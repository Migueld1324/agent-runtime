# Registro de decisiones arquitectónicas (ADR-001–087)

Este registro redacta cada decisión como parte de la **especificación de arquitectura**; no es una copia de turnos. Sus fundamentos se explican en las especificaciones de componentes y los capítulos siguientes. Los IDs son históricos y se conservan.

**Estado:** `baseline` = parte del diseño acordado, pero no necesariamente implementado; `retirada` = decisión anulada por una corrección posterior. Nunca interpretar un baseline como código existente. Las decisiones técnicas pueden evolucionar mediante nuevas enmiendas, no sobrescritura silenciosa.

## Capítulos
- [Fundamentos, memoria conceptual y Common Contracts](foundations.md) — ADR-001 a ADR-021
- [Modelos y Hybrid Routing](model-provider.md) — ADR-022 a ADR-037
- [Memoria y herramientas](memory-and-tools.md) — ADR-038 a ADR-057
- [Políticas y Agent Runtime](policy-and-runtime.md) — ADR-058 a ADR-084

## Enmiendas posteriores al baseline

- [ADR-085 — Fallos explícitos y recuperación controlada](085-runtime-failures-and-recovery.md): **aceptada, implementación incremental**. Verificador, errores explícitos y recuperación conservadora implementados; conciliación pendiente.

- [ADR-086 — Persistencia de invocaciones y exclusión de ejecución](086-durable-invocations-and-recovery.md): **aceptada e implementada**; concreta almacenamiento, exclusión, recuperación y migración conservadora.

- [ADR-087 — Validación extensible de entradas del Tool Gateway](087-tool-gateway-input-contract.md): **propuesta para revisión, no implementada**; perfil de `inputSchema`, compatibilidad de huellas y migración explícita de descriptores/grants.

## Excepciones y precedencia

- **ADR-035 retirada:** se descartó integrar plataformas externas de agentes; solo se integrarán proveedores de modelos LLM.
- **ADR-059 refinada:** default deny no bloquea el descubrimiento. ADR-068–072 incorporan registro seguro y aprobación bajo demanda.
- **Autenticación cloud:** la vía API key de PoC 0.3 no es obligación de arquitectura; PoC 0.3.1 permitió cuenta ChatGPT y mantuvo APIs como opción futura.
- **ADR-048:** no fusionar `ExecutionRecord`, `ExperienceRecord` y `MemoryEntry`.

## Consulta rápida por ID

| ID | Decisión | Estado |
|---|---|---|
| [ADR-001](foundations.md#adr-001) | Core independiente del sistema operativo | Baseline de diseño |
| [ADR-002](foundations.md#adr-002) | Modelos LLM intercambiables mediante adaptadores | Baseline de diseño |
| [ADR-003](foundations.md#adr-003) | Memoria relacional con tags y relaciones explícitas | Baseline de diseño |
| [ADR-004](foundations.md#adr-004) | SQLite inicial, persistencia desacoplada | Baseline de diseño |
| [ADR-005](foundations.md#adr-005) | Markdown Vault para conocimiento documental | Baseline de diseño |
| [ADR-006](foundations.md#adr-006) | Servicio unificado de recuperación de memoria | Baseline de diseño |
| [ADR-007](foundations.md#adr-007) | Índices textuales y semánticos regenerables | Baseline de diseño |
| [ADR-008](foundations.md#adr-008) | Memoria híbrida con revisión por políticas | Baseline de diseño |
| [ADR-009](foundations.md#adr-009) | Memory Service independiente de los agentes | Baseline de diseño |
| [ADR-010](foundations.md#adr-010) | Ámbitos por sesión, proyecto, persona y conocimiento compartido | Baseline de diseño |
| [ADR-011](foundations.md#adr-011) | Relaciones explícitas y procedencia verificable | Baseline de diseño |
| [ADR-012](foundations.md#adr-012) | Versiones, estados de vigencia y correcciones | Baseline de diseño |
| [ADR-013](foundations.md#adr-013) | Recuperación híbrida con filtrado previo por permisos | Baseline de diseño |
| [ADR-014](foundations.md#adr-014) | Persistencia portable, exportable y respaldable | Baseline de diseño |
| [ADR-015](foundations.md#adr-015) | Identidades explícitas para usuarios, agentes, dispositivos y ejecuciones | Baseline de diseño |
| [ADR-016](foundations.md#adr-016) | Capacidades identificadas mediante nombres y versiones estables | Baseline de diseño |
| [ADR-017](foundations.md#adr-017) | Resultados y errores estructurados, independientes del provider | Baseline de diseño |
| [ADR-018](foundations.md#adr-018) | Separación entre disponibilidad y autorización | Baseline de diseño |
| [ADR-019](foundations.md#adr-019) | Contexto y permisos controlados por el runtime confiable | Baseline de diseño |
| [ADR-020](foundations.md#adr-020) | Degradación elegante sin eludir políticas | Baseline de diseño |
| [ADR-021](foundations.md#adr-021) | Esquemas y contratos versionados para facilitar migraciones | Baseline de diseño |
| [ADR-022](model-provider.md#adr-022) | Separar `ModelProvider`, `ModelRegistry` y `ModelRouter` | Baseline de diseño |
| [ADR-023](model-provider.md#adr-023) | Inferencia y respuestas mediante contratos normalizados | Baseline de diseño |
| [ADR-024](model-provider.md#adr-024) | Descubrimiento explícito de capacidades y límites | Baseline de diseño |
| [ADR-025](model-provider.md#adr-025) | Tool Calling mediado obligatoriamente por el Agent Runtime | Baseline de diseño |
| [ADR-026](model-provider.md#adr-026) | Routing híbrido: elección manual y automatización opcional | Baseline de diseño |
| [ADR-027](model-provider.md#adr-027) | Autorización de privacidad antes de transmitir datos | Baseline de diseño |
| [ADR-028](model-provider.md#adr-028) | Gestión de contexto fuera del ModelProvider | Baseline de diseño |
| [ADR-029](model-provider.md#adr-029) | Streaming, cancelación y métricas como parte del contrato | Baseline de diseño |
| [ADR-030](model-provider.md#adr-030) | Fallback compatible con políticas y estado de ejecución | Baseline de diseño |
| [ADR-031](model-provider.md#adr-031) | `EmbeddingProvider` separado de la inferencia generativa | Baseline de diseño |
| [ADR-032](model-provider.md#adr-032) | Hybrid Routing con selección explícita por tarea o sesión | Baseline de diseño |
| [ADR-033](model-provider.md#adr-033) | Routing automático basado en capacidades, políticas y métricas | Baseline de diseño |
| [ADR-034](model-provider.md#adr-034) | Estado del modelo activo expuesto mediante eventos independientes de la interfaz | Baseline de diseño |
| [ADR-035](model-provider.md#adr-035) | Contratos distintos para inferencia y delegación a agentes externos | Retirada |
| [ADR-036](model-provider.md#adr-036) | Registro extensible de proveedores, sin modificar el núcleo | Baseline de diseño |
| [ADR-037](model-provider.md#adr-037) | Fallback controlado, sin sustituir silenciosamente modelos fijados ni eludir políticas | Baseline de diseño |
| [ADR-038](memory-and-tools.md#adr-038) | `MemoryService` independiente de los agentes | Baseline de diseño |
| [ADR-039](memory-and-tools.md#adr-039) | `MemoryProvider` desacoplado del almacenamiento físico | Baseline de diseño |
| [ADR-040](memory-and-tools.md#adr-040) | Memorias tipadas, versionadas y con procedencia | Baseline de diseño |
| [ADR-041](memory-and-tools.md#adr-041) | Persistencia híbrida mediante políticas de admisión | Baseline de diseño |
| [ADR-042](memory-and-tools.md#adr-042) | Fuente canónica diferenciada para SQL y Markdown | Baseline de diseño |
| [ADR-043](memory-and-tools.md#adr-043) | Indexación derivada, regenerable y recuperable | Baseline de diseño |
| [ADR-044](memory-and-tools.md#adr-044) | Búsqueda unificada con filtros de ámbitos y permisos | Baseline de diseño |
| [ADR-045](memory-and-tools.md#adr-045) | Relaciones explícitas entre recursos de conocimiento | Baseline de diseño |
| [ADR-046](memory-and-tools.md#adr-046) | Gestión de contradicciones, obsolescencia y correcciones | Baseline de diseño |
| [ADR-047](memory-and-tools.md#adr-047) | Exportación portable y operaciones de eliminación definidas | Baseline de diseño |
| [ADR-048](memory-and-tools.md#adr-048) | Separación entre experiencia operativa y conocimiento reutilizable | Baseline de diseño |
| [ADR-049](memory-and-tools.md#adr-049) | Herramientas identificadas por capacidades estables | Baseline de diseño |
| [ADR-050](memory-and-tools.md#adr-050) | Registro y descubrimiento dinámico de herramientas | Baseline de diseño |
| [ADR-051](memory-and-tools.md#adr-051) | `Tool Gateway` como punto obligatorio de autorización | Baseline de diseño |
| [ADR-052](memory-and-tools.md#adr-052) | Separación entre descriptor, autorización y ejecución | Baseline de diseño |
| [ADR-053](memory-and-tools.md#adr-053) | Preferencia por herramientas específicas frente a shell genérico | Baseline de diseño |
| [ADR-054](memory-and-tools.md#adr-054) | Ejecución delimitada por permisos, recursos y tiempos | Baseline de diseño |
| [ADR-055](memory-and-tools.md#adr-055) | Adaptadores por sistema operativo y entorno | Baseline de diseño |
| [ADR-056](memory-and-tools.md#adr-056) | Auditoría y experiencias derivadas de ejecuciones | Baseline de diseño |
| [ADR-057](memory-and-tools.md#adr-057) | Integraciones externas mediante adaptadores controlados | Baseline de diseño |
| [ADR-058](policy-and-runtime.md#adr-058) | Separar decisión y cumplimiento de políticas | Baseline de diseño |
| [ADR-059](policy-and-runtime.md#adr-059) | Default deny y principio de mínimo privilegio | Baseline de diseño |
| [ADR-060](policy-and-runtime.md#adr-060) | Permisos por operación, tarea y workspace | Baseline de diseño |
| [ADR-061](policy-and-runtime.md#adr-061) | Aprobaciones vinculadas a recursos y restricciones | Baseline de diseño |
| [ADR-062](policy-and-runtime.md#adr-062) | Autorización transversal para modelos, memoria y herramientas | Baseline de diseño |
| [ADR-063](policy-and-runtime.md#adr-063) | Restricciones efectivas de ejecución y recursos | Baseline de diseño |
| [ADR-064](policy-and-runtime.md#adr-064) | Datos externos sin autoridad para modificar políticas | Baseline de diseño |
| [ADR-065](policy-and-runtime.md#adr-065) | Delegación de permisos sin escalamiento de privilegios | Baseline de diseño |
| [ADR-066](policy-and-runtime.md#adr-066) | Auditoría y revocación de autorizaciones | Baseline de diseño |
| [ADR-067](policy-and-runtime.md#adr-067) | Políticas portables y desacopladas del sistema operativo | Baseline de diseño |
| [ADR-068](policy-and-runtime.md#adr-068) | Separar registro, disponibilidad, confianza y autorización | Baseline de diseño |
| [ADR-069](policy-and-runtime.md#adr-069) | Approval on Demand para capacidades sin políticas específicas | Baseline de diseño |
| [ADR-070](policy-and-runtime.md#adr-070) | Herencia controlada de permisos por capacidades | Baseline de diseño |
| [ADR-071](policy-and-runtime.md#adr-071) | Registro validado de herramientas e integraciones nuevas | Baseline de diseño |
| [ADR-072](policy-and-runtime.md#adr-072) | Reevaluación de permisos cuando cambian los privilegios de una herramienta | Baseline de diseño |
| [ADR-073](policy-and-runtime.md#adr-073) | Runtime como coordinador, independiente del LLM | Baseline de diseño |
| [ADR-074](policy-and-runtime.md#adr-074) | Separación entre Session, Run y Step | Baseline de diseño |
| [ADR-075](policy-and-runtime.md#adr-075) | Máquina de estados persistente | Baseline de diseño |
| [ADR-076](policy-and-runtime.md#adr-076) | Planificación incremental y verificable | Baseline de diseño |
| [ADR-077](policy-and-runtime.md#adr-077) | Checkpoints y recuperación tras interrupciones | Baseline de diseño |
| [ADR-078](policy-and-runtime.md#adr-078) | Control de reintentos y efectos secundarios | Baseline de diseño |
| [ADR-079](policy-and-runtime.md#adr-079) | Aprobaciones que suspenden y reanudan ejecuciones | Baseline de diseño |
| [ADR-080](policy-and-runtime.md#adr-080) | Context Manager independiente de MemoryProvider | Baseline de diseño |
| [ADR-081](policy-and-runtime.md#adr-081) | Presupuestos de ejecución y detección de estancamiento | Baseline de diseño |
| [ADR-082](policy-and-runtime.md#adr-082) | Eventos observables para cualquier interfaz | Baseline de diseño |
| [ADR-083](policy-and-runtime.md#adr-083) | Consolidación de experiencias al cerrar una ejecución | Baseline de diseño |
| [ADR-084](policy-and-runtime.md#adr-084) | Extensibilidad multiagente sin dependencia inicial | Baseline de diseño |
| [ADR-085](085-runtime-failures-and-recovery.md) | Fallos explícitos y recuperación controlada del runtime | Aceptada; implementación incremental |
| [ADR-086](086-durable-invocations-and-recovery.md) | Persistencia de invocaciones y exclusión de ejecución | Aceptada e implementada |
| [ADR-087](087-tool-gateway-input-contract.md) | Validación extensible de entradas del Tool Gateway | Propuesta para revisión |
