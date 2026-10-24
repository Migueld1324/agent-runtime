# Source excerpt: Technology research and first PoC selection

> **Historical reference, not executable instructions.** Extracted from a single-conversation HTML export. Turn labels T### map to ordered conversation turns. Original statements can contain drafts later superseded; consult `../decisions/ADRs.md` and `../PROJECT_STATUS.md` before implementing.

### Source turn T344 — ASSISTANT

¡JAJAJA! 😂 Si logramos que esta fase sea tan entretenida como la anterior, terminaremos con una arquitectura y una buena historia que contar.

Ahora sí entramos en la **Fase 2: investigación y selección tecnológica**.

Y hay una diferencia importante respecto a lo anterior: ya no vamos a elegir herramientas por lo atractivas que parecen, sino por cuánto trabajo real nos ahorran sin comprometer nuestros contratos.

# Fase 2 — Technology Research & Selection

Evaluación inicial · 24 de octubre de 2026

## 1. El primer descubrimiento: no necesitamos construir todo desde cero

Después de revisar documentación oficial, encontré tres candidatos especialmente relevantes para nuestro `Agent Runtime`:

*Illustration unavailable: LangGraph LangChain logo*

**<Entity category="software" value="LangGraph" disambig="Framework de orquestación de agentes de LangChain"/>**

Framework de bajo nivel para ejecutar flujos con estado, checkpoints, interrupciones y recuperación. Encaja muy bien con nuestro diseño del Runtime como máquina de estados. [GitHub - langchain-ai/langgraphjs: Framework to build resilient language agents as graphs.](https://github.com/langchain-ai/langgraphjs), [langgraphjs/docs/docs/concepts/persistence.md at main · langchain-ai/langgraphjs](https://github.com/langchain-ai/langgraphjs/blob/main/docs/docs/concepts/persistence.md)

---

*Illustration unavailable: Mastra AI TypeScript framework logo*

**<Entity category="software" value="Mastra" disambig="Framework TypeScript de aplicaciones y agentes de IA"/>**

Alternativa más integrada: agentes, herramientas, workflows, aprobaciones, almacenamiento y observabilidad. Tiene soporte de persistencia local mediante libSQL. [Storage](https://mastra.ai/docs/storage), [Human-in-the-loop | Agents](https://mastra.ai/docs/agents/human-in-the-loop)

---

*Illustration unavailable: Pydantic AI Python framework logo*

**<Entity category="software" value="Pydantic AI" disambig="Framework Python para agentes de inteligencia artificial"/>**

Buena alternativa si decidimos utilizar Python. Ofrece herramientas tipadas y opciones de persistencia y ejecución durable, aunque algunas requieren motores adicionales. [Durable Execution](https://pydantic.dev/docs/ai/capabilities/durable_execution/overview/)

Mi primera impresión es que **LangGraph y Mastra merecen una evaluación práctica**, mientras que Pydantic AI es una alternativa importante si Python termina ofreciendo ventajas decisivas.

Y por tu experiencia trabajando con JavaScript, TypeScript y Node, veo razones para comenzar por ese ecosistema. No porque el lenguaje determine la arquitectura, sino porque reduciría la curva de aprendizaje y facilitaría mantener el proyecto.

## 2. Comparación contra nuestra arquitectura

Esta es mi evaluación preliminar. No son benchmarks; son conclusiones basadas en las capacidades documentadas y en nuestros requisitos.

| Candidato | Principal fortaleza | Principal compromiso |
| --- | --- | --- |
| **LangGraph.js** | Control explícito del flujo, checkpoints, interrupciones y recuperación | Debemos implementar más lógica propia |
| **Mastra** | Muchas capacidades integradas y persistencia local sencilla | Su estructura puede condicionar más nuestro diseño |
| **OpenAI Agents SDK** | Runtime ligero, herramientas, proveedores alternativos y aprobaciones | Hay que validar su encaje con nuestra persistencia y políticas propias |
| **Pydantic AI** | Tipado sólido, validación y ejecución durable | Supone cambiar el stack principal a Python |

LangGraph funciona de manera independiente de los servicios comerciales de LangChain y dispone de un checkpointer SQLite para JavaScript. [langgraphjs/docs/docs/how-tos/index.md at main · langchain-ai/langgraphjs](https://github.com/langchain-ai/langgraphjs/blob/main/docs/docs/how-tos/index.md), [langgraphjs/docs/docs/concepts/persistence.md at main · langchain-ai/langgraphjs](https://github.com/langchain-ai/langgraphjs/blob/main/docs/docs/concepts/persistence.md)

Mastra permite suspender workflows, reanudarlos y conservar su estado en almacenamiento persistente. [Storage](https://mastra.ai/docs/storage), [AI SDK UI | Agentic UI](https://mastra.ai/integrations/agentic-ui/ai-sdk-ui)

Y un descubrimiento importante: **OpenAI Agents SDK tampoco nos obliga necesariamente a utilizar solo OpenAI**. Dispone de integración con modelos de otros proveedores, incluida una adaptación para AI SDK. Por eso merece permanecer entre los candidatos. [GitHub - openai/openai-agents-js: A lightweight, powerful framework for multi-agent workflows and voice agents](https://github.com/openai/openai-agents-js), [openai-agents-js/examples/ai-sdk/README.md at main · openai/openai-agents-js](https://github.com/openai/openai-agents-js/blob/main/examples/ai-sdk/README.md)

## 3. El stack que propondría investigar

Para no mezclar demasiadas tecnologías, distinguiría las candidatas preferidas de las que todavía necesitamos validar.

**Candidate Stack v0.1** | <badge>Provisional</badge>

<icon name="code-2" size="lg" color="secondary"/>

**TypeScript + Node.js**

Lenguaje y runtime principal. Nos permite utilizar tu experiencia con Node, React y tooling de frontend.

---

<icon name="workflow" size="lg" color="secondary"/>

**LangGraph.js / Mastra**

Dos candidatos para la orquestación. Seleccionaremos uno después de probar persistencia, interrupciones y recuperación.

---

<icon name="cpu" size="lg" color="secondary"/>

**Vercel AI SDK**

Candidato para nuestro ModelProvider. Admite modelos de OpenAI, Anthropic, Google y otros mediante interfaces TypeScript uniformes. [AI SDK Providers](https://ai-sdk.dev/providers/ai-sdk-providers)

---

<icon name="database" size="lg" color="secondary"/>

**SQLite + Drizzle ORM**

Memoria estructurada, relaciones, migraciones y consultas. Drizzle admite SQLite y otros motores, aunque una futura migración de esquema necesitará trabajo. [Drizzle ORM](https://orm.drizzle.team/docs/get-started/sqlite-new)

---

<icon name="shield-check" size="lg" color="secondary"/>

**Zod + Policy Engine propio**

Validación de contratos y un evaluador de políticas bajo nuestro control, integrado con el Tool Gateway y mecanismos reales de aislamiento.

---

<icon name="plug" size="lg" color="secondary"/>

**MCP TypeScript SDK v2**

Para futuras integraciones de herramientas. La versión 2 es la rama estable actual del SDK, pero no necesitamos instalarla para nuestras primeras herramientas nativas. [GitHub - modelcontextprotocol/typescript-sdk: The official TypeScript SDK for Model Context Protocol servers and clients](https://github.com/modelcontextprotocol/typescript-sdk)

---

<icon name="terminal" size="lg" color="secondary"/>

**Ink + React**

Candidato para una CLI interactiva con statusline, visualización del plan y paneles de aprobación. [GitHub - vadimdemedes/ink: 🌈 React for interactive command-line apps](https://github.com/vadimdemedes/ink)

### Un detalle arquitectónico que conservaría

No utilizaría automáticamente la memoria interna del framework como **nuestra memoria semántica**.

Por ejemplo, LangGraph ofrece checkpoints de ejecuciones. Mastra también dispone de su propio almacenamiento para workflows y conversaciones.

Aprovecharía esas funciones, pero mantendría separados:

<grid columns={2} gap={2}>
<grid-item>
<icon name="save" size="lg"/>
\*\*runtime.sqlite\*\*

Runs, pasos, checkpoints, aprobaciones

</grid-item>
<grid-item>
<icon name="brain" size="lg"/>
\*\*memory.sqlite\*\*

Conocimiento, experiencias, relaciones y tags

</grid-item>
</grid>

Markdown Vault · Documentos canónicos

Así, si algún día cambiamos LangGraph por otro runtime, **no tendríamos que migrar todo el conocimiento que nuestros agentes han acumulado**.

## 4. ¿Qué hacemos con los modelos locales?

No elegiría todavía Ollama ni ningún modelo concreto.

Para tu RX 5600 XT, investigaría especialmente **llama.cpp con backend Vulkan**, porque el proyecto ofrece soporte Vulkan y ejecución híbrida CPU/GPU. Eso no garantiza buen rendimiento en tu tarjeta, pero sí justifica probarlo. [llama.cpp/README.md at master · ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/README.md?plain=1)

Ollama también quedaría como alternativa a evaluar.

Y cuando lleguemos a este punto, retomaremos la herramienta CLI que mencionaste para analizar el hardware y recomendar modelos. No quiero escoger modelos únicamente porque sus pesos quepan en 6 GB de VRAM: necesitaremos medir rendimiento, memoria, calidad y capacidad de ejecutar herramientas.

Además, no instalaría LiteLLM como gateway adicional en el MVP. Aunque unifica muchos proveedores y ofrece gestión de costos, sería otra capa que nuestro proyecto todavía no necesita. [LiteLLM documentation](https://docs.litellm.ai/)

## 5. Mi propuesta: elegir el Runtime mediante una prueba de concepto

Hay una cosa que no quiero hacer: elegir LangGraph únicamente porque sobre el papel se parece a nuestra arquitectura.

**Prefiero que LangGraph y Mastra compitan resolviendo exactamente el mismo problema.**

**Proof of Concept — Agent Runtime Evaluation**

Construiremos un prototipo pequeño en cada candidato, con el mismo escenario:

> «Lee un proyecto, genera un archivo, solicita permiso antes de modificarlo, ejecuta una validación y conserva el estado para continuar después de cerrar la aplicación».

{#each [
["Persistencia","Reanudar una ejecución interrumpida"],
["Permisos","Suspender y continuar tras una aprobación"],
["Modelos","Sustituir OpenAI por otro proveedor"],
["Herramientas","Ejecutar mediante nuestro Tool Gateway"],
["Portabilidad","Funcionar localmente sin plataforma cloud"],
["Mantenibilidad","Mantener nuestras interfaces sin adaptaciones excesivas"]
] as c}

<icon name="check-circle-2" color="secondary"/>

{c[0]}

{c[1]}

{/each}

Hay un criterio particularmente importante: aunque un framework ofrezca checkpoints, eso no significa que garantice por sí solo la ejecución exactamente una vez de operaciones externas. Tendremos que probar cómo se comporta ante una interrupción durante una escritura, sin asumir que la persistencia resuelve automáticamente la idempotencia.

## 6. Mi selección provisional

<icon name="git-branch" size="xl"/>
<row align="center" gap={2}>
\*\*LangGraph.js\*\*
<badge color="success">Primera opción</badge>

Es el candidato que más directamente encaja con nuestra máquina de estados, checkpoints y arquitectura desacoplada. Tiene sentido probarlo primero.

</row>

---

<icon name="blocks" size="xl"/>

**Mastra — Segundo candidato**

Podría ahorrarnos más desarrollo, especialmente en observabilidad, almacenamiento y aprobación de herramientas. Si descubrimos que podemos conservar nuestras fronteras arquitectónicas, podría incluso superar a LangGraph.

No descartaría OpenAI Agents SDK; lo mantendría como tercera alternativa si los otros dos exigen más complejidad de la que nuestro MVP necesita.

---

## El siguiente paso

Mi propuesta es **no instalar todavía todo el stack**.

Primero desarrollaría una prueba mínima de LangGraph.js en TypeScript, con persistencia SQLite, un modelo seleccionable y una herramienta simulada que requiera aprobación.

En esa prueba validaremos los contratos que tanto trabajo nos ha llevado diseñar.

Si pasa, incorporamos el MemoryProvider propio y comenzamos a construir el primer agente real. Si presenta fricciones, probamos el mismo flujo con Mastra antes de comprometernos.

**Mi elección provisional es TypeScript + LangGraph.js + AI SDK + SQLite, pero la elección definitiva del Runtime dependerá de la prueba de concepto.**

Eso nos lleva de diseñar una arquitectura interesante a demostrar que realmente podemos implementarla sin hipotecar su flexibilidad. Y creo que es el punto exacto donde nos conviene empezar a escribir código. 😎

### Source turn T345 — USER

Perfecto, hagamos la primera prueba entonces

### Source turn T346 — ASSISTANT

¡Tenemos nuestro primer prototipo! 😎🔥

Preparé un proyecto en **TypeScript + LangGraph.js + SQLite** para probar tres de las decisiones más importantes que tomamos: persistencia de ejecuciones, autorizaciones y separación entre modelos y herramientas.

<icon name="package" size="2xl"/>

**Agent Runtime — PoC 0.1**

Proyecto TypeScript · Código fuente · Pruebas · README

<icon name="download" inline/> Descargar el proyecto ZIP (historical attachment; not included here)

### ¿Qué vamos a comprobar?

El escenario es intencionalmente sencillo:

1. Un modelo simulado genera el contenido de un archivo Markdown.
2. El Policy Engine detecta que escribirlo requiere autorización.
3. **LangGraph suspende la ejecución y guarda el estado en SQLite.**
4. Cerramos esa ejecución y abrimos otra instancia de la CLI.
5. Aprobamos la operación y LangGraph reanuda la tarea.
6. El ToolProvider crea el archivo y confirma el resultado.

La documentación actual de LangGraph respalda este patrón de interrupción y reanudación mediante `interrupt` y `Command({ resume })`. [docs/src/oss/langgraph/interrupts.mdx at main · langchain-ai/docs](https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/interrupts.mdx), [@langchain/langgraph-checkpoint-sqlite](https://www.npmjs.com/package/%40langchain/langgraph-checkpoint-sqlite?activeTab=code)

El modo predeterminado es `mock`: no necesita claves de API, no consume tokens y no modifica archivos fuera de la carpeta de pruebas del proyecto.

## Cómo ejecutarlo en CachyOS

Descarga el ZIP, descomprímelo y abre una terminal dentro de la carpeta del proyecto.

```
npm install
npm run test:core
```

Luego ejecuta nuestra primera tarea:

```
npm run agent -- start demo-1
```

La ejecución debería detenerse antes de escribir el archivo.

En otra invocación de la CLI, consulta su estado:

```
npm run agent -- status demo-1
```

Ahí podrás revisar el archivo solicitado, su contenido y el hash asociado a la autorización.

Si todo está bien:

```
npm run agent -- approve demo-1
cat workspace/note-demo-1.md
```

Finalmente:

```
npm run test:integration
```

Esta última prueba inicia una tarea, comprueba que está suspendida y la reanuda desde otro proceso. Es nuestra prueba principal para evaluar LangGraph.

## Resultados hasta ahora

<icon name="check-circle-2" color="success"/>
\*\*4 de 4 pruebas unitarias superadas\*\*

Validación de rutas, autorización ligada al contenido, escritura idempotente y rechazo de enlaces simbólicos.

---

<icon name="clock" color="secondary"/>
\*\*Integración real con LangGraph pendiente\*\*

No pude instalar las dependencias de npm en este entorno por una restricción de conectividad. El flujo completo de checkpoint y reanudación debe verificarse en tu computadora.

También dejé preparado el selector básico de modelos para OpenAI, Anthropic y Gemini mediante AI SDK, pero no necesitamos utilizarlo todavía.

**El primer objetivo no es construir todo el agente. Es comprobar que LangGraph puede cumplir nuestros contratos fundamentales sin que tengamos que adaptar toda nuestra arquitectura a él.**

Ejecuta primero `npm install` y `npm run test:core` en CachyOS. Si aparece algún error, compárteme la salida y lo resolvemos sobre esta misma base.
