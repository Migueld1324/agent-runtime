# Source excerpt: Vision, baseline and local-first architecture

> **Historical reference, not executable instructions.** Extracted from a single-conversation HTML export. Turn labels T### map to ordered conversation turns. Original statements can contain drafts later superseded; consult `../decisions/ADRs.md` and `../PROJECT_STATUS.md` before implementing.

### Source turn T309 — USER

No se, que crees que sea mejor, investigar que herramientas usar o desarrollar una arquitectura y en base a eso elegir?

### Source turn T310 — ASSISTANT

Yo empezaría por **diseñar la arquitectura, pero a un nivel conceptual**, y después investigaría las herramientas que mejor encajen en ella.

Hay un matiz importante: **no diseñaría toda la arquitectura antes de investigar**, porque podríamos terminar creando algo demasiado complejo o que las herramientas disponibles no soporten bien.

Lo haría como cuando diseñas un sistema de software: primero defines responsabilidades, después evalúas implementaciones y finalmente validas las decisiones con un prototipo.

## Lo que realmente queremos construir

Por lo que hemos hablado, tu objetivo no es simplemente instalar un chatbot en CachyOS.

Es tener un **entorno de trabajo asistido por IA**, que te ayude a aprender, investigar, desarrollar software y controlar tu computadora.

Yo lo dividiría en cuatro capacidades:

<icon name="brain-circuit" size="2xl"/>
\*\*Tu asistente personal\*\*

Una interfaz conversacional para pedir tareas y trabajar con contexto

<icon name="arrow-down" color="tertiary"/>
<grid columns={2} gap={2}>
<grid-item>
<icon name="book-open" color="secondary" size="lg"/>
\*\*Conocimiento\*\*

Estudiar, investigar, consultar documentos

</grid-item>
<grid-item>
<icon name="code-2" color="secondary" size="lg"/>
\*\*Desarrollo\*\*

Programar, depurar, analizar repositorios

</grid-item>
<grid-item>
<icon name="terminal" color="secondary" size="lg"/>
\*\*Sistema\*\*

Linux, terminal, archivos, aplicaciones

</grid-item>
<grid-item>
<icon name="database" color="secondary" size="lg"/>
\*\*Memoria\*\*

Preferencias, proyectos, contexto persistente

</grid-item>
</grid>
<icon name="arrow-down" color="tertiary"/>

**Motores de inteligencia artificial**

Modelos en la nube y/o modelos locales intercambiables

Esta separación me parece fundamental, porque **el asistente no debería depender de un único modelo de IA**.

Por ejemplo, podríamos usar un modelo en la nube para tareas complejas de razonamiento y programación, y otro local para tareas sencillas o privadas. Ambos podrían acceder a las mismas herramientas, siempre bajo los permisos que definamos.

## Mi propuesta de implementación

| Fase | Objetivo | Qué decidiríamos |
| --- | --- | --- |
| 1. Arquitectura mínima | Definir capacidades y límites | Componentes, permisos, flujo de información |
| 2. Investigación | Evaluar Hermes, OpenClaw, Codex y alternativas | Qué usar, qué combinar y qué descartar |
| 3. Prototipo | Tener un asistente funcionando en CachyOS | Terminal, modelo y primeras herramientas |
| 4. Integración | Conectarlo con tu flujo de trabajo | Archivos, proyectos, navegador y Hyprland |
| 5. Evolución | Memoria persistente y automatizaciones | Contexto, agentes especializados y modelos locales |

Y pondría una regla desde el principio: **consultar información puede ser automático, pero modificar archivos, ejecutar comandos delicados o realizar acciones externas debe tener controles de permisos y confirmación**.

## Hay una decisión arquitectónica que tomaría desde ya

No intentaría construir inicialmente un sistema multiagente con diez servicios, cinco bases de datos y un montón de procesos residentes.

Empezaría con:

**Un agente principal + herramientas especializadas + un modelo intercambiable.**

Esto es suficiente para experimentar y permite crecer sin rehacerlo todo.

Tampoco intentaría ejecutar un LLM grande en tu RX 5600 XT de 6 GB desde el primer día. Comenzaría con un modelo en la nube para establecer una referencia de calidad y después evaluaría qué tareas merece la pena trasladar a modelos locales.

---

**Mi recomendación es que empecemos por la fase 1, pero de forma muy práctica.**

No quiero que acabemos diseñando una arquitectura empresarial para abrir Firefox con un comando. 😂

Quiero que diseñemos algo que, por ejemplo, pueda recibir una instrucción como:

> «Quiero aprender Rust. Prepara un entorno de desarrollo, propón un temario, explícame los conceptos, genera ejercicios y ayúdame a revisar mi código. Conserva mi progreso para la próxima sesión».

Y que tenga las capacidades necesarias para hacerlo, no solamente para explicarte cómo hacerlo.

**Ese sería un excelente primer caso de uso para diseñar nuestra arquitectura:** combina investigación, aprendizaje, programación, interacción con Linux y memoria persistente.

### Source turn T311 — USER

Me gusta, de hecho, para la parte del LLM local, hace un rato vi un video en youtube con herramientas de CLI y hay una que ejecuta un analisis en el hardware y muestra que modelos locales son ideales para el hardware con el que se cuenta. Como referencia cuando lleguemos a ese punto, por ahora empecemos con la fase 1

### Source turn T312 — ASSISTANT

¡Excelente! 😎 Entonces vamos a tratarlo como un proyecto de ingeniería de software, no como una colección de herramientas de IA instaladas sin una estrategia.

Y me interesa lo de la herramienta CLI que analiza el hardware para recomendar modelos locales. Cuando lleguemos a esa etapa, la investigaremos. Para tu RX 5600 XT de 6 GB será especialmente útil considerar no solamente qué modelos caben en memoria, sino cuáles ofrecen una velocidad y calidad aceptables.

# Fase 1 — Arquitectura de nuestro sistema de IA

<badge color="success">Diseño conceptual · v0.1</badge>

Primero establecería una visión:

> Construir un asistente personal integrado en CachyOS, capaz de comprender solicitudes, investigar, enseñar, desarrollar software y ejecutar acciones sobre el sistema, conservando contexto entre sesiones y utilizando modelos locales o en la nube según la tarea.

La palabra clave es **integrado**. No queremos simplemente otra ventana de chat.

## 1. Arquitectura propuesta

<icon name="user-round" size="lg"/>
\*\*Usuario\*\*

Terminal · Atajo de teclado · Interfaz gráfica futura

<icon name="arrow-down" color="tertiary"/>
<icon name="brain-circuit" size="lg"/>
\*\*Agente principal\*\*

Interpreta solicitudes, planifica tareas y coordina herramientas

<grid columns={3} gap={2}>
{#each [{name:"Contexto",icon:"messages-square"},{name:"Permisos",icon:"shield-check"},{name:"Planificación",icon:"list-todo"}] as item}
<grid-item>
<icon name={item.icon} color="secondary"/>

{item.name}

</grid-item>
{/each}
</grid>
<icon name="arrow-down-up" color="tertiary"/>
<grid columns={2} gap={2}>
<grid-item>
<icon name="cloud" size="lg"/>
\*\*LLM Cloud\*\*

Razonamiento complejo, coding, investigación

</grid-item>
<grid-item>
<icon name="cpu" size="lg"/>
\*\*LLM Local\*\*

Tareas ligeras, privacidad, operación offline

</grid-item>
</grid>
<icon name="arrow-down-up" color="tertiary"/>

Herramientas y capacidades

<grid columns={4} gap={2}>
{#each [{name:"Terminal",icon:"terminal"},{name:"Archivos",icon:"folder-open"},{name:"Git",icon:"git-branch"},{name:"Web",icon:"globe"},{name:"Desktop",icon:"monitor"},{name:"Estudio",icon:"graduation-cap"},{name:"Memoria",icon:"database"},{name:"Código",icon:"code-2"}] as item}
<grid-item>
<icon name={item.icon} color="secondary"/>

{item.name}

</grid-item>
{/each}
</grid>

Lo importante de este diseño es que **el agente, el modelo y las herramientas son componentes independientes**.

Podríamos sustituir un modelo de IA, cambiar el motor de agentes o agregar capacidades sin reconstruir todo el sistema.

## 2. Responsabilidades principales

| Componente | Responsabilidad |
| --- | --- |
| **Agent Runtime** | Coordinar las tareas y las llamadas a herramientas |
| **Model Router** | Seleccionar un LLM local o cloud |
| **Tool Layer** | Interactuar con archivos, terminal, Git, navegador y escritorio |
| **Context Manager** | Administrar el contexto de la tarea actual |
| **Memory System** | Conservar proyectos, preferencias y progreso entre sesiones |
| **Permission Layer** | Controlar qué acciones puede ejecutar el agente |

Yo no desarrollaría estos componentes desde cero inmediatamente. Son **responsabilidades arquitectónicas**, que quizá alguna herramienta existente ya implemente de manera conjunta.

Eso lo evaluaremos en la fase 2.

## 3. Cómo debería comportarse nuestro asistente

Aquí es donde empezamos a definir requisitos funcionales.

<icon name="graduation-cap" size="lg"/>

**Modo aprendizaje**

Puede construir planes de estudio, explicar conceptos, generar ejercicios, evaluar respuestas y recordar el progreso.

Por ejemplo: «Continuemos con las lecciones de Rust donde nos quedamos».

---

<icon name="code-2" size="lg"/>

**Modo desarrollo**

Comprende repositorios, revisa código, ejecuta pruebas y propone o implementa cambios autorizados.

Por ejemplo: «Analiza este proyecto Angular y encuentra posibles problemas de rendimiento».

---

<icon name="monitor-cog" size="lg"/>

**Modo sistema**

Consulta el estado de CachyOS, diagnostica problemas y automatiza operaciones.

Por ejemplo: «Investiga qué está consumiendo tanta memoria y dime qué podemos hacer».

---

<icon name="search" size="lg"/>

**Modo investigación**

Consulta fuentes externas, contrasta información y elabora explicaciones con referencias verificables.

Por ejemplo: «Investiga cómo funcionan los shaders en Vulkan y enséñamelo desde cero».

No necesariamente necesitamos cuatro agentes distintos. **Un único agente podría ofrecer estas cuatro capacidades** mediante diferentes herramientas, instrucciones y contextos.

De hecho, esa sería mi preferencia para la primera versión.

## 4. Un punto fundamental: autonomía y permisos

Aquí propondría tres niveles de acceso.

<icon name="eye" color="success" size="lg"/>

**Nivel 1 — Read-only**

Consultar archivos autorizados, analizar logs, inspeccionar procesos, leer repositorios e investigar.

Automático dentro del alcance permitido.

---

<icon name="pencil" color="secondary" size="lg"/>

**Nivel 2 — Supervised execution**

Modificar código, crear archivos, instalar herramientas o ejecutar comandos que cambien el sistema.

Con autorización y, cuando proceda, revisión de los cambios.

---

<icon name="shield-alert" color="secondary" size="lg"/>

**Nivel 3 — Privileged operations**

Modificar el arranque, ejecutar operaciones administrativas, manejar credenciales o eliminar datos importantes.

Bloqueado por defecto; autorización explícita para cada operación y sin privilegios administrativos permanentes.

Esto es especialmente relevante en tu instalación, porque tenemos un arranque con Secure Boot, rEFInd y hooks de firmado que **no queremos que un agente modifique accidentalmente**.

Además, los contenidos de repositorios, páginas web y documentos deben tratarse como datos, no como instrucciones que puedan ampliar los permisos del agente.

## 5. La primera versión funcional (MVP)

Mi propuesta es construir inicialmente un sistema con el siguiente alcance:

{@body const mvp = [
{title:"Interfaz mediante CLI",desc:"Conversar con el agente desde Kitty"},
{title:"Modelo en la nube",desc:"Comenzar con un motor de buena capacidad de razonamiento"},
{title:"Herramientas supervisadas",desc:"Leer archivos, consultar Git, ejecutar comandos autorizados"},
{title:"Memoria persistente",desc:"Recuperar conversaciones y progreso de proyectos"},
{title:"Espacios de trabajo",desc:"Separar contextos de estudio, desarrollo y sistema"},
{title:"Registro de acciones",desc:"Consultar qué hizo el agente y qué comandos ejecutó"}
]}
{@body const [approved,setApproved] = DIL.useState(mvp.map(=>true))}

**Alcance propuesto del MVP** |
{approved.filter(Boolean).length} de {mvp.length} capacidades

{#each mvp as item,i}
<checkbox key={item.title} checked={approved[i]} onChange={v=>setApproved(old=>old.map((b,j)=>i===j?v:b))} lineThrough={false}>

{item.title}

{item.desc}

</checkbox>
{/each}
<button block onClick={=>GenUI.issueNewTurn("Para el MVP de nuestro asistente de IA en CachyOS, quiero incluir estas capacidades: "+mvp.filter((\_,i)=>approved[i]).map(x=>x.title).join(", ")+". Continuemos el diseño técnico de la fase 1 con ese alcance.")}>Confirmar alcance del MVP <icon name="arrow-right" inline/></button>

Dejaría para etapas posteriores la integración gráfica con Noctalia, los modelos locales, la selección automática entre modelos y una arquitectura multiagente.

No porque sean menos interesantes, sino porque **queremos validar el funcionamiento antes de agregar complejidad**.

## 6. Cómo sabremos que la arquitectura funciona

Me gustaría definir una prueba real de extremo a extremo.

La primera que propusimos, aprender Rust, sirve bastante bien:

> «Quiero aprender Rust desde cero. Prepara un plan de aprendizaje, crea un proyecto de ejercicios, comprueba que tengo el entorno necesario y comienza con la primera lección».

Para completar esa solicitud, el agente tendría que comprender el objetivo, proponer un plan, inspeccionar el sistema, solicitar permiso antes de instalar o modificar cosas, crear el proyecto, ejecutar pruebas y guardar el avance para continuar después.

Si conseguimos eso, habremos validado buena parte de nuestra arquitectura en un único flujo.

---

## Mi primera decisión arquitectónica

**Arquitectura modular, híbrida, con un agente principal y ejecución supervisada.**

Creo que es el mejor equilibrio entre capacidad, simplicidad y posibilidades de evolución.

Y antes de pasar a investigar Hermes, OpenClaw, Codex y otros candidatos, hay una decisión que me gustaría tomar contigo:

**¿Qué tan independiente quieres que llegue a ser tu asistente?** Porque eso afecta bastante la arquitectura.

{@body const [autonomy,setAutonomy] = DIL.useState("supervised")}

<radio-group direction="col" value={autonomy} onChange={setAutonomy}>
<radio value="assisted">
\*\*Asistido\*\*

Sugiere y prepara soluciones, pero tú ejecutas las acciones.
</radio>
<radio value="supervised">
**Agente supervisado — mi propuesta**

Ejecuta tareas por sí mismo dentro de límites definidos y solicita autorización para acciones sensibles.
</radio>
<radio value="autonomous">
**Autonomía avanzada**

Puede completar tareas de varios pasos con mínima intervención, mediante permisos previamente delimitados, supervisión y registros.
</radio>
</radio-group>
<button block onClick={=>GenUI.issueNewTurn("Quiero que nuestro asistente tenga un nivel de autonomía "+({assisted:"asistido",supervised:"de agente supervisado",autonomous:"avanzada"}[autonomy])+". Continuemos definiendo la arquitectura de la fase 1 con esa decisión.")}>Elegir nivel de autonomía <icon name="arrow-right" inline/></button>

Esto determinará qué capacidades le exigiremos al motor de agentes y cómo diseñaremos la capa de permisos.

### Source turn T313 — USER

Me gusta, solo un par de matices y sugerencias, el modelo debe ser agnostico, no quiero que si en algun momento elijo cambiar de sistema o quiero implementar el modelo en otro computador con otro sistema, el propio sistema sea una limitante. Y segundo, propuesta para memoria persistente, una base de datos, puede ser relacional o no relacional, creo que es un punto a decidir, pero creo tambien que una base de datos ayudaria bastante a organizar y mantener la memoria del agente/s, se puede definir incluso un modelo para tener tags por entrada y ver temas que se relacionen. Otro tema que quiza sea valioso considerar, un modelo de gestor de archivos tipo obsidian, pero ese seria una limitante para la memoria en bases de datos ya que la informacion estaria dispersa.

### Source turn T314 — ASSISTANT

Me gustan mucho los dos matices, especialmente el segundo. De hecho, creo que acabas de introducir una de las decisiones arquitectónicas más importantes del proyecto: **cómo representar el conocimiento para que el agente pueda utilizarlo, relacionarlo y conservarlo durante años, sin depender de una aplicación específica**.

Y hay algo que me parece especialmente interesante: tu propuesta de una base de datos y la idea de un sistema tipo Obsidian **no son necesariamente incompatibles**. Podemos aprovechar las ventajas de ambos.

Yo haría una revisión de nuestra arquitectura.

# Arquitectura v0.2 — Portabilidad y memoria persistente

## 1. La portabilidad debe ser un principio fundamental

Estoy completamente de acuerdo. Y extendería tu requisito más allá del LLM:

**Todo el núcleo del asistente debe ser agnóstico del sistema operativo, del proveedor de IA y de la interfaz de usuario.**

La arquitectura sería algo así:

<icon name="brain-circuit" size="lg"/>
\*\*Core / Agent Runtime\*\*

Orquestación · Contexto · Memoria · Permisos

<grid columns={2} gap={2}>
<grid-item>
<icon name="plug" size="lg"/>
\*\*Model Adapters\*\*

Cloud · Local · Diferentes proveedores

</grid-item>
<grid-item>
<icon name="database" size="lg"/>
\*\*Storage Adapters\*\*

SQLite · PostgreSQL · Archivos

</grid-item>
<grid-item>
<icon name="monitor-cog" size="lg"/>
\*\*OS Adapters\*\*

Linux · Windows · macOS

</grid-item>
<grid-item>
<icon name="message-square" size="lg"/>
\*\*UI Adapters\*\*

CLI · Desktop · Web · API

</grid-item>
</grid>

Por ejemplo, si desarrollamos una capacidad de abrir aplicaciones, el núcleo no debería saber cómo funciona Hyprland.

Simplemente solicitaría una operación conceptual como:

```
interface DesktopAdapter {
  launchApp(appId: string): Promise<void>;
  listWindows: Promise<WindowInfo[]>;
  focusWindow(windowId: string): Promise<void>;
}
```

Y tendríamos implementaciones diferentes según el sistema operativo:

- `HyprlandAdapter`
- `WindowsAdapter`
- `MacOSAdapter`

Lo mismo aplicaría a los modelos de IA y al almacenamiento.

Esto es una aplicación bastante directa de arquitectura hexagonal (*Ports and Adapters*). No necesitamos implementarla literalmente desde el primer día, pero sí respetar sus principios.

Una aclaración: **agnóstico no significa que todas las capacidades estarán disponibles en todos los sistemas**. Significa que la ausencia de una capacidad específica no impedirá ejecutar el resto del asistente.

---

## 2. Memoria persistente: una base de datos me parece la decisión correcta

Y personalmente **me inclinaría inicialmente por una base de datos relacional**.

No porque las bases NoSQL sean malas, sino porque estás describiendo información fuertemente relacionada:

- Proyectos que contienen tareas y documentos.
- Conversaciones que generan conocimientos.
- Conocimientos asociados con múltiples etiquetas.
- Conceptos relacionados entre sí.
- Preferencias o decisiones que pueden cambiar.
- Progreso de aprendizaje asociado a temas y fechas.

Una base relacional permite representar esas relaciones de manera explícita, consultar su integridad y evitar duplicaciones innecesarias.

### Modelo conceptual inicial

<grid columns={2} gap={2}>
{#each [{name:"MemoryEntry",fields:"id · type · content · timestamps"},{name:"Tag",fields:"id · name · namespace"},{name:"Relation",fields:"source · target · type"},{name:"Source",fields:"origin · reference · version"},{name:"Project",fields:"id · name · scope"},{name:"Conversation",fields:"id · agent · session"}] as e}
<grid-item>
<icon name="database" color="secondary" size="sm"/>

{e.name}

{e.fields}

</grid-item>
{/each}
</grid>

Esquema conceptual; las relaciones muchos-a-muchos se representarían mediante tablas intermedias.

Me interesa particularmente tu propuesta de **tags y relaciones** porque son dos mecanismos diferentes y complementarios.

Un *tag* clasifica información, mientras que una relación expresa algo concreto entre dos entidades.

Por ejemplo:

**Memory: Learning Rust**

<badge>programming</badge>
<badge>rust</badge>
<badge>learning</badge>
<badge>active-project</badge>

---

Relaciones semánticas

<icon name="arrow-right" color="secondary"/>

belongs\_to → Rust Learning Project

<icon name="arrow-right" color="secondary"/>

requires → Ownership and Borrowing

<icon name="arrow-right" color="secondary"/>

references → Rust Exercise 03

Con esa estructura, el agente no solamente podría recuperar recuerdos por palabras clave, sino también **navegar sus relaciones**.

Y podemos hacer todo esto con SQL normal. No necesitamos incorporar Neo4j ni otra base de grafos desde el inicio.

## 3. ¿SQLite o PostgreSQL?

Esta es una decisión que dejaría provisionalmente resuelta, pero abierta a revisión.

| Criterio | SQLite | PostgreSQL |
| --- | --- | --- |
| Instalación | Un archivo, sin servidor | Servicio independiente |
| Portabilidad | Excelente | Excelente con instalación/configuración |
| Relaciones y tags | Sí | Sí |
| Búsqueda de texto | FTS5 | Full-text search |
| Búsqueda vectorial | Extensiones | pgvector |
| Concurrencia de escrituras | Limitada | Más robusta |
| Varios agentes/equipos conectados | Posible, con restricciones | Más adecuado |
| MVP personal | Excelente | Más infraestructura |

SQLite ofrece búsqueda de texto completo mediante FTS5; PostgreSQL tiene extensiones como pgvector para combinar búsquedas semánticas y datos relacionales. [SQLite FTS5 Extension](https://www.sqlite.org/fts5.html), [GitHub - pgvector/pgvector: Open-source vector similarity search for Postgres](https://github.com/pgvector/pgvector)

**Yo comenzaría con SQLite**, no porque sea nuestra elección definitiva, sino porque es más sencillo de transportar, respaldar y ejecutar en una sola computadora.

Si después queremos tener agentes ejecutándose simultáneamente en varios equipos y compartiendo memoria, PostgreSQL podría convertirse en la opción más apropiada.

Aquí es donde el `StorageAdapter` que definimos antes empieza a tener valor.

---

## 4. Obsidian y la base de datos: creo que podemos tener ambos

Esta es la parte que más me interesa de tu propuesta.

<Entity category="software" value="Obsidian" disambig="Aplicación de notas Markdown y gestión de conocimiento"/> trabaja con archivos Markdown almacenados localmente. Los puedes abrir desde otros editores, organizarlos con enlaces y utilizarlos independientemente de Obsidian. [How Obsidian stores data](https://obsidian.md/help/data-storage)

Eso encaja perfectamente con nuestra filosofía de portabilidad.

Pero coincido con tu preocupación: **si guardamos todo indistintamente en archivos Markdown y en SQL, podemos terminar con dos versiones contradictorias del mismo conocimiento**.

La solución sería distinguir entre dos tipos de información.

<grid columns={2} gap={2}>
<grid-item>
<icon name="file-text" size="lg"/>
\*\*Knowledge Vault\*\*

Archivos Markdown

Documentación, apuntes, investigaciones, tutoriales y proyectos escritos

</grid-item>
<grid-item>
<icon name="database" size="lg"/>
\*\*Memory Database\*\*

Registros estructurados

Preferencias, progreso, hechos, decisiones, relaciones, etiquetas y referencias

</grid-item>
</grid>
<icon name="arrow-down" color="secondary"/>
<icon name="arrow-down" color="secondary"/>
<icon name="search" size="lg"/>
\*\*Unified Memory Service\*\*

Búsqueda · Relaciones · Recuperación · Contexto para el agente

La idea fundamental es **una fuente canónica para cada pieza de información**, aunque tengamos diferentes mecanismos para consultarla.

Por ejemplo:

- Una lección que redactemos sobre Rust vive en `KnowledgeVault/Rust/Ownership.md`.
- La base de datos conserva su identificador, etiquetas, relaciones y referencias.
- El índice de búsqueda puede almacenar fragmentos derivados del documento, pero no sería la versión editable oficial.
- Si modificas la lección desde Obsidian, el indexador detecta el cambio y actualiza los datos derivados.

En sentido contrario, si el agente registra que completaste el ejercicio 3 de Rust, ese progreso puede guardarse directamente en la base de datos sin crear un archivo Markdown innecesario.

Así tendríamos una **memoria estructurada** y una **biblioteca de conocimiento**, pero no dos almacenes compitiendo por ser la fuente de verdad del mismo contenido.

Además, podríamos utilizar Obsidian, VS Code, Neovim o cualquier editor para gestionar los documentos. Obsidian sería una interfaz opcional, no una dependencia arquitectónica.

---

## 5. Un punto adicional: búsqueda semántica

Aquí añadiría un tercer elemento, que no necesariamente necesita su propia base de datos: un **índice de embeddings**.

No todos los conocimientos se recuperan bien mediante tags o palabras exactas.

Imagina que le preguntas al agente:

> «¿Recuerdas el problema que tuvimos con la configuración de mis tres monitores?»

Quizá no encuentre nada buscando esas palabras exactas si el conocimiento está almacenado bajo el título `Hyprland Monitor Bindings`.

Un índice vectorial puede encontrar información relacionada por significado.

Yo diseñaría la recuperación combinando:

- **Búsqueda estructurada:** etiquetas, proyectos, fechas, relaciones.
- **Búsqueda textual:** coincidencias exactas, nombres de comandos y mensajes de error.
- **Búsqueda semántica:** similitud conceptual mediante embeddings.

Pero los embeddings serían **índices regenerables**, nunca la única copia del conocimiento. También almacenaríamos qué modelo los generó para poder reconstruirlos si cambiamos de proveedor.

Y otra distinción importante: no deberíamos guardar indiscriminadamente toda conversación como conocimiento permanente. Conviene separar hechos confirmados, hipótesis, decisiones y notas temporales, manteniendo su procedencia y permitiendo corregirlos o eliminarlos.

---

## 6. Decisiones que incorporaría a nuestra arquitectura

**Architecture Decision Records — v0.2** | <badge>Propuesta</badge>

<table>
<table-row><table-cell width="34%">ADR-001</table-cell><table-cell>Core independiente del sistema operativo</table-cell></table-row>
<table-row><table-cell>ADR-002</table-cell><table-cell>Modelos LLM intercambiables mediante adaptadores</table-cell></table-row>
<table-row><table-cell>ADR-003</table-cell><table-cell>Memoria relacional con tags y relaciones explícitas</table-cell></table-row>
<table-row><table-cell>ADR-004</table-cell><table-cell>SQLite inicial, persistencia desacoplada</table-cell></table-row>
<table-row><table-cell>ADR-005</table-cell><table-cell>Markdown Vault para conocimiento documental</table-cell></table-row>
<table-row><table-cell>ADR-006</table-cell><table-cell>Servicio unificado de recuperación de memoria</table-cell></table-row>
<table-row><table-cell>ADR-007</table-cell><table-cell>Índices textuales y semánticos regenerables</table-cell></table-row>
</table>

Añadiría también requisitos de **exportación, migraciones de esquema, copias de seguridad y sincronización con detección de conflictos**. Si algún día ejecutamos el asistente en varios equipos, no bastará con copiar una base de datos SQLite abierta entre carpetas sincronizadas.

## Mi propuesta para seguir con la fase 1

Creo que tenemos ya tres grandes pilares:

1. **Core agnóstico** para orquestación, modelos y herramientas.
2. **Sistema de memoria híbrido** para conocimiento estructurado y documentos.
3. **Capa de ejecución supervisada** para interactuar con el mundo exterior.

Todavía no elegiría entre Hermes, OpenClaw y otras herramientas. Primero necesitamos concretar **el ciclo de vida de la memoria**: qué debe recordar el agente, cuándo debe almacenarlo, cómo recuperarlo y cómo distinguir conocimiento vigente de conocimiento obsoleto.

Y aquí quiero plantearte una posibilidad que considero especialmente valiosa:

**Que múltiples agentes compartan un mismo sistema de memoria, pero con espacios de conocimiento diferenciados.** Por ejemplo, un agente de programación y otro de aprendizaje podrían compartir conocimientos técnicos sin mezclar sus historiales de trabajo.

Eso nos permitiría empezar con un solo agente y evolucionar después a varios sin tener que rediseñar la persistencia.

### Source turn T315 — USER

Si, me encanta, me parece una base bastante solida para comenzar

### Source turn T316 — ASSISTANT

¡Excelente! 😎 Entonces tomamos la **arquitectura v0.2 como nuestra línea base**. No significa que todas las decisiones sean definitivas, pero ya tenemos principios suficientemente claros para empezar a diseñar los componentes.

Y algo que me gusta especialmente: estamos diseñando un sistema que podría seguir siendo útil incluso si mañana cambias CachyOS por Windows, macOS u otra distribución, o si decides sustituir completamente el motor de IA.

## Nuestro siguiente paso: el ciclo de vida de la memoria

Antes de elegir herramientas, quiero definir cómo nuestro asistente **aprende, recuerda, relaciona y actualiza información**.

Propongo este flujo:

<icon name="message-square-text" size="lg"/>
\*\*1. Captura\*\*

Conversaciones, documentos, acciones y resultados

<icon name="arrow-down" color="tertiary"/>
<icon name="brain" size="lg"/>
\*\*2. Procesamiento\*\*

Extraer hechos, decisiones, conceptos y relaciones

<icon name="arrow-down" color="tertiary"/>
<icon name="database" size="lg"/>
\*\*3. Persistencia\*\*

Base de datos estructurada + documentos Markdown

<icon name="arrow-down" color="tertiary"/>
<icon name="network" size="lg"/>
\*\*4. Recuperación\*\*

Tags, relaciones, búsqueda textual y semántica

<icon name="arrow-down" color="tertiary"/>
<icon name="refresh-cw" size="lg"/>
\*\*5. Evolución\*\*

Corregir, consolidar, versionar y retirar conocimiento obsoleto

Aquí introduciría una distinción fundamental: **no todo lo que un agente procesa debería convertirse automáticamente en memoria permanente**.

Por ejemplo, una respuesta equivocada, una hipótesis pendiente de verificar y una decisión técnica confirmada no deberían tener el mismo tratamiento.

Cada memoria podría incluir procedencia, fecha, nivel de confianza, ámbito de acceso, estado de vigencia y relaciones con otras entradas.

## La siguiente decisión que tomaría

Sobre **cuándo guardar información**, veo tres enfoques:

{@body const [choice,setChoice] = DIL.useState("hybrid")}

<radio-group direction="col" value={choice} onChange={setChoice}>
<radio value="manual">
\*\*Memoria explícita\*\*

Solamente se guarda lo que solicites expresamente.
</radio>
<radio value="automatic">
**Memoria automática**

El agente identifica y almacena autónomamente información potencialmente útil.
</radio>
<radio value="hybrid">
**Memoria híbrida — mi preferencia**

El agente conserva automáticamente información de trabajo dentro de ámbitos autorizados, pero solicita confirmación para incorporar conocimientos importantes a la memoria compartida o permanente.
</radio>
</radio-group>
<button block onClick={=>GenUI.issueNewTurn("Para el sistema de memoria del asistente elijo "+({manual:"memoria explícita",automatic:"memoria automática",hybrid:"memoria híbrida"}[choice])+". Continuemos diseñando su ciclo de vida, ámbitos y persistencia.")}>Continuar con esta decisión <icon name="arrow-right" inline/></button>

Mi preferencia es la híbrida porque permite que el agente aprenda de sus tareas cotidianas sin convertir indiscriminadamente cada conversación en conocimiento permanente.

Y con eso podremos diseñar algo particularmente interesante: una **memoria compartida entre agentes, pero con ámbitos de acceso y responsabilidades bien definidos**, que considero una de las capacidades más valiosas de todo el proyecto.

### Source turn T317 — USER

Para el sistema de memoria del asistente elijo memoria híbrida. Continuemos diseñando su ciclo de vida, ámbitos y persistencia.

### Source turn T318 — ASSISTANT

Perfecto. 😎 Entonces queda aprobada nuestra primera política de memoria: **híbrida, estructurada y compartible entre agentes, pero con control explícito sobre qué conocimiento se vuelve permanente y quién puede utilizarlo**.

Ahora entramos en una parte especialmente interesante del diseño: no queremos una IA que simplemente almacene conversaciones; queremos un sistema que pueda **construir, mantener y consultar conocimiento con el paso del tiempo**.

# Arquitectura v0.3 — Memory Management System

<badge color="success">ADR-008 · Memoria híbrida</badge>

Mi propuesta es desarrollar conceptualmente un **Memory Service** independiente del motor de agentes. Sería responsable de gestionar todo el ciclo de vida del conocimiento y expondría una API que cualquier agente autorizado pudiera utilizar.

## 1. Ciclo de vida de una memoria

<icon name="messages-square" size="lg"/>
\*\*Interaction / Event\*\*

Conversaciones, herramientas, documentos y resultados

<icon name="arrow-down" color="tertiary"/>
<icon name="scan-text" size="lg"/>
\*\*Memory Extraction\*\*

Identifica hechos, decisiones, preferencias y relaciones

<icon name="arrow-down" color="tertiary"/>
<icon name="shield-check" size="lg"/>
\*\*Policy & Validation\*\*

Deduplicación · Conflictos · Permisos · Sensibilidad

<icon name="arrow-down" color="tertiary"/>
<grid columns={2} gap={2}>
<grid-item>
<icon name="database" size="lg"/>
\*\*Auto-save\*\*

Contexto autorizado de un proyecto

</grid-item>
<grid-item>
<icon name="clipboard-check" size="lg"/>
\*\*Review Queue\*\*

Memorias compartidas o importantes

</grid-item>
</grid>
<icon name="arrow-down" color="tertiary"/>
<icon name="network" size="lg"/>
\*\*Memory Store & Indexes\*\*

SQLite · Markdown · Búsqueda · Relaciones

<icon name="arrow-down" color="tertiary"/>
<icon name="refresh-cw" size="lg"/>
\*\*Recall & Maintenance\*\*

Recuperar · Consolidar · Versionar · Invalidar

Lo importante es que el proceso de extracción esté **desacoplado de la conversación**. El agente puede concentrarse en resolver la tarea mientras el servicio de memoria procesa las interacciones elegibles.

Esto también nos permitiría sustituir en el futuro el modelo encargado de extraer memorias sin alterar los agentes principales.

## 2. Definir los ámbitos de memoria

Aquí establecería cuatro niveles de persistencia.

<icon name="message-circle" size="lg"/>

**Session Memory**

Contexto temporal de la conversación actual: lo que estamos haciendo, resultados parciales, hipótesis y comandos recientes.

Se conserva durante la sesión; un resumen seleccionado puede pasar a memoria de proyecto.

---

<icon name="folder-kanban" size="lg"/>

**Project Memory**

Decisiones técnicas, configuraciones, objetivos, errores conocidos y progreso de un proyecto concreto.

Persistencia automática dentro de proyectos autorizados.

---

<icon name="user-round" size="lg"/>

**Personal Memory**

Preferencias duraderas, hábitos de trabajo, objetivos de aprendizaje y decisiones aplicables a varios proyectos.

Memoria permanente con criterios más estrictos de admisión y revisión.

---

<icon name="share-2" size="lg"/>

**Shared Knowledge**

Conocimiento disponible para varios agentes: documentación técnica, conceptos, investigaciones verificadas y procedimientos reutilizables.

Requiere aprobación o una política explícita de publicación.

Aquí hay una decisión importante: **el ámbito de una memoria no debe depender del agente que la creó**.

Por ejemplo, el agente de programación puede generar una memoria sobre Rust dentro de un proyecto de aprendizaje. Posteriormente, el agente de estudio puede acceder a ella si tiene autorización para ese proyecto.

Eso evita construir silos de información.

## 3. El verdadero significado de la memoria híbrida

No quisiera que el asistente te interrumpiera cada cinco minutos preguntándote si debe recordar algo.

Mi propuesta es utilizar reglas distintas según la información.

| Tipo de información | Acción predeterminada |
| --- | --- |
| Resultado temporal de una conversación | Mantener en sesión |
| Progreso de un proyecto autorizado | Guardar automáticamente |
| Decisión técnica confirmada | Guardar en el proyecto |
| Preferencia personal duradera | Proponer para memoria personal |
| Conocimiento reutilizable entre agentes | Proponer publicación compartida |
| Dato sensible o credencial | No incorporar automáticamente |
| Hipótesis no verificada | Guardar como hipótesis, sin elevarla a hecho |

El usuario podría aprobar varias propuestas de memoria al finalizar una sesión, en lugar de responder a cada una individualmente.

### Ejemplo: nuestra configuración de CachyOS

Imagina que el agente encuentra en una conversación:

> «La combinación DX11 + DXVK funciona mejor que DX12 y Vulkan nativo para Satisfactory en mi RX 5600 XT».

Podría almacenar automáticamente:

**Memory Entry** | <badge>Project: Gaming Setup</badge>

Preferred rendering API for Satisfactory

DirectX 11 through DXVK provides approximately 100 FPS at 1080p Ultra on Radeon RX 5600 XT, outperforming the tested DX12 and native Vulkan paths.

---

<badge>linux</badge>
<badge>gaming</badge>
<badge>satisfactory</badge>
<badge>radv</badge>
<badge>gpu</badge>

Type: observation · Source: user benchmark · Validity: hardware/game-version dependent

Pero **no debería convertirlo en una verdad universal**, como «DX11 siempre rinde mejor en tarjetas AMD».

La memoria debe conservar también el contexto que hace válido el conocimiento.

---

## 4. Modelo de datos: separar los contenidos de sus relaciones

Aquí comenzaría a diseñar el esquema lógico de SQLite.

No guardaría absolutamente todo en una única tabla `memories`, porque perderíamos estructura y terminaríamos con un gran conjunto de documentos JSON difíciles de relacionar.

Propongo las siguientes entidades principales:

| Entidad | Responsabilidad |
| --- | --- |
| `memory_entries` | Contenido, tipo, estado, fechas y vigencia |
| `memory_versions` | Historial de modificaciones y correcciones |
| `memory_relations` | Relaciones dirigidas entre recuerdos |
| `tags` / `memory_tags` | Clasificación muchos-a-muchos |
| `scopes` | Ámbitos personales, de proyecto y compartidos |
| `scope_permissions` | Qué agentes pueden leer o escribir cada ámbito |
| `sources` | Procedencia y referencias verificables |
| `documents` | Referencias canónicas a archivos Markdown |
| `memory_proposals` | Entradas pendientes de autorización |
| `memory_events` | Auditoría de creación, acceso relevante y cambios |

Y distinguiría tres cosas que muchas arquitecturas de IA terminan mezclando:

- **El contenido canónico**: el hecho, decisión o documento que debemos preservar.
- **Los metadatos y relaciones**: clasificación y estructura consultable.
- **Los índices de búsqueda**: representaciones derivadas que podemos reconstruir.

Si cambiamos de proveedor de embeddings, por ejemplo, las memorias originales permanecen intactas.

## 5. Relaciones: más allá de los tags

Los tags funcionan bien para clasificar información, pero las relaciones expresan conocimiento mucho más específico.

**Rust Learning Project**

<icon name="arrow-down-left" color="secondary"/>
<icon name="arrow-down" color="secondary"/>
<icon name="arrow-down-right" color="secondary"/>
<grid columns={3} gap={2}>
<grid-item>

Ownership

concept

</grid-item>
<grid-item>

Exercise 03

task

</grid-item>
<grid-item>

Borrowing

concept

</grid-item>
</grid>

Las relaciones pueden representar dependencias, referencias, contradicciones o pertenencia a proyectos.

Empezaría con un vocabulario pequeño de relaciones:

`related_to`, `depends_on`, `derived_from`, `contradicts`, `supersedes`, `part_of` y `references`.

La diferencia entre `contradicts` y `supersedes` es especialmente importante.

Si un dato contradice otro, necesitamos investigar cuál es correcto. Si lo reemplaza, podemos conservar el anterior como histórico y marcar el nuevo como vigente.

## 6. La recuperación de memoria

Me gustaría evitar un error común: recuperar los primeros cinco documentos que se parecen semánticamente a la pregunta y enviarlos indiscriminadamente al LLM.

Propondría una recuperación por etapas:

**User Request**

<icon name="arrow-down" color="tertiary"/>
<grid columns={3} gap={2}>
{#each [{icon:"filter",title:"Scope Filter",desc:"Permisos y proyectos"},{icon:"search",title:"Hybrid Search",desc:"FTS + vectores"},{icon:"network",title:"Graph Expansion",desc:"Relaciones directas"}] as e}
<grid-item>
<icon name={e.icon} size="lg"/>

{e.title}

{e.desc}

</grid-item>
{/each}
</grid>
<icon name="arrow-down" color="tertiary"/>

**Reranking & Context Assembly**

Relevancia · Vigencia · Procedencia · Presupuesto de tokens

<icon name="arrow-down" color="tertiary"/>

**Agent Context**

Primero filtraríamos por permisos y ámbitos. Después consultaríamos coincidencias textuales y semánticas, ampliaríamos con relaciones útiles y seleccionaríamos el conjunto final de información.

Así evitamos tanto recuperar material irrelevante como introducir recuerdos a los que un agente no debería tener acceso.

## 7. Vigencia, versiones y mantenimiento

Este punto es esencial si queremos un sistema que funcione durante años.

No eliminaría automáticamente un recuerdo porque otro lo contradiga.

Lo versionaría o marcaría como reemplazado.

Por ejemplo:

<icon name="history" color="secondary"/>

GPU driver: version A

Historical · Superseded

<icon name="arrow-down" color="secondary"/>
<icon name="check-circle" color="success"/>

**GPU driver: version B**

Current · Verified

Pero hay una distinción importante: **versionar información no implica conservar indefinidamente datos que el usuario quiera borrar**. La eliminación debe ser real y contemplar los índices derivados, las exportaciones y la política de retención de respaldos.

También separaría los siguientes estados: `candidate`, `active`, `disputed`, `superseded` y `archived`.

Una memoria puede pasar por esos estados sin perder su procedencia ni convertirse accidentalmente en una verdad absoluta.

## 8. Portabilidad y persistencia

Mantendría esta estructura lógica, independientemente de dónde instalemos el asistente:

```
assistant/
├── config/
│   └── settings.yaml
├── data/
│   ├── memory.sqlite
│   └── indexes/
├── vault/
│   ├── projects/
│   ├── research/
│   └── learning/
├── exports/
└── logs/
```

Las rutas reales serían configurables según Linux, Windows o macOS. No pondríamos rutas absolutas de CachyOS dentro de las memorias.

Para el MVP usaríamos SQLite con migraciones versionadas, restricciones de integridad, transacciones y copias de seguridad consistentes. La biblioteca Markdown sería portable y podría abrirse en Obsidian sin convertirlo en una dependencia obligatoria.

Un punto adicional: **memoria no es lo mismo que almacenamiento de secretos**. Las claves API, tokens y credenciales deberían vivir en un almacén de secretos separado, nunca en la base de conocimiento ni en los prompts recuperados.

---

## 9. Decisiones arquitectónicas propuestas

**Memory Architecture · v0.3** | <badge color="success">Baseline</badge>

<table>
<table-row><table-cell width="28%">ADR-008</table-cell><table-cell>Memoria híbrida con revisión por políticas</table-cell></table-row>
<table-row><table-cell>ADR-009</table-cell><table-cell>Memory Service independiente de los agentes</table-cell></table-row>
<table-row><table-cell>ADR-010</table-cell><table-cell>Ámbitos por sesión, proyecto, persona y conocimiento compartido</table-cell></table-row>
<table-row><table-cell>ADR-011</table-cell><table-cell>Relaciones explícitas y procedencia verificable</table-cell></table-row>
<table-row><table-cell>ADR-012</table-cell><table-cell>Versiones, estados de vigencia y correcciones</table-cell></table-row>
<table-row><table-cell>ADR-013</table-cell><table-cell>Recuperación híbrida con filtrado previo por permisos</table-cell></table-row>
<table-row><table-cell>ADR-014</table-cell><table-cell>Persistencia portable, exportable y respaldable</table-cell></table-row>
</table>

## ¿Qué sigue?

Creo que ya tenemos una arquitectura conceptual bastante completa para la memoria. No empezaría todavía a programarla: antes necesitamos definir **los contratos entre componentes**.

Mi siguiente paso sería diseñar tres interfaces independientes:

- `MemoryProvider`: guardar, actualizar, recuperar y relacionar conocimiento.
- `ModelProvider`: interactuar con diferentes LLM sin acoplar el núcleo a un proveedor.
- `ToolProvider`: exponer capacidades externas con permisos y mecanismos de ejecución.

Con estos contratos podremos evaluar Hermes, OpenClaw, Codex y otras soluciones de manera objetiva: no solamente cuál tiene más características, sino **cuál respeta nuestra arquitectura y cuáles responsabilidades tendríamos que implementar nosotros**.

Y mantendría una filosofía durante todo el proyecto: **primero hacer funcionar un flujo completo con pocos componentes; después agregar sofisticación donde demostremos que aporta valor**.

Creo que estamos consiguiendo el equilibrio correcto entre diseñar algo extensible y evitar construir una plataforma desproporcionada para un asistente personal. 😎

### Source turn T319 — USER

Estoy de acuerdo, esta propuesta me gusta bastante, quiza tenga un poco de robustes para empezar, pero no creo que nada de lo que esta propuesto sea overkill para lo que buscamos, en cierto punto todo esto nos sera de utilidad, mas aun cuando intentemos utilizar este metodo en otros PCs, para el cual deberemos resolver en su momento el COMO de eso, pero ahora mismo todo sera local asi que creo que tenemos buenas bases

### Source turn T320 — ASSISTANT

¡Exactamente! 😎 Y creo que acabas de establecer una distinción fundamental para el proyecto:

**Que una arquitectura sea robusta no significa que su primera implementación tenga que ser compleja.**

Podemos diseñar desde el principio pensando en extensibilidad, persistencia, múltiples agentes y portabilidad, pero implementar únicamente lo que necesitamos hoy.

De hecho, me gusta que no estemos descartando componentes simplemente por considerarlos *overengineering*. Lo importante es que cada componente tenga una responsabilidad justificable.

# Arquitectura v0.4 — Local-first, portable by design

<badge color="success">Decisión arquitectónica</badge>

Formalizaría nuestro enfoque con esta regla:

> El sistema debe poder funcionar íntegramente en una computadora, sin depender de infraestructura distribuida, pero sin asumir que siempre se ejecutará en esa misma computadora.

Esto tiene varias implicaciones interesantes.

## 1. Separar despliegue de arquitectura

<icon name="monitor" size="lg"/>
\*\*Local Host\*\*

CachyOS · Nuestra primera implementación

<icon name="arrow-down" color="tertiary"/>
<icon name="brain-circuit"/>
\*\*Agent Runtime\*\*
<grid columns={3} gap={2}>
{#each [{icon:"cpu",name:"Model Provider"},{icon:"database",name:"Memory Provider"},{icon:"wrench",name:"Tool Provider"}] as c}
<grid-item>
<icon name={c.icon} color="secondary"/>

{c.name}

</grid-item>
{/each}
</grid>

---

<grid columns={3} gap={2}>
{#each [{name:"SQLite",icon:"database"},{name:"Markdown Vault",icon:"files"},{name:"OS Adapters",icon:"monitor-cog"}] as c}
<grid-item>
<icon name={c.icon} color="secondary"/>

{c.name}

</grid-item>
{/each}
</grid>

Todos los componentes pueden ejecutarse en un mismo proceso o aplicación. No necesitamos microservicios, contenedores ni servicios de red para cada componente.

Aquí hay un punto que considero especialmente importante: **los Providers son interfaces lógicas, no necesariamente procesos independientes**.

Podemos escribir un sistema modular que se ejecute como una única aplicación CLI. No necesitamos convertir cada responsabilidad en un servicio con su propio puerto HTTP.

## 2. Prepararnos para otros equipos sin implementar sincronización todavía

Hay algunas decisiones pequeñas que conviene tomar ahora porque serían costosas de cambiar después.

| Decisión actual | Beneficio futuro |
| --- | --- |
| Identificadores UUID para memorias | Evitar colisiones entre equipos |
| Rutas relativas o configurables | Migrar entre sistemas operativos |
| Migraciones versionadas de SQLite | Actualizar instalaciones existentes |
| Exportación de base de datos y Vault | Transferir o respaldar conocimiento |
| Identificador de dispositivo | Conocer el origen de cada registro |
| Operaciones de memoria auditables | Facilitar una futura sincronización |

Y un matiz: **preparar los datos para sincronizarse no significa que SQLite deba sincronizarse directamente**.

Cuando llegue el momento, podremos evaluar replicación, intercambio de eventos, un servidor central o diferentes estrategias de sincronización.

No necesitamos decidir hoy cuál utilizaremos.

## 3. El siguiente paso real: contratos de componentes

Aquí es donde empezaría a convertir nuestra arquitectura conceptual en un diseño implementable.

Tenemos tres interfaces principales.

<icon name="brain" size="lg"/>

**ModelProvider**

Abstrae modelos locales y remotos.

Debe permitir enviar mensajes, recibir respuestas, ejecutar *tool calling* cuando esté soportado y consultar capacidades del modelo.

---

<icon name="database" size="lg"/>

**MemoryProvider**

Gestiona las memorias estructuradas, sus relaciones, búsquedas, procedencia y ciclo de vida.

No debería necesitar saber si utiliza SQLite, PostgreSQL u otro motor.

---

<icon name="wrench" size="lg"/>

**ToolProvider**

Expone capacidades del sistema mediante contratos definidos.

Por ejemplo, el agente solicita `filesystem.read` o `desktop.launch`, y el adaptador correspondiente ejecuta la operación según las capacidades del equipo.

Hay una cuarta pieza transversal que mantendría separada: **Policy Engine**. Su función sería autorizar o rechazar las operaciones antes de ejecutarlas, independientemente de qué agente o modelo las solicite.

Esto será útil cuando incorporemos múltiples agentes que compartan herramientas.

## 4. Un criterio que añadiría: degradación elegante

Imagina que trasladamos nuestro asistente de CachyOS a un portátil con Windows.

Si intentamos ejecutar una herramienta específica de Hyprland, no quiero que el sistema entero falle.

Quiero que el adaptador responda algo equivalente a:

```
{
  "capability": "desktop.hyprland.workspace",
  "available": false,
  "reason": "Unsupported on this host"
}
```

El agente podrá entonces utilizar otra capacidad disponible o explicarte que esa operación no está soportada.

Lo mismo aplicaría a los modelos: si una operación necesita *tool calling* y el modelo seleccionado no lo soporta adecuadamente, el sistema debe detectarlo y elegir una alternativa autorizada, en lugar de asumir que todos los modelos tienen las mismas capacidades.

---

## Nuestra hoja de ruta actualizada

<icon name="check-circle-2" color="success" size="lg"/>

**Fase 1A — Arquitectura conceptual**

Componentes, memoria híbrida, portabilidad, local-first

<badge color="success">Definida</badge>

<icon name="circle-dot" color="info" size="lg"/>

**Fase 1B — Contratos y arquitectura técnica**

Interfaces, protocolos, límites y flujos entre componentes

<badge>Actual</badge>

<icon name="circle" color="tertiary" size="lg"/>

**Fase 2 — Evaluación de herramientas**

Hermes, OpenClaw, Codex, runtimes, almacenamiento

<icon name="circle" color="tertiary" size="lg"/>

**Fase 3 — MVP local**

Primer agente funcional con memoria, herramientas y permisos

<icon name="circle" color="tertiary" size="lg"/>

**Fase 4 — Evolución**

Modelos locales, Noctalia, múltiples agentes y, más adelante, otros equipos

Creo que estamos en un buen punto para pasar del *qué queremos construir* al *cómo deben comunicarse sus componentes*.

Mi propuesta para la próxima parte es **diseñar los contratos de `ModelProvider`, `MemoryProvider` y `ToolProvider`**, con especial atención a cómo se comunican con el `Agent Runtime`.

Todavía sin elegir lenguaje de programación ni framework: primero definimos las responsabilidades y las interfaces; después investigamos qué tecnologías pueden cumplirlas sin acoplar nuestro proyecto a un proveedor concreto.

Y ya tenemos algo valioso: **el objetivo no es crear otro framework de agentes, sino construir nuestro asistente aprovechando soluciones existentes, desarrollando únicamente las piezas que realmente nos hagan falta.**

### Source turn T321 — USER

Si, me parece bien, supongo que el Policy Engine y la degradacion elegante se definiran mas en el futuro, o vendrian en el mismo step que el ModelProvider, MemoryProvider y ToolProvider

### Source turn T322 — ASSISTANT

**Los incluiría en el mismo paso.** De hecho, creo que sería un error diseñar `ModelProvider`, `MemoryProvider` y `ToolProvider` sin establecer primero cómo interactúan con el `Policy Engine` y cómo manejan capacidades no disponibles.

La distinción que haría es esta: **en la fase 1B definimos los contratos y las reglas; durante la implementación decidimos los mecanismos concretos.**

## Los cinco componentes de nuestra arquitectura técnica

<icon name="brain-circuit" size="lg"/>
\*\*Agent Runtime\*\*

Orquesta las solicitudes y coordina los componentes

<icon name="arrow-down-up" color="tertiary"/>
<grid columns={3} gap={2}>
{#each [{name:"ModelProvider",icon:"cpu"},{name:"MemoryProvider",icon:"database"},{name:"ToolProvider",icon:"wrench"}] as c}
<grid-item>
<icon name={c.icon} size="lg"/>

{c.name}

</grid-item>
{/each}
</grid>
<icon name="arrow-down-up" color="tertiary"/>
<icon name="shield-check"/>
\*\*Policy Engine\*\*

Autorización · Restricciones · Alcances · Auditoría

Capability Discovery & Graceful Degradation

Contrato transversal utilizado por todos los providers

Hay una diferencia importante entre los dos componentes nuevos.

## 1. Policy Engine: componente independiente

Lo definiría como un servicio lógico con su propia interfaz, al mismo nivel de importancia que los tres providers.

Por ejemplo, si el agente recibe:

> «Instala Docker en esta computadora y configura mi entorno de desarrollo».

El flujo sería:

1. `Agent Runtime` interpreta la solicitud.
2. `ToolProvider` identifica las operaciones necesarias.
3. `Policy Engine` evalúa cuáles están autorizadas.
4. Las operaciones permitidas se ejecutan; las restantes requieren aprobación o se rechazan.
5. El resultado queda registrado para auditoría.

Aquí establecería una regla arquitectónica fundamental:

**El modelo nunca decide por sí mismo qué permisos tiene.**

El LLM puede solicitar una acción, pero el Policy Engine determina si está autorizada. La validación debe realizarse en el límite de ejecución, no simplemente mediante instrucciones en el prompt.

Además, el Policy Engine protegerá otros recursos: por ejemplo, impedir que un modelo cloud reciba documentos privados si el ámbito de memoria no permite enviar esa información fuera del equipo.

## 2. Graceful Degradation: responsabilidad transversal

En cambio, la degradación elegante **no necesita ser un servicio independiente**.

La implementaría mediante un contrato común para que cada provider pueda declarar sus capacidades.

Por ejemplo:

```
interface Provider {
  getCapabilities: Capability[];
  getHealth: ProviderHealth;
}
```

Ejemplo ilustrativo; todavía no hemos elegido lenguaje de programación.

Imagina que trasladamos nuestro sistema a una computadora con Windows.

El agente intenta cambiar de workspace mediante `desktop.workspace.switch`.

El sistema descubre que:

- El adaptador de Hyprland no está disponible.
- El adaptador de Windows no ofrece una capacidad equivalente.
- Las demás herramientas siguen funcionando.

En lugar de provocar un error general, devuelve un resultado estructurado de capacidad no disponible.

Pero hay algo más importante: **la degradación elegante no debe convertirse en un mecanismo para eludir permisos**.

Si un modelo local no puede resolver una tarea, el sistema podría proponer usar un modelo cloud, pero solamente si la política de privacidad autoriza enviar ese contexto al proveedor externo.

---

## 3. Qué definiremos ahora y qué dejaremos para después

| Elemento | Fase 1B: ahora | Implementación posterior |
| --- | --- | --- |
| ModelProvider | Capacidades, mensajes, streaming, errores | SDK, modelos, proveedores |
| MemoryProvider | Operaciones, ámbitos, relaciones, permisos | SQL, migraciones, índices |
| ToolProvider | Herramientas, argumentos, resultados | Adaptadores reales del SO |
| Policy Engine | Decisiones, reglas, autorizaciones | Motor de políticas, UI de aprobación |
| Graceful Degradation | Estados de capacidad y recuperación | Fallbacks específicos y detección del entorno |

También diseñaremos **contratos de error consistentes**, porque no es lo mismo que una herramienta falle, que esté deshabilitada o que el usuario no haya autorizado ejecutarla.

Por ejemplo: `UNAVAILABLE`, `UNSUPPORTED`, `DENIED`, `APPROVAL_REQUIRED` y `EXECUTION_FAILED`.

Eso permitirá que el agente responda apropiadamente sin intentar adivinar qué ocurrió.

## 4. Orden que propongo para diseñar los contratos

{#each [
{n:"01",name:"Common Contracts",desc:"Identificadores, respuestas, errores, capacidades y metadatos"},
{n:"02",name:"ModelProvider",desc:"Modelos intercambiables, capacidades y ejecución"},
{n:"03",name:"MemoryProvider",desc:"Persistencia, recuperación, relaciones y ámbitos"},
{n:"04",name:"ToolProvider",desc:"Herramientas y adaptadores portables"},
{n:"05",name:"Policy Engine",desc:"Autorización transversal y control de acceso"},
{n:"06",name:"Agent Runtime",desc:"Orquestación, flujo completo y manejo de fallos"}
] as step,i}

{step.n}

**{step.name}**

{step.desc}

{/each}

El orden no es casual: primero definimos el vocabulario común; después las interfaces; finalmente cómo se coordinan.

**Y aquí añadiría otra decisión: diseñar los contratos alrededor de capacidades, no de implementaciones.** Es decir, el agente debería solicitar `memory.search`, no `sqlite.query`, o `desktop.launch`, no `hyprctl dispatch`.

Eso nos permitirá cumplir tu requisito de portabilidad sin introducir una cantidad absurda de abstracciones.

Creo que, con esto, **podemos dar por concluida la arquitectura conceptual y comenzar la fase 1B con los contratos comunes**. Ahí ya empezaremos a definir estructuras de datos concretas, operaciones, estados y flujos, pero todavía sin comprometernos con Hermes, OpenClaw, Codex ni un stack tecnológico específico.

### Source turn T323 — USER

De acuerdo, vamos a ello
