# Visión del producto y alcance

## Objetivo

Construir un asistente/agente de IA personal cuya lógica de coordinación, herramientas, seguridad, memoria y recuperación **pertenezca a este proyecto**, independientemente de qué modelo generativo utilice. No se busca poner un chatbot sobre scripts de shell, ni empaquetar una plataforma de agentes externa.

La experiencia de usuario deseada incluye conversación, planificación de tareas reales, ejecución supervisada y recuperación de información aprendida en interacciones previas. Debe poder analizar y actuar sobre proyectos, archivos y eventualmente aplicaciones y servicios, siempre mediante capacidades registradas y límites efectivos.

## Requisitos acordados

**R-01 — Portabilidad.** El núcleo no debe depender de CachyOS, Hyprland, Linux, Windows ni macOS. Las particularidades de cada host viven en adaptadores de capacidades. La primera instancia se instalará **localmente en un único PC**; no se adelantará un sistema de sincronización multi-host.

**R-02 — Independencia del proveedor de modelos.** Usar distintos LLM, locales o cloud, y poder escoger uno manualmente por tarea/sesión. Cuando no haya selección explícita, el sistema podrá decidir por capacidades, políticas y métricas cuando ese router avanzado se implemente. No imponer APIs comerciales: el acceso mediante cuenta ChatGPT se validó en PoC 0.3.1; API keys siguen siendo una alternativa futura, no un requisito ni algo prohibido.

**R-03 — Agentes propios.** La planificación y ejecución de tareas son nuestras. No integrar Codex/Claude Code/Antigravity/OpenClaw como orquestadores externos. Podremos estudiar esas herramientas como referencias y usar CLI comerciales para desarrollar el repositorio, sin convertirlas en dependencias del runtime. La propuesta histórica de *External Agent Adapter* (ADR-035) fue expresamente descartada.

**R-04 — Memoria híbrida.** SQLite almacena entidades estructuradas/relaciones/estados; Markdown permite conocimiento documental humano y portable; búsquedas e índices son derivados y regenerables. La escritura y recuperación pasan por políticas de ámbito y privacidad.

**R-05 — Aprendizaje sin reentrenamiento.** Recordar acciones, experiencias y conocimiento de forma separada. Una experiencia de prueba y error no equivale automáticamente a una verdad general; una entrada de conocimiento debe incluir soporte y alcance.

**R-06 — Autonomía gobernada.** El agente puede descubrir capacidades y proponer trabajo; ninguna salida de LLM autoriza efectos por sí misma. Debe ser posible aprobar una operación una vez, por tarea o dentro de un workspace con restricciones, denegarla o revocar el permiso.

**R-07 — Durabilidad.** Una ejecución puede detenerse esperando aprobación y continuar en otro proceso sin olvidar su estado. Las operaciones con efectos secundarios no pueden reintentarse a ciegas tras fallos.

**R-08 — Evolución incremental.** Preservar el código probado. Las limitaciones deliberadas de las PoC (workspace `.md`, una propuesta a la vez, presupuesto de cinco llamadas) son **restricciones de pruebas**, no el límite final del producto.

## Fuera del alcance inmediato

La primera versión no requiere sincronización entre PCs, multiusuario, multiagente paralelo, herramienta genérica de shell sin restricciones, arbitraje inteligente automático entre modelos, vector search obligatorio, ni autonomía irrestricta. Están contemplados como extensiones a evaluar una vez funcionen los contratos y mecanismos de seguridad básicos.

## Criterio de éxito de arquitectura

Es posible cambiar de LLM o de sistema operativo sin cambiar la semántica de los contratos del runtime; una tarea puede proponer acciones y continuar tras interrupciones; el Policy Engine puede negar efectos; las memorias pueden vincularse a procedencia; los componentes evolucionan sin violar estas fronteras.

**Procedencia:** conversación original, tramo de definición del asistente (aprox. líneas 8070–9500), corrección sobre plataformas de agentes (10674–10680), pruebas posteriores de PoC 0.1–0.3.1.
