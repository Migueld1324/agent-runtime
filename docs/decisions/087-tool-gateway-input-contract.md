# ADR-087 — Validación extensible de entradas del Tool Gateway

**Estado:** Incremento 1 aprobado arquitectónicamente y autorizado para implementación por confirmación explícita del responsable del proyecto del 28-10-2026, comunicada fuera del repositorio; implementación autorizada después de integrar el PR #9 en un PR independiente. El Incremento 2 no está autorizado. Procedencia y alcance en el [registro de aprobación](087-increment-1-approval.md).
**Base contrastada:** `ab22823` de `origin/main`, con ADR-086 y su documentación de cierre integradas.  
**Relación:** concreta ADR-021/049–052/068–072 y conserva las fronteras de autorización y recuperación de ADR-085/086.

**Antecedente de inspección — 27-10-2026:** en `main` `a0af08d` no se localizó aprobación arquitectónica documentada de esta ADR. Se preparó el registro y no se inició implementación. La confirmación externa del 28-10-2026 resuelve ese vacío documental: el Incremento 1 no requiere nueva ratificación y comenzará en un PR independiente después de integrar el PR #9.

El cuerpo conserva la redacción técnica de la propuesta revisada y sus criterios de aceptación. El estado vigente anterior aprueba únicamente el Incremento 1; las referencias a migración y mantenimiento no autorizan el Incremento 2 ni operaciones sobre datos reales.

## Problema y resultado buscado

Hoy `src/v2/tools.ts` decide los campos y tipos aceptados mediante ramas por adaptador. `src/v3/tool-schema.ts` vuelve a describirlos para los proveedores. El esquema de escritura anunciado solo exige dos strings; la ejecución exige además nombre seguro, contenido no vacío y un máximo de 16 KiB. Un cambio puede actualizar una representación y dejar otra desfasada.

Se propone una fuente común para la estructura de los argumentos: `inputSchema`. El registro valida el descriptor; el Gateway valida cada propuesta con ese esquema y con las restricciones confiables del adaptador. El proveedor recibe el mismo esquema estructural. Pasar el esquema no autoriza efectos ni demuestra que el recurso sea seguro o esté disponible.

Ejemplo: una transformación restringida a `uppercase` anuncia y acepta únicamente ese valor. Si el modelo propone `lowercase`, el run falla antes de solicitar aprobación, reclamar una invocación o ejecutar. Una escritura con nombre `../secreto.md` sigue bloqueada por el adaptador aunque ambos argumentos sean strings.

## Alternativas

| Alternativa | Ventaja | Coste / motivo para no elegirla |
|---|---|---|
| Mantener validadores manuales y generar solo el esquema del proveedor | Cambio pequeño | La admisión de nuevos contratos sigue dependiendo de ramas de validación particulares |
| Implementar un intérprete propio de JSON Schema | Control local, sin dependencia | Añade semántica y mantenimiento de un estándar al runtime |
| Perfil limitado de JSON Schema con validador establecido | Una representación estructural y validación reutilizable | Añade dependencia y exige restringir los esquemas admitidos |

**Recomendación:** la tercera alternativa, con Ajv, compilación local y un perfil deliberadamente pequeño. La versión concreta se fijará y validará en el lockfile durante la implementación; no se añade ninguna dependencia en esta propuesta.

## Descriptor propuesto y perfil inicial

Se distinguen la versión del formato del descriptor y la versión de la herramienta. Los descriptores actuales sin `descriptorVersion` son legado v1; no se les añade un campo antes de calcular su huella histórica.

Ejemplo de manifiesto nuevo:

```json
{
  "descriptorVersion": 2,
  "id": "text.uppercase",
  "version": "1.0.0",
  "description": "Convert text to uppercase",
  "adapter": "builtin.text.transform",
  "effects": ["read"],
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "input": {"type": "string", "minLength": 1, "maxLength": 1024},
      "operation": {"type": "string", "enum": ["uppercase"]}
    },
    "required": ["input", "operation"]
  }
}
```

`descriptorVersion: 2` fija el perfil `tool-input/1`, con semántica JSON Schema draft-07. No se acepta seleccionar otro dialecto mediante el manifiesto. Todos los campos del ejemplo son obligatorios; los campos desconocidos del descriptor se rechazan. `operations` pertenece exclusivamente al formato legado: en v2 la lista se obtiene de `inputSchema.properties.operation.enum`.

El perfil inicial admite:

- Un objeto raíz con `type`, `properties`, `required` y `additionalProperties: false`; opcionalmente `description` de hasta 300 caracteres.
- Entre 1 y 16 propiedades, todas obligatorias y de tipo string. Nombres ASCII de hasta 64 caracteres, patrón `^[a-z][a-zA-Z0-9_]*$`; se excluyen `constructor` y `prototype`.
- En cada propiedad: `type: "string"`, `description` opcional, `minLength`, `maxLength` y `enum` opcionales. Las longitudes son enteros no negativos, consistentes y como máximo 65.536. `enum`, si aparece, contiene entre 1 y 32 strings distintos, de hasta 2.048 caracteres y compatibles con las longitudes declaradas.
- `required` contiene exactamente los nombres declarados, sin duplicados. No hay valores opcionales o implícitos en este corte.
- Límite de 8.192 bytes UTF-8 por manifiesto, aplicado también al cargar el registro, antes de parsear o compilar. La forma plana y los límites anteriores acotan el tamaño del esquema.

Se rechaza cualquier palabra clave ajena al perfil, incluidas `$ref`, `$id`, `$schema`, `default`, `format`, `pattern`, combinadores, objetos anidados y arrays como valores de argumentos. No se descargan esquemas ni se ejecutan validadores aportados por el manifiesto. Ampliar tipos o palabras clave requiere versionar el perfil y sus pruebas.

Los límites de JSON Schema para strings no sustituyen límites de bytes ni la semántica histórica de JavaScript. La transformación conserva además el máximo actual de 2.048 unidades UTF-16 (`input.length`); la escritura conserva 16.384 bytes UTF-8 y contenido no vacío según `trim()`. Así, introducir el validador no amplía silenciosamente las entradas aceptadas. Referencia: [JSON Schema: strings](https://json-schema.org/understanding-json-schema/reference/string).

### Invariante de no ampliación y coste del perfil v2

Para cada descriptor v2 admitido y sus operaciones declaradas, se exige `SchemaV2(args) => EntradaLegada(args)`: todo argumento aceptado por el esquema debe satisfacer las restricciones puras de entrada del adaptador legado equivalente. Por separado, `GatewayV2(args) = SchemaV2(args) AND ControlesAdaptador(args) AND Policy(args)`. La primera propiedad no se demuestra dejando que el adaptador rechace posteriormente un valor que el esquema anunció como válido. Tampoco equivale a garantizar permisos, existencia de archivos o éxito de ejecución.

En transformación, `maxLength: 2048` no cumple esa primera propiedad: Ajv cuenta un par sustituto como un carácter, mientras JavaScript cuenta dos unidades UTF-16. Por ejemplo, `"😀".repeat(1025)` pasa ese schema y excede las 2.048 unidades del adaptador. Para el perfil plano inicial se propone exigir `maxLength <= 1024`, además de `minLength >= 1`: como cada carácter ocupa a lo sumo dos unidades UTF-16, todo string admitido queda dentro del límite legado. Referencia: [Ajv: semántica de strings Unicode](https://github.com/ajv-validator/ajv/blob/master/docs/json-schema.md).

**Coste explícito:** v2 rechazará también entradas ASCII válidas en v1 de 1.025 a 2.048 caracteres. El codec v1 conserva exactamente su comportamiento; no se le aplica este límite nuevo. La previsualización de una migración debe mostrar la reducción y no llamarla equivalencia de entradas. Mantener toda la capacidad histórica en v2 exigiría otro perfil capaz de expresar el límite UTF-16, que se revisaría por separado; no se introduce una extensión silenciosa del estándar.

La propiedad se comprobará contra una referencia congelada del validador legado anterior al refactor, con casos de frontera y generación determinista de strings y esquemas admitidos; la referencia no puede delegar en el validador nuevo. Incluir ASCII, caracteres BMP multibyte, caracteres suplementarios, combinaciones de ambos, marcas combinantes, sustitutos aislados, cadenas vacías y espacios. Probar expresamente 1.024/1.025 caracteres suplementarios, 1.024/1.025 y 2.048/2.049 ASCII, y mezclas alrededor de 2.048 unidades UTF-16. La justificación del límite por unidades respalda la propiedad general; los tests son evidencia de implementación, no una prueba exhaustiva por muestreo.

Filesystem permanece en formato legado en este incremento; su schema estructural no se presenta como prueba de la primera propiedad v2. Se conservan regresiones de contenido vacío/espacios, rutas y 16.383/16.384/16.385 bytes UTF-8, también con caracteres suplementarios. No se admitirá un descriptor filesystem v2 mientras el perfil no pueda expresar todas sus restricciones puras de entrada; los controles del recurso real y de policy siempre seguirán siendo independientes.

## Registro y adaptadores confiables

El registro realiza dos comprobaciones antes de admitir un descriptor: conformidad con el perfil de esquema y compatibilidad con el contrato del adaptador. Validar un esquema como JSON Schema no basta para registrar una herramienta.

| Adaptador actual | Forma admitida | Restricciones que conserva el código confiable |
|---|---|---|
| `builtin.text.transform` | `input` y `operation`; enum no vacío contenido en uppercase/lowercase/titlecase | Efectos exactamente `read`; entrada no vacía de hasta 2.048 unidades UTF-16; operación soportada |
| `builtin.filesystem.read` | `fileName` | ID reservado, nombre Markdown seguro, workspace, archivo regular, rechazo de symlinks y límite de lectura |
| `builtin.filesystem.write` | `fileName` y `content` | ID reservado, nombre seguro, contenido y bytes acotados, escritura sin sobrescritura y aprobación exacta |

Los campos y `required` deben coincidir con la forma del adaptador; un esquema puede restringir longitudes o enums, pero nunca habilitar operaciones o campos que este no soporta. Para transformación v2 se exige `minLength` de input al menos 1 y `maxLength` como máximo 1.024, por la garantía UTF-16 anterior. Los built-ins de filesystem siguen definidos por código y en formato legado, no reemplazables mediante un manifiesto externo.

La primera implementación admite nuevas variantes de los adaptadores confiables existentes. Incorporar otro adaptador todavía requiere código revisado que declare su contrato, efectos y comprobaciones; registrar un schema no habilita shell, JavaScript, rutas de ejecutables ni URLs. No se incorpora `outputSchema` ni se cambia el resultado string actual.

## Validación y secuencia del Gateway

1. Resolver el descriptor registrado y su huella; rechazar formato, esquema o adaptador desconocidos antes de inferencia o ejecución según el punto de entrada.
2. Al recibir una propuesta, comprobar que sus argumentos son datos JSON con un objeto raíz y propiedades propias; aplicar el esquema compilado y las restricciones del adaptador. No transformar ni completar los argumentos.
3. Vincular la solicitud válida al descriptor y a sus argumentos exactos mediante `requestHash`; después evaluar ámbito, policy y grants.
4. Solicitar aprobación cuando corresponda. Antes del Executor, volver a resolver la herramienta y comprobar huella, argumentos, aprobación exacta y policy, incluida la revocación del grant.
5. Reclamar la invocación durable y ejecutar respetando ADR-086. Los controles sobre archivos reales siguen aplicándose dentro del adaptador. Persistir el resultado antes de grants/checkpoints como hasta ahora.

Ajv se configura explícitamente con `strict: true`, `allErrors: false`, `coerceTypes: false`, `useDefaults: false`, `removeAdditional: false` y `ownProperties: true`. El filtro del perfil se ejecuta antes de compilar. El runtime conserva una copia interna inmutable del descriptor y cachea validadores por formato/huella, nunca solo por capability ID. La compilación no usa carga remota ni extensiones ejecutables del descriptor. Estas opciones evitan coerción, inserción de defaults y eliminación de campos durante la validación; véanse [opciones de Ajv](https://ajv.js.org/options) y [modificación de datos](https://ajv.js.org/guide/modifying-data.html).

`schemaFor` pasa a obtener el esquema estructural de esa representación común. Las restricciones propias del adaptador se comunican en una descripción generada por código confiable; no se afirma que JSON Schema exprese íntegramente la política. Las rutas mock, ChatGPT y APIs comerciales pasan por la misma validación del Gateway. Las diferencias de protocolo no permiten omitir controles; un proveedor incapaz de representar el perfil falla explícitamente, sin cambiar de proveedor ni ampliar el esquema en silencio.

La fachada del runtime sigue siendo la frontera pública de ejecución. Los adaptadores son módulos internos confiables; no se entregan callbacks de ejecución al proveedor. Esta propuesta no convierte la separación de módulos en un sandbox del sistema operativo.

## Errores observables

| Situación | Resultado propuesto |
|---|---|
| Manifiesto o esquema inválido al registrar | Comando rechazado; no se publica descriptor ni se concede permiso |
| Descriptor incompatible o corrupto al cargar | Detener resolución/catálogo con diagnóstico normalizado; no omitirlo silenciosamente ni ejecutar |
| Propuesta inicial con campos extra, tipos, enum o límites inválidos | Run `failed`, `INVALID_ARGUMENT`, fase `model`, sin aprobación ni efecto, conforme ADR-085 |
| Respuesta de aprobación de otro run/hash | Rechazar comando sin consumir la solicitud válida pendiente |
| Descriptor cambiado, grant revocado o policy incumplida tras aprobación | `denied` antes de reclamar el Executor |
| Fallo al compilar o persistir controles necesarios | Detener el comando; nunca interpretar la excepción como validación satisfactoria |

Los errores de validación exponen código, fase y una ruta acotada del campo, sin reproducir el valor ni el objeto crudo de Ajv. No se cambia `RunError` ni se abre una fase de regeneración automática. Un fallo inesperado después de entrar al Executor conserva la clasificación conservadora de ADR-086.

## Huellas, permisos y compatibilidad

**Legado v1:** conservar exactamente la representación y el algoritmo existentes de `descriptorFingerprint` y `requestHash`. El esquema se deriva mediante un codec confiable de compatibilidad y se mantiene fuera del objeto usado para la huella. Esto se aplica también a los built-ins. Se prueban vectores fijos tomados del código anterior; no basta comparar dos funciones nuevas entre sí.

**Descriptor v2:** calcular SHA-256 de `tool-descriptor:v2\n` seguido del JSON canónico del manifiesto validado. La canonicalización ordena recursivamente las claves de objetos por orden de unidades UTF-16, conserva el orden de arrays y usa `JSON.stringify` para strings y números del perfil. No normaliza Unicode ni ordena enums/required. Cualquier diferencia de representación que quede tras esa regla cambia la huella, aunque pudiera ser semánticamente equivalente. Se incluye todo el manifiesto: versión de formato/herramienta, ID, descripción, adaptador, efectos y esquema.

`requestHash` mantiene su envoltura actual `{descriptor, args}` y vincula la nueva huella; no canonicaliza ni modifica los argumentos. El orden de claves de los argumentos conserva la semántica histórica de identidad exacta. Los cambios de esquema, efectos o versión invalidan las aprobaciones y grants asociados a la huella anterior. No se transfieren permisos por inferir que el cambio parece compatible.

Son dos garantías distintas, con dominios de identidad separados:

| Identificador | Garantía | Ejemplo obligatorio de prueba |
|---|---|---|
| `descriptorFingerprint` v2 | Identidad del contrato tras canonicalizar exclusivamente el descriptor | Reordenar claves de `properties` conserva la huella; reordenar `required` o `enum` la cambia |
| `requestHash` | Identidad de la solicitud serializada, vinculada a la huella del descriptor | `{input:"hola", operation:"uppercase"}` y `{operation:"uppercase", input:"hola"}` producen hashes distintos aunque ambos validen |

«Exacta» significa la representación del objeto JSON ya parseado según `JSON.stringify`, no los bytes originales enviados por el proveedor: espacios o escapes equivalentes del texto JSON no se conservan. No se reutiliza el canonicalizador de descriptores sobre los argumentos ni se consideran intercambiables dos aprobaciones por aceptar el mismo conjunto de valores. También se prueba que cambiar valores, normalización Unicode o huella del descriptor cambia `requestHash`, mientras reordenar solo claves del descriptor v2 y mantener los mismos argumentos lo conserva. Son pruebas separadas de las de validación de entradas.

El formato del descriptor es independiente de `stateVersion: 2` del run y del esquema SQLite de ADR-086. Este incremento no necesita cambiar esas versiones mientras sus campos de huella permanezcan opacos y no se altere su significado histórico. Los checkpoints, evidencias e invocaciones existentes no se reescriben ni reciben huellas nuevas retrospectivamente.

## Migración propuesta

La instalación nueva lee v1 y v2; no convierte archivos al consultar, arrancar, recuperar o listar. Los descriptores v1, sus grants y aprobaciones continúan siendo utilizables bajo las comprobaciones anteriores. Los nuevos registros pueden usar v2; una versión desconocida se rechaza.

Para cambiar un descriptor registrado existente al formato v2 se propone una operación administrativa explícita, separada de `recover` y de `migrate` del run:

1. Un modo de previsualización produce el descriptor v2 propuesto, restricciones reducidas, huellas anterior/nueva y grants afectados. No modifica archivos ni permisos. Es informativo: sus comprobaciones se repiten bajo exclusión al aplicar.
2. La aplicación exige la huella anterior esperada, exclusión del runtime y una sesión de mantenimiento impuesta por el sistema operativo conforme al apartado siguiente. En este primer corte se admite solo con todos los runs conocidos terminales: pendientes de aprobación, pausados, recuperables o inciertos bloquean la operación. Si no se puede demostrar el estado por datos ausentes, versiones desconocidas o inconsistencias, se rechaza. La ausencia de procesos antiguos debe estar garantizada durante toda la operación, no solo observada antes de empezar.
3. La sustitución valida y publica un único manifiesto mediante reemplazo atómico local, conserva una copia recuperable del anterior fuera del directorio activo y confirma durabilidad antes de informar éxito. Revalidar la huella esperada bajo exclusión evita sobrescribir cambios concurrentes. Un fallo de persistencia se informa como tal y no habilita efectos.
4. Los grants anteriores permanecen como registro asociado a la huella antigua y no autorizan el descriptor nuevo; el siguiente uso requiere consentimiento nuevo cuando la policy lo exija. No se copian grants ni se cambia su scope. La administración debe poder identificar y revocar registros por huella, también los antiguos, antes de habilitar esta migración.
5. Repetir la migración sobre el descriptor destino idéntico es un no-op. Una combinación inesperada de archivos/huellas tras caída exige diagnóstico; nunca restaurar automáticamente el descriptor antiguo y reactivar sus permisos.

Esta condición conservadora evita diseñar migraciones de invocaciones activas. No impide continuar usando el formato legado ni registrar una capacidad nueva con otro ID. No se migra el formato de los built-ins de filesystem en este corte; siguen usando el codec legado. Una futura migración de esos IDs requiere su propio plan de compatibilidad.

### Exclusión frente a procesos que no cooperan

El lock SQLite de ADR-086 solo coordina los comandos que lo adquieren. Añadir un lockfile, pedir confirmación al operador, revisar `ps`/`lsof` o escribir un marcador de mantenimiento no impide que un CLI antiguo arranque después o escriba con un descriptor ya abierto. Los locks de archivo cooperativos tampoco obligan a otro proceso a participar; véase [Linux: locks advisory](https://www.man7.org/linux/man-pages/man2/flock.2.html).

**Decisión propuesta para este corte:** el comando de aplicación debe rechazar la migración con diagnóstico `maintenance_exclusion_unavailable` en el checkout actual, donde CLI antiguos y nuevos se ejecutan libremente con el usuario propietario de `data/`. No habrá `--force` ni una declaración manual que sustituya esta condición. La previsualización y el primer incremento de validación siguen disponibles. No se considera implementable la fase 2 completa hasta aprobar y probar un backend de mantenimiento que cumpla el protocolo siguiente.

La referencia operativa propuesta para Linux es una instalación administrada con datos privados de una cuenta de servicio dedicada, un supervisor confiable y cgroup v2 para **todos** los procesos con acceso al almacenamiento, incluidos CLI v1/v2 y administradores de registry/grants. Los procesos del runtime no pueden lanzar trabajo fuera de ese grupo, delegar sus credenciales ni transferir descriptores a procesos externos. El usuario interactivo no puede acceder directamente a esos datos ni ejecutar comandos como esa cuenta. El migrador usa una identidad separada controlada por el supervisor. Un cgroup por sí solo no impone esta frontera de acceso; ambas condiciones son obligatorias. Administradores privilegiados y el supervisor forman parte de la base de confianza.

El backend debe comprobar esas condiciones desde su configuración protegida y los recursos reales del sistema, sin aceptar `maintenance:true` del CLI. El almacenamiento debe haber estado bajo esa frontera durante toda su sesión de uso: aplicar permisos a una carpeta previamente compartida no demuestra que no existan descriptores abiertos fuera del grupo. La incorporación de datos de un checkout no administrado requiere un procedimiento independiente de importación offline verificable; no se habilita con un simple `chmod`.

Protocolo de aplicación, mantenido por el supervisor y no por cooperación de los ejecutores:

1. Cerrar la admisión de cualquier nuevo proceso con acceso a esos datos, incluidos relanzamientos automáticos, antes de inspeccionar runs. Mantener la puerta cerrada mientras dure el mantenimiento y ante caída del migrador/supervisor hasta recuperación explícita.
2. Pedir la terminación de los procesos administrados y de todos sus descendientes. No continuar por el mero hecho de enviar una señal o agotar un timeout. El kernel debe confirmar que el subárbol de ejecución está vacío; en cgroup v2 la evidencia es `cgroup.events: populated=0`, bajo la puerta de admisión cerrada. Si no termina algún proceso, abortar la migración. No presentar una terminación forzada como garantía de que sus operaciones acabaron correctamente. Referencia: [kernel Linux: cgroup v2](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html).
3. Conceder al migrador acceso exclusivo a las identidades de almacenamiento verificadas, adquirir además el lock de ADR-086 y releer los stores v1/v2/v3, grants y registro. Comprobar integridad y terminalidad ahora; la parada puede haber dejado un run incierto, que bloquea la migración igual que cualquier otro no terminal. Los archivos, stores y sus identidades deben corresponder a la instalación completa; visibilidad parcial bloquea la operación.
4. Mantener acceso exclusivo, grupo de ejecución vacío y admisión cerrada hasta terminar publicación, sincronización y registro del resultado. La sesión se vincula a identidades de los stores/directorio, generación de mantenimiento y proceso migrador; un recibo antiguo, otra ruta o un PID reutilizado no permiten aplicarla. La pérdida de sesión detiene nuevas mutaciones y conserva el cierre de admisión para diagnóstico.
5. Solo después de comprobar el estado persistido, cerrar el migrador y su acceso a archivos, liberar el lock y salir explícitamente del mantenimiento. Registrar el resultado y las evidencias acotadas de exclusión; no almacenar secretos. Un fallo tras publicar se diagnostica bajo mantenimiento, sin relanzar procesos ni revertir permisos automáticamente.

La lectura de `populated=0` acredita únicamente el grupo administrado. Su suficiencia depende de la frontera de almacenamiento y de que no se puedan crear procesos nuevos con acceso durante la ventana; no demuestra ausencia global de procesos en el host. Si cualquiera de esas premisas no puede comprobarse, el backend no emite sesión y la aplicación no escribe. En otras plataformas hace falta un backend con garantías equivalentes; no se simula soporte mediante un listado de procesos. Esta dependencia nueva de la fase 2 queda explícita y pendiente de aprobación, no se atribuye al runtime local actual.

## Entrega y criterios de aceptación

La implementación, si se aprueba, se divide en dos incrementos revisables:

1. **Validación común y compatibilidad:** codec v1, descriptor v2 para nuevos registros, perfil/validador, contratos de adaptador y publicación del esquema a proveedores. Pruebas de huellas históricas y conservación de aprobaciones/grants. No se reemplazan registros existentes.
2. **Migración administrativa:** previsualización, backend de mantenimiento con exclusión impuesta por el sistema operativo, comprobación de runs terminales, reemplazo durable y administración de grants históricos. Primero se aprueba y valida el backend y su frontera de acceso; sin él solo se permite previsualizar. La aplicación se habilita al cubrir las caídas y repetir la validación completa. La compatibilidad v1 permite usar el primer incremento sin ejecutar esta migración.

| Prueba exigida | Evidencia de aceptación |
|---|---|
| Perfil inválido, clave desconocida, `$ref`, esquema grande o anidado | Registro y carga rechazados; sin compilación remota ni efectos |
| Argumentos omitidos, adicionales, null, array, número o enum desconocido | Cero entradas al Executor y ninguna aprobación emitida |
| No ampliación del schema v2, Unicode y caracteres suplementarios | `SchemaV2(args) => EntradaLegada(args)` contra referencia congelada; límite v2 conservador probado sin cambiar v1 |
| Espacios, combinantes, sustitutos aislados y límites UTF-16/UTF-8 | Fronteras de longitudes y bytes verificadas; contenido vacío rechazado y escritura limitada a 16 KiB |
| Esquema de transformación intenta habilitar una operación ajena al adaptador | Registro rechazado, aunque el schema sea sintácticamente válido |
| Mismo descriptor en proveedores y Gateway | Igualdad de esquema estructural y misma decisión local ante fixtures válidos/inválidos |
| Cambio de esquema/descriptor durante aprobación | Respuesta obsoleta rechazada o run denegado según la frontera, sin efecto |
| Cambio de policy o revocación tras aprobación | Revalidación bloquea ejecución; no basta el schema |
| Vectores de huella v1, permisos y aprobaciones entre procesos | Mismos hashes históricos; nueva versión no amplía permisos |
| Huellas v2 | Reordenar claves de objetos conserva huella; cambiar esquema, efectos, versión o arrays la cambia |
| Identidad de solicitud separada de la del descriptor | Reordenar argumentos cambia `requestHash`; reordenar solo claves del descriptor v2 no; ninguna mutación de argumentos durante validación |
| Resultado confirmado, incertidumbre y recuperación con formato legado | Conserva resultado y presupuesto; nunca repite Executor por introducir schemas |
| Migración con run pendiente, datos ambiguos o huella obsoleta | Cero sustituciones y cero grants nuevos |
| Checkout no administrado, sesión falsa/antigua o permisos de inspección insuficientes | Aplicación rechazada antes de escribir, sin bypass manual |
| CLI antiguo ignora locks y mantiene archivos abiertos; hijos sobreviven al padre | No se publica hasta que todos salgan del grupo protegido; timeout o grupo poblado bloquea la operación |
| Intento de arrancar un CLI antiguo entre inspección y publicación | La barrera del sistema impide acceso, incluso sin adquirir el lock de ADR-086 |
| Caída del migrador/supervisor o pérdida de sesión durante mantenimiento | Admisión permanece cerrada; sin publicación posterior no autorizada ni relanzamiento automático |
| Permisos nuevos sobre datos antes compartidos o vía alternativa de acceso | Backend rechaza emitir sesión; grupo vacío no se acepta como prueba suficiente |
| Caída antes/después de publicación de manifiesto | Un descriptor íntegro activo; no se concede permiso ni se asume éxito por un error |
| Regresión offline | Typecheck, suite completa y tres integraciones secuenciales satisfactorias en checkout aislado |

Para dar por terminado cada incremento se actualizan guía, estado y evidencia con resultados ejecutados. Esta propuesta no acredita esas pruebas: no contiene cambios de runtime, dependencia, manifiestos operacionales ni migraciones ejecutadas.

## Decisiones sometidas a revisión

Se propone aprobar el perfil plano inicial con Ajv y su límite v2 conservador de 1.024 caracteres para transformación, la separación entre estructura y controles confiables, la conservación exacta de huellas v1 y la identidad de solicitud sin canonicalizar argumentos. La entrega inicial deja funcional el legado sin reducir sus límites. La migración administrativa requiere además revisar un backend de mantenimiento con exclusión impuesta por el sistema operativo, bloquear runs no terminales y no transferir grants; su aplicación queda deshabilitada donde no pueda acreditarse esa exclusión. Memoria, nuevos ejecutores y conciliación de efectos inciertos permanecen fuera del alcance.
