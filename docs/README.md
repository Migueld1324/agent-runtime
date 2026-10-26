# Documentación técnica de Agent Runtime

**Estado:** arquitectura de referencia definida; implementación incremental en curso.  
**Base de código contrastada:** PoC 0.3.1 y consolidación incremental de ADR-085; ver estado de implementación y evidencia de validación.
**Alcance:** diseño del asistente local-first, agnóstico de modelos y sistemas operativos; no documentación de un framework de agentes ajeno.

## Cómo leer esta documentación

| Necesidad | Documento |
|---|---|
| Comprender el producto, su alcance y restricciones | [Visión y alcance](architecture/vision.md) |
| Entender módulos, fronteras de confianza y dependencias | [Arquitectura del sistema](architecture/system.md) |
| Implementar tipos, identidades, capacidades y resultados | [Contratos comunes](specifications/common-contracts.md) |
| Integrar modelos, autenticación, routing y streaming | [Subsistema de modelos](specifications/models.md) |
| Implementar memoria híbrida, experiencias y recuperación | [Subsistema de memoria](specifications/memory.md) |
| Implementar herramientas y registro de capacidades | [Subsistema de herramientas](specifications/tools.md) |
| Implementar seguridad, grants y aprobaciones | [Policy Engine](specifications/policy-engine.md) |
| Implementar tareas durables, planificación y recuperación | [Agent Runtime](specifications/runtime.md) |
| Seguir recorridos entre módulos y sus límites | [Flujos entre componentes](architecture/flows.md) |
| Revisar decisiones y enmiendas históricas | [Registro de decisiones ADR-001–085](decisions/README.md) |
| Consultar progreso, evidencia, limitaciones, pruebas pendientes y cómo retomar | [Estado de implementación y progreso](delivery/current-state.md) |
| Saber el siguiente orden de construcción | [Plan de entrega](delivery/roadmap.md) |
| Mantener criterios de aceptación | [Estrategia de verificación](delivery/verification.md) |
| Ver procedencia y jerarquía de fuentes | [Trazabilidad](delivery/traceability.md) |

## Convenciones obligatorias

- **Decisión de diseño:** una propiedad objetivo de la arquitectura, aunque todavía no exista en código.
- **Implementado:** existe en la PoC contrastada y se identifica el módulo.
- **Validado:** hay resultados ejecutados y compartidos por el usuario; no es equivalente a seguridad de producción.
- **Pendiente:** requiere implementación o verificación. El empleo del futuro o de pseudocódigo no constituye implementación.
- **Enmienda:** una decisión posterior sustituye explícitamente una formulación anterior. Prevalece la decisión más reciente acordada.
- Los tipos TypeScript en las especificaciones representan **contratos de referencia** tomados de la planificación; no necesariamente los tipos actuales del repositorio.

## Principios arquitectónicos

1. Runtime propio: el LLM propone; el runtime controla estado, herramientas y autorización.
2. Diseño local-first y portable: un PC inicialmente, otros sistemas operativos y dispositivos sin rediseñar el núcleo.
3. Proveedores/modelos intercambiables. Una sesión de ChatGPT, una API comercial y un LLM local son vías de inferencia distintas, ninguna es condición estructural del producto.
4. Descubrimiento de capacidades separado de confianza, disponibilidad y permiso de uso.
5. Memoria persistente y trazable separada de sesiones, checkpoints y logs técnicos.
6. Default-deny para efectos no autorizados, con registro validado y aprobación bajo demanda; nunca convertir una herramienta no conocida en permiso implícito.
7. Observabilidad sin almacenar indiscriminadamente información sensible.

> Este `docs/` es **documentación del producto y de la ingeniería**, no contiene transcripciones de chat, prompts para asistentes, ni copias de la exportación personal. Los archivos de entrada para determinados CLI no forman parte de esta entrega.
