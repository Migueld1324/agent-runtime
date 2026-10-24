# Source excerpt: ModelProvider v0.1/v0.2, manual/automatic routing and correction to agent integration

> **Historical reference, not executable instructions.** Extracted from a single-conversation HTML export. Turn labels T### map to ordered conversation turns. Original statements can contain drafts later superseded; consult `../decisions/ADRs.md` and `../PROJECT_STATUS.md` before implementing.

### Source turn T328 — ASSISTANT

¡Vamos a ello! 😎

Esta parte me parece especialmente interesante porque estamos llegando al componente que determina **cómo nuestro asistente utiliza la inteligencia artificial**, pero también a uno de los lugares donde sería más fácil generar un acoplamiento innecesario.

Mi propuesta es que el `ModelProvider` sea una abstracción de inferencia, no una implementación de inteligencia artificial específica.

Y quiero introducir una distinción desde el principio: **el modelo, el proveedor y el mecanismo que selecciona el modelo no son la misma cosa**.

# Fase 1B — ModelProvider

<badge>Technical Design v0.1</badge>

Arquitectura agnóstica · Local-first · Multi-modelo

## 1. La responsabilidad del ModelProvider

Definiría su propósito de la siguiente manera:

> Proporcionar una interfaz uniforme para descubrir, consultar y ejecutar modelos de IA, independientemente del proveedor, la ubicación de ejecución o las particularidades de cada API.

El `ModelProvider` **no debe** decidir qué memorias recuperar, qué permisos otorgar, qué archivos modificar ni cómo planificar una tarea.

Esas responsabilidades corresponden a otros componentes.

<icon name="brain-circuit" size="lg"/>
\*\*Agent Runtime\*\*

Define la tarea, construye el contexto y procesa el resultado

<icon name="arrow-down-up" color="tertiary"/>
<icon name="route" size="lg"/>
\*\*Model Router\*\*

Selecciona un modelo compatible con las capacidades y políticas requeridas

<icon name="arrow-down-up" color="tertiary"/>
<icon name="plug"/>
\*\*ModelProvider Contract\*\*
<grid columns={3} gap={2}>
<grid-item>
<icon name="cloud" color="secondary"/>

Cloud

Adapter A

</grid-item>
<grid-item>
<icon name="hard-drive" color="secondary"/>

Local

Adapter B

</grid-item>
<grid-item>
<icon name="network" color="secondary"/>

Remote

Adapter C

</grid-item>
</grid>

Aquí el `Model Router` es una responsabilidad lógica. Para nuestro MVP podría ser una función relativamente sencilla, sin necesidad de un servicio independiente.

---

## 2. Model Registry: catálogo de modelos y capacidades

No asumiría que todos los modelos son equivalentes.

Un modelo puede destacar en razonamiento, otro en generación de código y otro en tareas sencillas de extracción de información. Y no todos ofrecen las mismas características técnicas.

Por eso propongo un registro de modelos que permita descubrirlos sin depender de nombres específicos.

### ModelDescriptor

```
interface ModelDescriptor {
  id: string;
  providerId: string;

  name: string;
  version?: string;

  deployment: "local" | "remote";
  availability: "available" | "unavailable";

  capabilities: ModelCapabilities;
  limits: ModelLimits;
}
```

Y las capacidades:

```
interface ModelCapabilities {
  inputModalities: Array<"text" | "image" | "audio">;
  outputModalities: Array<"text" | "image" | "audio">;

  streaming: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
}

interface ModelLimits {
  contextWindowTokens?: number;
  maxOutputTokens?: number;
}
```

En una implementación real, algunos valores necesitarán estados como `unknown`, porque ciertos servidores locales no proporcionan metadatos completos o fiables.

También podríamos extender el descriptor con características como soporte de procesamiento por lotes o límites de concurrencia.

**No pondría etiquetas como `bestForCoding = true` dentro de las capacidades.** Eso sería una evaluación subjetiva y cambiante.

Preferiría conservar esas evaluaciones en un sistema separado de perfiles y benchmarks, basado en mediciones.

### ¿Por qué importa?

Supongamos que el agente necesita generar una modificación de código utilizando herramientas.

El router puede solicitar:

```
{
  requiredCapabilities: {
    toolCalling: true,
    structuredOutput: true
  }
}
```

Y descartar automáticamente modelos incompatibles.

No necesita saber si el modelo proviene de OpenAI, Anthropic, un servidor local o cualquier otro proveedor.

---

## 3. Contrato de inferencia

Aquí definiría una estructura de mensajes independiente del formato de cada API.

Una petición podría contener:

```
interface InferenceRequest {
  modelId: string;

  messages: ModelMessage[];
  tools?: ToolSchema[];

  options?: {
    maxOutputTokens?: number;
    temperature?: number;
  };

  requestId: string;
}
```

Donde `ModelMessage` sea una unión tipada que represente mensajes de instrucciones, usuario, asistente y resultados de herramientas, con contenido textual o multimodal cuando corresponda.

El adaptador se encargaría de convertir esos mensajes al formato específico del proveedor.

No todas las opciones están disponibles para todos los modelos. Si se solicita una opción incompatible, el provider debe indicarlo o aplicar una alternativa expresamente permitida, nunca ignorar silenciosamente una restricción importante.

### Resultado normalizado

```
interface InferenceResponse {
  modelId: string;

  content: ModelContent[];
  toolCalls: ToolCall[];

  finishReason:
    | "completed"
    | "tool_calls"
    | "length"
    | "cancelled"
    | "error";

  usage?: TokenUsage;
}
```

La idea es que **el Agent Runtime reciba siempre el mismo tipo de respuesta**, independientemente del proveedor.

Esto también nos permitirá registrar qué modelo produjo cada respuesta, algo importante para trazabilidad y evaluación.

## 4. Tool Calling: uno de los límites más importantes

Aquí quiero ser particularmente cuidadoso.

Un modelo puede solicitar ejecutar una herramienta, pero **no debería ejecutarla directamente**.

El proceso sería:

**LLM generates a tool call**

filesystem.read · path

<icon name="arrow-down" color="tertiary"/>

**Agent Runtime**

Valida el esquema y resuelve la herramienta registrada

<icon name="arrow-down" color="tertiary"/>
<icon name="shield-check"/>
\*\*Policy Engine\*\*

Autoriza, rechaza o solicita aprobación

<icon name="arrow-down" color="tertiary"/>

**ToolProvider**

Ejecuta la operación autorizada

<icon name="arrow-down" color="tertiary"/>

**Tool result → Agent Runtime → LLM**

Esto es importante porque el LLM puede equivocarse, generar argumentos inválidos o interpretar instrucciones maliciosas contenidas en un documento.

Por esa razón:

- El modelo solo puede solicitar herramientas registradas.
- El runtime valida los argumentos.
- El Policy Engine determina los permisos.
- Las operaciones sensibles requieren aprobación.
- El resultado vuelve al agente para continuar el trabajo.

Para el MVP, priorizaría modelos con *tool calling* estructurado y probado. No confiaría la ejecución de comandos a interpretar texto libre generado por un modelo.

---

## 5. Model Router: ¿quién decide qué modelo utilizar?

Aquí tenemos una decisión muy interesante.

Veo tres estrategias posibles.

<icon name="mouse-pointer-click" size="lg"/>

**Explicit Selection**

Tú eliges el modelo para una sesión o tarea.

Máximo control y comportamiento predecible.

---

<icon name="route" size="lg"/>

**Automatic Routing**

El sistema selecciona un modelo según capacidades, rendimiento, costo y disponibilidad.

Mayor comodidad, pero más complejidad y menos previsibilidad.

---

<icon name="sliders-horizontal" size="lg"/>

**Hybrid Routing**

El sistema puede elegir automáticamente dentro de los límites que configures, pero puedes fijar un modelo cuando quieras.

Control explícito con automatización opcional.

**Mi preferencia sería Hybrid Routing**, pero implementado progresivamente.

En la primera versión bastaría con seleccionar manualmente el modelo y tener un perfil predeterminado.

Posteriormente, podríamos establecer políticas por clase de tarea.

Por ejemplo:

| Tarea | Preferencia inicial |
| --- | --- |
| Clasificar información | Modelo local ligero |
| Extraer metadatos de memoria | Modelo local, si demuestra precisión suficiente |
| Programación compleja | Modelo potente con herramientas |
| Investigación | Modelo con acceso a fuentes mediante herramientas autorizadas |
| Conversación cotidiana | Modelo equilibrado según calidad y costo |
| Documentos privados | Modelo local o proveedor remoto autorizado explícitamente |

No son asignaciones definitivas. Tendríamos que medir la calidad y el rendimiento real de nuestros modelos antes de automatizarlas.

Y esto se relaciona directamente con la herramienta CLI de evaluación de hardware que mencionaste: los resultados de esas pruebas podrían alimentar al router en el futuro.

---

## 6. Privacidad: el router no puede saltarse las políticas

Quiero establecer aquí una regla estricta:

**Cambiar de un modelo local a uno cloud es también una decisión de transferencia de datos.**

Imagina que estamos analizando un documento privado.

Si el modelo local falla, el sistema no debería enviar automáticamente ese documento a un proveedor externo solamente porque ofrece más capacidad.

Primero debe consultar las restricciones aplicables.

**Ejemplo de una política de inferencia**

<table>
<table-row><table-cell width="44%">Modelo local</table-cell><table-cell><icon name="check" color="success" inline/> Permitido</table-cell></table-row>
<table-row><table-cell>Modelo cloud aprobado</table-cell><table-cell>Requiere autorización para estos datos</table-cell></table-row>
<table-row><table-cell>Proveedor desconocido</table-cell><table-cell><icon name="x" color="danger" inline/> Denegado</table-cell></table-row>
<table-row><table-cell>Fallback automático externo</table-cell><table-cell><icon name="x" color="danger" inline/> No permitido</table-cell></table-row>
</table>

El Policy Engine debe autorizar la transferencia antes de enviar el contexto, no después.

Lo mismo aplicaría a los costos. El router no debería cambiar silenciosamente a un modelo mucho más caro sin respetar los límites configurados.

Y el adaptador debería informar qué datos necesita transmitir. Incluso un modelo alojado en una computadora propia podría considerarse remoto si se accede a él a través de la red.

---

## 7. Gestión de contexto

Aquí hay otra distinción importante: **la ventana de contexto de un modelo y la memoria persistente del agente no son lo mismo**.

El MemoryProvider conserva conocimiento. El Agent Runtime selecciona qué información es relevante para una tarea. El ModelProvider únicamente recibe el contexto preparado y ejecuta la inferencia.

Context assembly

**Instructions**

Identidad operativa y reglas de la tarea

**Conversation**

Interacciones recientes y resumen de contexto relevante

**Retrieved Memory**

Conocimientos autorizados y relacionados con la tarea

**Tool Results**

Datos obtenidos de operaciones anteriores

**Context Budget Manager**

Prioriza contenido y reserva capacidad para la respuesta

El modelo declararía su límite de contexto cuando podamos conocerlo de manera fiable.

El runtime utilizaría esa información para decidir cuánto material incluir y cuándo resumir, reducir o recuperar información adicional.

Esto evita depender exclusivamente de conversaciones cada vez más largas, algo que puede afectar el costo y el rendimiento.

También permite una ventaja fundamental para tu proyecto: **podríamos cambiar de modelo sin perder el conocimiento que el agente ha acumulado**.

---

## 8. Streaming, cancelación y observabilidad

No quisiera limitar el contrato a esperar una respuesta completa.

El ModelProvider debería soportar eventos incrementales cuando el modelo lo permita.

Por ejemplo:

```
type InferenceEvent =
  | { type: "started"; modelId: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "usage"; usage: TokenUsage }
  | { type: "completed"; response: InferenceResponse }
  | { type: "failed"; error: OperationError };
```

La especificación final deberá incluir identificadores de llamadas, orden de eventos y cancelación explícita para que una ejecución interrumpida no deje operaciones ambiguas.

Con estos eventos podríamos mostrar en la terminal cuándo el modelo está respondiendo, cuándo solicita una herramienta y cuándo termina.

También recopilaría métricas:

| Métrica | Utilidad |
| --- | --- |
| Latencia inicial | Tiempo hasta comenzar a responder |
| Tokens de entrada/salida | Consumo de contexto |
| Tokens por segundo | Rendimiento de inferencia |
| Duración total | Experiencia del usuario |
| Costo estimado/real | Control financiero |
| Errores y reintentos | Fiabilidad |
| Modelo y versión | Comparación entre configuraciones |

Los datos de uso y costos deben permitir valores desconocidos; no todos los providers los ofrecen con la misma precisión.

También mantendría la observabilidad separada del contenido privado: registrar rendimiento no debería implicar guardar automáticamente todos los prompts.

---

## 9. Graceful Degradation aplicado a modelos

Ya habíamos definido la degradación elegante de forma general. Aquí podemos aterrizarla.

Ejemplo: falla el modelo seleccionado

<icon name="alert-circle" color="secondary"/>

Model A unavailable

<icon name="arrow-down" color="secondary"/>

Router busca alternativas compatibles

<icon name="shield-check" color="secondary"/>

Policy Engine valida privacidad y costo

<icon name="git-branch" color="secondary"/>

Usar alternativa permitida o solicitar autorización

Pero el fallback necesita reglas adicionales.

Si un modelo falla después de generar una llamada a una herramienta que ya se ejecutó, no podemos simplemente repetir toda la tarea con otro modelo. Podríamos duplicar acciones.

Por eso el **Agent Runtime debe conservar el estado de ejecución y los resultados de las herramientas**. El nuevo modelo, cuando esté permitido utilizarlo, continuaría desde un punto seguro.

Y si ningún modelo cumple los requisitos, el sistema debería indicarlo claramente, no inventar una solución.

---

## 10. Una distinción adicional: modelos generativos y embeddings

Aquí quiero recuperar algo de nuestro diseño de memoria.

El sistema necesitará modelos que generen respuestas y, posiblemente, modelos que produzcan representaciones vectoriales para la búsqueda semántica.

Aunque ambos sean modelos de IA, **sus contratos operativos son diferentes**.

Yo separaría:

- `ModelProvider`: inferencia generativa, herramientas y respuestas.
- `EmbeddingProvider`: generación de vectores para indexación y búsqueda.

Ambos podrían compartir registro de modelos, configuración de infraestructura y adaptadores de transporte, pero no forzaría las dos operaciones a utilizar una misma interfaz.

Esto simplifica bastante el diseño de los componentes y permite cambiar el modelo de embeddings sin afectar al LLM conversacional.

Los índices de memoria deberían conservar la identidad y versión del modelo de embeddings para poder reconstruirse cuando sea necesario.

---

## 11. Alcance recomendado para nuestro MVP

**Model subsystem · Primera implementación** | <badge>Propuesta</badge>

<table>
<table-row><table-cell>Registro de modelos</table-cell><table-cell>Catálogo configurable</table-cell></table-row>
<table-row><table-cell>ModelProvider</table-cell><table-cell>Inferencia y respuestas normalizadas</table-cell></table-row>
<table-row><table-cell>Streaming</table-cell><table-cell>Cuando lo soporte el modelo</table-cell></table-row>
<table-row><table-cell>Tool Calling</table-cell><table-cell>Estructurado, mediante el runtime</table-cell></table-row>
<table-row><table-cell>Selección</table-cell><table-cell>Manual con modelo predeterminado</table-cell></table-row>
<table-row><table-cell>Políticas</table-cell><table-cell>Autorización de salida de datos y límites básicos</table-cell></table-row>
<table-row><table-cell>Fallback</table-cell><table-cell>Explícito y supervisado</table-cell></table-row>
<table-row><table-cell>Observabilidad</table-cell><table-cell>Latencia, tokens, errores y modelo utilizado</table-cell></table-row>
<table-row><table-cell>Selección automática</table-cell><table-cell>Posterior, tras evaluar modelos</table-cell></table-row>
</table>

El MVP puede empezar con un único modelo cloud, pero el contrato debe aceptar modelos locales desde el primer día. No queremos implementar los modelos locales para descubrir después que tenemos que reescribir todo.

En cuanto al hardware, tampoco incluiría dependencias específicas de CUDA, ROCm o RADV en el contrato general. Esas características pertenecen a los adaptadores de ejecución y al descubrimiento de recursos del host.

---

## 12. Decisiones arquitectónicas — ModelProvider v0.1

| ADR | Decisión propuesta |
| --- | --- |
| ADR-022 | Separar `ModelProvider`, `ModelRegistry` y `ModelRouter` |
| ADR-023 | Inferencia y respuestas mediante contratos normalizados |
| ADR-024 | Descubrimiento explícito de capacidades y límites |
| ADR-025 | Tool Calling mediado obligatoriamente por el Agent Runtime |
| ADR-026 | Routing híbrido: elección manual y automatización opcional |
| ADR-027 | Autorización de privacidad antes de transmitir datos |
| ADR-028 | Gestión de contexto fuera del ModelProvider |
| ADR-029 | Streaming, cancelación y métricas como parte del contrato |
| ADR-030 | Fallback compatible con políticas y estado de ejecución |
| ADR-031 | `EmbeddingProvider` separado de la inferencia generativa |

## Una última consideración

Hay una cuestión que conviene decidir ahora, antes de considerar cerrado este componente.

**¿Debe el usuario conocer qué modelo está utilizando el agente en cada momento?**

Mi propuesta es que sí.

No necesariamente tiene que aparecer un aviso intrusivo cada vez que cambia, pero el sistema debería permitir consultar:

- Modelo seleccionado y proveedor.
- Si está ejecutándose localmente o en remoto.
- Motivo de selección, especialmente si fue automática.
- Consumo de tokens y costo disponible.
- Cambios de modelo y fallbacks durante la ejecución.

Y para tareas sensibles, la transición de local a cloud debería exigir autorización cuando la política aplicable no la haya concedido.

Esto evita que el Model Router se convierta en una caja negra.

**Con estas decisiones tendríamos un ModelProvider capaz de evolucionar desde un único modelo hasta una colección de modelos especializados, sin acoplar el funcionamiento de nuestros agentes a ninguno de ellos.**

El siguiente componente natural sería `MemoryProvider`, donde podremos convertir nuestra arquitectura de memoria híbrida en contratos concretos de lectura, escritura, búsqueda, relaciones y versionado. Pero antes me interesa validar contigo especialmente la separación entre `ModelProvider` y `ModelRouter`, porque es la decisión que permitirá que, en el futuro, el asistente utilice distintos modelos de forma inteligente sin perder tu control sobre ellos.

### Source turn T329 — USER

Si, en cuanto al routing me gusta la idea del hybrid routing, quiero poder ser capaz de elgir el modelo que quiero usar para una tarea o sesión, pero también quiero que el sistema sea capaza de discernir que modelo usar para desarrollar mejor la tarea si yo no se lo especifico.
En cuanto a conocer el model que se está usando, de hecho estaba pensando en tener un valor tipo statusline donde se muestre el model en uso, no es muy intrusivo y está siempre visible.
Algo que me gusta mucho de este planteamiento es que prepara el sistema para agregar modelos, digamos que hoy tenemos un modelo local y OpenAI como recursos, pero después, para agregar robustes al trabajo diario quiero agregar Anthropic, Antigravity, etc. Esta arquitectura los integra fácilmente.

### Source turn T330 — ASSISTANT

¡Esto confirma algo importante de nuestra arquitectura! 😎 **El ModelProvider no debe estar pensado para una lista fija de modelos, sino para un ecosistema de proveedores que pueda crecer sin modificar el núcleo del asistente.**

Y tus dos preferencias encajan perfectamente:

1. **Hybrid Routing:** si eliges un modelo, el sistema respeta tu elección. Si no especificas ninguno, selecciona el más adecuado según la tarea, sus capacidades y las políticas vigentes.
2. **Model Statusline:** siempre puedes ver qué modelo está trabajando, dónde se ejecuta y si fue seleccionado manual o automáticamente.

Yo formalizaría ambas como requisitos del sistema, no como funcionalidades opcionales que añadiremos algún día.

## 1. El modelo activo en la statusline

Por ejemplo, imagino algo así integrado en nuestra futura CLI:

<icon name="terminal" color="secondary"/>

assistant · ~/projects/rust-learning

❯ Explain the ownership rules in this example.

The agent is analyzing the project files...

---

<row align="center" gap={2}> | <icon name="cpu" color="success"/> |
Claude · Sonnet
| <badge>Auto</badge>

<icon name="cloud" color="secondary" size="xs"/>

Cloud

<icon name="shield-check" color="success" size="sm"/>
</row>

Representación conceptual, no una interfaz implementada ni un modelo seleccionado realmente.

Me gusta que sea poco intrusiva. Incluso podríamos mostrar información adicional al pulsar un atajo o abrir un panel de detalles: versión exacta, tokens utilizados, costo estimado, contexto consumido y motivo del routing.

Hay una consideración adicional: cuando existan varios agentes trabajando simultáneamente, **la statusline debería mostrar el modelo de la ejecución activa**, no asumir que todo el sistema utiliza uno solo.

## 2. Hybrid Routing: selección explícita y automática

Para hacerlo predecible, establecería un orden de prioridades.

<badge color="success">1</badge>
**Task override**

La elección específica para la tarea actual tiene prioridad.

---

<badge>2</badge>
**Session preference**

Si elegiste un modelo para toda la sesión, se conserva.

---

<badge>3</badge>
**Agent / Project profile**

Preferencias configuradas para un agente o proyecto.

---

<badge>4</badge>
**Automatic routing**

Si no hay una elección explícita, el sistema evalúa los modelos disponibles.

Todas las opciones están subordinadas a las políticas de seguridad y disponibilidad. Elegir manualmente un modelo no debe permitir saltarse una restricción de privacidad.

El contrato podría expresarse así:

```
interface ModelSelection {
  mode: "auto" | "manual";
  modelId?: string;
  scope: "task" | "session" | "project" | "agent";
  allowFallback: boolean;
}
```

Por ejemplo, podrías iniciar una sesión con el router automático, pedirle que use Claude para revisar código y, al terminar esa tarea, regresar automáticamente a la configuración anterior.

**Un cambio de modelo no debería implicar perder el contexto o empezar otra conversación.** El runtime conservaría el estado y prepararía el contexto compatible con el nuevo proveedor.

Eso sí, cambiar a mitad de una ejecución con herramientas requiere un punto de continuación seguro.

## 3. ¿Cómo decidiría automáticamente?

No basaría la selección únicamente en el proveedor ni en un ranking subjetivo de modelos.

Propongo evaluar varios criterios:

| Criterio | Ejemplo |
| --- | --- |
| Capacidades | Tool calling, imágenes, contexto, salida estructurada |
| Calidad comprobada | Resultados de benchmarks y tareas anteriores |
| Privacidad | Restricciones para información confidencial |
| Disponibilidad | Modelo cargado, conexión, límites de servicio |
| Latencia | Tiempo de respuesta y tokens por segundo |
| Costo | Presupuesto de la sesión o del proyecto |
| Preferencias | Priorizar modelos locales cuando sea viable |

Primero aplicamos los requisitos obligatorios: seguridad, permisos y capacidades. Después clasificamos los candidatos restantes.

No le daría al propio LLM autoridad absoluta para elegir modelos. **El routing debería ser verificable y configurable**, aunque eventualmente use otro modelo ligero como clasificador de tareas.

Y algo importante: cuando el sistema no tenga información suficiente para determinar qué modelo es mejor, debe admitirlo y utilizar un valor predeterminado, no inventar una supuesta optimización.

## 4. Diferenciar modelos de agentes externos

Aquí encontré un matiz interesante sobre <Entity category="software" value="Google Antigravity" disambig="Plataforma de desarrollo asistido por agentes de Google"/>.

Antigravity no es simplemente otro LLM como Gemini o Claude: es una plataforma de agentes con herramientas, gestión de contexto y ejecución de tareas. Google también documenta un SDK local y un agente administrado accesible mediante la Gemini API. [Choose your Antigravity](https://www.antigravity.google/docs/overview), [Antigravity SDK overview](https://www.antigravity.google/docs/sdk/overview), [Antigravity agent | Gemini API | Google AI for Developers](https://ai.google.dev/gemini-api/docs/antigravity-agent)

Esto significa que conviene distinguir dos tipos de integración:

| Integración | Responsabilidad |
| --- | --- |
| **ModelProvider** | Enviar solicitudes de inferencia a modelos como GPT, Claude o Gemini |
| **External Agent Adapter** | Delegar una tarea completa a un sistema como Antigravity, cuando exista una integración compatible |

La segunda opción implica un contrato más complejo: delegación, seguimiento de progreso, herramientas, permisos, resultados y cancelación.

No la implementaría todavía, pero **sí reservaría ese límite arquitectónico**. Así evitamos forzar un agente completo dentro de una interfaz pensada solamente para inferencias.

Esto también nos ayudará a evaluar Hermes, OpenClaw y otros runtimes en la siguiente fase.

## 5. Añadir proveedores sin modificar el núcleo

Imagina esta evolución:

Model Registry

<grid columns={2} gap={2}>
<grid-item>
<icon name="hard-drive" size="lg"/>
\*\*Local Runtime\*\*

Uno o varios LLM locales

</grid-item>
<grid-item>
<icon name="cloud" size="lg"/>
\*\*OpenAI\*\*

Modelos GPT

</grid-item>
<grid-item>
<icon name="cloud" size="lg"/>
\*\*Anthropic\*\*

Modelos Claude

</grid-item>
<grid-item>
<icon name="cloud" size="lg"/>
\*\*Google\*\*

Modelos Gemini

</grid-item>
</grid>

---

<icon name="plus-circle" color="secondary"/>

Nuevos providers mediante adaptadores, sin alterar el Agent Runtime.

Para agregar un proveedor nuevo, idealmente solo tendríamos que configurar sus credenciales, implementar o reutilizar su adaptador, registrar los modelos y verificar sus capacidades.

La compatibilidad con nuestro contrato debe comprobarse realmente: algunas APIs tienen diferencias en streaming, herramientas, formatos, límites y autenticación. La arquitectura hace viable la integración, pero no la vuelve automática por arte de magia.

También separaremos el acceso mediante una suscripción de usuario del acceso mediante API, porque pueden tener condiciones y facturación diferentes.

## 6. Formalizar la statusline

Añadiría un contrato de estado de inferencia que el runtime publica y cualquier interfaz puede consumir:

```
interface ActiveModelStatus {
  runId: string;
  modelId: string;
  providerId: string;

  location: "local" | "remote";
  selection: "manual" | "automatic";

  state: "idle" | "running" | "waiting" | "failed";

  tokensUsed?: number;
  estimatedCost?: number;
}
```

Nuestra CLI podría mostrarlo en una statusline, mientras que Noctalia podría presentarlo en un widget. Las dos interfaces consultarían el mismo estado; ninguna necesitaría implementar su propio router.

Para varios agentes simultáneos, el estado incluiría una entrada por ejecución, y la interfaz elegiría cuál mostrar como principal.

Esto nos deja abierta incluso la posibilidad de tener un panel de actividad donde veamos qué agente está trabajando, con qué modelo y qué operaciones ha solicitado.

---

## Decisiones nuevas — ModelProvider v0.2

| ADR | Decisión |
| --- | --- |
| ADR-032 | Hybrid Routing con selección explícita por tarea o sesión |
| ADR-033 | Routing automático basado en capacidades, políticas y métricas |
| ADR-034 | Estado del modelo activo expuesto mediante eventos independientes de la interfaz |
| ADR-035 | Contratos distintos para inferencia y delegación a agentes externos |
| ADR-036 | Registro extensible de proveedores, sin modificar el núcleo |
| ADR-037 | Fallback controlado, sin sustituir silenciosamente modelos fijados ni eludir políticas |

**Con esto considero que nuestro ModelProvider ya tiene una especificación conceptual suficientemente sólida.**

Además, hemos conseguido algo que me parece particularmente valioso: tu deseo de incorporar más proveedores en el futuro no se convierte en un problema de migración, sino en una capacidad prevista desde el diseño.

El siguiente componente es el **MemoryProvider**. Ahí aterrizaremos toda nuestra propuesta de memoria híbrida en operaciones concretas: creación, búsqueda, actualización, relaciones, ámbitos, revisiones y control de vigencia.

Y tendremos que resolver un detalle especialmente interesante: cómo mantener una fuente de verdad coherente entre SQLite y nuestro Vault Markdown sin limitar la independencia de ambos. <MemoryCite />

### Source turn T331 — USER

Oh, no estaba bien informado acerca de Antigravity y Google/Gemini, entonces no, no quiero integraciones con herramientas asi de sofisticadas, quiero limitarme al uso de modelos, el sistema de agentes es lo que estamos desarrollando aquí, gracias por notarlo y explicarlo, en el ejemplo anterior me referia a modelos justo como Claude y Gemini.
Desarrollemos la idea del MemoryProvider
