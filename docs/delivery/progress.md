# Registro de progreso

Fecha de actualización: 27-10-2026. Versión del proyecto: PoC 0.3.1.

## Estado actual

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

Continuar la Fase 0 de [roadmap.md](roadmap.md): revisar [ADR-087](../decisions/087-tool-gateway-input-contract.md), propuesta de validación extensible del Tool Gateway preparada sobre `ab22823`. Incluye alternativas, perfil inicial de `inputSchema`, conservación de huellas legado, migración explícita y pruebas de aceptación. **No está aprobada ni implementada.** Tras revisar el contrato, el primer incremento propuesto es validación común y compatibilidad; la migración administrativa se entrega por separado. La concurrencia entre runs, conciliación de efectos externos, MemoryService híbrido, Context Manager estructurado y routing por capacidades permanecen pendientes.
