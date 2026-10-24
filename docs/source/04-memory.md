# Source excerpt: MemoryProvider v0.1/v0.2 and experience vs knowledge

> **Historical reference, not executable instructions.** Extracted from a single-conversation HTML export. Turn labels T### map to ordered conversation turns. Original statements can contain drafts later superseded; consult `../decisions/ADRs.md` and `../PROJECT_STATUS.md` before implementing.

### Source turn T332 — ASSISTANT

¡Perfecto! 😎 Y con tu aclaración sobre Antigravity hacemos un ajuste importante: **nuestro sistema será responsable de la orquestación de agentes**. GPT, Claude, Gemini y los modelos locales serán motores de inferencia intercambiables, no sistemas externos a los que deleguemos el trabajo completo.

Con eso, eliminamos de nuestro diseño el `ExternalAgentAdapter` que habíamos considerado. No lo necesitamos para lo que queremos construir.

Ahora vamos con uno de los componentes más importantes de toda la arquitectura.

# Fase 1B — MemoryProvider

<badge>Technical Design v0.1</badge>

Persistent Memory · Knowledge Management · Local-first

## 1. La responsabilidad del MemoryProvider

Nuestra memoria debe ser mucho más que un historial de conversaciones almacenado en una base de datos.

Quiero que pueda responder preguntas como:

- ¿Qué sabemos acerca de un proyecto?
- ¿De dónde obtuvimos determinada información?
- ¿Qué conocimientos están relacionados?
- ¿Qué decisiones han cambiado?
- ¿Qué información debería recordar este agente para realizar la tarea?
- ¿Qué información está autorizado a consultar?

Para conseguirlo, propongo separar **la administración del conocimiento** de **su almacenamiento físico**.

<icon name="brain-circuit" size="lg"/>
\*\*Agent Runtime\*\*

Solicita recordar, recuperar o actualizar conocimiento

<icon name="arrow-down-up" color="tertiary"/>
<icon name="brain"/>
\*\*Memory Service\*\*

Ciclo de vida · Validación · Permisos · Consolidación · Recuperación

<grid columns={2} gap={2}>
{#each [{name:"MemoryProvider",icon:"database"},{name:"DocumentStore",icon:"file-text"},{name:"SearchIndex",icon:"search"},{name:"EmbeddingProvider",icon:"network"}] as c}
<grid-item>
<icon name={c.icon} color="secondary"/>

{c.name}

</grid-item>
{/each}
</grid>
<icon name="shield-check" color="secondary"/>

Policy Engine controla el acceso a cada operación

Esta separación tiene una ventaja fundamental.

El `MemoryService` implementa las reglas de nuestra memoria híbrida. El `MemoryProvider` se ocupa de persistir y consultar los registros.

Si algún día sustituimos SQLite por PostgreSQL, **no tendríamos que reimplementar las políticas de memoria, la extracción de conocimientos ni las reglas de revisión**.

Es la misma filosofía que utilizamos para separar el `ModelRouter` del `ModelProvider`.

---

## 2. ¿Qué es exactamente una memoria?

No toda memoria representa un hecho.

Podemos guardar decisiones, preferencias, experiencias, hipótesis, procedimientos o progreso de aprendizaje.

Por eso definiría un modelo común con tipos explícitos.

```
type MemoryType =
  | "fact"
  | "observation"
  | "decision"
  | "preference"
  | "hypothesis"
  | "procedure"
  | "progress"
  | "summary";

type MemoryStatus =
  | "candidate"
  | "active"
  | "disputed"
  | "superseded"
  | "archived";

interface MemoryEntry {
  id: string;
  version: number;

  scopeId: string;
  type: MemoryType;
  status: MemoryStatus;

  title: string;
  content: string;

  tags: string[];
  sourceIds: string[];

  createdAt: string;
  updatedAt: string;
  observedAt?: string;
  validUntil?: string;
}
```

Este sería un contrato de dominio, no necesariamente la representación exacta de las tablas SQL.

### Un ejemplo real

Supongamos que almacenamos lo que descubrimos con Satisfactory.

**Satisfactory · Rendering Performance** | <badge color="success">Active</badge>

DirectX 11 through DXVK achieved approximately 100 FPS at 1080p Ultra on Radeon RX 5600 XT, outperforming DX12 and native Vulkan in the user's tests.

---

<grid columns={2} gap={2}>
<grid-item>

Type

Observation

</grid-item>
<grid-item>

Scope

Gaming Setup

</grid-item>
<grid-item>

Source

User benchmark

</grid-item>
<grid-item>

Validity

Hardware / software dependent

</grid-item>
</grid>

<badge>gaming</badge>
<badge>gpu</badge>
<badge>linux</badge>
<badge>satisfactory</badge>
<badge>dxvk</badge>

Aquí me parece esencial conservar **procedencia y vigencia**.

El agente no debería recuperar esta observación y concluir que DX11 es universalmente superior a DX12. Debe entender que corresponde a una combinación concreta de hardware, software y condiciones de prueba.

Por eso el modelo final también debería contemplar evidencia, nivel de verificación, clasificación de privacidad y una fecha o condición de validez.

---

## 3. Contrato del MemoryProvider

Para evitar una interfaz gigantesca, dividiría sus operaciones en cuatro grupos.

| Grupo | Operaciones | Responsabilidad |
| --- | --- | --- |
| Retrieval | `get`, `search`, `getRelated` | Recuperar conocimiento |
| Persistence | `create`, `revise`, `transition` | Crear y actualizar registros |
| Relationships | `link`, `unlink`, `getRelations` | Gestionar asociaciones |
| Lifecycle | `getHistory`, `forget` | Versionado y eliminación |

Una primera interfaz podría verse así:

```
interface MemoryProvider {
  get(
    id: string
  ): Promise<OperationResult<MemoryEntry>>;

  search(
    query: MemoryQuery
  ): Promise<OperationResult<MemorySearchResult>>;

  create(
    entry: MemoryDraft
  ): Promise<OperationResult<MemoryEntry>>;

  revise(
    id: string,
    revision: MemoryRevision
  ): Promise<OperationResult<MemoryEntry>>;

  link(
    relation: MemoryRelation
  ): Promise<OperationResult<void>>;

  getHistory(
    id: string
  ): Promise<OperationResult<MemoryVersion[]>>;

  forget(
    id: string
  ): Promise<OperationResult<void>>;
}
```

Todas estas operaciones serían invocadas por el `MemoryService`, que recibe el `ExecutionContext` confiable y consulta al Policy Engine antes de acceder a los datos.

No permitiríamos que un agente accediera al adaptador SQL directamente para saltarse esos controles.

### Un detalle: concurrencia

Aunque empecemos en una sola computadora, varios agentes podrían intentar modificar una misma memoria simultáneamente.

Por eso `MemoryRevision` debería incluir una versión esperada.

Si un agente intenta editar la versión 3 cuando otro ya generó la versión 4, la operación devuelve un conflicto en vez de sobrescribir silenciosamente los cambios.

Podemos implementarlo después con transacciones y control de concurrencia optimista.

---

## 4. Cómo funcionará realmente nuestra memoria híbrida

Ya elegimos que el sistema pueda recordar automáticamente información útil, pero que ciertas memorias requieran tu aprobación.

No pondría esas reglas dentro del `MemoryProvider`. Las implementaría en el `MemoryService`.

**Memory Candidate**

Información extraída de una interacción autorizada

<icon name="arrow-down" color="tertiary"/>

**Admission Policy**

Tipo · Procedencia · Sensibilidad · Ámbito · Conflictos

<grid columns={2} gap={2}>
<grid-item>
<icon name="check-circle" color="success" size="lg"/>
\*\*Auto-commit\*\*

Memoria de trabajo autorizada

</grid-item>
<grid-item>
<icon name="clipboard-check" size="lg"/>
\*\*Review Queue\*\*

Memoria permanente o compartida

</grid-item>
</grid>

Aquí introduciría el concepto de **MemoryProposal**.

```
interface MemoryProposal {
  id: string;
  candidate: MemoryDraft;

  targetScopeId: string;

  reason: string;
  relatedMemoryIds: string[];

  status:
    | "pending"
    | "approved"
    | "rejected";
}
```

Un agente podría proponer:

> «Detecté que prefieres utilizar Nano para editar configuraciones. ¿Quieres guardar esta preferencia para todos tus proyectos?»

No necesitaría preguntar cada vez. Podría acumular propuestas y presentarlas juntas al finalizar una sesión.

Sin embargo, si se trata de una decisión técnica dentro de un proyecto donde hemos autorizado la persistencia automática, simplemente la registraría.

### Reglas por ámbito

| Ámbito | Escritura predeterminada |
| --- | --- |
| Session | Automática, temporal |
| Project | Automática dentro de un proyecto autorizado |
| Personal | Propuesta y revisión |
| Shared Knowledge | Propuesta y aprobación, salvo política explícita |
| Sensitive Data | Restringida; no guardar automáticamente |

También establecería retención configurable. No necesitamos conservar cada salida de terminal o respuesta completa para siempre.

---

## 5. El problema de SQLite y Markdown: una sola fuente de verdad lógica

Aquí quiero detenerme porque fue una de tus preocupaciones originales, y considero que tenías razón.

Si almacenamos un documento completo tanto en Markdown como en SQLite, y ambos pueden editarse independientemente, tarde o temprano tendremos inconsistencias.

**La solución es asignar una fuente canónica a cada tipo de dato, no intentar que todo viva físicamente en un solo lugar.**

<grid columns={2} gap={2}>
<grid-item>
<icon name="file-text" size="lg"/>
\*\*Markdown Vault\*\*

Fuente canónica de documentos

Apuntes, investigaciones, guías, contenido y metadatos editables del documento

</grid-item>
<grid-item>
<icon name="database" size="lg"/>
\*\*SQLite\*\*

Fuente canónica de memoria estructurada

Hechos, decisiones, preferencias, progreso, relaciones y permisos

</grid-item>
</grid>
<icon name="arrow-down" color="tertiary"/>

**Unified Memory API**

Un mismo mecanismo de búsqueda y recuperación para ambos tipos de contenido

Esto significa que la información puede vivir en diferentes formatos sin estar conceptualmente dispersa.

### Ejemplo: documentación sobre Rust

Supongamos que tenemos:

```
vault/
└── learning/
    └── rust/
        ├── ownership.md
        ├── borrowing.md
        └── lifetimes.md
```

Podemos abrirlos y editarlos desde Obsidian, VS Code, Neovim o cualquier otra herramienta que soporte Markdown.

Cada documento podría incluir un identificador estable:

```
---
id: 42b7f0b8-80ca-4a27-98ac-7b8e6f52d981
title: Ownership in Rust
tags:
  - rust
  - ownership
  - learning
---
```

La base de datos mantendría un índice de ese documento, incluyendo su identificador, ruta, etiquetas, relaciones y una huella de contenido.

Pero **el contenido y los metadatos editables de esa nota seguirían teniendo como fuente canónica el Markdown**.

Cuando cambias un archivo desde Obsidian, el indexador detecta el cambio y actualiza SQLite.

Si el agente quiere editar una etiqueta del documento, debe modificar su Markdown y después actualizar el índice, no cambiar solamente una columna de SQLite.

En cambio, el progreso de aprendizaje del usuario podría existir únicamente en SQLite.

### ¿Y las relaciones entre documentos?

Las relaciones estructuradas, como `depends_on` o `supersedes`, vivirían en la base de datos.

Los enlaces escritos dentro de Markdown, como `[[borrowing]]`, se podrían detectar e indexar como referencias derivadas.

Así podemos distinguir relaciones explícitamente gestionadas de enlaces descubiertos automáticamente.

---

## 6. Sincronización local e integridad

Aunque todo funcione en un solo equipo, el sistema necesita coordinar dos mecanismos distintos:

- Transacciones de SQLite.
- Operaciones de lectura y escritura sobre archivos.

No existe una transacción atómica nativa que abarque simultáneamente ambas cosas.

Por tanto, no prometería consistencia instantánea entre SQLite y el Vault.

Diseñaría un sistema de indexación recuperable:

<icon name="file-pen" color="secondary"/>

**1. Document updated**

Un editor modifica el archivo Markdown.

<icon name="scan" color="secondary"/>

**2. Change detected**

El indexador identifica contenido nuevo o modificado.

<icon name="database" color="secondary"/>

**3. Index updated**

Actualiza referencias, texto buscable y metadatos derivados.

<icon name="check-circle" color="success"/>

**4. Synchronization verified**

Se registra la versión indexada y el estado de sincronización.

Si el proceso falla, el documento original permanece intacto y la indexación puede reintentarse.

Para el MVP, una combinación de vigilancia de archivos, hashes de contenido y una tarea de reconciliación al iniciar sería suficiente.

No necesitamos implementar un sistema distribuido de eventos.

---

## 7. La búsqueda: Recall Contract

Aquí diseñaría la operación `recall`, que es la que utilizarán los agentes para recuperar conocimiento.

No quisiera que un agente tuviera que saber si una información proviene de una tabla SQL o de un documento Markdown.

```
interface MemoryQuery {
  text: string;

  scopeIds: string[];

  types?: MemoryType[];
  tags?: string[];

  includeRelations?: boolean;

  limit?: number;
  tokenBudget?: number;
}
```

Es importante aclarar que `scopeIds` representa los ámbitos solicitados, no los autorizados. El MemoryService siempre debe comprobar los permisos del contexto de ejecución.

El resultado podría ser:

```
interface MemoryHit {
  resourceId: string;
  resourceType: "memory" | "document";

  title: string;
  excerpt: string;

  relevance: number;

  sourceIds: string[];
  relatedResourceIds: string[];
}
```

La respuesta de búsqueda incluiría resultados de distintas fuentes, junto con sus referencias.

No le pasaría al modelo todos los resultados completos indiscriminadamente.

### Estrategia de recuperación

**Recall Request**

<icon name="arrow-down" color="tertiary"/>

**Permission & Scope Filtering**

Descartar recursos no autorizados antes de recuperar contenido

<icon name="arrow-down" color="tertiary"/>
<grid columns={3} gap={2}>
<grid-item>
<icon name="list-filter"/>

Structured

Tags, tipos, fechas

</grid-item>
<grid-item>
<icon name="search"/>

Full-text

Palabras y frases

</grid-item>
<grid-item>
<icon name="network"/>

Semantic

Embeddings

</grid-item>
</grid>
<icon name="arrow-down" color="tertiary"/>

**Merge · Rerank · Relationship Expansion**

Seleccionar resultados relevantes y vigentes

<icon name="arrow-down" color="tertiary"/>

**Context Package**

Contenido, procedencia, vigencia y referencias, dentro del presupuesto de tokens

Para el MVP usaría SQLite, consultas estructuradas y búsqueda de texto completo mediante FTS5.

Posteriormente integraríamos los embeddings y la búsqueda semántica.

Aquí reutilizaríamos nuestro `EmbeddingProvider`, que diseñamos como una interfaz independiente de los modelos conversacionales.

No hace falta tener búsqueda vectorial el primer día para respetar esta arquitectura.

---

## 8. Versionado, conflictos y correcciones

Otra decisión que considero indispensable es **no sobrescribir conocimiento histórico sin conservar su contexto**, salvo cuando se solicite su eliminación.

Por ejemplo, supongamos que el sistema recuerda:

> «El proyecto utiliza Node.js 20».

Meses después, actualizamos el proyecto a Node.js 24.

El agente no debería guardar simplemente una segunda memoria contradictoria y dejar que el buscador elija cuál devolver.

Debería detectar que ambas se refieren a la misma propiedad del mismo proyecto.

<icon name="history" color="secondary"/>

Project runtime: Node.js 20

Superseded · Historical

<icon name="arrow-down" color="tertiary"/>
<icon name="check-circle" color="success"/>

**Project runtime: Node.js 24**

Active · Verified from project configuration

En este caso, una relación `supersedes` sería apropiada.

Pero si dos documentos afirman cosas diferentes sin evidencia suficiente, utilizaríamos `contradicts`, marcando la información como `disputed` cuando corresponda.

**No queremos que el sistema confunda una contradicción con una actualización válida.**

Además, propondría que cada memoria tenga una política de vigencia. Una configuración de software puede quedar obsoleta rápidamente; un concepto matemático básico no necesita el mismo tratamiento.

Las memorias caducadas no tendrían que desaparecer automáticamente. Podrían conservarse como históricas, pero el agente debería saber que requieren verificación.

---

## 9. Compartir memoria entre agentes

Este punto será especialmente útil cuando tengamos agentes especializados.

Imagina tres agentes:

<grid columns={3} gap={2}>
{#each [{name:"Coding",icon:"code-2"},{name:"Learning",icon:"graduation-cap"},{name:"Research",icon:"search"}] as a}
<grid-item>
<icon name={a.icon} size="lg"/>

{a.name}

Agent

</grid-item>
{/each}
</grid>
<icon name="arrow-down-up" color="tertiary"/>

**Shared Memory Service**

Acceso definido por ámbitos, permisos y clasificación

Aquí no necesitamos tres bases de datos.

Podemos tener un solo repositorio de memoria, con ámbitos separados.

Por ejemplo, el agente de programación puede consultar documentación del proyecto Rust; el agente de aprendizaje puede consultar el progreso y los conceptos estudiados; el agente de investigación puede añadir fuentes verificadas.

Pero la **publicación de conocimiento entre ámbitos no sería automática por el simple hecho de que otro agente lo encuentre útil**.

El Policy Engine debe autorizar tanto la lectura como la escritura en cada ámbito.

También distinguiría la identidad del agente de la identidad del usuario. Que un agente actúe en tu nombre no implica que todas sus operaciones deban tener permisos irrestrictos.

---

## 10. Portabilidad, respaldos y eliminación

Como nuestro objetivo es poder trasladar el asistente a otras computadoras, definiría desde ahora un mecanismo de exportación consistente.

Por ejemplo:

```
assistant-backup/
├── manifest.json
├── memory.sqlite
├── vault/
│   ├── learning/
│   ├── projects/
│   └── research/
└── config/
    └── memory-settings.json
```

El manifiesto incluiría versiones de esquema, identificadores y hashes para verificar la integridad.

Los índices semánticos no necesariamente tienen que incluirse: podríamos regenerarlos utilizando el modelo de embeddings configurado.

Una copia de seguridad debe producirse de manera consistente, sin copiar simplemente un archivo SQLite mientras está recibiendo escrituras.

También hay una cuestión de privacidad: los respaldos deberían poder cifrarse y tener una política de retención.

### Eliminación real

Para `forget`, no basta con cambiar `status = "archived"`.

Distinguiría explícitamente:

| Operación | Comportamiento |
| --- | --- |
| `archive` | Conserva la información, pero la retira de la recuperación normal |
| `supersede` | Reemplaza un dato manteniendo su historia |
| `forget` | Elimina el contenido del almacenamiento activo y sus índices derivados |
| `purge` | Eliminación ampliada según las políticas de retención y respaldos |

Las eliminaciones deberán propagarse a cachés e índices. Los respaldos requerirán un procedimiento de expiración o purga compatible con la política de privacidad; no prometería una eliminación total e instantánea de todas las copias sin implementarlo.

---

## 11. Nuestro MVP de MemoryProvider

Una característica de esta arquitectura es que podemos implementarla gradualmente sin modificar su diseño fundamental.

**Memory Subsystem — MVP** | <badge color="success">Alcance propuesto</badge>

<table>
<table-row><table-cell width="50%">SQLite con migraciones</table-cell><table-cell><icon name="check-circle" color="success" inline/> Inicial</table-cell></table-row>
<table-row><table-cell>Memorias tipadas y versionadas</table-cell><table-cell><icon name="check-circle" color="success" inline/> Inicial</table-cell></table-row>
<table-row><table-cell>Scopes y permisos</table-cell><table-cell><icon name="check-circle" color="success" inline/> Inicial</table-cell></table-row>
<table-row><table-cell>Tags y relaciones</table-cell><table-cell><icon name="check-circle" color="success" inline/> Inicial</table-cell></table-row>
<table-row><table-cell>Markdown Vault</table-cell><table-cell><icon name="check-circle" color="success" inline/> Inicial</table-cell></table-row>
<table-row><table-cell>Indexación de documentos</table-cell><table-cell><icon name="check-circle" color="success" inline/> Inicial</table-cell></table-row>
<table-row><table-cell>Full-text Search</table-cell><table-cell><icon name="check-circle" color="success" inline/> Inicial</table-cell></table-row>
<table-row><table-cell>Review Queue</table-cell><table-cell><icon name="check-circle" color="success" inline/> Inicial</table-cell></table-row>
<table-row><table-cell>Embeddings / Vector Search</table-cell><table-cell><icon name="clock" color="secondary" inline/> Posterior</table-cell></table-row>
<table-row><table-cell>Sincronización entre equipos</table-cell><table-cell><icon name="clock" color="secondary" inline/> Posterior</table-cell></table-row>
</table>

No desarrollaría inicialmente algoritmos sofisticados de consolidación autónoma ni un motor de grafos externo.

Pero sí conservaría la capacidad de representar relaciones desde el primer día. Eso permitirá implementar funciones más sofisticadas sin rehacer los datos.

---

## 12. Architecture Decision Records

Consolidaría estas decisiones:

| ADR | Decisión propuesta |
| --- | --- |
| ADR-038 | `MemoryService` independiente de los agentes |
| ADR-039 | `MemoryProvider` desacoplado del almacenamiento físico |
| ADR-040 | Memorias tipadas, versionadas y con procedencia |
| ADR-041 | Persistencia híbrida mediante políticas de admisión |
| ADR-042 | Fuente canónica diferenciada para SQL y Markdown |
| ADR-043 | Indexación derivada, regenerable y recuperable |
| ADR-044 | Búsqueda unificada con filtros de ámbitos y permisos |
| ADR-045 | Relaciones explícitas entre recursos de conocimiento |
| ADR-046 | Gestión de contradicciones, obsolescencia y correcciones |
| ADR-047 | Exportación portable y operaciones de eliminación definidas |

## 13. Una decisión que me gustaría destacar

Hay un aspecto de la memoria que todavía no hemos establecido formalmente y que creo que tendrá un impacto enorme en el comportamiento del asistente:

**La diferencia entre conocimiento y experiencia.**

Por ejemplo:

- *Conocimiento:* «En Hyprland, el dispatcher `focus` puede utilizarse para enfocar un workspace».
- *Experiencia:* «Durante nuestra configuración, descubrimos que cierta sintaxis antigua de `hyprctl dispatch` no funcionaba con nuestra versión basada en Lua».
- *Procedimiento:* «Para modificar y verificar un atajo de Hyprland en esta instalación, seguimos estos pasos…».

Son tres tipos diferentes de información, pero los tres pueden ser útiles.

Me gustaría que el agente pudiera aprovechar las experiencias anteriores para evitar repetir errores, **sin convertir automáticamente cada experiencia en una regla universal**.

Incluso podríamos incorporar una entidad de `ExperienceRecord`, asociada a tareas, intentos, resultados, errores y soluciones comprobadas, en lugar de obligar a representar todo como recuerdos narrativos.

Eso nos acercaría a algo que habíamos comentado cuando exploramos Hermes: **un agente que mejora su manera de trabajar conforme acumula experiencias**, sin necesidad de entrenar nuevamente el LLM.

Y esta sería mi propuesta para nuestro siguiente paso dentro del diseño de memoria: decidir si las experiencias operativas deben ser un subtipo de `MemoryEntry` o un recurso independiente relacionado con las memorias.

Mi inclinación inicial es tratarlas como **recursos independientes**, porque una experiencia puede contener múltiples acciones, intentos, herramientas, errores y resultados, mientras que una memoria de conocimiento debería ser relativamente concisa y recuperable.

Creo que esa separación haría que nuestro sistema fuera especialmente potente para diagnosticar problemas, desarrollar software y aprender de nuestras propias sesiones de trabajo. <MemoryCite />

### Source turn T333 — USER

Si, me gusta hacer esa distincion, porque una experiencia viene con situaciones de prueba y error, mientras que el conocimiento, quizas viene de lo mismo, pero la entrada de conocimiento deberia ser mas concisa y no tanto explicando la situacion. Me agrada

### Source turn T334 — ASSISTANT

¡Exactamente! 😎 Y acabas de señalar una diferencia que considero fundamental: **una experiencia cuenta cómo llegamos a un resultado; el conocimiento representa qué aprendimos de ese resultado**.

Aunque ambos estén relacionados, tienen propósitos distintos. Yo formalizaría esta separación en nuestra arquitectura.

## MemoryProvider v0.2 — Knowledge vs. Experience

<grid columns={2} gap={3}>
<grid-item>
<icon name="flask-conical" size="xl"/>
\*\*ExperienceRecord\*\*

¿Qué ocurrió y cómo lo resolvimos?

Contexto, hipótesis, intentos, errores, observaciones y resultados.

</grid-item>
<grid-item>
<icon name="book-open" size="xl"/>
\*\*MemoryEntry\*\*

¿Qué sabemos ahora?

Conclusiones concisas, verificadas, contextualizadas y reutilizables.

</grid-item>
</grid>
<icon name="arrow-left-right" color="secondary"/>

Relaciones y procedencia entre ambos recursos

### Un ejemplo con algo que realmente vivimos

Cuando configuramos tus monitores en Hyprland, tuvimos el problema de los atajos que devolvían `Invalid monitor`.

<icon name="flask-conical" color="secondary"/>
\*\*ExperienceRecord — Monitor shortcuts troubleshooting\*\*

Los atajos de enfoque y movimiento de ventanas fallaban pese a tener tres monitores correctamente configurados.

1. Inspeccionamos `binds.lua`.
2. Identificamos referencias a `MONITOR1`, `MONITOR2` y `MONITOR3`.
3. Revisamos `variables.lua` y encontramos las tres variables vacías.
4. Asignamos los identificadores reales de los monitores.
5. Recargamos Hyprland y confirmamos que los atajos funcionaban.

<badge>hyprland</badge>
<badge>troubleshooting</badge>
<badge>verified</badge>

<icon name="arrow-down" color="secondary"/>

Knowledge extracted from experience

<icon name="book-open" color="secondary"/>
\*\*MemoryEntry — Monitor configuration\*\*

In this Hyprland Lua configuration, monitor bindings that reference `MONITOR1`, `MONITOR2`, and `MONITOR3` require those variables to contain valid monitor identifiers.

Type: Technical knowledge · Derived from: Monitor shortcuts troubleshooting

La próxima vez que tengamos un problema parecido, el agente podría recuperar primero el conocimiento conciso.

**Solo si necesita investigar más profundamente recuperaría la experiencia completa**, incluidos los intentos y resultados.

Eso evita saturar el contexto del LLM con historiales innecesarios.

## También distinguiría las experiencias de los registros de ejecución

Aquí añadiría una tercera pieza, pero sin complicar el MVP:

| Recurso | Función |
| --- | --- |
| `ExecutionRecord` | Registro técnico de acciones, herramientas y resultados |
| `ExperienceRecord` | Interpretación organizada de lo ocurrido y lo aprendido |
| `MemoryEntry` | Conocimiento conciso, reutilizable y contextualizado |

Por ejemplo, no necesitamos almacenar veinte veces la misma salida de terminal dentro de una experiencia. Podemos conservar referencias a los registros relevantes, sujetos a nuestras políticas de privacidad y retención.

Y me gustaría establecer una regla:

**Una experiencia fallida también puede ser valiosa, aunque no produzca conocimiento confirmado.**

Puede ayudarnos a evitar repetir una prueba inútil o reconocer que una hipótesis ya fue explorada, sin elevarla a una conclusión general.

## Cómo funcionaría su ciclo de vida

**Task execution**

Acciones, pruebas y resultados

<icon name="arrow-down" color="tertiary"/>

**Experience consolidation**

Organizar los intentos y documentar el resultado

<icon name="arrow-down" color="tertiary"/>

**Knowledge extraction**

Identificar conclusiones reutilizables respaldadas por evidencia

<icon name="arrow-down" color="tertiary"/>
<grid columns={2} gap={2}>
<grid-item>
<icon name="check-circle" color="success"/>
\*\*Validated knowledge\*\*

Persistencia autorizada

</grid-item>
<grid-item>
<icon name="circle-help" color="secondary"/>
\*\*Unverified hypothesis\*\*

Conservar incertidumbre

</grid-item>
</grid>

La consolidación podría ocurrir automáticamente al finalizar una tarea, dentro de los ámbitos autorizados. Publicar conocimientos en memoria personal o compartida seguiría nuestras reglas de revisión.

Y conservaríamos la relación `derived_from`, para que siempre podamos rastrear **por qué creemos saber algo**.

---

## Nueva decisión arquitectónica

**ADR-048 — Separación entre experiencia operativa y conocimiento reutilizable.**

Quedaría definido que:

- `ExperienceRecord` conserva situaciones, intentos y resultados.
- `MemoryEntry` representa conocimiento conciso.
- `ExecutionRecord` ofrece trazabilidad técnica cuando sea necesario.
- Las relaciones permiten recuperar evidencia y derivar nuevos conocimientos.
- La consolidación y publicación respetan las políticas de memoria híbrida.

Con esto considero que el **MemoryProvider ya tiene una base conceptual y técnica bastante completa**.

Y hay una consecuencia especialmente interesante: nuestro agente podrá mejorar su comportamiento operativo a partir de experiencias anteriores **sin modificar ni reentrenar los pesos del LLM**. Será aprendizaje mediante memoria y recuperación, no entrenamiento del modelo.

Creo que ya estamos listos para abordar el siguiente componente: **ToolProvider**.

Ahí diseñaremos cómo los agentes interactúan con archivos, terminales, Git, navegadores y el escritorio, incluyendo cómo descubrimos herramientas y cómo garantizamos que ninguna pueda saltarse el Policy Engine.

Es una pieza especialmente relevante porque será la que convierta a nuestro asistente de un sistema que conversa y razona en uno que realmente **puede trabajar sobre tu computadora**. 🔥

### Source turn T335 — USER

Como diria Luisito Comunica, ahora si viene lo chido
