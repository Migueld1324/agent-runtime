# ADR-088 M1 — plan y continuidad

Estado: M1 implementado y verificado localmente; rama publicada; creación/revisión del PR pendiente. Autorización: solicitud explícita del responsable para M1 completo, una única entrega/PR. No requiere nueva aprobación de ADR-088. Rama: `feat/adr088-maintenance-m1`. Base: `4ea84308496ca5ee7c885d899c058c3fe13e95e6`.

## Dependencia comprobada

El 29-10-2026 se consultaron por SSH `origin/main` y `refs/pull/10/head`. Main contiene los cinco commits del PR #10 mediante rebase; `git diff --exit-code origin/main 4c87bd5` devuelve 0. Main local actualizado por fast-forward. El árbol del PR #10 está íntegramente integrado; no se dedujo ausencia de integración de los SHA distintos.

## Fuente de verdad y límites

ADR-088, análisis de mantenimiento y plan M0–M6; ADR-085/086/087 y aprobación del Incremento 1. El plan aprobado define M1 como datos versionados, máquina de estados, policy administrativa, digest de plan, errores y deduplicación, con backend sin capacidad de aplicar por defecto. Criterios: estados, replay, autorización y fallo cerrado; plataformas incompatibles solo previsualizan.

M2 aporta identidad/inventario/journal/ancla; M3 exclusión nativa; M4 publicación; M5 consumidor de migración. No anticipar esas implementaciones ni declarar sus garantías cubiertas por dobles. No habilitar mantenimiento real, migraciones, privilegios OS ni operaciones sobre datos del usuario.

## Inspección e invariantes

- `src/v3/operations.ts`: lock global cooperativo `BEGIN IMMEDIATE`, ledger propio con identidad y confirmación durable. No sustituye barrera administrativa ni debe convertirse en journal de mantenimiento.
- `src/v3/graph.ts`: fachada serializada; recuperación explícita, presupuesto máximo dos, incertidumbre sin retry. Mantenimiento no altera estados, resultados ni presupuestos de runs.
- `src/v2/policy.ts`: grants por capability/descriptor/scope y aprobación exacta de herramienta. No son autoridad administrativa. Su constructor inicializa tablas: no usarlo para un probe informativo de mantenimiento.
- `src/v2/registry.ts`: consulta puede crear directorio; no reutilizar como inspector sin efectos. Conservar formatos, huellas y grants históricos de ADR-087.
- Mantener módulos portables y límites de confianza explícitos. No callbacks arbitrarios de ejecución, rutas de ejecutables ni capacidades OS suministradas por el cliente.

## Orden de implementación y aceptación

1. **Contratos:** tipos y validadores `maintenance/1` para capacidades, binding, plan, autorización, sesión opaca, evidencia y resultado según ADR-088. Validación de versión/forma y errores normalizados. Aceptación: entradas incompatibles fallan cerradas, sin efectos ni secretos en diagnósticos.
2. **Digest:** codec canónico propio del plan, versionado, sin reutilizar identidad de argumentos del Gateway. Documentar formato exacto y vectores fijos. Aceptación: orden irrelevante de claves estable; cambios relevantes del plan alteran digest; Unicode/arrays y representaciones ambiguas cubiertos.
3. **Policy:** canal de identidad confiable separado de datos del cliente; acciones de inspección, interrupción, aplicación, revocación histórica, recuperación y reapertura según ADR. Vincular consentimiento a instalación/generación, plan/digest, policy/versión, nonce y vigencia; revalidar cada acción. Aceptación: principal falso, permiso de herramienta, expiración, revocación, plan cambiado y replay rechazados; no consumir consentimiento ajeno.
4. **Estados:** máquina de ADR-088 y reglas de recuperación. Arranque cerrado, cuarentena ante incertidumbre, sin apertura por TTL/finally. Aceptación: tabla completa de transiciones permitidas/prohibidas, pérdida de autoridad, cancelación, reinicio y evidencia insuficiente; ningún estado declarativo acredita aislamiento OS.
5. **Deduplicación/persistencia:** contratos necesarios para conservar identidad de solicitudes y resultados; mismo ID con contenido distinto rechazado. Resolver antes de programar la frontera precisa con M2: journal/ancla/protección de instalación son posteriores, pero un mapa volátil no acredita deduplicación durable. Dobles de persistencia prueban semántica de recuperación y fallos; no declarar durabilidad nativa con ellos. Aceptación: repetición, concurrencia lógica, respuesta perdida, reapertura con estado persistido y fallos de almacenamiento sin ejecución ni éxito inventados.
6. **Backend portable:** interfaces `probe`, `preview`, `enter`, `validate`, `apply`, `inspect`, `recover`, `leave` y composición de controles. Capacidades ausentes/desconocidas deniegan; preview se marca informativo y no reserva autorización/exclusión. Aceptación: sin backend conforme no se concede sesión aplicable, ni apply o reapertura efectiva, ni se inicializan stores activos. Mantener contratos completos aunque las operaciones privilegiadas se rechacen en M1.
7. **Pruebas y revisión:** positivos/negativos de protocolo, autenticación/policy, digest, nonce, replay, estados y recuperación; compatibilidad con ADR-085/086/087. Trazar P01/P02/P16 y partes portables de P17/P18/P20/P22; P23 como regresión. No contar ensayos de dobles como P03–P09 o C1–C8 nativos. Ejecutar typecheck, suite y tres integraciones secuenciales en copia aislada; diff, evidencia, guía y seguimiento. Un único PR con toda M1.

Las elecciones de tipos, codec e interfaces concretas deben documentarse al implementarlas. Si una elección exige modificar una decisión arquitectónica, detener ese punto y solicitar autorización; no sustituirlo silenciosamente por un contrato más débil.

## Interfaces concretadas

La frontera implementada y las obligaciones del adaptador M2 están en [contrato M1/M2](maintenance-m1-contract.md). M1 contiene el puerto transaccional de solicitudes/resultados y el coordinador de deduplicación; no contiene store de producción, journal/ancla, aprovisionamiento, exclusión o publicador. Los dobles quedan exclusivamente en tests. Los rechazos del backend sin persistencia no se presentan como deduplicación durable.

Codec propio `maintenance-canonical/1`, autenticación de transporte separada, consentimiento exacto por acción, estados/recuperación puros y backend informativo sin emisión de sesiones aplicables. Los resultados del backend declaran admisión `unknown`, pues M1 no observa ni controla un servicio real. El arranque cerrado del modelo no acredita una barrera OS.

## Punto de continuidad

Implementación completa de los siete pasos dentro del alcance portable. Commits funcionales: `3762c8b` (contratos/digest y vectores) y `2cf81fb` (policy, estados, persistencia, backend y regresiones). Ningún cambio a código de runtime v1/v2/v3, dependencias, grants/checkpoints/ledger ni datos del usuario.

Validación final del 29-10-2026, copia `/tmp/adr088-m1-d_zzuz4v`: typecheck PASS, suite **81/81 PASS** (23 pruebas M1 nuevas), integraciones v1/v2/v3 secuenciales PASS. Node v24.22.1, dependencias locales reutilizadas por symlink, sin reinstalación ni credenciales. La suite completa se ejecutó fuera del sandbox: el runner dentro del sandbox no reportó casos individuales y quedó detenido en pruebas entre procesos, por lo que esa ejecución se interrumpió y no cuenta como PASS. Evidencia y matriz en [validación M1](maintenance-m1-validation.md).

Entrega publicada por SSH: `origin/feat/adr088-maintenance-m1`, con implementación y evidencia en `42b960b` (más este cierre documental). Push confirmado el 29-10-2026, sin merge. El árbol local quedó limpio y la rama sigue al remoto.

Pendiente de entrega: crear/revisar **un único PR** contra main con toda M1. Bloqueo operativo concreto: no hay `gh`, `GH_TOKEN`/`GITHUB_TOKEN`, configuración de gh ni conector GitHub en el entorno. SSH permitió publicar, pero no proporciona la API para crear el PR. [Abrir el PR único](https://github.com/Migueld1324/agent-runtime/pull/new/feat/adr088-maintenance-m1); título y cuerpo listos en [PR M1](maintenance-m1-pr.md). No solicitar otra aprobación de ADR-088 ni reimplementar componentes. No hacer merge automáticamente.

No queda implementación M1 pendiente identificada en esta revisión. No atribuir a esta entrega P03–P15/P19/P21 nativos, C1–C8 ni D3–D10. M2–M4 y ADR-087 Incremento 2 siguen pendientes y no están habilitados. Siguiente acción: crear el PR único desde la rama publicada cuando exista un canal autenticado y atender su revisión sin reducir el alcance aprobado.
