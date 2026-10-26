# Especificación: modelos e inferencia

**Diseño:** ModelProvider v0.1/v0.2, ADR-002, ADR-022–037, con **ADR-035 retirada**. **Estado:** adaptador ChatGPT y wrappers comerciales/`mock` en PoC 0.3.1; router inteligente y contrato multimodal completo pendientes.

## División de responsabilidades

- **ModelRegistry:** catálogo de modelos e información observable/capacidades/límites.
- **ModelRouter:** decide una selección entre candidatos que cumplen condiciones de tarea y políticas. Un `modelId` fijado para sesión/tarea prevalece sobre la selección automática.
- **ModelProvider:** una interfaz uniforme para inferencia, streaming y tool-call; transporta solicitudes por el proveedor compatible.
- **EmbeddingProvider:** interfaz separada para producir vectores destinados a búsqueda semántica; puede compartir infraestructura, pero no se fuerza al contrato generativo.
- **Context Manager:** *afuera* del ModelProvider; ensambla conversación, memorias autorizadas y resultados de herramientas dentro de un presupuesto de contexto.

## Catálogo

```ts
interface ModelDescriptor {
  id: string;
  providerId: string;
  name: string;
  version?: string;
  deployment: 'local' | 'remote';
  availability: 'available' | 'unavailable';
  capabilities: ModelCapabilities;
  limits: ModelLimits;
}
interface ModelCapabilities {
  inputModalities: Array<'text' | 'image' | 'audio'>;
  outputModalities: Array<'text' | 'image' | 'audio'>;
  streaming: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
}
interface ModelLimits { contextWindowTokens?: number; maxOutputTokens?: number; }
```

Los metadatos pueden ser desconocidos; no inventar capacidades. La etiqueta «mejor modelo para programar» no es una capacidad contractual: requiere perfiles y evidencia de benchmarks.

## Inferencia y resultado normalizado

```ts
interface InferenceRequest {
  modelId: string;
  messages: ModelMessage[];
  tools?: ToolSchema[];
  options?: { maxOutputTokens?: number; temperature?: number };
  requestId: string;
}
interface InferenceResponse {
  modelId: string;
  content: ModelContent[];
  toolCalls: ToolCall[];
  finishReason: 'completed' | 'tool_calls' | 'length' | 'cancelled' | 'error';
  usage?: TokenUsage;
}
```

`ModelMessage`, `ModelContent`, `ToolSchema`, `ToolCall` y `TokenUsage` son tipos nombrados en el diseño; **la exportación no proporciona aquí una definición final exhaustiva de cada uno**. Deben concretarse y versionarse antes de considerarlos contratos estables. Los formatos particulares (OpenAI, Gemini, Ollama, etc.) se traducen en adaptadores.

El modelo **propone** llamadas a herramientas; no recibe callbacks de ejecución directa. Cada propuesta pasa por Registry → validación de esquema → Policy Engine → Tool Gateway → Executor. Los resultados de herramientas regresan como observaciones al runtime y, luego, a la siguiente inferencia autorizada.

## Hybrid Routing

### Orden de selección objetivo

1. Si el usuario fija modelo para la tarea, utilizarlo o devolver error explícito si no cumple los requisitos; no sustituirlo silenciosamente.
2. Si no hay selección por tarea, aplicar la preferencia de sesión.
3. Si no existe elección explícita, considerar perfil por defecto y selección automática **cuando esté implementada**.
4. Filtrar primero por capacidades requeridas (tool-calling, modalidades, formatos), accesibilidad real y políticas.
5. Evaluar privacidad, presupuesto/costo, latencia y métricas medidas. Una transición local → remoto puede implicar autorización de egreso.
6. Ofrecer fallback solo si es compatible con política, ámbito y estado de la ejecución; nunca repetir efectos ya realizados.

**PoC 0.3.1 no implementa el paso 5:** su `auto` es una prioridad de proveedores configurados, o `mock` offline por defecto. Es deliberadamente distinto de Hybrid Routing final.

### Modalidades de acceso

- **Cuenta ChatGPT con autorización del plan:** `auth:v3 login`, `models`, `use`; PoC validada con token activo y solicitud real de herramienta. El acceso está sujeto a las autorizaciones, límites y mecanismos admitidos por el servicio.
- **API keys comerciales:** adaptadores OpenAI / Anthropic / Google incluidos en PoC como alternativas, pero no se consideran accesibles ni necesarias para los ensayos actuales.
- **Servidor de modelo local:** previsto mediante adaptadores y registro de capacidades; todavía **no validado** en PoC 0.3.1.

No confundir credencial/sesión con el contrato de inferencia; no utilizar un token OAuth personal como sustituto improvisado de una API key en un endpoint no autorizado.

## Protocolo y routing implementados

El adaptador de cuenta en `src/v3/chatgpt-inference.ts` usa la ruta `/v1/responses` con `store:false` y `stream:true`. `siwc-protocol.ts` recolecta el SSE hasta un evento de respuesta completada y rechaza streams truncados, fallidos o incompletos. Su salida de planificación es un objeto JSON de texto: una herramienta registrada con argumentos string o una respuesta final. No es una llamada nativa a funciones con callbacks ejecutables.

Los wrappers comerciales en `src/v3/models.ts` sí exponen esquemas de herramientas al SDK, pero sin handlers `execute`. El modelo, cualquiera que sea su proveedor, no autoriza ni ejecuta herramientas. Registry, validación de argumentos, hash y policy se aplican después de la propuesta, antes de producir efectos. Una respuesta final activa la verificación del objetivo descrita en [runtime](runtime.md); tampoco acredita éxito por sí sola.

| Selector | Configuración / autenticación | Conducta actual |
|---|---|---|
| `mock` | Ninguna | Fixture determinista offline; no es un LLM local |
| `chatgpt` | Cuenta SIWC conectada, consentimiento y modelo seleccionado | Inferencia remota mediante cuenta; no requiere API key comercial |
| `openai` | `OPENAI_API_KEY` y `OPENAI_MODEL` | API opcional al seleccionarla y configurarla |
| `anthropic` | `ANTHROPIC_API_KEY` y `ANTHROPIC_MODEL` | API opcional al seleccionarla y configurarla |
| `google` | `GOOGLE_GENERATIVE_AI_API_KEY` y `GOOGLE_MODEL` | API opcional al seleccionarla y configurarla |
| `auto` | Variables de entorno y conexiones disponibles | Offline `mock` salvo `AGENT_ALLOW_CLOUD=1`; con opt-in elige el primer proveedor configurado de la prioridad |

La prioridad cloud predeterminada es `chatgpt,openai,anthropic,google`; `AGENT_AUTO_PRIORITY` permite delimitarla. Si no hay un proveedor configurado elegible, `auto` permanece en `mock`. Esta selección inicial no es fallback ante una inferencia fallida ni routing por calidad. Errores de autenticación, cuota o red no cambian silenciosamente el proveedor seleccionado.

Los pasos de login, catálogo, elección de modelo, logout, elegibilidad y ensayo manual se mantienen en [la guía de ChatGPT](../guides/chatgpt.md), junto con las referencias SIWC de la PoC. Los resultados realmente ejecutados están en [verificación](../delivery/verification.md); las limitaciones históricas del contenedor de construcción no invalidan la evidencia posterior del host o de CI.

## Streaming, cancelación y telemetría

```ts
type InferenceEvent =
  | { type: 'started'; modelId: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'completed'; response: InferenceResponse }
  | { type: 'failed'; error: OperationError };
```

La implementación concreta debe definir orden, IDs, errores, cancelación y un evento final fiable antes de confiar en herramientas propuestas. Recolectar latencia inicial, duración total, tokens, tasa, errores, modelo y costos cuando existan datos; `unknown` es válido. No guardar prompts completos por defecto.

## Seguridad y degradación

Antes de enviar datos a cualquier modelo cloud: clasificar la información, comprobar alcance y egreso; revisar consentimientos; conservar estimación de costos si aplica. Si un proveedor falla después de una escritura, recuperar el checkpoint real antes de considerar fallback. Si ninguna ruta válida existe, reportar `UNAVAILABLE` / bloqueo de política.

## Implementación actual (referencia verificable)

| Código | Comportamiento observado |
|---|---|
| `src/v3/router.ts` | `mock`, `chatgpt`, `openai`, `anthropic`, `google`; `auto` offline salvo opt-in explícito; sin ranking inteligente |
| `src/v3/models.ts` | Modelo propone una llamada por iteración; cloud comercial usa AI SDK sin `execute` callback |
| `src/v3/chatgpt-auth.ts` | Manejo de autorización de cuenta y modelo seleccionado |
| `src/v3/chatgpt-inference.ts`, `siwc-protocol.ts` | Inferencia autorizada con propuestas estructuradas; espera evento completo y rechaza fallas del stream |
| `test/v3-siwc.test.ts` | Validaciones del protocolo/stream, no auditoría integral del proveedor |

**Fuentes:** diseño original, líneas 9923–10680; resultados de las pruebas de cuenta y denegación compartidos posteriormente por el usuario.
