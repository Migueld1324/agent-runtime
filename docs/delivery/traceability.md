# Procedencia y trazabilidad de diseño

## Jerarquía de fuentes

1. **Corrección explícita y posterior del usuario** en la conversación original: prevalece sobre propuestas previas.
2. **Acuerdos del diseño técnico** aprobados en secuencia, siempre interpretados con sus enmiendas.
3. **Implementación efectiva de la PoC 0.3.1**, contrastada con `src/` y `test/`.
4. **Logs de pruebas reales compartidos por el usuario**, que demuestran comportamientos concretos en su máquina.
5. Propuestas de stack y ejemplos didácticos: no elevar automáticamente a decisiones definitivas.

## Mapa de fuentes originales

El archivo de referencia fue la exportación Markdown de la conversación «Solucionar Secure Boot Invalid», recibida el 24-10-2026, que incluye el tramo de diseño del asistente y pruebas. **No se adjunta aquí** por contener discusiones personales y técnicas ajenas al proyecto. Los siguientes son intervalos de línea de esa exportación, para auditoría cuando la fuente esté disponible de forma privada.

| Tema | Líneas aprox. | Estado recuperado |
|---|---:|---|
| Definición del asistente y principios | 8072–8434 | Base conceptual |
| Portabilidad, SQLite + Markdown, búsquedas | 8435–8813 | Decisiones sobre local-first y memoria |
| Memoria híbrida v0.3 | 8814–9183 | Ciclo de vida, scopes, relaciones, admisión |
| Local-first v0.4 y arquitectura de contratos | 9184–9504 | Monolito modular, policy transversal |
| Common Contracts v0.1 | 9505–9922 | Identidad, capacidades, resultados |
| ModelProvider v0.1/v0.2 | 9923–10681 | Routing, inferencia, corrección ADR-035 |
| MemoryProvider v0.1/v0.2 | 10682–11586 | Contratos, experiencia frente a conocimiento |
| ToolProvider v0.1 | 11587–12011 | Registry, Gateway y adaptadores |
| Policy Engine v0.1/v0.2 | 12012–12971 | Grants, aprobación bajo demanda |
| Agent Runtime v0.1 | 12972–13730 | Estados, checkpoints, reintentos |
| Investigación de stack y elección de PoC | 13731–13954 | Opciones y selección provisional |
| PoC 0.1 a 0.3 y regresiones iniciales | 13955–15703 | Ejecución incremental |
| PoC 0.3.1, autenticación y denegación | Conversación posterior, logs compartidos | Validación end-to-end con cuenta ChatGPT |

## No confundir

- Una tabla «ADR propuestas» en un mensaje técnico es una **propuesta histórica**. La aceptación global posterior consolida esa base en el diseño, pero no la implementa.
- **ADR-035 fue retirada** por corrección explícita: no se integrarán agentes externos como motor de orquestación.
- **ADR-059 fue refinada por ADR-068–072:** no autorización implícita; sí descubrimiento y aprobación bajo demanda.
- Una API key aparecía en un primer ensayo de PoC 0.3; la PoC 0.3.1 corrigió el bloqueo para permitir cuenta ChatGPT sin key comercial.
- Modelos locales, router inteligente, SQL/Markdown híbridos y aislamiento OS son todavía requisitos, no funciones demostradas.

## Investigación arquitectónica posterior — Maintenance Backend

La propuesta [ADR-088](../decisions/088-maintenance-backend.md), del 27-10-2026, procede de inspección del repositorio en `5aa4eac`, de ADR-085/086 aceptadas y de la dependencia pendiente de ADR-087. El [análisis](../architecture/maintenance-backend-analysis.md) identifica módulos, amenazas, alternativas y fuentes primarias consultadas; el [plan](maintenance-backend-plan.md) separa aceptación futura de evidencia existente. No se atribuye esta propuesta a los acuerdos históricos ni se considera aprobada por estar en el registro. ADR-085/086/087 conservan su contenido; las ampliaciones propuestas se identifican en ADR-088.

## Datos sensibles y publicación

El paquete contiene solo especificaciones redactadas y resúmenes técnicos. No incrusta historial completo, credenciales OAuth, correo de autenticación, IDs de cuenta ni rutas de claves. Antes de publicar futuras trazas de diagnóstico, sanitizar contenido y revisar archivos ignorados por Git.
