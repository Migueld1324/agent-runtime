# Registro de progreso

**ADR-088 M1 — preparación, 29-10-2026:** PR #10 integrado en main `4ea8430`; identidad de árbol comprobada por SSH contra `4c87bd5`. Rama nueva `feat/adr088-maintenance-m1`. M1 completo autorizado en una única entrega; plan presentado y persistido en [plan y continuidad M1](maintenance-m1-implementation.md). Sin implementación funcional ni pruebas M1 todavía; ninguna garantía nueva declarada. Pendiente implementar contratos, digest, policy, estados/recuperación, deduplicación y backend portable con sus pruebas. Siguiente acción: concretar interfaces y frontera de persistencia M1/M2 contra ADR-088, y comenzar contratos/digest. Corte por límite de sesión, sin bloqueo de aprobación identificado. Este estado sustituye referencias anteriores a PR #10 pendiente.

**Actualización ADR-087 Incremento 1 — 29-10-2026:** implementación en la rama `feat/adr087-input-contract`, sobre `main` `7d87338` (PR #9 integrado, confirmado por API). Descriptores v2 para nuevos registros, Ajv 8.20.0 fijado, perfil `tool-input/1`, codec legado separado, canonicalización v2 y validación común del Gateway/proveedores. V1 conserva fingerprints, hashes de solicitud y límites; los datos históricos no se migran. V2 admite hasta 1.024 caracteres Unicode y mantiene el control de 2.048 unidades UTF-16. Evidencia y límites en [validación del incremento](adr087-increment-1-validation.md). Pendiente crear el PR y completar revisión técnica/arquitectónica antes del merge; publicación por SSH por instrucción del responsable. Incremento 2 y Maintenance Backend siguen fuera de alcance.

Los estados anteriores siguientes son antecedentes históricos.

Fecha de actualización: 28-10-2026. Versión del proyecto: PoC 0.3.1.

## Estado actual

**Aprobación y autorización registradas — 28-10-2026:** ADR-087 Incremento 1 está aprobado y autorizado para implementación; ADR-088 está aprobada, por confirmación explícita del responsable comunicada fuera del repositorio. El [registro de aprobación](../decisions/087-increment-1-approval.md) conserva la procedencia y el alcance. No se requiere nueva ratificación. El PR #9 es exclusivamente documental; una vez integrado, la autorización vigente habilita iniciar el Incremento 1 en un PR funcional independiente con los criterios ya establecidos. No se añadió Ajv ni se cambió código/tests. El Incremento 2 y operaciones reales de mantenimiento no están autorizados. La implementación de Maintenance Backend queda fuera de este trabajo; su futuro inicio será M1 portable, sin privilegios OS prematuros.

**Antecedente histórico — inspección del 27-10-2026:** `main` en `a0af08d` incorporaba PR #7/#8 y todavía mostraba ADR-087 como propuesta no aprobada. No se localizaron revisiones ni comentarios de aprobación en GitHub y se detuvo la implementación para preparar el registro. Esa observación se conserva como evidencia histórica de las fuentes disponibles; la confirmación externa del 28-10-2026 resuelve el estado de aprobación y deja sin efecto la petición de nueva ratificación.

**PoC 0.3.1 cerrada dentro de su alcance.** Los seis casos de cierre fueron evaluados. Evidencia, run IDs, cambios, resultados y límites en [poc-031-closure.md](poc-031-closure.md).

- PoC 0.1: ejecución durable y aprobaciones.
- PoC 0.2: registro de herramientas, grants y revocación.
- PoC 0.3: planner secuencial y checkpoints con mock.
- PoC 0.3.1: autenticación de cuenta ChatGPT e inferencia real.
- Cierre: reutilización y revocación de grants con ChatGPT, routing automático real sin API keys comerciales, pruebas controladas de fallos/propuestas inválidas y límite de cinco propuestas.
- Endurecida la validación de campos adicionales; añadidos tres tests de cierre.

## Validación del cierre

`typecheck` y `test:core`: PASS (seis archivos de tests). Tests nuevos ejecutados directamente: 2/2 y 1/1. Integraciones v2/v3: PASS. Tres ejecuciones reales completadas y una denegada tras verificar la revocación; contenidos/ausencia de archivos y checkpoints comprobados. Sin grants activos al finalizar.

Los conteos de suites se solapan y no deben sumarse. Los resultados históricos y límites de arquitectura permanecen en [current-state.md](current-state.md).

## Consolidación posterior a PoC 0.3.1

PR #1 integrado en `main` (`efcb035`), con el commit de cierre `e487b70` como ancestro. Primer cambio de consolidación: CI offline para PR a `main`, Node 24 y dependencias del lockfile, con las suites existentes en un runner desechable y sin credenciales de modelos.

Validación nueva en copia temporal con instalación limpia: `npm ci`, typecheck, `test:core` **21/21** y las tres integraciones v1/v2/v3 PASS; actionlint v1.7.12 PASS. CI hospedada confirmada: [Offline CI, run 40284439972](https://github.com/Migueld1324/agent-runtime/actions/runs/40284439972), intento 4 `success`, job Ubuntu con todos los pasos PASS; configuración integrada en `main` por PR #2 (`1a36ba5`). Detalles en [verificación](verification.md#integración-continua-offline).

ADR-085: principios de estados/errores acordados, incluyendo recuperación explícita con máximo de dos intentos, compatibilidad conservadora, detención ante incertidumbre y `completed` solo tras verificar el objetivo. Contrato concreto de criterios/evidencia aprobado; primer verificador implementado para archivo Markdown y contenido exacto, con evidencia durable y recuperación exclusiva de comprobación. Validación local aislada: typecheck, 29/29 tests y las tres integraciones PASS. Ese primer incremento quedó integrado por PR #3 (`ba88410`). La evidencia remota citada corresponde al PR de CI, no acredita las modificaciones posteriores. El Gateway requiere su propuesta independiente. Diagnóstico y dependencias en [estado actual](current-state.md#consolidación-posterior-al-cierre--26-10-2026). La reconciliación de efectos inciertos permanece pendiente.

## Recuperación durable — ADR-086

Base `ba88410`, con PR #3 integrado. [ADR-086](../decisions/086-durable-invocations-and-recovery.md) está aprobada e implementada: stores SQLite separados, exclusión global de mutantes v3, reclamación atómica antes del Executor, resultado durable antes de grants/checkpoints y observaciones deduplicadas. Los fallos de modelo producen `paused` o `failed`; los efectos sin confirmación producen `uncertain`, con run suspendido sin retry.

`recover` comparte un presupuesto durable de dos órdenes entre modelo, verificador y reparación segura de continuidad. Conserva proveedor, criterio y resultados, rechaza órdenes despachadas y exige nuevo consentimiento si no se inició el Executor. `migrate` adapta interrupciones demostrablemente seguras v0/v1 a v2 sin borrar el historial. La reconciliación externa sigue pendiente.

La evidencia de typecheck, pruebas y las tres integraciones se registra en [verificación](verification.md#recuperación-durable--adr-086). No se atribuye al run hospedado anterior la validación de este incremento.

Integración comprobada el 27-10-2026 mediante la API de GitHub: [PR #4](https://github.com/Migueld1324/agent-runtime/pull/4) integrado en `main` a las 08:52:24 UTC, commit `a7b5c02676c9cfab4830e2e2170c0a46b1fac4ce`. Su commit fuente `b8758e94b4c66e9aced499425c547715e5bd5cd6` pasó [Offline CI, run 40324649673](https://github.com/Migueld1324/agent-runtime/actions/runs/40324649673), intento 1, con instalación, typecheck, pruebas e integraciones en `success`. El incremento de recuperación durable queda cerrado dentro del alcance de ADR-086; la Fase 0 continúa.

## Siguiente trabajo

Después de integrar el PR #9, implementar [ADR-087 Incremento 1](../decisions/087-tool-gateway-input-contract.md) en un PR independiente: validación común con Ajv/perfil restringido, descriptores v2 para nuevos registros, compatibilidad íntegra v1, huellas deterministas, identidad de solicitud separada y preservación de límites operativos. La aprobación arquitectónica ya está registrada; no se solicitará nuevamente. Ejecutar y persistir typecheck, regresiones, nuevas integraciones y casos adversariales antes de declarar el incremento terminado. La concurrencia entre runs, conciliación de efectos externos, MemoryService híbrido, Context Manager estructurado y routing por capacidades permanecen pendientes.

El alcance aprobado conserva la no ampliación de entradas y la separación entre huella del descriptor e identidad de solicitud. Transformación v2 se limita a 1.024 caracteres del schema para respetar 2.048 unidades UTF-16, conservando los límites v1. El Incremento 2 permanece sin autorizar y requiere además exclusión verificable de procesos antiguos, backend de mantenimiento y sus criterios de aceptación; el checkout actual no acredita esa exclusión y no puede aplicar migraciones.

## Propuesta de Maintenance Backend — 27-10-2026

**Antecedente histórico:** se conserva el estado observado al redactar la propuesta. La aprobación vigente de ADR-088 y ADR-087 Incremento 1 es la registrada arriba el 28-10-2026; no autoriza el Incremento 2 ni mantenimiento real.

Investigación documental sobre `origin/main` en `5aa4eac`, que ya contiene ADR-087 como propuesta. Se añade [ADR-088](../decisions/088-maintenance-backend.md), **no aprobada ni implementada**, sin modificar el contenido de ADR-085/086/087. Define contrato portable, autorización administrativa, exclusión mantenida ante procesos antiguos/no cooperativos, journal/ancla de evidencia y recuperación con admisión cerrada.

El [análisis](../architecture/maintenance-backend-analysis.md) contrasta persistencia/locking actuales, amenazas y alternativas. cgroup v2 solo aporta una parte del posible adaptador Linux; no demuestra control de acceso al almacenamiento, retirada de handles externos ni ausencia de I/O pendiente. Windows, macOS, broker y alternativas offline se evalúan sin declarar soporte ni introducir dependencias Linux en core.

El [plan M0–M6](maintenance-backend-plan.md) traza garantías a pruebas adversariales P01–P23, caídas C1–C8 y gates D1–D10. Son criterios pendientes, no resultados ejecutados. El Incremento 2 de ADR-087 continúa bloqueado; se conservan grants históricos sin transferencia a nuevas huellas y todos los runs deben ser terminales de forma demostrable. No se inició implementación, aprovisionamiento ni migración. Siguiente paso: revisión arquitectónica y aprobación explícita antes de implementar.
