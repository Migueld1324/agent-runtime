# Roadmap incremental, agnóstico de modelos

**Fecha de corte:** 2026-10-24. Los hitos expresan una **secuencia propuesta** basada en las decisiones recuperadas, no autorización para tomar decisiones abiertas sin consulta. Avanzar sobre `agent-runtime` como repositorio único.

## Hitos finalizados / demostrados

- [x] PoC 0.1: gateway/políticas de archivos restringidos y tests base.
- [x] PoC 0.2: registro de tools, aprobación/grants, persistencia y tests.
- [x] PoC 0.3/0.3.1: LangGraph con checkpoint, mock y LLM real ChatGPT con cuenta, sin API key comercial obligatoria.
- [x] Con modelo real: aprobar transformación y escritura; comprobar archivo.
- [x] Con modelo real: denegar escritura; verificar ausencia y persistencia `DENIED`.
- [x] `typecheck` y pruebas unitarias/integración reportadas como exitosas en host.
- [x] Repositorio Git de referencia creado: `https://github.com/Migueld1324/agent-runtime`.
- [x] Decisión de conservar PoC evolutivas en un solo proyecto.
- [x] Paquete de transferencia de contexto con documentación agnóstica de CLI (este conjunto de archivos). **Pendiente incorporar/commitear en el repo del usuario.**

## Próximo hito recomendado — base formal de memoria

- [ ] Leer diseño [`MEMORY_V03.md`](MEMORY_V03.md), conservar decisión de separar `MemoryEntry` y `ExperienceRecord`.
- [ ] Proponer y revisar **interfaces mínimas** `MemoryService`/`MemoryProvider`, scopes y operaciones de lifecycle. **No inventar aprobaciones** sobre campos/schemas específicos.
- [ ] Definir versionado/migraciones/ownership de SQLite; declarar canonicidad de datos y proyecciones.
- [ ] Implementar slice mínimo SQLite con ambas entidades y asociación/procedencia; tests unitarios e integración.
- [ ] Implementar consulta filtrada por scope/permiso y ciclo de actualización/archivo/supersede; tests de fugas cross-scope.
- [ ] Evaluar export Markdown/Vault opcional e índices derivados sin segundo origen de verdad.

### Criterios de salida sugeridos para ese hito

Se conserva evidencia/atribución; no hay fuga entre scopes; no se promociona experiencia a regla automáticamente; SQLite permite recuperar tras reinicio; exportación no crea dos autoridades; las pruebas actuales del runtime permanecen verdes.

## Hitos posteriores sin calendario comprometido

- [ ] Contratos y **capability negotiation** de `ModelProvider`, `ToolProvider`, `MemoryProvider`, política/graceful degradation.
- [ ] Routing más inteligente: elección manual por tarea/sesión + automática justificable; modelo visible siempre en UI/statusline; sin fallback de coste oculto.
- [ ] Modelos locales reales y proveedores adicionales por contrato (sin atar la arquitectura a un CLI).
- [ ] Herramientas extensibles con descubrimiento/registro, inspección de manifests, grants, revocación y auditoría verificable.
- [ ] Recovery de side effects e idempotencia; observabilidad/sesiones.
- [ ] Scheduler, trabajo prolongado, agentes especializados, paralelismo condicionado a permisos y recuperación; diseño abierto.
- [ ] Evaluar sandbox de OS/plugins ejecutables, networking y operaciones más allá del workspace con ADR y tests de amenazas.

## Cómo usar el roadmap

Antes de cada cambio, elegir un vertical slice pequeño y sus pruebas; no marcar como hecho lo que solo se diseñó. Al concluir, registrar: fecha, commit, comandos/resultados, limitaciones y siguiente decisión pendiente. Usar [`HANDOFF_TEMPLATE.md`](HANDOFF_TEMPLATE.md).
