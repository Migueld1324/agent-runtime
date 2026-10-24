# Architecture Decision Records — original index (ADR-001–084)

> **Status conventions:** This index transcribes the historical decision titles from the complete conversation. An ADR mentioned in an assistant message was originally *proposed*; approval of an architectural baseline does not imply that its functionality is implemented. ADR-035 was **explicitly rejected/superseded** by the user. The full technical arguments, alternatives, interfaces and context are preserved in `docs/source/`. Most ADRs were accepted as part of the evolving conceptual baseline; individual production design and testing remain open.

The line numbers refer to the user-provided Markdown export (not Git source lines). Each source document has ordered `T###` turn identifiers for locating the original dialogue. Do not reconstruct or overwrite these from vague recollections.

## Fundamentos y persistencia

| ID | Decision in original plan | Status | Evidence |
|---|---|---|---|
| ADR-001 | Core independiente del sistema operativo | Conceptual baseline | [Source](../source/01-foundations.md) · MD L8701 |
| ADR-002 | Modelos LLM intercambiables mediante adaptadores | Conceptual baseline | [Source](../source/01-foundations.md) · MD L8702 |
| ADR-003 | Memoria relacional con tags y relaciones explícitas | Conceptual baseline | [Source](../source/01-foundations.md) · MD L8703 |
| ADR-004 | SQLite inicial, persistencia desacoplada | Conceptual baseline | [Source](../source/01-foundations.md) · MD L8704 |
| ADR-005 | Markdown Vault para conocimiento documental | Conceptual baseline | [Source](../source/01-foundations.md) · MD L8705 |
| ADR-006 | Servicio unificado de recuperación de memoria | Conceptual baseline | [Source](../source/01-foundations.md) · MD L8706 |
| ADR-007 | Índices textuales y semánticos regenerables | Conceptual baseline | [Source](../source/01-foundations.md) · MD L8707 |

## Arquitectura de memoria v0.3

| ID | Decision in original plan | Status | Evidence |
|---|---|---|---|
| ADR-008 | Memoria híbrida con revisión por políticas | Conceptual baseline | [Source](../source/01-foundations.md) · MD L9149 |
| ADR-009 | Memory Service independiente de los agentes | Conceptual baseline | [Source](../source/01-foundations.md) · MD L9150 |
| ADR-010 | Ámbitos por sesión, proyecto, persona y conocimiento compartido | Conceptual baseline | [Source](../source/01-foundations.md) · MD L9151 |
| ADR-011 | Relaciones explícitas y procedencia verificable | Conceptual baseline | [Source](../source/01-foundations.md) · MD L9152 |
| ADR-012 | Versiones, estados de vigencia y correcciones | Conceptual baseline | [Source](../source/01-foundations.md) · MD L9153 |
| ADR-013 | Recuperación híbrida con filtrado previo por permisos | Conceptual baseline | [Source](../source/01-foundations.md) · MD L9154 |
| ADR-014 | Persistencia portable, exportable y respaldable | Conceptual baseline | [Source](../source/01-foundations.md) · MD L9155 |

## Common Contracts

| ID | Decision in original plan | Status | Evidence |
|---|---|---|---|
| ADR-015 | Identidades explícitas para usuarios, agentes, dispositivos y ejecuciones | Conceptual baseline | [Source](../source/02-common-contracts.md) · MD L9860 |
| ADR-016 | Capacidades identificadas mediante nombres y versiones estables | Conceptual baseline | [Source](../source/02-common-contracts.md) · MD L9861 |
| ADR-017 | Resultados y errores estructurados, independientes del provider | Conceptual baseline | [Source](../source/02-common-contracts.md) · MD L9862 |
| ADR-018 | Separación entre disponibilidad y autorización | Conceptual baseline | [Source](../source/02-common-contracts.md) · MD L9863 |
| ADR-019 | Contexto y permisos controlados por el runtime confiable | Conceptual baseline | [Source](../source/02-common-contracts.md) · MD L9864 |
| ADR-020 | Degradación elegante sin eludir políticas | Conceptual baseline | [Source](../source/02-common-contracts.md) · MD L9865 |
| ADR-021 | Esquemas y contratos versionados para facilitar migraciones | Conceptual baseline | [Source](../source/02-common-contracts.md) · MD L9866 |

## ModelProvider / routing

| ID | Decision in original plan | Status | Evidence |
|---|---|---|---|
| ADR-022 | Separar `ModelProvider`, `ModelRegistry` y `ModelRouter` | Conceptual baseline | [Source](../source/03-models.md) · MD L10406 |
| ADR-023 | Inferencia y respuestas mediante contratos normalizados | Conceptual baseline | [Source](../source/03-models.md) · MD L10407 |
| ADR-024 | Descubrimiento explícito de capacidades y límites | Conceptual baseline | [Source](../source/03-models.md) · MD L10408 |
| ADR-025 | Tool Calling mediado obligatoriamente por el Agent Runtime | Conceptual baseline | [Source](../source/03-models.md) · MD L10409 |
| ADR-026 | Routing híbrido: elección manual y automatización opcional | Conceptual baseline | [Source](../source/03-models.md) · MD L10410 |
| ADR-027 | Autorización de privacidad antes de transmitir datos | Conceptual baseline | [Source](../source/03-models.md) · MD L10411 |
| ADR-028 | Gestión de contexto fuera del ModelProvider | Conceptual baseline | [Source](../source/03-models.md) · MD L10412 |
| ADR-029 | Streaming, cancelación y métricas como parte del contrato | Conceptual baseline | [Source](../source/03-models.md) · MD L10413 |
| ADR-030 | Fallback compatible con políticas y estado de ejecución | Conceptual baseline | [Source](../source/03-models.md) · MD L10414 |
| ADR-031 | `EmbeddingProvider` separado de la inferencia generativa | Conceptual baseline | [Source](../source/03-models.md) · MD L10415 |
| ADR-032 | Hybrid Routing con selección explícita por tarea o sesión | Conceptual baseline | [Source](../source/03-models.md) · MD L10659 |
| ADR-033 | Routing automático basado en capacidades, políticas y métricas | Conceptual baseline | [Source](../source/03-models.md) · MD L10660 |
| ADR-034 | Estado del modelo activo expuesto mediante eventos independientes de la interfaz | Conceptual baseline | [Source](../source/03-models.md) · MD L10661 |
| ADR-035 | Contratos distintos para inferencia y delegación a agentes externos | **Rejected / superseded** | [Source](../source/03-models.md) · MD L10662 |
| ADR-036 | Registro extensible de proveedores, sin modificar el núcleo | Conceptual baseline | [Source](../source/03-models.md) · MD L10663 |
| ADR-037 | Fallback controlado, sin sustituir silenciosamente modelos fijados ni eludir políticas | Conceptual baseline | [Source](../source/03-models.md) · MD L10664 |

## MemoryProvider / Knowledge-Experience

| ID | Decision in original plan | Status | Evidence |
|---|---|---|---|
| ADR-038 | `MemoryService` independiente de los agentes | Conceptual baseline | [Source](../source/04-memory.md) · MD L11378 |
| ADR-039 | `MemoryProvider` desacoplado del almacenamiento físico | Conceptual baseline | [Source](../source/04-memory.md) · MD L11379 |
| ADR-040 | Memorias tipadas, versionadas y con procedencia | Conceptual baseline | [Source](../source/04-memory.md) · MD L11380 |
| ADR-041 | Persistencia híbrida mediante políticas de admisión | Conceptual baseline | [Source](../source/04-memory.md) · MD L11381 |
| ADR-042 | Fuente canónica diferenciada para SQL y Markdown | Conceptual baseline | [Source](../source/04-memory.md) · MD L11382 |
| ADR-043 | Indexación derivada, regenerable y recuperable | Conceptual baseline | [Source](../source/04-memory.md) · MD L11383 |
| ADR-044 | Búsqueda unificada con filtros de ámbitos y permisos | Conceptual baseline | [Source](../source/04-memory.md) · MD L11384 |
| ADR-045 | Relaciones explícitas entre recursos de conocimiento | Conceptual baseline | [Source](../source/04-memory.md) · MD L11385 |
| ADR-046 | Gestión de contradicciones, obsolescencia y correcciones | Conceptual baseline | [Source](../source/04-memory.md) · MD L11386 |
| ADR-047 | Exportación portable y operaciones de eliminación definidas | Conceptual baseline | [Source](../source/04-memory.md) · MD L11387 |
| ADR-048 | Separación entre experiencia operativa y conocimiento reutilizable | Conceptual baseline | [Source](../source/04-memory.md) · MD L11555 |

## ToolProvider

| ID | Decision in original plan | Status | Evidence |
|---|---|---|---|
| ADR-049 | Herramientas identificadas por capacidades estables | Conceptual baseline | [Source](../source/05-tools.md) · MD L11966 |
| ADR-050 | Registro y descubrimiento dinámico de herramientas | Conceptual baseline | [Source](../source/05-tools.md) · MD L11967 |
| ADR-051 | `Tool Gateway` como punto obligatorio de autorización | Conceptual baseline | [Source](../source/05-tools.md) · MD L11968 |
| ADR-052 | Separación entre descriptor, autorización y ejecución | Conceptual baseline | [Source](../source/05-tools.md) · MD L11969 |
| ADR-053 | Preferencia por herramientas específicas frente a shell genérico | Conceptual baseline | [Source](../source/05-tools.md) · MD L11970 |
| ADR-054 | Ejecución delimitada por permisos, recursos y tiempos | Conceptual baseline | [Source](../source/05-tools.md) · MD L11971 |
| ADR-055 | Adaptadores por sistema operativo y entorno | Conceptual baseline | [Source](../source/05-tools.md) · MD L11972 |
| ADR-056 | Auditoría y experiencias derivadas de ejecuciones | Conceptual baseline | [Source](../source/05-tools.md) · MD L11973 |
| ADR-057 | Integraciones externas mediante adaptadores controlados | Conceptual baseline | [Source](../source/05-tools.md) · MD L11974 |

## Policy Engine

| ID | Decision in original plan | Status | Evidence |
|---|---|---|---|
| ADR-058 | Separar decisión y cumplimiento de políticas | Conceptual baseline | [Source](../source/06-policies.md) · MD L12603 |
| ADR-059 | Default deny y principio de mínimo privilegio | Conceptual baseline | [Source](../source/06-policies.md) · MD L12604 |
| ADR-060 | Permisos por operación, tarea y workspace | Conceptual baseline | [Source](../source/06-policies.md) · MD L12605 |
| ADR-061 | Aprobaciones vinculadas a recursos y restricciones | Conceptual baseline | [Source](../source/06-policies.md) · MD L12606 |
| ADR-062 | Autorización transversal para modelos, memoria y herramientas | Conceptual baseline | [Source](../source/06-policies.md) · MD L12607 |
| ADR-063 | Restricciones efectivas de ejecución y recursos | Conceptual baseline | [Source](../source/06-policies.md) · MD L12608 |
| ADR-064 | Datos externos sin autoridad para modificar políticas | Conceptual baseline | [Source](../source/06-policies.md) · MD L12609 |
| ADR-065 | Delegación de permisos sin escalamiento de privilegios | Conceptual baseline | [Source](../source/06-policies.md) · MD L12610 |
| ADR-066 | Auditoría y revocación de autorizaciones | Conceptual baseline | [Source](../source/06-policies.md) · MD L12611 |
| ADR-067 | Políticas portables y desacopladas del sistema operativo | Conceptual baseline | [Source](../source/06-policies.md) · MD L12612 |
| ADR-068 | Separar registro, disponibilidad, confianza y autorización | Conceptual baseline | [Source](../source/06-policies.md) · MD L12928 |
| ADR-069 | Approval on Demand para capacidades sin políticas específicas | Conceptual baseline | [Source](../source/06-policies.md) · MD L12929 |
| ADR-070 | Herencia controlada de permisos por capacidades | Conceptual baseline | [Source](../source/06-policies.md) · MD L12930 |
| ADR-071 | Registro validado de herramientas e integraciones nuevas | Conceptual baseline | [Source](../source/06-policies.md) · MD L12931 |
| ADR-072 | Reevaluación de permisos cuando cambian los privilegios de una herramienta | Conceptual baseline | [Source](../source/06-policies.md) · MD L12932 |

## Agent Runtime

| ID | Decision in original plan | Status | Evidence |
|---|---|---|---|
| ADR-073 | Runtime como coordinador, independiente del LLM | Conceptual baseline | [Source](../source/07-runtime.md) · MD L13677 |
| ADR-074 | Separación entre Session, Run y Step | Conceptual baseline | [Source](../source/07-runtime.md) · MD L13678 |
| ADR-075 | Máquina de estados persistente | Conceptual baseline | [Source](../source/07-runtime.md) · MD L13679 |
| ADR-076 | Planificación incremental y verificable | Conceptual baseline | [Source](../source/07-runtime.md) · MD L13680 |
| ADR-077 | Checkpoints y recuperación tras interrupciones | Conceptual baseline | [Source](../source/07-runtime.md) · MD L13681 |
| ADR-078 | Control de reintentos y efectos secundarios | Conceptual baseline | [Source](../source/07-runtime.md) · MD L13682 |
| ADR-079 | Aprobaciones que suspenden y reanudan ejecuciones | Conceptual baseline | [Source](../source/07-runtime.md) · MD L13683 |
| ADR-080 | Context Manager independiente de MemoryProvider | Conceptual baseline | [Source](../source/07-runtime.md) · MD L13684 |
| ADR-081 | Presupuestos de ejecución y detección de estancamiento | Conceptual baseline | [Source](../source/07-runtime.md) · MD L13685 |
| ADR-082 | Eventos observables para cualquier interfaz | Conceptual baseline | [Source](../source/07-runtime.md) · MD L13686 |
| ADR-083 | Consolidación de experiencias al cerrar una ejecución | Conceptual baseline | [Source](../source/07-runtime.md) · MD L13687 |
| ADR-084 | Extensibilidad multiagente sin dependencia inicial | Conceptual baseline | [Source](../source/07-runtime.md) · MD L13688 |

## Amendments that override earlier drafts

- **ADR-035 is rejected**: the earlier proposal to distinguish `External Agent Adapter` from model inference was explicitly withdrawn after the user clarified that only LLM model providers (GPT, Claude, Gemini, local models) should be integrated. This project's agent orchestration remains first-party.
- **ADR-059 default deny is retained**, but is *not* a ban on unknown tools. ADR-068–072 clarify discovery, validation, approval-on-demand, inheritance, reauthorization for privilege changes, and least privilege. An unregistered tool is not silently executable; it may follow a controlled onboarding and approval workflow.
- **Hybrid routing** is explicit manual task/session choices first and policy-compliant automatic fallback when no choice is set. The primitive PoC `auto` mode was intentionally implemented as offline mock by default; it is NOT proof of intelligent routing.
- **Authentication is not equivalent to inference:** OAuth/plan-eligible authentication was added in PoC 0.3.1 after PoC 0.3's API-key-only path proved unusable for current testing. API keys are optional future credentials, not forbidden.
- **Memory is not a single transcript:** `ExecutionRecord` (raw technical event), `ExperienceRecord` (context and trial/error), `MemoryEntry` (concise knowledge) are separate, related resources.

## ADR governance

When making an implementation change: identify relevant ADR IDs, read the full technical rationale and subsequent amendments in the source turn(s), compare against repository code, write a new ADR amendment or supersession, and include tests. Never treat a proposal from earlier in the same conversation as more authoritative than a later explicit user correction.
