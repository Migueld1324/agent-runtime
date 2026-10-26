# ADR-085 — Fallos explícitos y recuperación controlada del runtime

**Estado:** aceptada. Implementación incremental: primer verificador de objetivo y recuperación de su lectura implementados; recuperación general y migraciones pendientes.
**Acuerdos:** recuperación explícita y acotada, compatibilidad conservadora de checkpoints y detención ante efectos inciertos. `completed` queda reservado a objetivos verificados; se descarta finalizar por mera respuesta del planner.
**Ámbito:** consolidación del runtime v3 después de PoC 0.3.1.
**Referencias:** ADR-017/021, ADR-061/066/072 y ADR-073–079/081; [runtime](../specifications/runtime.md), [contratos comunes](../specifications/common-contracts.md), [cierre](../delivery/poc-031-closure.md).

## Problema y evidencia

Diagnóstico histórico sobre la base `1a36ba5`, anterior al primer incremento descrito al final de esta ADR.

`src/v3/graph.ts` persiste `queued`, `tool_proposed`, `authorized`, `running`, `completed`, `denied` y `budget_exhausted`. El CLI deriva `WAITING_APPROVAL` de `tool_proposed` y el siguiente nodo `authorization`. No existe recuperación explícita en el CLI.

`test/v3-adapter-failures.test.ts` demuestra que una excepción inicial del modelo deja `queued`, `next: model` y un error en la tarea de LangGraph. Los errores de herramientas también se propagan: el checkpoint puede conservar `authorized` aunque el Executor haya comenzado. `executeTool`, creación de grant y persistencia del resultado no son una transacción única. Una caída puede dejar un efecto sin observación confirmada.

Una respuesta `final` del modelo produce `completed` actualmente. No existe un verificador genérico de criterios de éxito. Las nuevas garantías deben distinguir finalización del ciclo, fallo operativo y resultado del objetivo.

## Decisión

### Estados de ejecución y estados de invocación

Conservar los estados actuales y la proyección `WAITING_APPROVAL`. Incorporar solamente `paused`, `recovering` y `failed`, ya presentes en la máquina de referencia. No crear `RETRYABLE` como estado. `uncertain` pertenece al resultado de una invocación, conforme a ADR-078; suspende el run en `paused`.

| Situación | Estado / condición propuesta | Continuación permitida |
|---|---|---|
| Objetivo verificado | `completed`, todos los criterios satisfechos con evidencia, sin error activo, propuesta pendiente ni efecto incierto | Terminal |
| Usuario o policy deniegan una operación válida | `denied` | Terminal; no eludir con otra herramienta |
| Propuesta válida pendiente de consentimiento | `tool_proposed` + interrupción; CLI `WAITING_APPROVAL` | Solo `approve` o `deny` sobre solicitud exacta |
| Fallo recuperable con continuación segura identificada | `paused`, error con `retryable: true` | Recuperación explícita y acotada |
| Recuperación autorizada en curso | `recovering` | Revalidar y continuar desde frontera segura |
| Error terminal | `failed`, error con `retryable: false` | Terminal; no reabrir este run |
| Invocación con efecto no confirmado | `paused`, invocación `uncertain`, `retryable: false` | Inspección; conciliación fuera de este incremento |
| Presupuesto agotado | `budget_exhausted` | Terminal; no reiniciar contadores |

Una orden de control inválida —por ejemplo, aprobar otro run o con un hash incorrecto— se rechaza sin cambiar un run válido ni consumir su aprobación pendiente. No convertir un error de comando en una denegación del usuario. Cambios reales de descriptor, policy o revocación sí bloquean la operación.

### Clasificación de errores

El runtime decide la clasificación usando fase, evidencia del adaptador y persistencia. No inferir seguridad de un mensaje de excepción o de un código HTTP aislado.

| Caso | Tratamiento acordado |
|---|---|
| Red, timeout o error transitorio del modelo; sin herramienta nueva ejecutada | `paused`, continuación en modelo; preservar observaciones previas |
| Cuenta desconectada, credencial expirada o refresh fallido, sin efecto de herramienta | `paused` si una corrección explícita de sesión/configuración permite continuar; nunca cambiar proveedor |
| Propuesta malformada, herramienta desconocida o argumentos inválidos | `failed`, sin autorización ni efecto; sin regeneración automática |
| Prohibición de policy, grant revocado o descriptor cambiado | `denied`, antes de invocar el Executor |
| Fallo de herramienta probado antes de cualquier efecto | `failed` por defecto; solo recuperable si el adaptador acredita continuación segura |
| Excepción después de entrar al Executor sin prueba suficiente del resultado | `paused` + `uncertain`; sin retry |
| Efecto confirmado y fallo al guardar grant, observación o checkpoint | No repetir el efecto; conservar confirmación durable si existe; si no, tratar como incierto |
| Error interno no clasificado | `failed` antes del Executor; incierto tras entrar a una operación con efectos |
| Fallo de persistencia | Error de infraestructura: no declarar estado durable que no se logró guardar; detener y conservar la evidencia disponible |

Un 429 puede ser transitorio o una cuota no disponible; `retryable` exige una condición de recuperación documentada. Una excepción en una lectura solo es recuperable si el contrato confiable garantiza que no produce efectos; la etiqueta declarada por una herramienta no es prueba suficiente.

Los reintentos internos del SDK, fetch y framework deben inventariarse y quedar explícitamente limitados. La política acordada para la recuperación general es un intento por orden de recuperación del runtime; deshabilitar reintentos automáticos ocultos donde sean configurables. No introducir fallback comercial.

### Metadatos mínimos

Reutilizar `OperationError { code, message, retryable }`, con códigos existentes. Asociarlo a metadatos versionados del run: fase (`model`, `authorization`, `execute`, `verification`, `persistence`), identificador del intento y punto seguro de continuación, si existe. Guardar mensajes normalizados y sanitizados, no tokens, respuestas crudas ni objetos completos del proveedor.

Mantener el contador actual de propuestas válidas y añadir un contador durable de intentos de recuperación. Límite inicial aprobado: máximo **dos recuperaciones explícitas por run**, además del intento original; si un nuevo fallo requiere una tercera recuperación, termina en `failed`. Un nuevo intento de modelo puede consumir cuota remota aun sin efectos locales. La recuperación no promete respuesta idéntica del modelo ni ausencia de cobro de inferencias repetidas.

`retryable: true` significa que el runtime conoce una continuación segura y elegible. No concede permiso, no evita validar presupuesto y no dispara ejecución. Para una incertidumbre puede existir causa externa corregible y aun así `retryable` debe ser `false`.

### Transiciones y fronteras durables

1. Un fallo de modelo capturado produce un checkpoint `paused` o `failed`, en lugar de dejar éxito o estado activo aparente. No capturar `interrupt()` ni señales de control del framework como errores de negocio.
2. Una solicitud explícita de recuperación válida lleva `paused -> recovering`. Antes de inferir otra vez, verificar versión, presupuesto, proveedor fijado y ausencia de efectos inciertos. No volver a ejecutar herramientas con observaciones confirmadas.
3. Una nueva propuesta pasa por el mismo registro, validación, hash y autorización. Recuperar no equivale a aprobar; la propuesta puede ser distinta. Un permiso de una vez anterior no autoriza una propuesta distinta.
4. Antes de entrar al Executor, persistir una frontera de invocación identificada, su hash y su fase de ejecución. Debe existir un checkpoint anterior al efecto; una asignación en memoria dentro del nodo no basta.
5. Persistir resultado confirmado y observación antes de la siguiente inferencia. Si la recuperación encuentra una invocación iniciada sin resultado durable, detener como incierta. Aunque una caída haya ocurrido antes del efecto real, preferir detener ante falta de evidencia.
6. Revalidar descriptor, argumentos, scope y policy inmediatamente antes de cualquier efecto. Nunca conservar un booleano `authorized` como permiso suficiente para reintentar.
7. `completed`, `denied`, `failed` y `budget_exhausted` son terminales. `status` es lectura; una invocación genérica del grafo no debe permitir saltarse estas reglas.

Esto requiere metadatos operacionales mínimos de invocación, no implementar `ExecutionRecord`, `ExperienceRecord`, memoria ni conciliación general. La forma concreta de los nodos y la atomicidad del marcador deben demostrarse con pruebas antes de acreditar la garantía de recuperación.

### Significado de completed y verificación del objetivo

**Decisión aprobada:** `completed` solo representa una tarea cuyo objetivo fue comprobado. Se rechaza `completionBasis: 'planner_final'` como fundamento de éxito. Se conserva la regla de la especificación de runtime; el primer incremento cambia el comportamiento de cierre de la PoC.

**Contrato aprobado:** incorporar una fase de verificación del runtime, independiente del ModelProvider. La propuesta `final` del modelo solicita verificar; no actualiza directamente el estado a `completed`. No hace falta crear un estado público adicional `verifying`: el run permanece activo hasta obtener un resultado durable.

- Los criterios de aceptación se fijan antes de ejecutar herramientas, con ID, versión y parámetros verificables, asociados al objetivo y run. Su procedencia debe ser confiable: usuario o plantilla determinista revisada. El modelo puede sugerir criterios, pero no aprobarlos, cambiarlos ni autocalificar su resultado.
- Un run nuevo sin criterios soportados se rechaza antes de producir efectos. No inventar criterios a partir del texto final ni aceptar una lista vacía como éxito.
- Cada criterio se evalúa mediante un verificador confiable y produce `passed`, `failed` o `inconclusive`, con evidencia referenciada y acotada. Estos son resultados de comprobación, no estados nuevos del run.
- Para `completed`, todos los criterios deben ser `passed`; no debe haber error activo, propuesta pendiente o invocación incierta. Persistir IDs/versiones de criterios, hash de sus parámetros, resultado, instante de comprobación y evidencia suficiente; no guardar secretos o contenido indiscriminado.
- Una comprobación negativa produce `failed` con diagnóstico de objetivo incumplido, conservando efectos y observaciones. No reejecutar herramientas ni pedir al modelo que repare automáticamente el resultado dentro de este incremento.
- Una imposibilidad de comprobar no cuenta como incumplimiento demostrado ni como éxito. Un fallo transitorio de lectura puede dejar `paused`, `retryable: true` y continuación solo en verificación. Una carencia permanente o evidencia ambigua deja `paused`, `retryable: false`, con motivo explícito y sin continuación automática.
- Recuperar la verificación consume el mismo presupuesto de dos recuperaciones, conserva las herramientas ya ejecutadas y nunca reanuda desde el Executor. No activar esta ruta si hay una invocación incierta.
- Verificar también requiere policy, validación de recursos y límites. Una comprobación de filesystem es una lectura autorizada del workspace, no una vía privilegiada que permita acceder a cualquier ruta. La verificación inicial no modifica recursos.
- La evidencia acredita el momento de la comprobación. No promete que un archivo permanezca inalterado después, ni exactly-once, ni conciliación de operaciones inciertas.

Primer corte aprobado: objetivos de demostración con archivo Markdown en el workspace y contenido esperado exacto, ambos establecidos por el solicitante o una plantilla confiable antes de iniciar. El verificador lee el archivo real, rechaza rutas inseguras y symlinks y compara contenido; las observaciones o un mensaje del modelo no sustituyen esa lectura. Si la tarea exige además una operación concreta, debe declararse un criterio sobre su observación confirmada; obtener el archivo por otro medio no prueba ese requisito. No se considera que este primer verificador cubra objetivos arbitrarios.

Este contrato habilita el primer incremento de criterios, comandos y grafo. No se incluye todavía replanificación, evaluación semántica por otro LLM ni un catálogo general de verificadores. El contrato extensible del Gateway sigue siendo un trabajo independiente.

### Compatibilidad de checkpoints

Propuesta: esquema nuevo con `stateVersion: 1`; ausencia del campo identifica legado, sin mutar el archivo al consultar. Preservar SQLite, run IDs, observaciones y huellas existentes.

- Runs terminales antiguos: conservar su estado histórico; el CLI debe distinguir `completed` legado sin evidencia de objetivo de un `completed` del contrato nuevo. No inventar evidencia ni presentar el primero como éxito verificado.
- Aprobaciones antiguas: permitir adaptación explícita solo si el snapshot conserva interrupción real en autorización, descriptor/hash válidos y ausencia de error o ejecución incierta. Preservar la solicitud original; revalidar todas las condiciones antes de continuar. La adaptación no aporta criterios de éxito: para completar bajo el contrato nuevo deben existir criterios confiables acordados explícitamente antes de reanudar efectos, o la continuación queda bloqueada.
- Legado con errores de modelo o con ejecución interrumpida: inspección por defecto; no habilitar retry por deducirlo de `next` o del texto del error. Requiere migración específica y evidencia suficiente.
- Versión desconocida, incompatible o datos inconsistentes: rechazar continuación y explicar el motivo, sin borrar ni reiniciar checkpoints.

La migración debe ser explícita, idempotente y verificable, conservando el checkpoint previo. Si la adaptación de una aprobación antigua no puede demostrarse segura, mantenerla consultable y detener en lugar de reejecutar a ciegas. No exigir borrar `data/` para actualizar.

## Alternativas y consecuencias

- **Todo error -> failed:** sencillo, pero impide distinguir corrección de sesión, indisponibilidad temporal y efectos inciertos.
- **Nuevo estado retryable + retry automático:** duplica el contrato de errores y oculta intentos; puede repetir efectos o consumir cuota sin una orden nueva.
- **Estados independientes para cada proveedor:** rompe independencia del runtime y hace que las transiciones dependan del backend.
- **Conservar errores solo en LangGraph:** mantiene la ambigüedad actual del CLI y no establece un contrato portable.
- **Decisión adoptada:** estados existentes del diseño, clasificación conservadora, recuperación explícita, versión y evidencia durable. Añade complejidad de persistencia y migración; no garantiza exactly-once.

## Pruebas exigidas antes de implementar el contrato completo

1. Error inicial del modelo: `paused` o `failed` explícito, checkpoint restaurable y CLI sin falso éxito.
2. Herramienta confirmada seguida de error de modelo: recuperación conserva la observación y no repite la herramienta.
3. Propuesta inválida: `failed`, cero ejecución; no consume una aprobación anterior.
4. Aprobación pendiente, denegación y comandos inválidos: semántica independiente y durable.
5. Revocación o cambio de descriptor durante pausa/recuperación: efecto bloqueado.
6. Fallo antes del Executor frente a excepción tras comenzar una escritura: fallo seguro frente a `uncertain`, sin retry del segundo caso.
7. Caída entre frontera durable/efecto/observación: la recuperación se detiene si no puede confirmar el efecto; no se promete conciliación.
8. Caída después del efecto y antes de guardar grant: no se repite para intentar guardar el permiso.
9. Presupuestos originales y de recuperación persisten entre procesos; no hay intentos automáticos ocultos.
10. Respuesta final con archivo ausente o contenido distinto: nunca `completed`. Archivo y contenido correctos, todos los criterios comprobados y sin errores/incertidumbre: `completed` con evidencia durable.
11. Falta de criterios o criterios alterados por el modelo: rechazo sin ejecución. Verificación inconclusa o fallida y recuperación solo del verificador: sin repetir herramientas.
12. Checkpoints antiguos terminales, pendientes y con errores; versiones desconocidas; adaptación repetida sin duplicación.
13. Las suites actuales y CI offline siguen pasando. Las aprobaciones y escrituras reales de la PoC conservan su significado, salvo cambios expresamente aprobados.

Esta lista es criterio de aceptación futuro, no evidencia de pruebas añadidas o ejecutadas.

## Acuerdos e implementación incremental

Aprobados: recuperación únicamente explícita, máximo inicial de dos recuperaciones por run, compatibilidad conservadora y adaptación segura de aprobaciones antiguas, detención ante incertidumbre sin conciliación automática y `completed` únicamente tras comprobar el objetivo.

Aprobados también el primer verificador de archivo/contenido, los criterios definidos antes de ejecutar, la evidencia durable y la distinción entre incumplimiento y comprobación inconclusa.

Primer incremento implementado: `src/v3/objective.ts`, criterios `workspace.file_content` v1, un criterio por run; `stateVersion: 1`; nodos `intake`, `check_objective`, `verification_recovery`; CLI con `--expect-file`, `--expect-content` y `retry-verification`. El criterio se vincula mediante SHA-256 al run, objetivo y scope; no se entrega al modelo para que lo modifique. El criterio comprueba el resultado de archivo, no que el planner haya usado una herramienta específica.

La comprobación lee hasta 16 KiB + un byte de detección de exceso; rechaza symlinks y targets no regulares. Usa descriptor y policy de `filesystem.read`, y un ejecutor confiable de lectura acotada. Donde existen `O_NOFOLLOW` y `O_NONBLOCK`, se aplican al abrir; no equivale a aislamiento OS ni a protección general de carreras sobre el directorio raíz. La evidencia guarda hash de bytes leídos completos si están dentro del límite, tamaño observado, huella del descriptor, fecha y resultado; no duplica contenido en la evidencia. El contenido esperado sí pertenece al contrato operacional persistido, no debe contener secretos.

Las excepciones inesperadas del verificador se normalizan como comprobación inconclusa sin retry; fallos transitorios de lectura reconocidos permiten dos recuperaciones explícitas. Una respuesta inválida a la recuperación vuelve a suspender sin consumir el contador ni comprobar de nuevo; el nodo de suspensión no produce efectos.

Continúan pendientes: transiciones generales para errores de modelo/Executor y su clasificación estructurada, inventario y control de retries de SDK, frontera durable previa a efectos, representación operacional de incertidumbre y adaptación explícita de checkpoints antiguos. En este incremento, esos checkpoints son consultables pero no reanudables; `completed` legado se muestra como no verificado. Las excepciones del modelo/Executor conservan por ahora el comportamiento de PoC documentado, sin retry nuevo.

La suite de criterios de aceptación anterior cubre el contrato completo de esta ADR. La cobertura ejecutada del primer incremento está en [verification.md](../delivery/verification.md); no se acreditan como resueltos los puntos pendientes.

La extensibilidad del Gateway requiere su propuesta independiente; no queda aprobada por esta ADR.
