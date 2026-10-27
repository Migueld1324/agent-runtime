# ADR-087 — Validación extensible de entradas del Tool Gateway

**Estado:** propuesta para revisión; no aprobada ni implementada.  
**Base contrastada:** `ab22823` de `origin/main`, con ADR-086 y su documentación de cierre integradas.  
**Relación:** concreta ADR-021/049–052/068–072 y conserva las fronteras de autorización y recuperación de ADR-085/086.

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
      "input": {"type": "string", "minLength": 1, "maxLength": 2048},
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

## Registro y adaptadores confiables

El registro realiza dos comprobaciones antes de admitir un descriptor: conformidad con el perfil de esquema y compatibilidad con el contrato del adaptador. Validar un esquema como JSON Schema no basta para registrar una herramienta.

| Adaptador actual | Forma admitida | Restricciones que conserva el código confiable |
|---|---|---|
| `builtin.text.transform` | `input` y `operation`; enum no vacío contenido en uppercase/lowercase/titlecase | Efectos exactamente `read`; entrada no vacía de hasta 2.048 unidades UTF-16; operación soportada |
| `builtin.filesystem.read` | `fileName` | ID reservado, nombre Markdown seguro, workspace, archivo regular, rechazo de symlinks y límite de lectura |
| `builtin.filesystem.write` | `fileName` y `content` | ID reservado, nombre seguro, contenido y bytes acotados, escritura sin sobrescritura y aprobación exacta |

Los campos y `required` deben coincidir con la forma del adaptador; un esquema puede restringir longitudes o enums, pero nunca habilitar operaciones o campos que este no soporta. Para transformación se exige `minLength` de input al menos 1 y `maxLength` como máximo 2.048. Los built-ins de filesystem siguen definidos por código, no reemplazables mediante un manifiesto externo.

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

El formato del descriptor es independiente de `stateVersion: 2` del run y del esquema SQLite de ADR-086. Este incremento no necesita cambiar esas versiones mientras sus campos de huella permanezcan opacos y no se altere su significado histórico. Los checkpoints, evidencias e invocaciones existentes no se reescriben ni reciben huellas nuevas retrospectivamente.

## Migración propuesta

La instalación nueva lee v1 y v2; no convierte archivos al consultar, arrancar, recuperar o listar. Los descriptores v1, sus grants y aprobaciones continúan siendo utilizables bajo las comprobaciones anteriores. Los nuevos registros pueden usar v2; una versión desconocida se rechaza.

Para cambiar un descriptor registrado existente al formato v2 se propone una operación administrativa explícita, separada de `recover` y de `migrate` del run:

1. Un modo de previsualización produce el descriptor v2 equivalente, huellas anterior/nueva y grants afectados. No modifica archivos ni permisos.
2. La aplicación exige la huella anterior esperada y exclusión del runtime. En este primer corte se admite solo con todos los runs conocidos terminales: pendientes de aprobación, pausados, recuperables o inciertos bloquean la operación. Si no se puede demostrar el estado por datos ausentes, versiones desconocidas o inconsistencias, se rechaza. Deben estar detenidos los CLI históricos v1/v2, que no participan del lock de ADR-086.
3. La sustitución valida y publica un único manifiesto mediante reemplazo atómico local, conserva una copia recuperable del anterior fuera del directorio activo y confirma durabilidad antes de informar éxito. Revalidar la huella esperada bajo exclusión evita sobrescribir cambios concurrentes. Un fallo de persistencia se informa como tal y no habilita efectos.
4. Los grants anteriores permanecen como registro asociado a la huella antigua y no autorizan el descriptor nuevo; el siguiente uso requiere consentimiento nuevo cuando la policy lo exija. No se copian grants ni se cambia su scope. La administración debe poder identificar y revocar registros por huella, también los antiguos, antes de habilitar esta migración.
5. Repetir la migración sobre el descriptor destino idéntico es un no-op. Una combinación inesperada de archivos/huellas tras caída exige diagnóstico; nunca restaurar automáticamente el descriptor antiguo y reactivar sus permisos.

Esta condición conservadora evita diseñar migraciones de invocaciones activas. No impide continuar usando el formato legado ni registrar una capacidad nueva con otro ID. No se migra el formato de los built-ins de filesystem en este corte; siguen usando el codec legado. Una futura migración de esos IDs requiere su propio plan de compatibilidad.

## Entrega y criterios de aceptación

La implementación, si se aprueba, se divide en dos incrementos revisables:

1. **Validación común y compatibilidad:** codec v1, descriptor v2 para nuevos registros, perfil/validador, contratos de adaptador y publicación del esquema a proveedores. Pruebas de huellas históricas y conservación de aprobaciones/grants. No se reemplazan registros existentes.
2. **Migración administrativa:** previsualización, exclusión, comprobación de runs terminales, reemplazo durable y administración de grants históricos. Solo se habilita al cubrir las caídas y repetir la validación completa. La compatibilidad v1 permite usar el primer incremento sin ejecutar esta migración.

| Prueba exigida | Evidencia de aceptación |
|---|---|
| Perfil inválido, clave desconocida, `$ref`, esquema grande o anidado | Registro y carga rechazados; sin compilación remota ni efectos |
| Argumentos omitidos, adicionales, null, array, número o enum desconocido | Cero entradas al Executor y ninguna aprobación emitida |
| Unicode, espacios y límites UTF-16/UTF-8 | No se amplía el conjunto de entradas legado; escritura limitada a 16 KiB |
| Esquema de transformación intenta habilitar una operación ajena al adaptador | Registro rechazado, aunque el schema sea sintácticamente válido |
| Mismo descriptor en proveedores y Gateway | Igualdad de esquema estructural y misma decisión local ante fixtures válidos/inválidos |
| Cambio de esquema/descriptor durante aprobación | Respuesta obsoleta rechazada o run denegado según la frontera, sin efecto |
| Cambio de policy o revocación tras aprobación | Revalidación bloquea ejecución; no basta el schema |
| Vectores de huella v1, permisos y aprobaciones entre procesos | Mismos hashes históricos; nueva versión no amplía permisos |
| Huellas v2 | Reordenar claves de objetos conserva huella; cambiar esquema, efectos, versión o arrays la cambia |
| Resultado confirmado, incertidumbre y recuperación con formato legado | Conserva resultado y presupuesto; nunca repite Executor por introducir schemas |
| Migración con run pendiente, datos ambiguos o huella obsoleta | Cero sustituciones y cero grants nuevos |
| Caída antes/después de publicación de manifiesto | Un descriptor íntegro activo; no se concede permiso ni se asume éxito por un error |
| Regresión offline | Typecheck, suite completa y tres integraciones secuenciales satisfactorias en checkout aislado |

Para dar por terminado cada incremento se actualizan guía, estado y evidencia con resultados ejecutados. Esta propuesta no acredita esas pruebas: no contiene cambios de runtime, dependencia, manifiestos operacionales ni migraciones ejecutadas.

## Decisiones sometidas a revisión

Se propone aprobar el perfil plano inicial con Ajv, la separación entre estructura y controles confiables, la conservación exacta de huellas v1 y la invalidación conservadora de permisos al migrar a v2. La entrega inicial deja funcional el legado; la migración administrativa se implementa después, con bloqueo de runs no terminales y sin transferir grants. Memoria, nuevos ejecutores y conciliación de efectos inciertos permanecen fuera del alcance.
