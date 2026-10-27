# Instalación y ejecución del runtime

Esta guía describe el CLI v3 actual. Los contratos están en [runtime](../specifications/runtime.md) y [herramientas](../specifications/tools.md); la historia de la PoC se conserva en [su cierre](../delivery/poc-031-closure.md).

## Preparar el entorno

Requiere Node.js >=24.15 y npm. Desde la raíz de un checkout:

```bash
npm ci
npm run typecheck
```

`npm ci` instala las versiones del lockfile. El proyecto incluye dependencias nativas (`better-sqlite3`) y herramientas con scripts de instalación (`esbuild`). Si el gestor solicita aprobar scripts, revisar esas dependencias individualmente; no habilitar scripts indiscriminadamente.

Usar un checkout del repositorio para las instalaciones actuales. Los comandos básicos mostrados también pueden ejecutarse desde Fish. La evidencia de portabilidad ejecutada y la configuración del runner están en [verificación](../delivery/verification.md); no se acredita soporte probado en todos los sistemas operativos.

## Herramientas y datos de demostración

`filesystem.read` y `filesystem.write` están incorporadas. Consultar el registro antes de inscribir la transformación:

```bash
npm run agent:v2 -- tools list
```

Solo si falta `text.transform`:

```bash
npm run agent:v2 -- tools register examples/text-transform.tool.json
```

`EEXIST` indica que el descriptor ya está registrado; el registro no sobrescribe herramientas silenciosamente. Los checkpoints, descriptores y grants viven en `data/`. Los archivos Markdown de demostración viven en `workspace/`. Ambos contienen datos locales ignorados por Git; no borrar los checkpoints para actualizar el código.

## Ejecutar una tarea offline

Elegir un run ID y un archivo que no existan. El siguiente ejemplo usa `demo-verified-1` y `demo-verified-1.md`:

```bash
npm run agent:v3 -- start demo-verified-1 --model mock --task 'Convierte "hola agente" a mayúsculas y guarda el resultado en demo-verified-1.md' --expect-file demo-verified-1.md --expect-content 'HOLA AGENTE'
npm run agent:v3 -- status demo-verified-1
```

El solicitante fija el archivo y contenido esperados **antes de ejecutar**. `mock` propone operaciones deterministas; no es un LLM local. Si no hay un grant compatible, la primera transformación queda en `WAITING_APPROVAL`. Revisar herramienta, scope, argumentos y hash antes de resolver la solicitud:

```bash
npm run agent:v3 -- approve demo-verified-1
npm run agent:v3 -- status demo-verified-1
```

Si ahora solicita `filesystem.write` con los argumentos esperados, aprobarla por separado:

```bash
npm run agent:v3 -- approve demo-verified-1
npm run agent:v3 -- status demo-verified-1
cat workspace/demo-verified-1.md
```

Una autorización de transformación no concede autorización de escritura. Para denegar la propuesta pendiente, usar `npm run agent:v3 -- deny demo-verified-1`. No ejecutar todas las aprobaciones a ciegas: un grant existente puede cambiar la primera solicitud pendiente.

## Verificación y recuperación de la comprobación

La respuesta final del modelo activa una lectura autorizada del archivo real. Solo los bytes esperados permiten `COMPLETED`; archivo ausente o diferente produce `FAILED`. Una comprobación inconclusa produce `PAUSED`; una lectura denegada por policy produce `DENIED`. La evidencia se persiste con fecha, hash de criterio y resultado.

El primer verificador admite un archivo Markdown seguro del workspace y hasta 16 KiB de contenido UTF-8 esperado. Comprueba el resultado, no que se haya usado una herramienta específica, y no cubre objetivos arbitrarios. El criterio se vincula al run, objetivo y scope; cambiarlo durante la ejecución bloquea la continuación.

Solo si el diagnóstico indica una comprobación transitoria recuperable:

```bash
npm run agent:v3 -- retry-verification demo-verified-1
```

Se permiten como máximo dos recuperaciones explícitas por run, compartidas entre inferencia, verificación y reparación de continuidad. Esta ruta repite la comprobación y conserva las observaciones; no vuelve al modelo ni reejecuta herramientas. No permite reintentar escrituras inciertas.

## Recuperación tras fallo o interrupción

Consultar primero `status`. Expone fase/código del error, elegibilidad de recuperación, presupuesto compartido e invocaciones durables. Cuando el modelo falla de forma recuperable, corregir la causa —por ejemplo, volver a autenticar la misma cuenta— y solicitar un intento explícito:

```bash
npm run agent:v3 -- recover demo-verified-1 --request-id recovery-1
npm run agent:v3 -- status demo-verified-1
```

Usar un ID de orden nuevo para cada intento autorizado. Un ID ya despachado se rechaza; repetirlo no duplica la recuperación. El proveedor y el objetivo permanecen fijados. Sin `--request-id`, el CLI genera uno nuevo.

Después de una interrupción, el registro de invocaciones determina qué puede recuperarse. Una herramienta confirmada restaura su observación sin volver a ejecutarse. Si nunca se reclamó el Executor, se solicita consentimiento nuevo. Una invocación iniciada sin resultado confirmado queda `uncertain` y `PAUSED`, sin reintento ni comprobación del objetivo para omitir esa incertidumbre. Su conciliación sigue pendiente. Un fallo al guardar el grant conserva el resultado y requiere inspección; no se concede automáticamente al recuperar.

Solo un comando mutante v3 puede estar activo a la vez, incluso para runs distintos. `Runtime busy` indica que otra ejecución tiene el control; `status` sigue disponible. No borrar `runtime-control.sqlite` para forzar el acceso. `runtime-v3.sqlite`, `runtime-operations.sqlite` y `runtime-control.sqlite` cumplen funciones diferentes; no reemplazar uno por una base vacía cuando una recuperación falle. Ledger ausente/ajeno bloquea la continuación.

## Checkpoints anteriores

Los checkpoints antiguos siguen consultables. Solo `COMPLETED` v0 sin evidencia se muestra como no verificado; una verificación v1 conserva su significado. Para una aprobación pendiente demostrablemente segura o una verificación pendiente v1:

```bash
npm run agent:v3 -- migrate demo-verified-1
```

Un checkpoint v0 sin criterio requiere además `--expect-file` y `--expect-content`, con el objetivo aceptado por el solicitante. La migración conserva el historial y el presupuesto, y exige una aprobación nueva cuando corresponde. No admite versiones desconocidas, terminales ni ejecuciones antiguas ambiguas. Consultar [ADR-086](../decisions/086-durable-invocations-and-recovery.md) para las invariantes; no borrar bases para actualizar.

## Permisos persistentes

Mientras la propuesta de transformación esté pendiente, puede concederse un permiso de workspace como alternativa a la aprobación individual mostrada antes:

```bash
npm run agent:v3 -- approve demo-verified-1 --remember workspace
npm run agent:v2 -- grants list
npm run agent:v2 -- grants revoke text.transform
```

`--remember workspace` solo se aplica a transformaciones admitidas por la PoC; la escritura exige aprobación individual. El store de grants es compartido por v2/v3. Para el alcance exacto de estos permisos, consultar [Policy Engine](../specifications/policy-engine.md).

## Pruebas y límites del prototipo

Seguir [verificación](../delivery/verification.md) para las suites offline y CI. Las integraciones deben ejecutarse secuencialmente en un checkout desechable: crean registros y revocan grants. Las pruebas de inferencia real son separadas; ver [uso de ChatGPT](chatgpt.md).

El presupuesto actual cuenta cinco propuestas válidas de herramienta, antes de su autorización. Agotarlo detiene la ejecución sin una sexta inferencia, incluso si esta hubiera podido devolver una respuesta final. El Gateway valida argumentos y reevalúa permisos antes del efecto. El alcance de filesystem se limita a Markdown de demostración; no usar el prototipo sobre carpetas personales o repositorios reales. Estas comprobaciones no ofrecen aislamiento OS ni conciliación general de efectos externos.
