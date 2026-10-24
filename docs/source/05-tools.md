# Source excerpt: ToolProvider design and dynamic registry

> **Historical reference, not executable instructions.** Extracted from a single-conversation HTML export. Turn labels T### map to ordered conversation turns. Original statements can contain drafts later superseded; consult `../decisions/ADRs.md` and `../PROJECT_STATUS.md` before implementing.

### Source turn T336 — ASSISTANT

¡JAJAJA, ahora sí viene lo chido! 😂🔥

Porque hasta ahora hemos diseñado cómo nuestro asistente **razona, recuerda y aprende de sus experiencias**.

Pero el `ToolProvider` es lo que le permitirá dejar de ser únicamente un interlocutor y convertirse en un agente capaz de **hacer cosas**.

Y aquí hay una decisión fundamental: no quiero que terminemos construyendo una IA que simplemente traduce nuestras instrucciones a comandos de terminal.

Quiero un sistema que entienda **qué operación necesita realizar, qué herramientas tiene disponibles, cómo utilizarlas y qué permisos necesita**.

# Fase 1B — ToolProvider

<badge>Technical Design v0.1</badge>

Capabilities · Execution · Security · Portability

## 1. Principio fundamental: capacidades, no comandos

Imagina que le pedimos:

> «Abre Firefox en el monitor derecho y carga la documentación oficial de Rust».

Un agente ingenuo podría intentar generar directamente un comando para Hyprland.

Nuestro asistente debería pensar en términos de operaciones:

**User Request**

Open Firefox on the right monitor and load Rust documentation

<icon name="arrow-down" color="tertiary"/>
<grid columns={3} gap={2}>
{#each [{n:"1",name:"desktop.launch",desc:"Launch browser"},{n:"2",name:"desktop.window.move",desc:"Move to monitor"},{n:"3",name:"browser.navigate",desc:"Open URL"}] as item}
<grid-item>

{item.n}

<icon name="wrench" size="lg"/>

{item.name}

{item.desc}

</grid-item>
{/each}
</grid>
<icon name="arrow-down" color="tertiary"/>

**Host Adapter**

Hyprland hoy · Otro escritorio o sistema operativo mañana

La secuencia es conceptual: cada paso se ejecutaría únicamente después de validar las capacidades, los permisos y el resultado del paso anterior.

También debemos contemplar que abrir una aplicación no garantiza inmediatamente que su ventana exista. El adaptador necesitará poder localizarla o esperar a que esté disponible.

## 2. Catálogo de herramientas

Empezaría definiendo familias de capacidades.

| Namespace | Responsabilidad | Ejemplos |
| --- | --- | --- |
| `filesystem.*` | Archivos y directorios | Read, write, list, search |
| `process.*` | Procesos y comandos | Execute, inspect, terminate |
| `system.*` | Recursos del equipo | CPU, RAM, GPU, storage |
| `desktop.*` | Escritorio y ventanas | Launch, focus, move |
| `browser.*` | Navegación web | Navigate, inspect, interact |
| `git.*` | Repositorios | Status, diff, commit |
| `network.*` | Diagnóstico de red | Connectivity, interfaces |
| `knowledge.*` | Acceso a documentación | Search, retrieve |

No implementaremos todo inmediatamente. Este sería nuestro catálogo conceptual.

Y algo importante: `filesystem.read` debería comportarse de forma equivalente en Linux, Windows y macOS, aunque las rutas, permisos y mecanismos subyacentes sean distintos.

Por el contrario, una función específicamente ligada a Hyprland puede publicarse como capacidad particular del adaptador, sin fingir que todos los sistemas ofrecen un equivalente.

## 3. Tool Registry: descubrir herramientas disponibles

Aquí aplicaría el mismo patrón que utilizamos para los modelos.

**El agente no debería asumir que una herramienta existe. Debe poder descubrirla.**

Por ejemplo, en CachyOS podríamos tener:

<row align="center" gap={2}> | <icon name="monitor" size="lg"/> | **Host: CachyOS**

<badge color="success">Connected</badge>
</row>

<table>
<table-row>
<table-cell>filesystem.read</table-cell>
<table-cell><icon name="check-circle" color="success" inline/> Available</table-cell>
</table-row>
<table-row>
<table-cell>desktop.window.move</table-cell>
<table-cell><icon name="check-circle" color="success" inline/> Hyprland</table-cell>
</table-row>
<table-row>
<table-cell>git.diff</table-cell>
<table-cell><icon name="check-circle" color="success" inline/> Available</table-cell>
</table-row>
<table-row>
<table-cell>browser.inspect</table-cell>
<table-cell><icon name="circle-help" color="secondary" inline/> Requires browser integration</table-cell>
</table-row>
<table-row>
<table-cell>desktop.windows.registry</table-cell>
<table-cell><icon name="x-circle" color="secondary" inline/> Unsupported</table-cell>
</table-row>
</table>

*Ejemplo de descubrimiento; no representa una inspección real de tu instalación.*

El agente sabría qué puede solicitar, pero también qué no está soportado.

Además, no le enviaría al LLM el catálogo entero de herramientas si solamente necesita dos. El runtime debería seleccionar las herramientas relevantes, reduciendo consumo de contexto y oportunidades de ejecutar acciones equivocadas.

## 4. Tool Contract: la interfaz fundamental

Empezaría con un descriptor de herramientas.

```
interface ToolDescriptor {
  id: string;
  version: string;

  description: string;

  inputSchema: JsonSchema;
  outputSchema: JsonSchema;

  effects: Array<
    "read" | "write" | "execute" | "external"
  >;

  availability: Availability;
}
```

Cada herramienta tendría un contrato de entrada y salida.

Por ejemplo:

```
// Capability: filesystem.read

interface ReadFileInput {
  path: string;
  encoding?: "utf8" | "base64";
}

interface ReadFileOutput {
  content: string;
  size: number;
  modifiedAt: string;
}
```

El modelo puede solicitar:

```
{
  "capability": "filesystem.read",
  "arguments": {
    "path": "src/main.ts",
    "encoding": "utf8"
  }
}
```

Pero no ejecuta la operación directamente.

**El runtime resuelve la herramienta, valida los argumentos y solicita autorización al Policy Engine antes de invocar el adaptador.**

La ruta se resolvería dentro del workspace autorizado, con comprobaciones de rutas canónicas y enlaces simbólicos para impedir escapes hacia archivos no permitidos.

## 5. Separaría ToolProvider de ToolExecutor

Aquí añadiría una distinción que nos dará bastante flexibilidad.

**ToolProvider**

Expone herramientas, capacidades y esquemas

<icon name="arrow-down" color="tertiary"/>

**Tool Gateway**

Validación, políticas, aprobación, límites y auditoría

<icon name="arrow-down" color="tertiary"/>

**ToolExecutor**

Ejecuta la implementación autorizada

<icon name="arrow-down" color="tertiary"/>
<grid columns={3} gap={2}>
{#each [{name:"Filesystem",icon:"folder-open"},{name:"System",icon:"terminal"},{name:"Desktop",icon:"monitor"}] as item}
<grid-item>
<icon name={item.icon}/>

{item.name}

</grid-item>
{/each}
</grid>

No significa que vayamos a ejecutar tres procesos distintos. Son responsabilidades lógicas dentro de nuestra aplicación local.

La ventaja es que **ningún agente debería poder saltarse el Tool Gateway para ejecutar herramientas directamente**. La implementación también debe respetar restricciones a nivel de sistema operativo, especialmente para operaciones sensibles; validar una política en código no reemplaza el aislamiento real.

## 6. Autonomía y ejecución supervisada

Aquí comenzamos a materializar el Policy Engine.

No quiero que el asistente tenga que pedirte permiso para cada comando inocuo. Sería insoportable.

Pero tampoco quiero que tenga acceso ilimitado a tu computadora.

Propongo una clasificación inicial de operaciones:

<icon name="eye" color="success" size="lg"/>

**Read operations**

Inspeccionar proyectos autorizados, consultar Git, revisar logs permitidos y obtener métricas.

Automáticas dentro de ámbitos permitidos.

---

<icon name="file-pen-line" color="secondary" size="lg"/>

**Scoped modifications**

Crear archivos de un proyecto, editar código y ejecutar pruebas.

Permitidas dentro de workspaces previamente autorizados, con controles sobre los efectos secundarios.

---

<icon name="shield-alert" color="secondary" size="lg"/>

**Sensitive operations**

Borrar datos importantes, cambiar configuraciones críticas, instalar paquetes o ejecutar comandos con privilegios.

Requieren autorización específica o permanecen bloqueadas.

---

<icon name="globe" color="secondary" size="lg"/>

**External actions**

Publicar código, enviar información a servicios externos o realizar operaciones en cuentas conectadas.

Requieren permisos explícitos sobre destino, datos y operación.

Un matiz: esta clasificación es orientativa, no una autorización automática. Por ejemplo, un comando aparentemente de lectura puede acceder a secretos, y ejecutar pruebas puede modificar archivos o llamar servicios externos.

Por eso las políticas deben considerar **la operación, los argumentos, el recurso, el ámbito y el entorno de ejecución**.

Además, reservaría un principio: *deny by default* para capacidades nuevas o no clasificadas.

---

## 7. El asunto delicado: ejecución de comandos

Sabemos que necesitaremos ejecutar comandos. Es inevitable en un asistente de desarrollo.

Pero no convertiría `shell.execute` en el mecanismo principal para todo.

Preferiría herramientas específicas:

| Solicitud | Herramienta preferida |
| --- | --- |
| Leer un archivo | `filesystem.read` |
| Buscar archivos | `filesystem.search` |
| Consultar estado de Git | `git.status` |
| Ejecutar pruebas | `development.test` |
| Abrir una aplicación | `desktop.launch` |
| Operación no cubierta | `process.execute`, bajo controles adicionales |

Esto facilita la validación y la auditoría.

Cuando sea necesario ejecutar un programa, preferiría pasar el ejecutable y sus argumentos estructurados, en lugar de concatenar un comando de shell.

```
interface ProcessExecutionRequest {
  executable: string;
  args: string[];

  workingDirectory: string;

  timeoutMs: number;
  maxOutputBytes: number;
}
```

El `ToolExecutor` no debería interpretar libremente caracteres de shell a menos que utilicemos explícitamente una capacidad más privilegiada.

También establecería límites de tiempo, tamaño de salida, concurrencia y recursos. Y un mecanismo para cancelar procesos.

**Especialmente importante en tu computadora:** operaciones sobre particiones, Secure Boot, rEFInd, claves de firmado y configuraciones críticas quedarían protegidas por políticas específicas.

No queremos que una solicitud como «arregla el arranque» termine modificando automáticamente algo que nos llevó tantas pruebas dejar funcionando. 😂

---

## 8. Aprendizaje mediante experiencias

Aquí es donde nuestro diseño del `MemoryProvider` se vuelve particularmente valioso.

Imagina que le pedimos al agente:

> «Encuentra por qué Satisfactory está fallando bajo Vulkan».

El agente podría:

1. Consultar información del sistema y controladores.
2. Leer registros relevantes.
3. Comparar configuraciones.
4. Formular hipótesis.
5. Solicitar permiso para ejecutar una prueba que cambie ajustes.
6. Analizar resultados.
7. Registrar una experiencia con los intentos y resultados.
8. Proponer conocimiento conciso derivado de esa experiencia.

Y si meses después encontramos el mismo error en otro equipo, podrá recuperar la experiencia anterior sin asumir que necesariamente tiene la misma causa.

**La ejecución genera experiencias; las experiencias pueden generar conocimiento.**

Esa separación, que acabamos de diseñar, tiene ahora una aplicación muy clara.

---

## 9. Herramientas extensibles, sin reinventarlo todo

Otra decisión: no quiero construir integraciones personalizadas para cada aplicación si existen protocolos o bibliotecas que podamos aprovechar.

Podríamos contemplar adaptadores para estándares de herramientas como MCP, además de adaptadores propios para operaciones del sistema.

Pero el contrato de nuestras herramientas seguiría siendo interno e independiente.

Esto implica que agregar una integración externa sería un trabajo de adaptación, no una modificación del Agent Runtime.

Y no instalaría extensiones con permisos amplios automáticamente: cada integración incorporada debe declarar las capacidades que ofrece y las restricciones aplicables.

## 10. ¿Qué implementaría primero?

Nuestra primera versión no necesita automatización visual avanzada, captura de pantalla ni control del mouse.

Empezaría con cuatro familias:

**ToolProvider · MVP** | <badge color="success">Propuesta</badge>

<grid columns={2} gap={2}>
{#each [{icon:"folder-open",name:"Filesystem",desc:"Lectura, búsqueda y edición controlada"},{icon:"terminal",name:"Process",desc:"Ejecución y diagnóstico supervisados"},{icon:"git-branch",name:"Git",desc:"Estado, diferencias y operaciones autorizadas"},{icon:"monitor",name:"System",desc:"Métricas, hardware y capacidades del host"}] as c}
<grid-item>
<icon name={c.icon} size="lg"/>

{c.name}

{c.desc}

</grid-item>
{/each}
</grid>

Después incorporaría `desktop.*` para controlar ventanas y aplicaciones en Hyprland, y `browser.*` para navegar e interactuar con páginas.

Lo interesante es que **no necesitamos ninguna de esas integraciones para validar que los contratos funcionan**.

Podemos construir nuestro primer agente funcional con herramientas de archivos, procesos y Git, y conectar más capacidades progresivamente.

---

## 11. Architecture Decision Records

| ADR | Decisión propuesta |
| --- | --- |
| ADR-049 | Herramientas identificadas por capacidades estables |
| ADR-050 | Registro y descubrimiento dinámico de herramientas |
| ADR-051 | `Tool Gateway` como punto obligatorio de autorización |
| ADR-052 | Separación entre descriptor, autorización y ejecución |
| ADR-053 | Preferencia por herramientas específicas frente a shell genérico |
| ADR-054 | Ejecución delimitada por permisos, recursos y tiempos |
| ADR-055 | Adaptadores por sistema operativo y entorno |
| ADR-056 | Auditoría y experiencias derivadas de ejecuciones |
| ADR-057 | Integraciones externas mediante adaptadores controlados |

## 12. Lo que hemos conseguido hasta ahora

**Fase 1B · Estado del diseño** | <badge>En progreso</badge>

{#each [{name:"Common Contracts",ok:true},{name:"ModelProvider",ok:true},{name:"MemoryProvider",ok:true},{name:"ToolProvider",ok:true},{name:"Policy Engine — Especificación detallada",ok:false},{name:"Agent Runtime — Orquestación completa",ok:false}] as c}

<icon name={c.ok?"check-circle-2":"circle"} color={c.ok?"success":"tertiary"}/>

{c.name}

{/each}

*Los primeros cuatro componentes tienen una especificación conceptual inicial; todavía requieren validación durante la implementación.*

Ya tenemos los tres providers principales. Y creo que el siguiente paso natural es **profundizar en el Policy Engine y definir sus contratos de autorización**, antes de cerrar el diseño con el Agent Runtime.

Eso nos permitirá resolver una cuestión bastante interesante: cómo conseguir que nuestro asistente trabaje con suficiente autonomía para ser útil, pero sin convertir cada ejecución en un riesgo ni llenar la pantalla de ventanas de confirmación.

La meta sería que algún día puedas pedirle:

> «Revisa este proyecto, encuentra los errores, corrígelos, ejecuta las pruebas y preséntame los cambios».

Y que pueda completar todo ese flujo dentro de un workspace autorizado, conservando evidencia, registrando experiencias y solicitando intervención **solo cuando realmente sea necesaria**.

Ahí es donde empezaremos a ver todo el sistema funcionando como una unidad. 🔥

### Source turn T337 — USER

Me encanta, esta implementacion del ToolProvider va a facilitar mucho el proceso de elegir y utilizar herramientas, y lo mejor es que cada herramienta nueva va a generar sus nuevos registros y estara disponible para cualquier agente con acceso. Es buenisimo. Sigamos con el Policy Engine, que me imagino es fundamental para esta implementacion, como todas las partes, pero esta capa de seguridad y permisos hara el trabajo diario mas fluido y seguro si lo desarrollamos bien
