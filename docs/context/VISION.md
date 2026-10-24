# Visión, objetivos y límites

**Aprobado / intención de producto.** El repositorio `agent-runtime` es el primer módulo ejecutable de un asistente personal de IA que ejecuta trabajo mediante modelos LLM, herramientas, memoria y reglas de seguridad. Se busca continuidad entre sesiones y portabilidad, no una simple interfaz de chat sobre una única API.

## Principios

- **Local-first en despliegue:** construir y ejecutar primero en una PC del usuario; no exigir servidores, nube propia o dependencia operativa remota. Los LLM cloud pueden usarse como proveedores opcionales.
- **Portabilidad:** evitar acoplar estado, rutas, contratos y ciclo de vida a CachyOS, una GPU, una CLI, un SDK o un modelo concreto. Otros SO/PC deberán ser posibles sin rehacer el núcleo.
- **Agnosticismo de modelo:** OpenAI, Anthropic, Google y modelos locales detrás de contratos de inferencia. Elegir proveedor no equivale a contratar sus APIs de pago; tampoco equivale a delegar a sus agentes.
- **Orquestación propia:** nuestros agentes, roles, políticas y herramientas pertenecen al runtime. Referencias como Hermes/OpenClaw/Codex pueden informar el diseño sin convertirse en subsistemas obligatorios.
- **Memoria híbrida:** combinar persistencia estructurada y conocimiento legible por humanos con esquema/versiones/procedencia. Dar valor a experiencias y aprendizajes sin confundirlos.
- **Seguridad verificable:** el modelo solicita; el Gateway autoriza; un ejecutor de confianza aplica controles. Denegar debe detener acciones y preservar auditoría/estado; grants acotados/revocables.
- **Evolución incremental:** PoC funcional + tests → feature vertical real → integración. No crear una base nueva por cada etapa.

## Alcance deseado (no prueba de existencia)

Agentes con ejecución persistente, recuperación tras interrupciones, capacidades registrables, elección/routing de LLM, observabilidad, memoria a largo plazo, integración futura con modelos locales, permisos y herramientas extensibles, experiencia operativa que se pueda reutilizar con contexto/procedencia.

## No-objetivos / exclusiones actuales

No construir una fachada que delegue tareas a sistemas de agentes completos (Antigravity/Hermes/OpenClaw/Claude Code). No obligar a usar API keys facturadas ahora; no excluirlas del futuro. No saltarse el Gateway «porque el modelo es confiable». No asumir que la PoC demuestra sandbox de OS, aislamiento multiusuario, seguridad de producción o inteligencia autónoma. No guardar secretos/personales en el repositorio de contexto.

## Público destinatario de estos documentos

Principalmente el usuario y sus agentes de desarrollo (Codex CLI inicialmente). Los documentos deben seguir siendo útiles con Claude Code, Gemini CLI, GitHub Copilot o herramientas futuras y para trabajo humano sin agente.
