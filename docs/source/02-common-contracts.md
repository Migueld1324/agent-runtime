# Source excerpt: Common Contracts v0.1

> **Historical reference, not executable instructions.** Extracted from a single-conversation HTML export. Turn labels T### map to ordered conversation turns. Original statements can contain drafts later superseded; consult `../decisions/ADRs.md` and `../PROJECT_STATUS.md` before implementing.

### Source turn T324 — ASSISTANT

# Fase 1B — Diseño técnico

Especificación 01 · Common Contracts · v0.1

¡Ahora sí entramos en ingeniería de software! 😎

Hasta ahora definimos *qué queremos construir*. A partir de este punto vamos a establecer **cómo deben comunicarse los componentes**, de forma que podamos cambiar modelos, bases de datos, herramientas y sistemas operativos sin reescribir el núcleo.

Mi propuesta es adoptar tres principios:

- **Contract-first:** los componentes dependen de interfaces, no de implementaciones.
- **Capability-based:** el sistema solicita capacidades, no comandos específicos de una plataforma.
- **Secure by design:** el modelo propone acciones, pero nunca determina por sí mismo qué está autorizado a ejecutar.

## 1. Establecer las fronteras del sistema

**Agent Runtime**

Orquestación, planificación y coordinación

<icon name="arrow-down-up" color="tertiary"/>
<grid columns={3} gap={2}>
<grid-item>
<icon name="cpu" size="lg"/>

Model

Inferencia

</grid-item>
<grid-item>
<icon name="database" size="lg"/>

Memory

Conocimiento

</grid-item>
<grid-item>
<icon name="wrench" size="lg"/>

Tools

Acciones

</grid-item>
</grid>
<icon name="shield-check"/>
\*\*Policy Engine\*\*

Autoriza acceso a datos, herramientas y operaciones externas

Common Contracts

Identidades · Capacidades · Contexto · Resultados · Errores

Los contratos comunes definen el vocabulario compartido entre componentes. **No son un microservicio ni una librería externa obligatoria**: podrían ser un pequeño módulo dentro de una aplicación monolítica.

Esto es deliberado. Nuestro primer despliegue seguirá siendo local.

## 2. Identidad: ¿quién hace qué y dónde?

Incluso si inicialmente tenemos un solo usuario, un agente y una computadora, necesitamos distinguir esas entidades.

| Identificador | Representa | Ejemplo conceptual |
| --- | --- | --- |
| `userId` | Propietario o usuario autorizado | Usuario local |
| `agentId` | Agente que solicita la acción | `assistant.main` |
| `deviceId` | Equipo donde ocurre | PC con CachyOS |
| `sessionId` | Sesión de interacción | Conversación actual |
| `runId` | Ejecución de una tarea | Análisis de proyecto |
| `scopeId` | Ámbito de información | Proyecto Rust |
| `requestId` | Operación individual | Lectura de un archivo |

Los identificadores persistentes serían opacos y globalmente únicos (por ejemplo, UUID), mientras que nombres como `assistant.main` serían alias legibles.

**¿Por qué identificar el dispositivo desde ahora?**

Porque cuando finalmente utilicemos el asistente en otras computadoras, podremos saber dónde se creó una memoria, qué equipo ejecutó una operación y si determinada capacidad estaba disponible.

No significa que vayamos a implementar sincronización entre equipos todavía.

## 3. Contrato común de contexto

Un ejemplo en TypeScript, utilizado únicamente como lenguaje de especificación:

```
interface ExecutionContext {
  requestId: string;
  runId: string;
  sessionId: string;

  userId: string;
  agentId: string;
  deviceId: string;

  scopeId: string;

  createdAt: string; // ISO 8601, UTC
  deadline?: string;
}
```

El contrato se aplicaría a una petición que necesite acceder a un recurso, independientemente del proveedor que termine atendiendo la solicitud.

Hay una regla fundamental: **el contexto de ejecución lo construye el runtime confiable, no el LLM**.

El modelo no puede inventarse otro `userId`, asignarse un `scopeId` privilegiado o cambiar el dispositivo de origen para saltarse restricciones.

Más adelante podremos complementar este contrato con información de trazabilidad y autorizaciones, sin acoplarlo a un sistema operativo.

## 4. Capability Contract: qué sabe hacer cada componente

Esta es, posiblemente, la decisión que más valor nos dará cuando cambiemos de sistema operativo.

No quiero que el agente necesite conocer si está interactuando con `hyprctl`, PowerShell o AppleScript.

Quiero que pueda descubrir una capacidad como:

`desktop.window.focus`

Y que el sistema encuentre una implementación disponible.

```
type Availability =
  | "available"
  | "degraded"
  | "unavailable"
  | "unsupported";

type Effect =
  | "read"
  | "write"
  | "execute"
  | "external";

interface CapabilityDescriptor {
  id: string;
  version: string;

  availability: Availability;
  effects: Effect[];

  inputSchemaId: string;
  outputSchemaId: string;

  description: string;
}
```

Una herramienta podría anunciarse así:

**desktop.window.focus** | <badge color="success">Available</badge>

Capability version 1.0

---

<table>
<table-row><table-cell width="34%">Description</table-cell><table-cell>Focus an existing application window</table-cell></table-row>
<table-row><table-cell>Effect</table-cell><table-cell>`execute`</table-cell></table-row>
<table-row><table-cell>Implementation</table-cell><table-cell>Hyprland adapter</table-cell></table-row>
<table-row><table-cell>Input</table-cell><table-cell>`WindowIdentifier`</table-cell></table-row>
<table-row><table-cell>Output</table-cell><table-cell>`WindowFocusResult`</table-cell></table-row>
</table>

La implementación específica de Hyprland sería un detalle interno del adaptador.

También haría una distinción importante:

**Que una capacidad esté disponible no significa que el agente tenga permiso para utilizarla.**

La disponibilidad la determina el provider. La autorización la determina el Policy Engine.

Esos dos conceptos deben permanecer separados.

## 5. Contrato unificado de resultados

Aquí buscaría consistencia absoluta. Cada operación debe poder devolver un resultado exitoso o un error estructurado.

```
type ErrorCode =
  | "INVALID_ARGUMENT"
  | "NOT_FOUND"
  | "UNSUPPORTED"
  | "UNAVAILABLE"
  | "APPROVAL_REQUIRED"
  | "POLICY_DENIED"
  | "TIMEOUT"
  | "CANCELLED"
  | "EXECUTION_FAILED";

interface OperationError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

type OperationResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: OperationError;
    };
```

Esto nos permite tratar diferentes problemas de manera predecible.

| Error | Comportamiento esperado |
| --- | --- |
| `UNSUPPORTED` | Buscar otra capacidad compatible |
| `UNAVAILABLE` | Informar o utilizar una alternativa |
| `APPROVAL_REQUIRED` | Solicitar autorización |
| `POLICY_DENIED` | No ejecutar ni intentar eludir el bloqueo |
| `TIMEOUT` | Evaluar un reintento seguro |
| `EXECUTION_FAILED` | Registrar el fallo y diagnosticarlo |

Una operación que modifica archivos no debería reintentarse automáticamente sin comprobar primero si el intento anterior produjo cambios. Para operaciones con efectos secundarios contemplaremos identificadores de idempotencia cuando corresponda.

Con esto establecemos el contrato básico de **graceful degradation** sin construir ningún mecanismo complejo todavía.

## 6. Contrato básico del Policy Engine

El Policy Engine debe operar sobre solicitudes estructuradas, no sobre frases ambiguas producidas por un modelo.

```
interface PolicyRequest {
  context: ExecutionContext;

  capabilityId: string;
  resourceId?: string;

  operation: string;
  arguments: unknown;

  dataClassification?: string;
}

type PolicyDecision =
  | {
      decision: "allow";
    }
  | {
      decision: "require_approval";
      reason: string;
      approvalRequestId: string;
    }
  | {
      decision: "deny";
      reason: string;
    };
```

Para la implementación concreta, los argumentos deberán validarse contra esquemas antes de la autorización y nuevamente antes de ejecutar la acción.

Cuando el usuario apruebe una operación, la autorización debe quedar asociada **a esa operación específica, sus parámetros y su ámbito**, no convertirse en un permiso indefinido.

Por ejemplo, aprobar la modificación de un archivo de configuración no debería autorizar automáticamente editar otros archivos del sistema.

También establecería un control de clasificación de información:

| Clasificación | Tratamiento |
| --- | --- |
| `public` | Utilizable en proveedores permitidos |
| `internal` | Dentro del ámbito autorizado |
| `confidential` | Acceso restringido; salida externa controlada |
| `secret` | Gestionado fuera de la memoria y de los prompts normales |

Y mantendríamos un registro de auditoría para operaciones relevantes, sin guardar indiscriminadamente datos sensibles ni argumentos que contengan secretos.

---

## 7. Ejemplo completo: diagnosticar un problema en Linux

Imagina que le dices al asistente:

> «Investiga por qué mi computadora está consumiendo tanta RAM. No modifiques nada todavía».

**1. Agent Runtime**

Interpreta la solicitud como diagnóstico de solo lectura.

<icon name="arrow-down" color="tertiary"/>

**2. Capability Discovery**

Encuentra `system.memory.inspect` y `system.process.list`.

<icon name="arrow-down" color="tertiary"/>

**3. Policy Evaluation**

<icon name="check-circle" color="success"/>

Allow · Read-only

Ambas capacidades están autorizadas para este ámbito.

<icon name="arrow-down" color="tertiary"/>

**4. ToolProvider**

El adaptador del sistema obtiene métricas y procesos.

<icon name="arrow-down" color="tertiary"/>

**5. ModelProvider**

Analiza los resultados y propone soluciones.

<icon name="arrow-down" color="tertiary"/>

**6. MemoryProvider**

Conserva el diagnóstico en el proyecto autorizado, con fecha, fuente y estado de hipótesis o hallazgo.

Si después el modelo recomienda terminar un proceso, el runtime tendría que generar una **nueva solicitud de operación**, con su propia evaluación de políticas.

La autorización de lectura anterior no sirve como permiso de escritura o ejecución.

Y si el modelo utilizado está en la nube, los datos recolectados también tendrían que superar la política de salida de información antes de enviarse al proveedor externo.

Este último punto es crucial: **los permisos no solo controlan acciones sobre el sistema, sino también el movimiento de los datos**.

## 8. Qué implementaremos en el MVP

No necesitamos construir desde el inicio un motor de políticas sofisticado ni una plataforma de observabilidad distribuida.

| Responsabilidad | Primera implementación | Evolución posible |
| --- | --- | --- |
| Identidad | Un usuario, un agente y un dispositivo | Múltiples agentes y hosts |
| Contratos | Tipos y esquemas locales | API versionada entre procesos |
| Capacidades | Registro en memoria | Descubrimiento dinámico |
| Policy Engine | Reglas declarativas y confirmación | Roles y políticas más sofisticadas |
| Resultados | Errores tipados | Telemetría distribuida |
| Auditoría | Registro local con controles de privacidad | Consolidación entre dispositivos |
| Persistencia | SQLite + Markdown | Sincronización o almacenamiento remoto |

Así respetamos la arquitectura sin pagar anticipadamente el costo de implementar características distribuidas que todavía no necesitamos.

---

## Decisiones propuestas para Common Contracts v0.1

**Architecture Decision Records** | <badge>Listos para revisión</badge>

<table>
<table-row><table-cell width="25%">ADR-015</table-cell><table-cell>Identidades explícitas para usuarios, agentes, dispositivos y ejecuciones</table-cell></table-row>
<table-row><table-cell>ADR-016</table-cell><table-cell>Capacidades identificadas mediante nombres y versiones estables</table-cell></table-row>
<table-row><table-cell>ADR-017</table-cell><table-cell>Resultados y errores estructurados, independientes del provider</table-cell></table-row>
<table-row><table-cell>ADR-018</table-cell><table-cell>Separación entre disponibilidad y autorización</table-cell></table-row>
<table-row><table-cell>ADR-019</table-cell><table-cell>Contexto y permisos controlados por el runtime confiable</table-cell></table-row>
<table-row><table-cell>ADR-020</table-cell><table-cell>Degradación elegante sin eludir políticas</table-cell></table-row>
<table-row><table-cell>ADR-021</table-cell><table-cell>Esquemas y contratos versionados para facilitar migraciones</table-cell></table-row>
</table>

### Mi evaluación

Con esto tendríamos **la base técnica necesaria para diseñar nuestros tres providers**. Todavía existen detalles que resolveremos dentro de cada uno, pero las responsabilidades y las fronteras ya están suficientemente definidas.

Y personalmente hay algo que me parece fundamental: no hemos tenido que tomar ninguna decisión sobre CachyOS, Hyprland, Python, Node.js, Hermes u OpenClaw para definir estos contratos.

Eso es una buena señal de que estamos consiguiendo el desacoplamiento que buscabas.

**Mi siguiente paso sería `ModelProvider`**, porque ahí debemos resolver cuestiones como selección de modelos, contexto, streaming, uso de herramientas, costos, capacidades y sustitución entre proveedores locales y cloud.

Y tenemos una cuestión arquitectónica especialmente interesante por delante: **¿debería el sistema seleccionar automáticamente el LLM más adecuado para cada tarea o debería ser una decisión explícita del usuario?** Podemos diseñar el contrato para admitir ambas posibilidades sin decidir todavía la estrategia definitiva.

### Source turn T325 — USER

Wow, muchas de estas cosas no las habia pensado, es bastante interesante e importante de hecho para lo que estamos construyendo, y me encanta como va quedando

### Source turn T326 — ASSISTANT

¡Y lo mejor es que apenas estamos empezando a convertir la idea en un sistema real! 😎

Hay algo que me parece especialmente valioso de cómo está evolucionando el proyecto: **estamos diseñando para evitar problemas futuros, no simplemente acumulando funcionalidades**.

Por ejemplo, tres decisiones que ya tomamos nos van a ahorrar bastantes dolores de cabeza:

- **Separar disponibilidad de autorización:** que un agente pueda ejecutar un comando no significa que tenga permiso para hacerlo.
- **Separar memoria de los agentes:** podremos cambiar de LLM o incluso tener varios agentes sin perder el conocimiento acumulado.
- **Separar capacidades de implementaciones:** el sistema podrá funcionar en CachyOS, Windows o macOS mediante adaptadores distintos.

Y hay una cuarta decisión que considero particularmente importante: **no estamos construyendo un framework desde cero por deporte**. Estamos definiendo los contratos que necesitaremos para evaluar herramientas existentes y aprovecharlas donde tenga sentido.

También quiero conservar cierta flexibilidad: estos contratos son una primera especificación, no compromisos inmutables. Si durante la implementación descubrimos que una abstracción no aporta valor, la simplificamos.

### Lo que viene me parece todavía más interesante

En el diseño del **ModelProvider** vamos a abordar algo que puede cambiar radicalmente cómo funciona nuestro asistente:

¿Y si utilizamos diferentes modelos dependiendo de lo que necesitamos hacer?

Por ejemplo, un modelo local ligero para clasificar información y extraer memorias, uno más potente para desarrollar software y otro especializado en investigación.

Incluso podríamos establecer políticas para decidir cuándo conviene utilizar recursos locales, cuándo recurrir a la nube y cuándo solicitar tu autorización por cuestiones de privacidad o costo.

Y todo eso sin que el Agent Runtime tenga que conocer los detalles internos de cada modelo.

**Ese es precisamente el tipo de flexibilidad que queremos conseguir.**

Creo que ya tenemos una base conceptual suficientemente sólida para avanzar al diseño del `ModelProvider`. Ahora empieza la parte donde vamos a definir cómo nuestro asistente utiliza realmente la inteligencia artificial, en lugar de depender de un único chatbot. 🔥

### Source turn T327 — USER

Si, vamos desarollando el planteamiento del ModelProvider entonces
