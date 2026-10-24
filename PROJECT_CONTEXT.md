# Contexto de transferencia — agent-runtime

**Fecha del corte:** 2026-10-24. **Idioma de trabajo:** español. **Estado general:** PoC 0.3.1 funcional y validada localmente; la arquitectura completa del asistente sigue en desarrollo.

> Este documento es el resumen de entrada. La **fuente canónica** de decisiones y progreso está en [`docs/context/`](docs/context/README.md), no en un proveedor de LLM o en una sesión de chat. Lee los detalles antes de planificar.

## Propósito

Construir un asistente personal de IA portable y local-first, con runtime, memoria híbrida, herramientas, permisos y orquestación **propios**, capaz de consumir distintos modelos en la nube o locales. El primer despliegue se hace en una sola PC; la portabilidad a otros sistemas/PC se conserva desde el diseño.

## Lo acordado (no volver a decidirlo sin motivo)

- **No** delegar agentes a plataformas como Antigravity, Hermes, OpenClaw o Codex. Pueden inspirar mecanismos, pero este proyecto crea su propio orquestador. Los proveedores externos aportan inferencia.
- Interfaces desacopladas por capacidades (`ModelProvider`, `ToolProvider`, `MemoryProvider`), junto con política y degradación controlada.
- Memoria **híbrida**: conocimiento `MemoryEntry`, experiencias `ExperienceRecord`, SQLite estructurado y Vault Markdown opcional, sin duplicar fuentes canónicas. Ámbitos y permisos, versionado, procedencia, recuperación y ciclo de vida controlado.
- Routing de modelos **híbrido** como objetivo: elección manual por tarea/sesión y automática cuando corresponda, siempre visible para el usuario; sin cambiar el núcleo para añadir proveedores.
- Herramientas nuevas: descubrimiento/registro separado de autorización; **default-deny**, aprobación bajo demanda, revalidación de grants/descriptor.
- Las PoC son **evolutivas**: se siguen desarrollando en este repositorio versionado en Git.

## Situación real validada

PoC 0.1: runtime/políticas/archivos básicos. PoC 0.2: registro confiable de tools, grants, política y autorización persistente. PoC 0.3.1: planificación secuencial LangGraph, checkpoint SQLite, adaptador ChatGPT con autenticación por cuenta y API comerciales opcionales/no requeridas. El usuario ejecutó y reportó **18/18 tests unitarios**, **integración v2 y v3 PASS**, `typecheck` completado sin errores reportados, **aprobación real** en dos tools y **denegación real** de escritura sin creación del archivo. Véanse [`POC_HISTORY.md`](docs/context/POC_HISTORY.md) y [`TEST_EVIDENCE_2026-10-24.md`](docs/context/TEST_EVIDENCE_2026-10-24.md).

## No confundir con capacidades actuales

**No implementado aún**: `MemoryService` y memoria híbrida v0.3, `ExperienceRecord` persistente, embeddings/retrieval, agentes multiagente, routing automático inteligente, scheduler y sandbox de plugins/OS. El `auto` actual usa prioridad/disponibilidad y por defecto `mock`; `mock` **no es un LLM local**. Las herramientas del PoC solo aceptan operaciones limitadas en `workspace/` y `.md`.

## Próxima dirección

1. Mantener tests del runtime y documentar sus límites.
2. Diseñar contratos de memoria independientes del almacenamiento, empezando por `MemoryEntry` y `ExperienceRecord`, preservando trazabilidad y seguridad; después implementar vertical slice pequeño con tests.
3. Extender proveedores/herramientas de forma incremental sin eliminar controles ni forzar APIs comerciales.

**Ir a:** [Índice](docs/context/README.md) · [Decisiones](docs/context/DECISIONS.md) · [Arquitectura](docs/context/ARCHITECTURE.md) · [Memoria](docs/context/MEMORY_V03.md) · [Roadmap](docs/context/ROADMAP.md) · [Cómo continuar con CLI](docs/context/OPERATING_GUIDE.md).
