# Instrucciones para agentes de desarrollo

Este repositorio contiene el **runtime propio** de un asistente/agente de IA **local-first, portable y agnóstico del modelo**. Estas instrucciones aplican con Codex CLI y con cualquier otro agente que lea `AGENTS.md`; los documentos canónicos no dependen de un CLI.

## Inicio obligatorio de cada sesión

1. Lee [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) y [docs/context/README.md](docs/context/README.md).
2. Según la tarea, consulta [DECISIONS.md](docs/context/DECISIONS.md), [ARCHITECTURE.md](docs/context/ARCHITECTURE.md), [MEMORY_V03.md](docs/context/MEMORY_V03.md), [POC_HISTORY.md](docs/context/POC_HISTORY.md) y [ROADMAP.md](docs/context/ROADMAP.md).
3. Inspecciona el código real y `package.json` antes de afirmar que una capacidad está implementada.
4. Distingue siempre: **decisión acordada**, **implementación actual**, **resultado verificado**, **propuesta** y **pendiente**. Ninguna propuesta se convierte en decisión por aparecer en un documento.

## Restricciones del proyecto

- La **orquestación, memoria, políticas, herramientas y ciclo de vida de agentes son propios**. OpenAI/Claude/Gemini/modelos locales son proveedores de **inferencia**, no plataformas externas de agentes a las cuales delegar trabajo. La antigua idea de `ExternalAgentAdapter` (ADR-035) fue descartada.
- **No asumir API keys ni facturación comercial** para ejecutar las pruebas actuales. Existe autenticación por cuenta ChatGPT (SIWC), validada en el host; adaptadores API continúan como opciones futuras, nunca como fallback de facturación silencioso. Modelos locales son objetivo de portabilidad, **no** integrar fingiendo que ya están implementados.
- La selección manual de modelo debe existir por tarea/sesión; selección automática es un objetivo de routing híbrido. La interfaz deberá mostrar modelo seleccionado. El `auto` actual es un mecanismo preliminar, no routing inteligente.
- LLM **propone**; `Policy Gateway` **autoriza/deniega**; `ToolProvider` **ejecuta** tras validación. Mantener default-deny, hashes/schemas/grants y aprobación independiente por operación. Herramientas futuras pueden descubrirse/registrarse sin adquirir permiso de ejecución automáticamente.
- La memoria híbrida acordada separa `MemoryEntry` (conocimiento reusable) de `ExperienceRecord` (experiencia contextual de prueba/error); no convertir una experiencia particular en regla universal.
- Portabilidad entre SO, equipos y proveedores. Primero instalar/validar localmente en un PC; no imponer infraestructura remota ni compromisos con un proveedor.
- El código evoluciona incrementalmente desde PoC 0.1/0.2/0.3.1; no crear proyectos aislados para cada PoC.
- **Nunca** versionar tokens OAuth, API keys, sesiones, secretos, logs sensibles, `.env`, archivos runtime SQLite o `workspace/` de prueba. No pegar credenciales en respuestas.
- No elevar límites de seguridad del PoC (`workspace/`, `.md`, una tool/inferencia, cinco tools) sin una decisión explícita de arquitectura y nuevas pruebas.

## Desarrollo y verificación

- Usar los comandos **existentes** de `package.json`. Node >=24.15. `npm run typecheck`, `npm run test:core`, `npm run test:v2`, `npm run test:v2:integration`, `npm run test:v3`, `npm run test:v3:integration`.
- En cambios de política, autorización, checkpointing, inferencia o memoria, añadir pruebas de regresión. No reportar un test como pasado si no se ejecutó en el entorno actual; la evidencia histórica está documentada.
- Una denegación debe impedir ejecución y efectos secundarios; el modelo nunca ejecuta herramientas de forma directa. No usar scripts de instalación remotos sin revisión.
- Al cerrar trabajo, actualizar [ROADMAP.md](docs/context/ROADMAP.md), [POC_HISTORY.md](docs/context/POC_HISTORY.md) y el registro de decisiones si procede; consignar comandos/resultados reales. No reescribir evidencia histórica.

## Para iniciar

Ante la petición «continúa el proyecto», **primero** resume en breve la arquitectura aprobada, el estado validado, los pendientes y la tarea próxima; **después** propone o realiza cambios acotados según la instrucción del usuario. Más detalles en [OPERATING_GUIDE.md](docs/context/OPERATING_GUIDE.md).
