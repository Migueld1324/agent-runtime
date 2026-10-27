# ADR-086 — Persistencia de invocaciones y exclusión de ejecución

**Estado:** aceptada e implementada en el runtime v3. Validación y límites en [verification.md](../delivery/verification.md#recuperación-durable--adr-086).
**Base contrastada:** `ba88410`, merge por squash del PR #3; contenido equivalente al incremento de objetivos y README anterior.
**Relación:** desarrolla ADR-075/077/078/079 y [ADR-085](085-runtime-failures-and-recovery.md), sin sustituir sus decisiones aprobadas.

## Alcance aprobado

El siguiente incremento debe persistir fallos explícitos de modelo y Executor, distinguir efectos inciertos y permitir recuperación segura. Están aprobados el registro operacional mínimo con reclamación atómica, la conservación de resultados confirmados, la recuperación inicialmente limitada a modelo/verificador, el presupuesto compartido de dos recuperaciones y la detención ante incertidumbre.

La elección de almacenamiento, exclusión y evolución de esquema que sigue forma parte del contrato aprobado. No introduce MemoryService, ExecutionRecord, ExperienceRecord, nuevos proveedores, conciliación automática ni validación extensible del Gateway.

## Evidencia del problema

En la base contrastada, el nodo `execute` llama al Executor, guarda opcionalmente un grant y devuelve la observación. No había confirmación durable independiente entre esas operaciones. La reentrada al nodo no demuestra si el efecto ocurrió. Dos procesos también pueden leer el mismo checkpoint antes de actuar; el contador de herramientas no constituye un mecanismo de exclusión.

`SqliteSaver` administra su propio esquema y conexiones. Acoplar código de dominio a sus tablas internas dificultaría actualizar el adaptador de checkpoints. Se mantienen interfaces propias para invocaciones y control de acceso a mutaciones.

## Almacenamiento adoptado

| Recurso | Función y autoridad |
|---|---|
| `data/runtime-v3.sqlite` | Checkpoints LangGraph: posición, criterios, observaciones y aprobaciones |
| `data/runtime-operations.sqlite` | Store propio: identidad, reclamación y resultado confirmado de invocaciones; metadatos de versión/identidad del store |
| `data/runtime-control.sqlite` | Exclusión de comandos mutantes mientras un proceso trabaja; no almacena el resultado de herramientas |

Reutilizar SQLite disponible en el proyecto; no añadir dependencia de infraestructura externa. El store de invocaciones debe confirmar sus escrituras antes de devolver éxito. No desactivar journaling ni sincronización durable para acelerar tests. No asumir una transacción única que incluya herramienta externa, grant y checkpoint.

El registro de invocación manda sobre si el Executor puede entrar y sobre el resultado confirmado. El checkpoint manda sobre la continuación del grafo. Un desacuerdo no se resuelve eligiendo el dato más reciente: se validan identidades, hashes y transiciones; si no puede explicarse, se detiene.

### Exclusión inicial: un comando mutante del runtime a la vez

Decisión: adquirir `BEGIN IMMEDIATE` en una conexión dedicada al store de control y conservar esa transacción durante el comando mutante. El registro de resultados se confirma en otra base para que su durabilidad no dependa de liberar la exclusión. Al terminar el comando, cerrar/rollback de control libera la exclusión; no hay datos de negocio que confirmar en esa transacción.

- Adquirir exclusión antes de leer el checkpoint que decidirá una mutación. Aplicarla a start, aprobación, denegación, recuperación y migración; cualquier API pública equivalente debe pasar por la misma frontera.
- Durante una inferencia o ejecución activa, un segundo comando mutante se rechaza como ocupado, sin consumir aprobación o recuperación. Al suspenderse el grafo para esperar al usuario, el comando termina y libera la exclusión.
- `status` sigue siendo consulta. No reanuda el grafo ni convierte una invocación activa en incierta. Puede informar que existe una invocación iniciada cuyo resultado aún no está confirmado.
- No utilizar TTL ni la edad de un registro como prueba de muerte. No borrar el archivo de control para desbloquear: podría permitir dos conjuntos distintos de locks. El proceso que recupera debe adquirir la misma exclusión antes de interpretar invocaciones iniciadas como abandonadas.
- Los comandos administrativos de grants/registry siguen revalidándose en el Gateway; no basta la exclusión para autorizar. No se pretende una transacción distribuida con cambios administrativos externos.

**Coste deliberado:** serializa comandos mutantes incluso de runs diferentes. Una inferencia lenta puede bloquear otra aprobación. Evita inicialmente diseñar leases, expiración, heartbeat y fencing para efectos externos. La concurrencia entre runs queda diferida; no es una garantía multi-host. Requiere archivos locales y pruebas de liberación tras muerte real del proceso.

Alternativa: exclusión por run mediante archivos SQLite separados. Permitiría paralelismo entre runs, con más archivos y reglas de ciclo de vida. Un lease persistido en una fila exige demostrar cómo se recupera tras caída sin dejar actuar al propietario anterior; un timeout por sí solo no lo resuelve. Se adopta la exclusión global para este corte monoproceso lógico.

SQLite documenta que `BEGIN IMMEDIATE` reclama una transacción de escritura y puede devolver `SQLITE_BUSY` ante otra activa. La transacción del archivo de control **no** debe mantenerse en la conexión del ledger o del checkpointer, pues impediría sus confirmaciones durables.

## Contrato mínimo de invocación

- Identidad estable: `runId` + ordinal de propuesta válida; unicidad durable. Una repetición del mismo comando no crea otra invocación.
- Vinculación: capability ID, huella del descriptor, hash de solicitud, scope y hash del criterio de objetivo. El ordinal no basta para aceptar argumentos distintos.
- Estados: `prepared`, `authorized`, `executing`, `succeeded`, `failed`, `uncertain`, ya previstos en el contrato de ToolInvocation.
- Resultado o error normalizado, acotado; no objetos crudos del proveedor ni secretos. El resultado confirmado debe ser suficiente para restaurar la observación junto a los argumentos del checkpoint vinculado.
- Resultado e identidad son inmutables una vez confirmados. No sobrescribir un registro existente con otro descriptor, request o criterio.

Preparar y autorizar no producen efectos de herramienta. La transición a `executing` se reclama con actualización condicional dentro de una transacción breve y confirmada: solo quien obtiene una fila válida puede entrar al Executor. Una reclamación fallida nunca autoriza ejecución. Antes de reclamar, revalidar policy, descriptor, argumentos y aprobación exacta. El acceso al proceso/grafo interno no puede ser una ruta pública alternativa sin estas comprobaciones.

No mantener abierta la transacción de confirmación del ledger durante el efecto externo: se necesita conservar el marcador `executing` aun si el proceso cae. Una vez retornado el Executor, guardar `succeeded` y resultado **antes** de escribir el grant o devolver la observación al grafo.

## Recuperación y resultados

| Evidencia durable encontrada bajo exclusión | Conducta implementada |
|---|---|
| Error recuperable del modelo; observaciones confirmadas, sin efecto incierto | `paused`; orden explícita consume presupuesto, persiste `recovering` y vuelve solo al modelo |
| Error terminal del modelo o propuesta inválida | `failed`; no reabrir el run |
| Incumplimiento real de policy, revocación o descriptor cambiado antes del Executor | `denied`; sin efecto |
| Invocación `executing` sin resultado confirmado al recuperar | Registrar `uncertain`; run `paused`, `retryable:false`; no ejecutar ni verificar el objetivo para ignorar la incertidumbre |
| Invocación `succeeded`, checkpoint todavía sin su observación | Restaurar una única observación vinculada al mismo invocation ID y continuar; nunca llamar al Executor otra vez |
| Resultado confirmado, grant no guardado | Mantener el resultado; suspender con diagnóstico administrativo no reintentable en este corte. No repetir herramienta ni intentar conceder el grant automáticamente; no afirmar que un grant ambiguo esté ausente |
| Fallo del Executor demostrado antes de cualquier efecto | `failed`; este incremento no habilita retry del Executor |
| Error después de entrar al Executor sin evidencia suficiente | `uncertain`, aunque el código de error parezca transitorio |
| No puede confirmarse una escritura necesaria de checkpoint o ledger | Detener con error de infraestructura; no declarar durable un estado no guardado ni ejecutar otro efecto |

El resultado confirmado no equivale a objetivo cumplido: `completed` continúa requiriendo la verificación aprobada. La observación restaurada debe deduplicarse por invocation ID, no por coincidencia de texto. Si faltan el checkpoint o los argumentos vinculados, no inventarlos a partir del resultado.

Para `prepared`/`authorized` sin reclamación iniciada, no hay permiso para ejecutar desde la orden de recuperación. La decisión conservadora es restaurar una solicitud de aprobación del mismo request, con consentimiento nuevo antes de la primera entrada al Executor. Esto no reintenta una invocación iniciada; la transición se cubre con pruebas de caída antes de reclamar. Nunca reutilizar automáticamente un permiso de una vez tras una continuación ambigua.

Al clasificar errores del modelo, usar errores tipados/códigos y fase, no regex sobre mensajes. Una autenticación corregible o fallo transitorio puede suspender; una propuesta inválida no activa regeneración automática. No capturar interrupciones normales del framework como fallos. Deshabilitar retries ocultos configurables antes de acreditar un intento por orden y mantener el proveedor seleccionado.

La recuperación de modelo y verificador comparte `recoveryCount`, con máximo dos. No resetearlo al cambiar de fase o proceso. Registrar de forma durable la orden aceptada y su continuación para no consumirla dos veces tras una caída; el identificador de orden/intento también debe deduplicarse.

## Versión y compatibilidad

Introducir `stateVersion: 2` para el contrato con invocaciones. Mantener la versión del criterio de archivo en 1; es un contrato diferente. El store propio tiene esquema versionado y una identidad persistente vinculada al checkpoint, para detectar que falta el ledger o que se restauró otro archivo por error. No recrear un store vacío y asumir que ninguna operación se ejecutó.

- Consultar v0/v1 sin cambiar sus estados históricos ni inventar evidencia de efectos o éxito.
- Adaptación explícita, idempotente y con checkpoint previo conservado. No borrar bases para actualizar.
- Un v1 con evidencia de objetivo conserva su carácter verificado; no confundirlo con `completed` v0 sin evidencia.
- Solo adaptar una aprobación pendiente si conserva interrupción real, criterio válido, hashes exactos y ausencia de ejecución o error ambiguo. Requerir nuevo consentimiento antes de ejecutar bajo v2.
- No traducir `authorized` + siguiente nodo `execute` de versiones anteriores a «no ejecutado»: no tienen el marcador que permitiría demostrarlo.
- Versión desconocida, store ausente/ajeno o recuperación no demostrable: consulta/diagnóstico y continuación bloqueada.

No ampliar silenciosamente el ámbito de los grants ni cambiar sus fingerprints por versionar el estado del run. La validación extensible del Gateway y su migración de descriptores quedan para otro PR.

## Validación exigida

Pruebas entre procesos, con barreras deterministas, para dos continuaciones concurrentes y caídas antes de reclamar, después de reclamar, después del efecto y después de confirmar resultado. Comprobar que el Executor entra como máximo una vez por invocación, que no se inventa éxito y que el proceso superviviente no puede robar la exclusión.

Inyectar fallos de checkpoint, ledger y grant; comprobar resultado conservado, observaciones únicas y detención ante incertidumbre. Comprobar recuperación compartida modelo/verificador, preservación de proveedor y contadores, nuevas aprobaciones exactas y consulta/adaptación de v0/v1. Mantener las suites y CI offline actuales.

La cobertura ejecutada incluye muerte real de procesos en las cuatro fronteras de ejecución, competencia entre procesos, fallos inyectados de SQLite/checkpoints/grants, recuperación compartida y migración conservadora. Los resultados y el alcance exacto están en [verificación](../delivery/verification.md#recuperación-durable--adr-086).

## Detalles de implementación y límites

`src/v3/operations.ts` implementa el esquema propio v1: identidad del store, identidad de run/criterio/proveedor, invocaciones y órdenes de recuperación. `src/v3/graph.ts` expone una fachada serializada; el grafo interno no se entrega al CLI ni a proveedores. `updateState` queda como interfaz confiable de administración/pruebas, también serializada; no acepta cambios de identidad del run para continuar.

El grafo usa durabilidad síncrona de checkpoints antes de ejecutar el siguiente nodo. `nextPhase` conserva la continuación prevista cuando sobreviven escrituras de un nodo pero falla el checkpoint que agenda su sucesor. La recuperación solo repara rutas conocidas sin operaciones pendientes o inciertas; nunca usa ese campo para autorizar el Executor.

Cada orden de recuperación se registra antes de despacharse. La repetición de una orden aceptada pero aún no despachada conserva su contador; una orden ya despachada no vuelve a ejecutarse. Si el proceso cae después de despacharla, hace falta una orden nueva y presupuesto disponible. La reparación de una aprobación o de una observación también consume el presupuesto compartido. El intento consumido no se devuelve si falla la persistencia posterior.

Los resultados confirmados están acotados a 64 KiB UTF-8. Si no pueden persistirse, el marcador iniciado permanece sin confirmación y la recuperación detiene la operación como incierta. Los mensajes de errores se normalizan; los resultados de herramientas y criterios siguen siendo datos operacionales y no deben contener secretos.

La migración admite una interrupción real de aprobación v0/v1, o del verificador v1, sin error de tarea ni ejecución ambigua. v0 necesita criterio explícito; v1 conserva criterio y presupuesto. Se añade un checkpoint v2 y se mantiene el historial. Un resultado verificado v1 conserva su significado en consulta; no se convierte retrospectivamente en no verificado.

No se incorpora conciliación automática de efectos externos, retry del Executor, ejecución concurrente entre runs ni garantía universal de exactly-once. El control usa archivos SQLite locales compartidos por todos los comandos v3; no coordina procesos v1/v2 históricos ni hosts distintos. La validación extensible del Gateway permanece para otro cambio.

## Referencias técnicas

- [SQLite: transacciones y BEGIN IMMEDIATE](https://www.sqlite.org/lang_transaction.html).
- [SQLite: locking y recuperación de journaling](https://www.sqlite.org/lockingv3.html).
- `src/v3/graph.ts`, `src/v3/cli.ts`, `src/tool.ts` y adaptador SqliteSaver instalado, contrastados sobre la base indicada.
