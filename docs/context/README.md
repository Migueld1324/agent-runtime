# Índice canónico del proyecto

Esta carpeta reúne el **plan**, las **decisiones** y la **evidencia del progreso**, de modo que pueda trabajar cualquier agente/CLI sin depender del historial de una conversación ni de un modelo particular. Los archivos `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` y `.github/copilot-instructions.md` son **adaptadores de entrada**, no fuentes independientes de diseño.

## Orden de lectura recomendado

1. [`../../PROJECT_CONTEXT.md`](../../PROJECT_CONTEXT.md): resumen de una página.
2. [`VISION.md`](VISION.md): objetivos, alcance, no-objetivos.
3. [`DECISIONS.md`](DECISIONS.md): decisiones recuperadas, descartes y grado de certeza.
4. [`ARCHITECTURE.md`](ARCHITECTURE.md): mapa actual y objetivo; estado de implementación.
5. [`MODEL_ACCESS_AND_ROUTING.md`](MODEL_ACCESS_AND_ROUTING.md): modelos, autenticación y enrutamiento.
6. [`SECURITY_AND_TOOLS.md`](SECURITY_AND_TOOLS.md): Policy Gateway, scopes, herramientas y fronteras.
7. [`MEMORY_V03.md`](MEMORY_V03.md): contrato de memoria híbrida y experiencias.
8. [`POC_HISTORY.md`](POC_HISTORY.md): evolución 0.1 → 0.2 → 0.3.1.
9. [`TEST_EVIDENCE_2026-10-24.md`](TEST_EVIDENCE_2026-10-24.md): transcripción sanitizada de validación real.
10. [`ROADMAP.md`](ROADMAP.md): trabajo siguiente y criterios de salida.
11. [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md): decisiones no cerradas.
12. [`OPERATING_GUIDE.md`](OPERATING_GUIDE.md): comandos, prácticas CLI y transferencia entre sesiones.
13. [`PROVENANCE.md`](PROVENANCE.md): cómo se reconstruyó y cómo mantener la veracidad.
14. [`HANDOFF_TEMPLATE.md`](HANDOFF_TEMPLATE.md): formato reutilizable para registrar avances.

## Semántica de estados

- **Aprobado:** decisión expresamente aceptada o restricción fijada.
- **Implementado:** está en el código revisado del corte 0.3.1.
- **Validado en host:** hay evidencia de comandos/salidas aportada tras ejecutarlos localmente.
- **Diseñado, no implementado:** arquitectura acordada cuyo código aún falta.
- **Propuesto / por decidir:** alternativa para deliberación; **no** implica permiso de implementarla como decisión final.

Ante discrepancia: código + pruebas establecen **comportamiento actual**; `DECISIONS.md` establece **intención acordada**; propuestas nunca prevalecen sobre decisiones. El usuario resuelve contradicciones sustantivas.
