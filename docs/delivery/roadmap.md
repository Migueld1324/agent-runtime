# Roadmap de implementación

El plan separa **arquitectura estable** de **cortes incrementales verificables**. Se preserva PoC 0.3.1; no se empieza otro proyecto desde cero. Cada fase produce código probado, migraciones/documentación y criterios observables.

## Fase 0 — Consolidación del runtime actual

**Entrada:** PoC 0.3.1 validada y repositorio Git.  
**Objetivo:** base de mantenimiento sin modificar semántica de aprobaciones.

- Organizar módulos por contratos/adapter/domain sin duplicar versiones activas.
- Conservar tests v1/v2/v3 como regresión.
- Formalizar estado/versionado de run y checkpoint; documentar compatibilidad/migración.
- Separar configuración/credenciales de datos compartibles y de exportación.
- Añadir diagnóstico de fallos y eventos estructurados sin almacenar secretos.

**Avance:** CI, verificador de archivo/contenido y recuperación durable conservadora implementados (ADR-085/086). La evidencia ejecutada está en [verificación](verification.md). El próximo diseño a revisar es la validación extensible del Tool Gateway, antes de implementar cambios de contrato.

**Salida:** suite actual sigue verde; prueba manual real de `approve` y `deny` no cambia de significado.

## Fase 1 — Common Contracts y registro de capacidades

- Introducir contratos tipados y esquemas versionados de identidad, ámbito, recursos y resultados.
- Consolidar ModelRegistry y ToolRegistry como catálogos independientes.
- Distinguir `unavailable`, `unsupported`, `registration_required`, `require_approval`, `deny`.
- Política de fingerprint/cambios de versión y reevaluación de grants.

**Salida:** pruebas de contract compatibility y permisos por ámbitos, incluyendo actualización de herramienta con nuevos efectos.

## Fase 2 — MemoryService híbrido (siguiente capacidad funcional grande)

- Modelos `MemoryEntry`, `ExperienceRecord`, `ExecutionRecord` (relacionados, no fusionados), scopes, relaciones, fuentes y revisiones.
- SQLite estructurado con migraciones + Markdown Vault de conocimiento documental.
- Policies de admisión por ámbito y cola de revisión.
- Búsqueda full-text, filtros de acceso previos a recall y procedimientos de reconstrucción de índices.
- Integrar Context Manager para construir contexto con memoria autorizada; separar checkpoint de memoria.

**Salida:** pruebas de privacidad, ciclo de revisión/corrección, restore y recuperación cruzada con fuentes. **No requiere vectores todavía.**

## Fase 3 — Runtime durable ampliado

- `Session`/`Run`/`Step`/`ToolInvocation` con estado y criterios de éxito verificables.
- Planes incrementales con versiones, dependencias y replanificación supervisada.
- Recuperación de operaciones inciertas, idempotency key donde aplique; pruebas de fallos entre efecto y checkpoint.
- Consolidación post-run hacia ExperienceRecord y propuestas de conocimiento.

**Salida:** puede continuar una tarea no trivial después de interrupción sin duplicar efectos y respetando revocaciones.

## Fase 4 — Subsystem de modelos completo

- Catálogo de capacidades; selección manual por tarea/sesión.
- Adaptadores locales; evaluar `llama.cpp`/Vulkan y Ollama según hardware real, sin asumir rendimiento.
- Streaming, cancelación, métricas y provider-neutral usage.
- `EmbeddingProvider` si la búsqueda semántica mejora resultados documentadamente.
- Router híbrido automático medido y sujeto a privacidad/costo; fallback con estado conservado.

**Salida:** sustituir modelo o mover implementación sin reescribir orquestación; ninguna fuga cloud sin autorización.

## Fase 5 — Ecosistema de herramientas y UX

- Adaptadores host confiables para filesystem/Git/sistema operativo/aplicaciones; posible MCP con frontera segura.
- Perfiles de ejecución sandboxed donde el sistema operativo lo permita.
- CLI interactiva o futura UI que consuma eventos del runtime; aprobaciones y estado desacoplados.
- Extensiones multi-dispositivo y multiagente solo si aparecen necesidades concretas y pruebas equivalentes.

## Decisiones que no deben anticiparse como definitivas

No existe una decisión final sobre servidor de inferencia local, ORM, formato de sincronización inter-host, motor de índice vectorial, framework CLI interactivo ni estrategia de aislamiento OS. LangGraph y AI SDK fueron seleccionados **para las PoC**, no declarados irremplazables. La automatización de modelos y costes necesita métricas.

## Definición de terminado por iteración

(1) contrato descrito y versionado; (2) controles de seguridad identificados; (3) tests unitarios/integración + caso negativo; (4) compatibilidad con estado existente; (5) documentación del comportamiento *implementado* actualizada; (6) ningún paso crítico depende de una API comercial sin alternativa autorizada.
