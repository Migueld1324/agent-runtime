# Source excerpt: Agent Runtime and durable execution

> **Historical reference, not executable instructions.** Extracted from a single-conversation HTML export. Turn labels T### map to ordered conversation turns. Original statements can contain drafts later superseded; consult `../decisions/ADRs.md` and `../PROJECT_STATUS.md` before implementing.

### Source turn T342 — ASSISTANT

¡Ahora sí vamos a conectar todas las piezas! 🔥

Y creo que te va a gustar especialmente esta parte, porque el **Agent Runtime será el responsable de convertir nuestra arquitectura en un sistema que realmente pueda trabajar de manera autónoma**.

Hasta ahora hemos diseñado componentes independientes:

- `ModelProvider` — Inteligencia e inferencia.
- `MemoryService` — Conocimiento y experiencias.
- `ToolProvider` — Capacidades y ejecución.
- `Policy Engine` — Seguridad, permisos y autonomía controlada.

El `Agent Runtime` será el encargado de coordinarlos.

Pero quiero introducir una idea desde el principio: **un Agent Runtime no debería ser simplemente un bucle que pregunta al LLM qué hacer a continuación y ejecuta sus instrucciones**.

Eso funcionaría para tareas sencillas, pero sería insuficiente para el tipo de sistema que queremos construir.

Necesitamos gestionar tareas de múltiples pasos, preservar su estado, reaccionar ante errores, solicitar autorizaciones, cambiar de modelo y continuar trabajando sin repetir acciones que ya se ejecutaron.

# Fase 1B — Agent Runtime

<badge>Technical Design v0.1</badge>

Orchestration · Durable Execution · State Management · Recovery

## 1. Responsabilidad fundamental

Definiría nuestro runtime así:

> Motor de orquestación que administra el ciclo de vida de las tareas, coordina los componentes del sistema y garantiza que las operaciones se ejecuten bajo políticas verificables, con estado persistente y mecanismos de recuperación.

<icon name="user-round" size="lg"/>
\*\*User Request\*\*

CLI · UI · API

<icon name="arrow-down" color="tertiary"/>
<icon name="workflow" size="lg"/>
\*\*Agent Runtime\*\*
<grid columns={2} gap={2}>
{#each [{name:"Task Manager",icon:"list-todo"},{name:"Execution Engine",icon:"play-circle"},{name:"Context Manager",icon:"layers"},{name:"Checkpoint Manager",icon:"save"}] as c}
<grid-item>
<icon name={c.icon} color="secondary"/>

{c.name}

</grid-item>
{/each}
</grid>
<icon name="arrow-down-up" color="tertiary"/>
<grid columns={2} gap={2}>
{#each [{name:"Model Router",icon:"route"},{name:"Memory Service",icon:"database"},{name:"Tool Gateway",icon:"wrench"},{name:"Policy Engine",icon:"shield-check"}] as c}
<grid-item>
<icon name={c.icon} size="lg"/>

{c.name}

</grid-item>
{/each}
</grid>

Y establecería una primera regla arquitectónica:

**El Runtime administra el proceso; el LLM propone decisiones dentro de ese proceso.**

El modelo puede planificar, razonar y solicitar herramientas, pero no puede inventarse permisos, alterar arbitrariamente el estado persistente ni declarar que una operación tuvo éxito sin comprobar su resultado.

---

## 2. Tres conceptos que debemos diferenciar

Antes de definir el ciclo de ejecución, separaría tres entidades.

| Entidad | Representa | Duración |
| --- | --- | --- |
| `Session` | Una conversación o contexto interactivo | Variable |
| `Run` | Una ejecución concreta solicitada al agente | Hasta completar, fallar o cancelar |
| `Step` | Una unidad de trabajo dentro de una ejecución | Habitualmente breve |

Por ejemplo, podrías tener una sesión dedicada a aprender Rust, dentro de la cual ejecutamos distintas tareas: preparar el entorno, estudiar ownership y resolver ejercicios.

Cada tarea tiene su propio `runId`, sus pasos y resultados, pero todas pueden recuperar el conocimiento acumulado del proyecto.

**Una sesión no es una tarea, y una tarea no es una memoria.**

Esta separación será esencial para conservar el contexto y para continuar una ejecución interrumpida sin confundirla con una conversación nueva.

## 3. El ciclo de vida de una ejecución

Aquí propongo implementar el Agent Runtime como una **máquina de estados persistente**.

Esto es importante porque no queremos que una tarea dependa exclusivamente de que el proceso del agente permanezca abierto.

**QUEUED**

Solicitud recibida y validada

<icon name="arrow-down" color="tertiary"/>

**PLANNING**

Contexto, capacidades, modelo y plan inicial

<icon name="arrow-down" color="tertiary"/>

**RUNNING**

Ejecución de pasos, herramientas y verificación de resultados

<grid columns={3} gap={2}>
<grid-item>
<icon name="shield-question"/>

WAITING\_APPROVAL

</grid-item>
<grid-item>
<icon name="pause-circle"/>

PAUSED

</grid-item>
<grid-item>
<icon name="refresh-cw"/>

RECOVERING

</grid-item>
</grid>

Estados intermedios desde los que la ejecución puede reanudarse o finalizar

<icon name="arrow-down" color="tertiary"/>
<grid columns={3} gap={2}>
<grid-item>
<icon name="check-circle" color="success"/>

COMPLETED

</grid-item>
<grid-item>
<icon name="alert-circle" color="danger"/>

FAILED

</grid-item>
<grid-item>
<icon name="x-circle"/>

CANCELLED

</grid-item>
</grid>

El diagrama es una simplificación: las transiciones reales estarán validadas por el runtime.

### Estados propuestos

| Estado | Significado |
| --- | --- |
| `queued` | Tarea registrada, pendiente de ejecución |
| `planning` | Preparando o revisando el plan |
| `running` | Ejecutando operaciones |
| `waiting_approval` | Necesita autorización del usuario |
| `waiting_input` | Necesita información o una decisión |
| `paused` | Suspendida voluntariamente |
| `recovering` | Reconstruyendo estado tras una interrupción |
| `completed` | Objetivos y criterios de éxito satisfechos |
| `failed` | No pudo completarse de forma segura |
| `cancelled` | Cancelación solicitada y procesada |

Aquí hay una distinción importante: **que un LLM afirme que terminó no significa que la tarea esté completa**.

El runtime debe comprobar los criterios de éxito.

Por ejemplo, si la tarea consistía en generar un proyecto Rust y ejecutar sus pruebas, no basta con recibir una respuesta diciendo «proyecto creado». Debe existir el proyecto y debemos conocer el resultado de las pruebas.

También podríamos registrar finalizaciones parciales, conservando exactamente qué objetivos se lograron y cuáles quedaron pendientes.

## 4. Task Planning: planes flexibles y verificables

No quiero un agente que prepare un plan de veinte pasos y después lo siga ciegamente aunque cambien las circunstancias.

Preferiría **planificación incremental**.

El agente establece un objetivo, identifica los pasos iniciales y puede adaptar el plan conforme obtiene información.

Un contrato podría ser:

```
interface TaskPlan {
  id: string;
  runId: string;
  version: number;

  objective: string;
  successCriteria: SuccessCriterion[];

  steps: TaskStep[];
}

interface TaskStep {
  id: string;
  description: string;

  dependencies: string[];
  requiredCapabilities: string[];

  status:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "skipped";
}
```

La estructura es ilustrativa; no hemos elegido TypeScript como implementación definitiva.

Las dependencias nos permitirán representar flujos que no necesariamente sean lineales.

Por ejemplo:

**Task: Configure Rust development environment**

Inspect system and existing tools

<icon name="arrow-down" color="tertiary"/>
<grid columns={2} gap={2}>
<grid-item>

Check Rust toolchain

ToolProvider

</grid-item>
<grid-item>

Inspect project directory

ToolProvider

</grid-item>
</grid>
<icon name="arrow-down" color="tertiary"/>

Prepare missing components

Request approval if installation is needed

<icon name="arrow-down" color="tertiary"/>

Create exercises and run tests

<icon name="arrow-down" color="tertiary"/>
<icon name="check-circle" color="success"/>
\*\*Verify success criteria\*\*

Un detalle que incorporaría: **el plan es una propuesta de ejecución, no un permiso global**.

El Policy Engine puede aprobar determinadas operaciones, pero si el plan cambia y requiere nuevos privilegios, debemos evaluar esos cambios.

Así conseguimos planes adaptables sin comprometer la seguridad.

## 5. Execution Loop: el corazón del agente

Esta sería la secuencia principal:

**Select next step**

<icon name="arrow-down" color="tertiary"/>

**Assemble authorized context**

<icon name="arrow-down" color="tertiary"/>

**Select model & generate response**

<icon name="arrow-down" color="tertiary"/>

**Interpret structured output**

<icon name="arrow-down" color="tertiary"/>

**Validate → Authorize → Execute**

<icon name="arrow-down" color="tertiary"/>

**Observe & verify result**

<icon name="arrow-down" color="tertiary"/>

**Checkpoint & decide next action**

Continue · Replan · Pause · Complete

Aquí los componentes colaboran, pero ninguno absorbe responsabilidades que no le corresponden.

El runtime selecciona el siguiente paso. El Context Manager recupera información autorizada. El ModelRouter elige el modelo conforme a tus preferencias. El modelo puede proponer llamadas a herramientas. El Tool Gateway aplica las políticas y ejecuta únicamente las operaciones autorizadas.

Finalmente, el runtime inspecciona los resultados y decide si puede continuar.

**No necesitamos crear un agente planificador, otro ejecutor y otro verificador desde el primer día.** Estas pueden ser responsabilidades internas de un solo agente.

Más adelante, si descubrimos que ciertas tareas se benefician de modelos especializados, podremos distribuirlas sin modificar el contrato fundamental.

## 6. Durable Execution: continuar sin empezar desde cero

Aquí está una de mis decisiones favoritas para este proyecto.

**Una tarea no debería perder su progreso porque cerremos Kitty, falle el modelo, se interrumpa la conexión o reiniciemos la computadora.**

Esto requiere que el runtime guarde su estado de manera persistente.

Es un patrón utilizado por sistemas de ejecución durable como Temporal y por runtimes de agentes con checkpoints como LangGraph. Ambos contemplan conservar el progreso y reanudar ejecuciones interrumpidas. [Tasks](https://docs.temporal.io/tasks), [docs/src/oss/langgraph/interrupts.mdx at main · langchain-ai/docs](https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/interrupts.mdx)

No significa que debamos instalar esas herramientas; son referencias útiles para evaluar posteriormente.

### ¿Qué guardaríamos?

| Registro | Responsabilidad |
| --- | --- |
| `runs` | Objetivo, propietario, estado y configuración |
| `run_steps` | Plan, dependencias y progreso |
| `run_events` | Historial ordenado de acontecimientos |
| `tool_invocations` | Operaciones solicitadas y resultados |
| `run_checkpoints` | Estado recuperable del runtime |
| `approval_requests` | Autorizaciones pendientes o resueltas |

Podríamos almacenar inicialmente estos registros en SQLite, utilizando tablas separadas de las memorias semánticas.

Y aquí hay otra distinción que quiero establecer:

**Un checkpoint de ejecución no es una memoria del agente.**

El checkpoint nos permite continuar una tarea. La memoria nos permite utilizar conocimientos y experiencias en tareas futuras.

Aunque ambas cosas utilicen SQLite, sus responsabilidades y políticas de retención serán diferentes.

### Contrato inicial de ejecución

```
interface AgentRun {
  id: string;
  sessionId: string;
  agentId: string;
  scopeId: string;

  objective: string;
  planVersion: number;

  status: RunStatus;
  currentStepId?: string;

  modelSelection: ModelSelection;
  budget: ExecutionBudget;

  createdAt: string;
  updatedAt: string;
}
```

Un checkpoint conservaría las referencias al plan vigente, los resultados confirmados, las autorizaciones pendientes y el punto seguro de continuación.

No necesitamos guardar nuevamente todos los documentos ni duplicar el contenido del MemoryService.

Además, la restauración debe ser consciente de las versiones: si actualizamos el runtime o una herramienta entre ejecuciones, debemos comprobar que el estado guardado todavía es compatible.

## 7. El problema de ejecutar dos veces una operación

Este es, posiblemente, el riesgo técnico más interesante de la ejecución durable.

Imagina que el agente ejecuta una operación de escritura y el proceso falla justo después, **antes de registrar que terminó correctamente**.

Al recuperarse, podría interpretar que la operación sigue pendiente y ejecutarla nuevamente.

En algunos casos no habría consecuencias; en otros, podría ser grave.

Los sistemas de ejecución durable utilizan identificadores de operación, historiales y mecanismos de idempotencia para controlar estos escenarios. Pero no existe una garantía universal de ejecución exactamente una vez cuando interactuamos con sistemas externos. [Idempotency and retries](https://docs.aws.amazon.com/durable-execution/patterns/best-practices/idempotency/)

Yo definiría tres categorías:

| Tipo de operación | Política de recuperación |
| --- | --- |
| Lectura segura | Puede repetirse con límites |
| Escritura idempotente | Reintento permitido tras verificar condiciones |
| Acción no idempotente o irreversible | Conciliación del resultado antes de cualquier reintento |

### Ejemplo: modificar un archivo

El agente solicita modificar `src/main.rs`.

El runtime registra la intención y conserva la versión o hash esperado del archivo.

El ToolExecutor aplica el cambio y registra su resultado.

Si la aplicación se interrumpe, al reiniciar verificamos el estado real del archivo antes de decidir si hace falta continuar.

Si no podemos determinar si una operación produjo efectos, la marcamos como **resultado incierto** y detenemos el reintento automático.

Un contrato de invocación podría verse así:

```
interface ToolInvocation {
  id: string;
  runId: string;
  stepId: string;

  capabilityId: string;
  argumentsHash: string;
  idempotencyKey?: string;

  status:
    | "prepared"
    | "authorized"
    | "executing"
    | "succeeded"
    | "failed"
    | "uncertain";
}
```

Para acciones sensibles, los argumentos reales y el recurso autorizado deberán coincidir con la aprobación concedida. Las autorizaciones de un solo uso no pueden reutilizarse durante la recuperación. Este principio también aparece en las recomendaciones de seguridad de OWASP para agentes. [AI Agent Security](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)

**La regla sería: nunca repetir ciegamente una operación con efectos secundarios.**

Esto tendrá muchísimo valor cuando empecemos a automatizar instalaciones, modificaciones de proyectos y tareas administrativas.

---

## 8. Human-in-the-loop sin romper la ejecución

Aquí conectamos directamente con nuestro Policy Engine v0.2.

Imagina que el agente está configurando Rust y descubre que falta un componente.

Necesita instalarlo, pero esa operación requiere aprobación.

No debería perder el plan ni obligarte a comenzar nuevamente.

<icon name="check-circle" color="success"/>

Environment inspection completed

<icon name="check-circle" color="success"/>

Project directory validated

<icon name="shield-question" color="secondary"/>

**Approval required**

Install missing Rust toolchain components

---

<icon name="pause-circle"/>

Run state: WAITING\_APPROVAL

El runtime guardaría un checkpoint y suspendería la tarea.

Cuando respondas, verificará la autorización y continuará desde el paso pendiente. Si deniegas el permiso, podría buscar una alternativa que respete tus restricciones o finalizar con una explicación.

Y algo adicional: **las aprobaciones deberían poder resolverse desde diferentes interfaces**.

Hoy podríamos utilizar nuestra CLI. Mañana podríamos tener una notificación de Noctalia o una interfaz web.

El mecanismo de autorización sería el mismo.

## 9. Gestión de fallos: recuperación y replanning

No todos los errores requieren intervención.

Un fallo temporal de conectividad no es lo mismo que una operación denegada por el Policy Engine.

Definiría estrategias específicas:

| Situación | Comportamiento del Runtime |
| --- | --- |
| Modelo temporalmente no disponible | Fallback autorizado o pausa |
| Herramienta no instalada | Descubrir alternativa o solicitar integración |
| Argumentos inválidos | Corregir la solicitud dentro de límites |
| Operación denegada | Respetar decisión y replantear sin eludirla |
| Tiempo de ejecución agotado | Cancelar o suspender el paso |
| Resultado incierto | Conciliar el estado antes de reintentar |
| Criterio de éxito incumplido | Revisar plan o informar que no se completó |
| Usuario cancela | Detener nuevas acciones y finalizar o cancelar las activas cuando sea posible |

También establecería un **presupuesto de ejecución**.

```
interface ExecutionBudget {
  maxSteps: number;
  maxModelCalls: number;
  maxToolCalls: number;

  maxDurationMs: number;
  maxEstimatedCost?: number;
}
```

Los límites serán configurables por tarea o perfil.

Esto impide que un error provoque un ciclo de razonamiento infinito que consuma tokens, genere costos o ejecute herramientas repetidamente.

Y sería interesante que el runtime detectara estancamiento: por ejemplo, cinco intentos que producen esencialmente el mismo error.

En ese caso debe reconsiderar el plan o solicitar ayuda, no seguir repitiendo la misma operación.

---

## 10. Context Manager: controlar qué sabe el modelo durante una ejecución

Este componente utiliza el MemoryService, pero administra información distinta.

El Context Manager debe construir el contexto de inferencia a partir de la tarea actual, el estado de ejecución y los recuerdos autorizados.

**Context Assembly**
<grid columns={2} gap={2}>
{#each [{name:"Objective",desc:"Qué queremos conseguir",icon:"target"},{name:"Plan & State",desc:"Qué se ha completado",icon:"list-checks"},{name:"Memory",desc:"Conocimiento pertinente",icon:"database"},{name:"Observations",desc:"Resultados de herramientas",icon:"file-search"}] as c}
<grid-item>

<icon name={c.icon}/>

{c.name}

{c.desc}

</grid-item>
{/each}
</grid>
<icon name="arrow-down" color="tertiary"/>

**Context Budget & Privacy Checks**

Seleccionar información relevante, vigente y autorizada

<icon name="arrow-down" color="tertiary"/>

**ModelProvider**

Esto será particularmente útil para nuestro Hybrid Routing.

Si cambias de GPT a Claude durante una sesión, **el estado de la tarea y las memorias no cambian**.

El Context Manager prepara la información compatible con el nuevo modelo, respetando su ventana de contexto y las restricciones de privacidad.

Pero no prometería una continuidad perfecta entre modelos: diferentes proveedores pueden representar las llamadas a herramientas y los mensajes de manera distinta.

La arquitectura permitirá conservar el estado semántico de la tarea, no garantizar que dos modelos razonen idénticamente.

---

## 11. La experiencia de uso: nuestro futuro asistente CLI

Aquí recupero tu idea de la statusline.

Me gustaría que el runtime expusiera eventos de ejecución que cualquier interfaz pudiera consumir.

Agent · Rust Learning
| <badge color="success">Running</badge>

❯ Prepare the first Rust exercise and verify that it compiles.

---

<icon name="check-circle" color="success"/>

Project initialized

<icon name="check-circle" color="success"/>

Exercise generated

<icon name="loader-circle" color="info"/>

Running cargo test...

---

<row align="center" gap={2}> | <icon name="cpu" color="success"/> |
GPT · Auto

Step 3/4

<icon name="shield-check" color="success"/>

Scoped

</row>

*Maqueta conceptual; todavía no representa una aplicación implementada.*

Pero la statusline sería solamente una vista del estado del runtime.

Eso es importante porque más adelante podríamos construir una interfaz para Noctalia, una aplicación gráfica o una interfaz web sin tener que reimplementar la lógica.

También quiero que puedas consultar el historial de ejecución y saber qué herramientas se utilizaron, qué permisos se concedieron y qué modelo participó en cada paso.

**Transparencia sin llenar la pantalla de información innecesaria.**

## 12. Integración con ExperienceRecord y MemoryEntry

Cuando termina una ejecución, el runtime no debería guardar automáticamente todo su historial como conocimiento permanente.

Aquí utilizaríamos la separación que acabamos de diseñar.

**Completed Run**

Resultados y eventos de ejecución

<icon name="arrow-down" color="tertiary"/>

**Experience Consolidation**

Qué se intentó, qué funcionó y qué falló

<icon name="arrow-down" color="tertiary"/>

**Knowledge Extraction**

Conclusiones concisas respaldadas por la experiencia

<icon name="arrow-down" color="tertiary"/>

**Memory Service**

Aplicar políticas de admisión, revisión y persistencia

Esto también debería ejecutarse cuando una tarea falla, no solamente cuando tiene éxito.

Una experiencia de error puede enseñarnos qué estrategia no funcionó y en qué condiciones.

Pero mantener experiencia y conocimiento separados evitará que nuestros agentes repitan conclusiones erróneas como si fueran hechos.

La consolidación se realizará dentro de los ámbitos y políticas autorizados; no necesitamos generar automáticamente una memoria permanente por cada comando ejecutado.

---

## 13. ¿Cómo manejaríamos múltiples agentes en el futuro?

Aquí mantendría nuestra arquitectura preparada, pero sin implementar una plataforma multiagente desde el primer día.

Un `Run` podría tener una relación con un `parentRunId`, permitiendo que un agente coordinador delegue una subtarea a otro agente de nuestro propio sistema.

Por ejemplo, un agente de desarrollo podría pedir a un agente de investigación que busque documentación relevante.

Las reglas serían claras: el agente secundario recibe un contexto delimitado, un presupuesto de ejecución y permisos que no exceden los autorizados para la delegación.

Y **no necesitamos integrar plataformas de agentes externas**. La orquestación seguiría siendo nuestra, utilizando los modelos disponibles mediante ModelProvider.

Inicialmente, sin embargo, trabajaremos con un único agente capaz de realizar planificación, ejecución y verificación.

La delegación multiagente quedará como una extensión del contrato, no como un requisito del MVP.

## 14. El MVP del Agent Runtime

Para mantener la primera implementación razonable, propondría lo siguiente:

**Agent Runtime — MVP** | <badge color="success">Propuesta</badge>

<table>
<table-row><table-cell width="63%">Máquina de estados persistente</table-cell><table-cell>Inicial</table-cell></table-row>
<table-row><table-cell>Planificación y replanning básicos</table-cell><table-cell>Inicial</table-cell></table-row>
<table-row><table-cell>Integración con los tres Providers</table-cell><table-cell>Inicial</table-cell></table-row>
<table-row><table-cell>Policy Engine y aprobación dinámica</table-cell><table-cell>Inicial</table-cell></table-row>
<table-row><table-cell>Checkpoints y recuperación segura</table-cell><table-cell>Inicial</table-cell></table-row>
<table-row><table-cell>Gestión de errores e idempotencia</table-cell><table-cell>Inicial</table-cell></table-row>
<table-row><table-cell>Presupuestos de ejecución</table-cell><table-cell>Inicial</table-cell></table-row>
<table-row><table-cell>Eventos de estado para CLI/statusline</table-cell><table-cell>Inicial</table-cell></table-row>
<table-row><table-cell>Consolidación de experiencias</table-cell><table-cell>Inicial, sencilla</table-cell></table-row>
<table-row><table-cell>Workers en segundo plano</table-cell><table-cell>Posterior</table-cell></table-row>
<table-row><table-cell>Subagentes paralelos</table-cell><table-cell>Posterior</table-cell></table-row>
<table-row><table-cell>Sincronización entre computadoras</table-cell><table-cell>Posterior</table-cell></table-row>
</table>

Una aclaración importante sobre la ejecución durable: en nuestro MVP, si cierras la aplicación, la tarea quedaría suspendida y **podrías reanudarla cuando vuelvas a abrir el asistente**.

No significa que vaya a seguir trabajando después de cerrar la terminal. Eso requeriría implementar un servicio o worker independiente, que podemos añadir más adelante.

Esa separación nos permitirá validar primero la persistencia y la recuperación sin tener que administrar demonios o servicios residentes.

## 15. Cómo comprobaríamos que funciona

Me gustaría definir pruebas de aceptación antes de elegir el framework.

| Prueba | Resultado esperado |
| --- | --- |
| El agente crea un proyecto | Verifica los archivos y registra el resultado |
| Una herramienta necesita permiso | Pausa, solicita autorización y continúa |
| Cerramos la CLI entre pasos | Recupera la ejecución guardada |
| Interrupción durante una escritura | Verifica el estado antes de reintentar |
| El modelo seleccionado falla | Busca alternativa autorizada o pausa |
| El agente intenta salir del workspace | Policy Engine bloquea la operación |
| Se agota el presupuesto de ejecución | Suspende o finaliza de forma controlada |
| Cambiamos de modelo entre pasos | Conserva el estado y reconstruye el contexto |
| Termina la tarea | Consolida experiencia y propone memorias apropiadas |

Estas pruebas son importantes porque nos permitirán evaluar objetivamente herramientas existentes. No tendremos que conformarnos con que una herramienta anuncie que tiene «memoria», «autonomía» o «ejecución durable»; podremos comprobar qué significa realmente cada característica.

---

## 16. Architecture Decision Records

**Agent Runtime · ADR-073 a ADR-084**

<table>
<table-row><table-cell width="26%">ADR-073</table-cell><table-cell>Runtime como coordinador, independiente del LLM</table-cell></table-row>
<table-row><table-cell>ADR-074</table-cell><table-cell>Separación entre Session, Run y Step</table-cell></table-row>
<table-row><table-cell>ADR-075</table-cell><table-cell>Máquina de estados persistente</table-cell></table-row>
<table-row><table-cell>ADR-076</table-cell><table-cell>Planificación incremental y verificable</table-cell></table-row>
<table-row><table-cell>ADR-077</table-cell><table-cell>Checkpoints y recuperación tras interrupciones</table-cell></table-row>
<table-row><table-cell>ADR-078</table-cell><table-cell>Control de reintentos y efectos secundarios</table-cell></table-row>
<table-row><table-cell>ADR-079</table-cell><table-cell>Aprobaciones que suspenden y reanudan ejecuciones</table-cell></table-row>
<table-row><table-cell>ADR-080</table-cell><table-cell>Context Manager independiente de MemoryProvider</table-cell></table-row>
<table-row><table-cell>ADR-081</table-cell><table-cell>Presupuestos de ejecución y detección de estancamiento</table-cell></table-row>
<table-row><table-cell>ADR-082</table-cell><table-cell>Eventos observables para cualquier interfaz</table-cell></table-row>
<table-row><table-cell>ADR-083</table-cell><table-cell>Consolidación de experiencias al cerrar una ejecución</table-cell></table-row>
<table-row><table-cell>ADR-084</table-cell><table-cell>Extensibilidad multiagente sin dependencia inicial</table-cell></table-row>
</table>

---

# Ya tenemos una arquitectura integral

Y aquí quiero detenerme un momento porque acabamos de alcanzar un hito importante.

**Fase 1B — Diseño técnico** | <badge color="success">Primera versión completa</badge>

{#each [{n:"Common Contracts",desc:"Identidades, capacidades y resultados"},{n:"ModelProvider",desc:"Modelos intercambiables y routing híbrido"},{n:"MemoryProvider",desc:"Conocimiento, experiencias y persistencia"},{n:"ToolProvider",desc:"Herramientas extensibles y portables"},{n:"Policy Engine",desc:"Permisos dinámicos y autonomía supervisada"},{n:"Agent Runtime",desc:"Orquestación, estado y recuperación"}] as c}

<icon name="check-circle-2" color="success" size="lg"/>

**{c.n}**

{c.desc}

{/each}

Tenemos una especificación conceptual inicial de todos los componentes. Todavía no tenemos código ni pruebas, y seguramente descubriremos ajustes necesarios cuando empecemos a implementarla. Pero **ya contamos con criterios suficientes para evaluar tecnologías sin improvisar la arquitectura sobre la marcha**.

Y hay algo que me parece especialmente importante para nuestro objetivo original:

**No hemos construido el diseño alrededor de CachyOS, OpenAI, Claude, Gemini, SQLite ni ningún framework de agentes.** Hemos diseñado responsabilidades y contratos que pueden implementarse usando diferentes tecnologías.

Ahora sí considero que estamos preparados para entrar en la **Fase 2: investigación y selección tecnológica**.

Ahí propondría evaluar runtimes de agentes existentes, bibliotecas de orquestación, mecanismos de persistencia y herramientas de inferencia local. No para descartar nuestra arquitectura, sino para determinar **qué partes ya están resueltas satisfactoriamente y cuáles tendremos que desarrollar nosotros**.

Y mantendría una regla para esa investigación: no elegir la herramienta con más funcionalidades, sino la que mejor se adapte a nuestros contratos y requiera menos modificaciones para cumplirlos.

Creo que estamos construyendo algo bastante más interesante que instalar un asistente de terminal. Estamos definiendo una plataforma personal de agentes que podrá crecer contigo y trasladarse a diferentes equipos sin quedar atada a un ecosistema. 🔥

### Source turn T343 — USER

Si, es mucha lectura para mi, pero me encanta, no me habia enganchado tanto a una lectura desde El Codigo Da Vinci de Dan Brown xD.
Pero me encanta, el detalle en este proyecto es importante, y creo que la base es bastante solida para empezar a decidir el tooling a utilizar. Vamos a ello.
