# Registro de progreso

Fecha de actualización: 26-10-2026. Versión del proyecto: PoC 0.3.1.

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

Validación nueva en copia temporal con instalación limpia: `npm ci`, typecheck, `test:core` **21/21** y las tres integraciones v1/v2/v3 PASS; actionlint v1.7.12 PASS. Ejecución hospedada en GitHub pendiente de PR. Detalles en [verificación](verification.md#integración-continua-offline).

Los contratos de estados/errores y del Gateway siguen pendientes de aprobación antes de implementarse. Diagnóstico y dependencias en [estado actual](current-state.md#consolidación-posterior-al-cierre--26-10-2026). La reconciliación de efectos inciertos permanece pendiente.

## Siguiente trabajo

Continuar la Fase 0 de [roadmap.md](roadmap.md): validar CI en GitHub y acordar el contrato de estados/checkpoint antes de implementarlo. MemoryService híbrido, Context Manager estructurado y routing por capacidades siguen pendientes de implementación.
