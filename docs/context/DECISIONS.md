# Registro de decisiones y restricciones recuperadas

**Corte:** 2026-10-24. Este registro es **descriptivo**, no es la transcripción literal ni la serie completa de ADR históricos. La conversación original contenía referencias a `ADR-035` y `ADR-038`–`ADR-047`, pero no se dispone aquí del texto íntegro de cada ADR; **no se inventan sus títulos, números intermedios ni firmas**. Los identificadores `R-*` de esta tabla son solo índices de transferencia, no nuevos ADR aprobados.

| ID | Estado | Decisión / restricción |
|---|---|---|
| R-01 | Aprobado | Asistente **local-first**, despliegue inicial en una PC, arquitectura portable entre equipos y SO. |
| R-02 | Aprobado | Sistema **agnóstico del modelo**: inferencia de GPT/Claude/Gemini/locales sin acoplar orquestación a proveedor. |
| R-03 | Aprobado | Solo proveedores **LLM**, no plataformas externas completas de agentes. `ExternalAgentAdapter` propuesto en `ADR-035` queda **descartado/sustituido conceptualmente**. |
| R-04 | Aprobado | Contratos orientados a capacidad; separar `ModelProvider`, `ToolProvider`, `MemoryProvider`, política y degradación controlada. Las firmas concretas no están cerradas. |
| R-05 | Aprobado | Routing híbrido: modelo manual por tarea/sesión o selección automática; mostrar qué modelo está activo; extensibilidad. |
| R-06 | Aprobado | Memoria híbrida: persistencia estructurada SQLite inicialmente, Markdown Vault opcional, sin doble fuente de verdad; etiquetas, relaciones y portabilidad. |
| R-07 | Aprobado | `MemoryEntry` y `ExperienceRecord` son recursos **separados pero vinculables**; evidencia contextual no equivale automáticamente a regla reusable. |
| R-08 | Aprobado a nivel de diseño | `MemoryService` separado de `MemoryProvider`; scopes Session/Project/Personal/Shared, registros tipados/versionados/procedencia, búsqueda autorizada e índices reconstruibles, ciclo de vida con corrección/archivo/olvido. |
| R-09 | Aprobado | Política default-deny con tool discovery/registration distinto de autorización; `approval on demand`, scopes y revalidación de descriptor. |
| R-10 | Aprobado | Runtime propio como máquina de estados con planificación incremental, checkpoints/reanudación y permisos controlados. |
| R-11 | Aprobado | Las PoC se **reutilizan evolutivamente** en un único repositorio Git; no crear proyectos separados sin necesidad. |
| R-12 | Restricción actual | No exigir pago de APIs comerciales en pruebas presentes. No eliminarlas como opción futura. Cuenta ChatGPT autorizada y LLM real verificado. |
| R-13 | Validado en PoC | El LLM propone herramientas; Gateway y usuario determinan ejecución; denegación de escritura debe impedir efectos. |
| R-14 | Aprobado | Contexto/planning compartido en documentación **agnóstica de CLI**, con entradas para Codex y otros agentes. |

## Aclaraciones importantes

- **Referencia ADR-035:** la versión antigua que proponía `External Agent Adapter` **no debe orientar nuevas implementaciones**. Este registro no pretende editar retroactivamente un documento ADR original todavía no importado.
- **Referencia ADR-038–047:** corresponde al bloque discutido de arquitectura de memoria (interfaces, lifecycle, scopes, SQLite/Markdown, indexación, recuperación, corrección y exportación). El rango se recuerda; no se reconstruye un ADR individual por número sin el texto original.
- **Experiencia versus conocimiento:** es una decisión explícita posterior del usuario; prevalece sobre cualquier interpretación anterior que trate cada historial operativo como `MemoryEntry`.
- **Método de acceso al LLM:** inicial elección exclusiva de API keys en la PoC 0.3 fue una **suposición incorrecta**, corregida en 0.3.1; no debe convertirse en principio de diseño.

## No decidido / no aprobado automáticamente

Biblioteca final para el motor de memoria; schema físico; motor vectorial; estrategia exacta de embedding; modelo base por defecto; cuota/ranking del router; scheduler; sistema de aislamiento; roles multiagente; políticas de retención y privacidad específicas; estructura definitiva de paquetes. Las propuestas en [`ROADMAP.md`](ROADMAP.md) son trabajo sugerido, no decisiones irrevocables.

## Cómo agregar decisiones nuevas

Capturar contexto, alternativas, criterio, consecuencia, fecha y aprobación explícita en un ADR numerado *cuando se confirme el historial y la numeración*. Hasta entonces registrar nueva deliberación como `Propuesto` con fecha y convertirla a `Aprobado` solo tras decisión explícita. **No marcar decisiones históricas como inventadas para rellenar huecos.**
