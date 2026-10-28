# Maintenance Backend — plan incremental y criterios de aceptación

**Estado:** plan propuesto, no aprobado ni ejecutado. **Fecha:** 27-10-2026.

**Base:** `5aa4eac`. [ADR-088](../decisions/088-maintenance-backend.md) define el contrato; el [análisis](../architecture/maintenance-backend-analysis.md) identifica evidencia, amenazas T1–T15 y alternativas. Las garantías G1–G8 son requisitos por demostrar. Este documento no autoriza implementación ni operaciones de mantenimiento.

## Secuencia y dependencias

| Etapa | Entrega futura | Dependencias | Criterio de salida |
|---|---|---|---|
| M0 — revisión arquitectónica | ADR-088, análisis y este plan; resolver comentarios y registrar aceptación/rechazo explícitos | Revisión de ADR-085/086/087 y portabilidad | Contrato y límites acordados; autorización explícita antes de escribir código funcional |
| M1 — protocolo portable | Datos versionados, máquina de estados, policy administrativa, digest de plan, errores, deduplicación; backend sin capacidad de aplicar por defecto | M0 aprobado e implementación autorizada | Tests de estados, replay, autorización y fallo cerrado; plataforma no compatible solo previsualiza |
| M2 — identidad, inventario y evidencia | Aprovisionamiento de instalación; inspectores v1/v2/v3; journal/ancla, staging y respaldo; plan de importación cuando aplique | M1; contratos de persistencia revisados | No inicializa stores perdidos; diferencia ausencia esperada; integridad y terminalidad comprobadas; journal/ancla soportan recuperación |
| M3 — primer adaptador de exclusión | Perfil Linux administrado o alternativa equivalente elegida tras ensayos; barrera de admisión, ciclo de vida, frontera de datos y drenaje de I/O | M1/M2; instalación desechable con autoridad suficiente | G1–G4/G7 acreditadas con procesos no cooperativos, escape, handles, caída del supervisor y reinicio de host; capacidades insuficientes deniegan |
| M4 — publicación y recuperación | Publicador allowlisted, sync/reemplazo/resultado, retiro de handles, reapertura explícita; matriz de caídas | M2/M3 y perfil de filesystem probado | G5/G7; no éxito sin evidencia, no rollback de permisos automático; recuperación determinista o cuarentena |
| M5 — consumidor ADR-087 Incremento 2 | Preview definitivo, sustitución de un descriptor, administración por huellas históricas y pruebas completas | ADR-087 aprobada, Incremento 1 validado, M1–M4 conformes y aceptación de seguridad | Todos los criterios D1–D10 de abajo satisfechos; decisión explícita de habilitación por perfil |
| M6 — ampliar plataformas/perfiles | Windows/macOS/BSD, broker, VM u otros adaptadores | M1 y revisión de límites específicos | Misma suite de contrato y evidencia nativa equivalente; sin simular cumplimiento ni obligar a Linux en core |

M2 y M3 pueden requerir iteraciones de diseño; no se reduce G3 para acomodar un mecanismo insuficiente. Si el aislamiento de procesos falla, revisar la alternativa broker/VM antes de M4. La disponibilidad de M1 o una demo Linux no desbloquea M5. El Incremento 1 de ADR-087 puede avanzar de forma independiente tras su propia aprobación; no necesita migrar registros existentes.

Cada etapa debe tener PR separado con cambios acotados, controles negativos y evidencia. No mezclar instalación privilegiada, cambio del Gateway y migración de datos reales en un solo incremento. Las pruebas deberán usar fixtures sintéticos y almacenamiento desechable, sin credenciales ni datos locales del usuario.

## Estrategia de verificación

Tres niveles distintos de evidencia:

1. **Contrato portable:** tests deterministas del protocolo, plan/autorización, estados, idempotencia y recuperación usando dobles con fallos explícitos. Sirven para semántica, no para acreditar aislamiento OS.
2. **Adaptador nativo:** procesos reales no cooperativos, handles abiertos, arranques alternos y permisos efectivos, en VM/host desechable con el perfil exacto. Barreras/handshakes deterministas en cada frontera; no inferir carreras cubiertas porque un `sleep` pasó.
3. **Durabilidad y reinicio:** muerte de cliente/publicador/supervisor, reinicio de VM y fallos de almacenamiento. Un SIGKILL demuestra fallo de proceso; no equivale a pérdida de energía. Acreditar separadamente flush/reemplazo y corte abrupto dentro del perfil ensayado.

El expediente de cada ensayo registrará commit, protocolo, adaptador/configuración (digest), SO/kernel o build, filesystem/montaje, versiones SQLite/VFS, identidades no sensibles, precondiciones, barreras, actor adversarial, resultado esperado/observado, digests de artefactos antes/después y referencias a evidencia sanitizada. No registrar tokens ni contenidos personales. Resultado: PASS, FAIL, BLOCKED o NOT RUN. Solo PASS con evidencia cuenta para habilitar un perfil.

## Matriz de pruebas exigidas

Todas las filas están **pendientes** en este PR. «Sin mutación de negocio» permite únicamente evidencia administrativa declarada; no autoriza inicializar ni reparar silenciosamente stores.

| ID | Escenario y frontera controlada | Oráculo de aceptación | Cobertura |
|---|---|---|---|
| P01 | Backend ausente, sin privilegios, perfil desconocido, protocolo no soportado | `maintenance_exclusion_unavailable`; no escritura de negocio; preview identificado como informativo | G8; T1/T4 |
| P02 | Usuario sin rol, aprobación de herramienta usada como permiso, principal falso, plan alterado, nonce repetido, permiso vencido/revocado | Rechazo en autoridad; no sesión/publicación no autorizadas; mismo ID con contenido distinto falla | G4; T10/T15 |
| P03 | Dos administradores y dos supervisores compiten por la misma instalación; segundo pathname alias | Una sola generación/autoridad activa; segunda operación rechazada; no bypass por alias | G1/G4; T5/T6 |
| P04 | CLI antiguo ignora lock y conserva FD/mmap; proceso hace doble fork y muere el padre | No publicación hasta retirar todo acceso; grupos/hijos vivos mantienen bloqueo; sin reapertura por timeout | G2/G3; T1/T2 |
| P05 | CLI antiguo intenta arrancar entre inspección y rename, por servicio, socket, timer, consola y broker externo | Sistema impide acceso en cada ruta, incluso sin conocer protocolo nuevo | G2/G7; T1/T3/T13 |
| P06 | Adversario intenta cambiar cgroup/job, ampliar modos/ACL de sus archivos, publicar enlaces, delegar FD/handle o credenciales, ptrace, IPC/WMI/servicio externo | Escape y acceso externo denegados por el perfil; una vía exitosa invalida conformidad | G2/G3; T3/T4 |
| P07 | Grupo vacío pero carpeta previamente compartida; FD exterior, hardlink, symlink, bind mount, share o raw access | Backend rechaza sesión sin procedencia/frontera suficiente; permisos recién aplicados no pasan | G2/G4; T4 |
| P08 | Señal ignorada, proceso bloqueado, freezer, permisos insuficientes para inspeccionar, I/O diferido | No declarar quiescencia por señal/grupo vacío sin barrera adicional; resultado bloqueado verificable | G3; T2/T14 |
| P09 | Publicador detenido/suspendido conserva acceso; candidato nuevo presenta generación o PID reciclados | No reemplazo del dueño hasta retirada probada; recibos viejos nunca habilitan escritura | G1/G4/G7; T5/T6/T7 |
| P10 | Store faltante/ajeno, sidecar inesperado, schema desconocido, vínculo ledger/checkpoint roto, run huérfano | Rechazo sin creación de DB vacía ni borrado de sidecars; inventario completo obligatorio | G4/G6; T6/T9 |
| P11 | Cada versión de run: pendiente, pausado, recuperable, incierto, terminal histórico, error de tarea y `next=[]` ambiguo | Solo terminalidad demostrada acepta; sin inventar éxito legado ni consumir recoveries; incertidumbre bloquea aunque `status` diga terminal | G6; T9 |
| P12 | Preview válido pero descriptor, scope, grants o configuración cambian antes de adquirir exclusión | Relectura rechaza plan obsoleto; nueva autorización; cero sustituciones | G4; T10/T15 |
| P13 | Sustitución autorizada del descriptor y revocación histórica por clave exacta en operación aparte | Un manifiesto válido, huella destino exacta; grants antiguos sin transferencia, nueva huella sin permiso implícito; revocación no afecta otra clave | G5/G6; T11 |
| P14 | Fallos ENOSPC/EIO en intención, respaldo, staging, sync archivo/directorio, rename, commit de resultado y cierre | Resultado corresponde a evidencia; nunca éxito anticipado; datos coherentes o cuarentena explícita | G5/G7; T8 |
| P15 | Muerte en cada frontera de la matriz de interrupciones; caída simultánea cliente/supervisor | Inicio cerrado; recuperación explícita y sin republicar cuando destino ya está; cero relanzamientos automáticos | G5/G7; T7/T13 |
| P16 | Respuesta perdida después de resultado durable; reenvío del mismo comando | Mismo operation ID y resultado; sin nueva publicación ni grants; `already_applied` exige evidencia exacta | G1/G5; T5 |
| P17 | Cancelación antes/durante/después de rename; permiso revocado con syscall ya aceptado | No promete cancelar el syscall; `indeterminate` donde corresponda; admisión cerrada, inspección requerida | G4/G7; T7/T15 |
| P18 | Journal truncado, resultado ausente, ancla adelantada, restore parcial o destino con huella inesperada | Rechazo/cuarentena, sin reconstrucción automática desde timestamps ni rollback a descriptor antiguo | G5/G7; T6/T8/T11/T12 |
| P19 | Abrir evidencia como usuario ordinario, intentar modificarla y exportar errores con secretos canario | Acceso según policy, alteración denegada, exportación sanitizada; registro fallido no permite operar | G5; T10/T12 |
| P20 | Reapertura con publicador vivo, handles pendientes, resultado incompleto o ejecutor incompatible | Rechazo; solo cierre íntegro permite admisión; ninguna apertura implícita en `finally` | G2/G7; T1/T2/T13 |
| P21 | Importación: origen activo, copia con WAL omitido, inventario parcial, permisos nuevos sobre inodes viejos | Incorporación rechazada; procedimiento offline probado crea frontera nueva sin declarar efectos históricos confirmados | G2/G4/G6; T4/T9 |
| P22 | Perfil portable/no Linux y adaptadores nativos futuros | Misma semántica de estados/errores; ausencia de aislamiento deniega; pruebas OS independientes antes de habilitar | G8; T1/T3/T8 |
| P23 | Regresión de runtime y compatibilidad ADR-087 Incremento 1 | Huellas/requests v1 conservados; no ampliación v2, resultado durable y recuperaciones intactos; typecheck, suite y tres integraciones PASS | G6/G8; ADR-085/086/087 |

Para P04/P05/P06 usar al menos un binario/fixture legado congelado anterior al backend y un escritor adversarial que no importe código de locking del runtime. Probar desde el mismo usuario interactivo del despliegue y desde las identidades de servicio permitidas; una prueba solo como usuario sin ningún permiso no representa al adversario. Verificar intento/denegación con barreras externas y efectos sobre fixtures, sin conceder al actor permisos artificiales que eliminen la frontera bajo evaluación.

## Matriz de interrupciones y recuperación

Inyectar fallo de proceso a ambos lados de cada escritura durable y fallo de persistencia en la misma frontera. C1–C8 deben ejecutarse también con reinicio de la autoridad; las ventanas críticas de publicación/cierre requieren ensayos de reinicio abrupto de la VM. Los resultados se evalúan con la [tabla de recuperación de ADR-088](../decisions/088-maintenance-backend.md#publicación-transacciones-y-recuperación).

| ID | Punto de interrupción | Resultado obligatorio al volver |
|---|---|---|
| C1 | Intención persistida, cierre efectivo aún incompleto | Boot/admisión cerrados; retirar procesos antes de conceder sesión; ninguna publicación |
| C2 | Admisión cerrada, parada parcial | No interpretar estado parcial como quiescencia; terminar o permanecer bloqueado |
| C3 | Quiescencia/lock adquiridos, validación/respaldo incompletos | Revalidación completa; sin restaurar permisos ni asumir preparación |
| C4 | Respaldo y staging sincronizados, antes de reemplazo | Si origen exacto y evidencia coherente, `not_applied`; nueva aplicación solo explícita |
| C5 | Rename aceptado, sync del directorio pendiente | Inspeccionar origen/destino bajo exclusión, no declarar durabilidad anticipada; sincronizar/verificar o cuarentena |
| C6 | Destino durable, commit de resultado ausente/fallido | Con intención y destino exactos, completar evidencia bajo recuperación autorizada; sin repetir cambio de negocio |
| C7 | Resultado durable, publicador/handles/lock aún abiertos | No reapertura hasta retiro comprobado; respuesta perdida se deduplica |
| C8 | Cierre registrado, reapertura/acuse interrumpidos | Nueva comprobación de generación/recursos y autorización de recuperación; no activar ejecutores por registro histórico aislado |

No se requiere que todas las caídas terminen en éxito: el resultado correcto puede ser cuarentena indefinida. No contar una denegación por limitaciones del runner como prueba positiva de un perfil que debía aplicar. Separar pruebas de «rechaza cuando no puede» de pruebas de «puede operar con garantías».

## Criterios para desbloquear ADR-087 Incremento 2

Todos son necesarios; al corte de esta propuesta **ninguno se declara satisfecho por este PR**.

| ID | Condición verificable | Evidencia de cierre requerida |
|---|---|---|
| D1 | Aprobación explícita de ADR-087, ADR-088 y autorización de implementación | Registro de revisión con decisiones, alcance y cambios solicitados; integrar documentación no basta |
| D2 | Incremento 1 de ADR-087 implementado y validado | Vectores legado, schemas, no ampliación de entradas, identidad exacta de requests, compatibilidad de permisos y proveedores |
| D3 | Instalación con procedencia/frontera acreditadas | Inventario completo protegido; aprovisionamiento nuevo o importación offline validada, recursos y generaciones vinculados |
| D4 | Al menos un adaptador conforme en perfil definido | P01–P09/P20/P22, incluidos no cooperativos, accesos externos, drenaje y reinicio; informe de privilegios y límites |
| D5 | Autorización administrativa y evidencia durables | P02/P12/P18/P19; política de acceso/retención y pruebas de replay, corrupción y fallo del journal/ancla |
| D6 | Inspector completo de runs y stores | P10/P11/P21; ausencia esperada diferenciada, versiones conocidas, todos terminales y sin incertidumbre |
| D7 | Publicación/recuperación del manifiesto demostradas | P14–P18 y C1–C8; evidencia de atomicidad y durabilidad por perfil, respaldo comprobado, cero rollback automático |
| D8 | Grants históricos administrables sin transferencia | P13; listar y revocar por huella completa/scope; nuevo descriptor sin grant implícito; repetición no-op probada |
| D9 | Regresión completa y documentación operativa | P23, guía de instalación, diagnóstico, operación, recuperación, cancelación y reapertura; CI y pruebas privilegiadas identificadas por separado |
| D10 | Revisión arquitectónica/de seguridad del expediente del perfil | G1–G8 trazadas a PASS; riesgos residuales aceptados explícitamente; habilitación limitada a ese perfil, sin bypass en checkouts libres |

El gate se evalúa por instalación/perfil al operar, además de la aceptación de la implementación. Un binario probado en Linux no permite aplicar en otro filesystem, configuración o SO sin evidencias correspondientes. La previsualización no constituye aprobación ni reserva de estado y siempre se revalida bajo exclusión.

## Evidencia de esta entrega documental

Se inspeccionaron código, ADR aprobadas/propuestas, seguimiento y pruebas existentes; se consultaron fuentes primarias enlazadas en el análisis y ADR. Se conservaron ADR-085/086/087 sin cambios de contenido. No se añadieron dependencias, código funcional, fixtures operacionales, unidades de servicio o migraciones; no se modificaron `data/` ni `workspace/`.

La comprobación de esta entrega se limita a alcance documental del diff, enlaces internos y consistencia de referencias/estados. No se atribuye el resultado de la CI histórica a este diseño. P01–P23, C1–C8 y D1–D10 requieren trabajo futuro tras aprobación; su presencia en tablas no es evidencia de ejecución.
