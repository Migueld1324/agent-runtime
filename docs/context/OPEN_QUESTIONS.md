# Decisiones abiertas y riesgos — NO tratarlas como acuerdos

| Área | Pregunta pendiente | Restricción conocida |
|---|---|---|
| Memoria | ¿Campos mínimos y esquema versionado de `MemoryEntry`/`ExperienceRecord`? | Deben ser distintos, vinculables y con procedencia. |
| Memoria | ¿Cómo se admite una propuesta, cuándo requiere revisión humana, cuándo se descarta? | No elevar automáticamente una experiencia a conocimiento universal. |
| Memoria | ¿Canonicidad específica por tipo entre SQLite y Vault Markdown? | Nunca dos fuentes de verdad independientes. |
| Memoria | ¿Semántica operacional de `forget`, `purge`, `archive`, `supersede`, backup y export? | Ámbitos, permisos, portabilidad y trazabilidad con privacidad. |
| Recuperación | ¿FTS inicial, embeddings opcionales, ranking, deduplicación y budgets? | Debe funcionar con degradación controlada y filtrado de permiso previo. |
| Modelo | ¿Contrato exacto de inferencia/propuestas de tools/streaming y negociación de capacidades? | No delegar agentes externos; provider/model agnóstico. |
| Routing | ¿Cómo ponderar modelos, privacidad, coste, cuota, velocidad y riesgo? | Manual/auto, transparencia de elección, sin fallback comercial silencioso. |
| Autenticación | ¿Cómo abstraer OAuth, API-key futura y endpoint local sin exponer secretos? | Cuenta actual funcional; APIs de pago no son requisito actual. |
| Tooling | ¿Qué esquema de registro dinámico, review y approvals escalable? | Default-deny y registro separado de ejecución. |
| Seguridad | ¿Modelo de identidad/scope, multiusuario, logs, revocación y sandbox para plugins? | PoC no es sandbox; no aumentar privilegios sin ADR. |
| Runtime | ¿Replays deterministas e idempotencia de side effects en crashes? | Mantener controles de checkpoint/permiso. |
| Producto | ¿Scheduler, multiagente, UI, sync entre equipos? | Primero local en una sola PC; portabilidad preservada. |
| Historial | ¿Dónde están los textos originales ADR-001... y ADR-038–047? | No asignar números/títulos inventados. |

**Regla:** propuestas por agentes deben ir acompañadas de trade-offs y etiqueta `Propuesto`; una decisión cambia a `Aprobado` solo si el usuario la confirma. No convertir detalles técnicos recomendados en políticas inmutables por mera inclusión aquí.
