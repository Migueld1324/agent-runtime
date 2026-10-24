# Modelos, acceso y routing

## Decisiones acordadas

1. **No forzar una vía de acceso.** El agente podrá usar autenticación por cuenta cuando exista un flujo oficialmente autorizado, API keys comerciales opcionales en el futuro, y servidores de modelos locales.
2. **Ahorita API keys pagadas no son una posibilidad operativa** para los tests del usuario. No pedir claves ni activar facturación como prerequisito; no descartar esa alternativa arquitectónicamente.
3. **El sistema no consume agentes externos.** OpenAI GPT, Anthropic Claude, Google Gemini y modelos locales aportan inferencia, no «un orquestador delegado» como Codex/Antigravity/Hermes/OpenClaw.
4. **Routing híbrido objetivo:** selección manual por tarea/sesión; automática cuando no se indique, con el modelo seleccionado siempre visible. Añadir modelos/proveedores sin modificar el núcleo.
5. No fallback implícito a un proveedor facturado; no confundir login de una CLI de desarrollo con la autenticación del runtime en producción.

## Estado actual (PoC 0.3.1)

- `npm run auth:v3 -- login|status|models|use MODEL_SLUG|logout`: autorización SIWC de la cuenta ChatGPT compatible y catálogo. Usuario confirmó login, permiso del plan, token activo y catálogo accesible.
- `--model chatgpt` funciona: **inferencias reales validadas**, propuestas de tools y respuesta final; no necesita API key comercial.
- `--model openai|anthropic|google` conserva adaptadores basados en API keys, **no requeridos ni probados en esta fase**.
- `--model mock` usa lógica determinista de regresión, **no** un LLM local.
- `--model auto`: usa `mock` por defecto aunque haya credenciales. Con `AGENT_ALLOW_CLOUD=1` evalúa proveedores configurados en prioridad, prefiriendo `chatgpt` por defecto; **no** pondera inteligencia de tarea, costes, capacidades o privacidad.
- Solo una identidad ChatGPT conectada por instancia local en esta PoC; la elegibilidad de cuentas/modelos puede cambiar. El catálogo/autorización se deben verificar en la instancia, no adivinar slugs.
- `src/v3/chatgpt-inference.ts` usa propuestas JSON en streaming SSE completado y no entrega ejecución de herramientas al modelo. La revalidación es local.

## Diseño futuro, pendiente

- API de `ModelProvider` con métodos/capacidades declaradas de inferencia, tool proposal/function calling, context window, streaming, structured output, uso/coste disponible y auth; soporte degradado cuando no exista capacidad.
- Un `ModelRouter` manual/auto real que considere políticas de datos, confidencialidad, requerimientos, calidad, coste/cuotas/latencia y fallos; visibilidad de selección y explicación.
- Proveedor local real (p. ej., API local de inferencia), sin confundirlo con fixture mock. Modelo disponible y capacidades medibles, no presunción de equivalencia con cloud.
- Rotación/expiración de tokens, recuperación tras errores de red, quotas y telemetría **sin exponer credenciales**.

## Restricciones de seguridad

Tokens OAuth se guardan fuera del repositorio. Nunca pegar tokens, cookies del navegador ni datos de cuenta personal en docs/issues/logs. No usar endpoints privados ni workarounds si la autorización formal no está disponible. Ver [SECURITY_AND_TOOLS.md](SECURITY_AND_TOOLS.md).
