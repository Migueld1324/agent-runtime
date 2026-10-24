# Memoria híbrida v0.3 — diseño acordado, sin implementación

**Estado:** diseño aprobado en sus principios; **no** hay todavía un subsistema `MemoryService` en el repositorio de PoC 0.3.1. El sufijo **v0.3 de memoria** se refiere al diseño conceptual, no a la versión ejecutable 0.3 del runtime.

## Propósito

Que el asistente conserve conocimiento, preferencias, decisiones y contexto de manera portable, trazable y recuperable, sin depender del historial completo de chat, del LLM ni de una base opaca de un proveedor. Debe poder archivar, corregir, olvidar/exportar y volver a indexar. `MemoryService` es el responsable del ciclo de vida y de aplicar permisos; `MemoryProvider` es el contrato que evita que la lógica de memoria dependa de SQLite/Markdown/vector DB específica.

## Dos recursos distintos, relacionables

| Recurso | Contenido | Ejemplo conceptual | Riesgo a evitar |
|---|---|---|---|
| `MemoryEntry` | Conocimiento/pauta concisa potencialmente reusable; tipada, versionada, con ámbito, procedencia y estado. | «Para este tipo de reparación fue eficaz probar X después de comprobar Y» **solo si hay evidencia suficiente**. | Elevar una observación aislada a verdad universal. |
| `ExperienceRecord` | Secuencia operativa contextual: objetivo, entorno, intentos, errores, observaciones y resultado. | «En CachyOS y bajo condición Z, comando A falló; luego B funcionó». | Reducir toda una experiencia a una regla sin condiciones. |

Una experiencia puede **respaldar** una entrada de conocimiento mediante relación explícita (y una entrada puede apuntar a múltiples experiencias). El esquema concreto de entidades/relaciones sigue por definirse; la distinción semántica está aprobada.

## Principios del contrato de memoria (aprobados a nivel arquitectónico)

- Memoria tipada, con versiones, procedencia/fecha/confianza o evidencia suficiente para revisión; no texto suelto indistinguible.
- Ámbitos conceptuales: **Session, Project, Personal, Shared**; filtrado por autorización antes de recuperar o revelar información; no suponer que `Shared` significa público.
- Ciclo de vida con propuesta/captura, revisión/admisión, recuperación, actualización/corrección, `archive`, `supersede`, `forget` y `purge` según semántica/permiso que deberá formalizarse. No almacenar automáticamente todo el historial.
- Recuperación híbrida: filtros de ámbito/permisos, búsqueda por texto (FTS) y, donde esté disponible, vectores/reranking como índices **derivados y regenerables**; fallar de forma útil si embeddings no están presentes.
- Relaciones, etiquetas y fuentes explícitas. Contradicciones, obsolescencia y correcciones no deben desaparecer en silencio; conservar trazabilidad proporcional a privacidad y borrado.
- Export/import portable y posibilidad de reconstruir índices derivados sin atar datos al modelo de embeddings o al proveedor.

## Persistencia híbrida sin dos fuentes de verdad

- **SQLite estructurado** es el almacén inicial de registros transaccionales, metadatos, scopes/relaciones y estados de memoria (modelo conceptual). 
- **Markdown Vault (tipo Obsidian)** es deseable para documentos/notas legibles y controlables por humanos, de forma opcional.
- Una entidad o clase de documento debe tener **una fuente canónica declarada**. No mantener como autoridad dos copias independientes SQLite+Markdown del mismo hecho. Si un Markdown es canónico, SQLite puede guardar proyecciones/referencias e índices regenerables; si una entrada estructurada es canónica, una vista Markdown es exportación/proyección, no origen adicional. **El mapeo concreto por tipo queda por diseñar.**
- Evitar dependencias de funcionalidades exclusivas de Obsidian y rutas absolutas del equipo.

## Flujo de ejemplo (ilustrativo, no implementado)

```text
Interacción / herramienta -> ExperienceRecord propuesta -> validación + scope
                                  | 
                                  +-> posible MemoryEntry derivada, con evidencia
                                         |
                                MemoryService / políticas
                                         |
                          persistencia canónica + índices derivados
                                         |
                 recall: ACL/scope -> búsqueda -> ranking -> contexto al agente
```

## Decisiones que faltan (no inventar en código)

Modelo mínimo de tipos/IDs/versión/estado y relaciones; semántica de confianza y procedencia; retención por scope; criterios de admisión/confirmación automática o humana; política de capturar secretos/PII; resolución de conflictos; operaciones `forget` frente a `purge` con backups/proyecciones; estrategia de índices y migraciones; organización física de Vault. Ver [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md).

## Vertical slice recomendado (propuesta de plan)

Definir contratos y pruebas de `MemoryEntry`/`ExperienceRecord` y scopes; implementar SQLite para ambos; registrar una experiencia de una ejecución ficticia; derivar una entrada de conocimiento aprobada y vinculada; buscar/revocar por scope; actualizar/archivar y comprobar reindexación; finalmente explorar Vault Markdown opcional. Esta secuencia **no** autoriza grabar conversaciones privadas automáticamente.
