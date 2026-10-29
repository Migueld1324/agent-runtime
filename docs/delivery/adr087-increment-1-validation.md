# ADR-087 Incremento 1 — evidencia de implementación

Fecha: 29-10-2026. Base: `7d873381ece6ef1642347246be93a7b3480823d9`; PR #9 confirmado mediante API con `merged: true`, `merged_at: 2026-10-28T06:37:32Z`. Código y pruebas: `3296e32`; dependencia corregida y árbol funcional validado: `aa7df87`. Esta entrega requiere revisión técnica y arquitectónica antes de merge.

## Cambios y compatibilidad

- Nuevos manifiestos v2 de transformación, perfil plano draft-07 `tool-input/1`, filtro previo y Ajv **8.20.0 exacto** en package/lockfile. Opciones explícitas strict, allErrors false, sin coerción/defaults/eliminación de campos, propiedades propias. Claves y adaptadores desconocidos fallan cerrados.
- Esquema común para Gateway y proveedores. El codec v1 queda fuera de la representación histórica usada para fingerprints. La referencia pura de validación v1 se conserva en `test/fixtures/legacy-tools.ts`, extraída de `7d87338`, sin delegar en el validador nuevo.
- V2 utiliza dominio `tool-descriptor:v2\n` y claves ordenadas por UTF-16; arrays y Unicode se conservan. `requestHash` mantiene su implementación original y el orden de argumentos de JSON.stringify.
- Descriptores internos congelados; validadores cacheados por formato/huella. Lectura limitada a 8.192 bytes antes de parsear, también al cargar registro; publicación exclusiva del descriptor validado, sin releer el origen después de validarlo. No se sobrescriben registros.
- El Gateway existente llama al validador común antes de aprobación y antes del Executor/reclamación durable; conserva revalidación de huella, solicitud, scope y revocación. No cambian versiones ni tablas de checkpoints, grants o ledger.

## Ejecución verificada

Entorno: Linux `6.18.55-2-cachyos-lts`, Node `v24.22.1`, npm `11.19.1`. Copia aislada en `/tmp/adr087-wjw5quex`, sin copiar `data/`, `workspace/` ni credenciales. Dependencias locales compartidas mediante symlink a node_modules; **no se ejecutó npm ci**. Ajv instalado y fijado mediante npm; la instalación final auditó 85 paquetes y reportó cero vulnerabilidades conocidas.

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | PASS, código de salida 0 |
| `npm run test:core` | PASS, 56 pruebas, 0 fallos; incluye integración aislada que ejecuta dos casos adicionales en proceso hijo |
| `npm run test:integration` | PASS |
| `npm run test:v2:integration` | PASS |
| `npm run test:v3:integration` | PASS |
| `git diff --check` | PASS |

Las tres integraciones se ejecutaron secuencialmente después de la suite. Salidas persistidas: [suite](evidence/adr087-core.txt), [integraciones](evidence/adr087-integration.txt). La primera ejecución de la suite dentro del sandbox quedó detenida en pruebas de procesos; no se cuenta como PASS. Las ejecuciones completas acreditadas se hicieron fuera del sandbox sobre la copia desechable. La versión inicial Ajv 8.17.1 reportó GHSA-2g4f-4pwh-qvx6 (`$data`); se sustituyó por 8.20.0 y se repitió toda la validación.

## Cobertura y límites

`v2-input-contract.test.ts`: vectores fijos de fingerprint/request v1, grants sin transferencia entre huellas del mismo ID, canonicalización separada de requestHash, identidad Unicode sin normalización, comparación con referencia legada y generación determinista de límites v2. Incluye ASCII, BMP, suplementarios, combinantes, sustitutos aislados, espacios y fronteras UTF-16; filesystem conserva 16.383/16.384/16.385 bytes UTF-8 y rutas/contenido seguros. Rechaza esquemas, operaciones y argumentos no admitidos sin mutación, incluyendo getters y propiedades heredadas.

`v3-input-contract.test.ts`: propuestas inválidas terminan failed/INVALID_ARGUMENT sin aprobación, invocaciones ni entradas al Executor; ausencia de grant; recreación del runtime con aprobación pendiente; respuesta equivocada no consume la solicitud; cambio de esquema bloquea consentimiento obsoleto. Resultado v2 confirmado antes de una interrupción simulada se recupera con una sola observación y sin repetir Executor. Registro y grants v2 sobreviven procesos CLI distintos; reutilización, revocación, rechazo de sobrescritura y carga corrupta/excesiva. Cada integración nueva crea su propia copia de fuentes para no contaminar otros tests.

La suite existente conserva las pruebas de muerte real de procesos, incertidumbre, revocación, fallos de persistencia/grants, presupuesto y recuperación de ADR-085/086. Las pruebas por muestreo no prueban exhaustivamente la implicación de esquemas; el límite v2 de 1.024 caracteres garantiza como máximo 2.048 unidades UTF-16. El coste aprobado es rechazar ASCII v2 de 1.025–2.048 caracteres que v1 sigue aceptando.

Sin inferencias comerciales o ChatGPT real; igualdad estructural y controles locales probados, no conformidad remota de cada proveedor. Sin CI hospedada acreditada todavía. Sin ensayo de pérdida de energía ni garantías de aislamiento OS/multi-host. Registro exclusivo no constituye una migración atómica administrativa. No se implementaron migración v1→v2, Maintenance Backend ni transferencia de grants.

## Corrección del contrato publicado — PR #10

Revisión del 29-10-2026. Antes de editar se ejecutó `git fetch origin main refs/pull/10/head` por SSH: el HEAD remoto del PR era `1f3490fb4d3060ffb0cf3949ca3a1f88c7a40b77`, idéntico al checkout local limpio. Ambos problemas seguían presentes. El commit funcional validado es `bda2adf`.

Se restauraron `minLength: 1` y `maxLength: 2048` en el esquema publicado de transformación v1. El codec sigue separado del descriptor usado para fingerprints. Esos límites cuentan caracteres JSON Schema; el control confiable continúa contando unidades UTF-16. Su conjunción conserva el conjunto de entradas aceptadas por el validador legado, incluidos caracteres suplementarios y sustitutos aislados.

Para transformación v2, `constraintsFor()` obtiene los límites del esquema validado del descriptor y los expresa como caracteres Unicode. La descripción exige todas las restricciones de inputSchema y distingue el máximo adicional de 2.048 unidades UTF-16 del adaptador. No cambia el descriptor ni la validación efectiva, los hashes de solicitud o los grants. Ambos adaptadores de inferencia continúan consumiendo `schemaFor()` y `constraintsFor()` comunes.

Las dos regresiones de `test/v3-tool-schema.test.ts` se ejecutaron primero contra el HEAD original: **2 fallos esperados**, por `minLength` ausente y descripción genérica incorrecta. Tras la corrección verifican esquema publicado, identidad del descriptor, vectores históricos de fingerprint/requestHash, comparación con la referencia legada y casos Unicode de frontera. Los contratos v2 de 1–1.024, 2–4 y 3–3 caracteres se comparan con descripción y aceptación/rechazo del Gateway, incluidos campos extra y operación no admitida.

Validación sobre copia nueva `/tmp/adr087-pr10-2_5w9lkb`, con Node v24.22.1, npm 11.19.1 y Linux 6.18.55-2-cachyos-lts. Sin copiar datos operacionales ni credenciales; node_modules reutilizado por symlink, sin reinstalar dependencias. Ejecución fuera del sandbox para las pruebas entre procesos. No se hicieron inferencias remotas ni cambios arquitectónicos.

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | PASS, salida 0 |
| `npm run test:core` | **58/58 PASS**, incluidos los dos tests nuevos |
| Integraciones v1, v2 y v3, en ese orden | PASS, salidas 0 |
| `git diff --check` | PASS |

Evidencia persistida: [typecheck](evidence/adr087-pr10-typecheck.txt), [suite](evidence/adr087-pr10-core.txt), [integraciones](evidence/adr087-pr10-integrations.txt). Las pruebas históricas de grants, approvals y recuperación siguen incluidas en la suite completa. La consistencia probada es la representación local entregada a proveedores y su relación con el Gateway; no acredita comportamiento de un LLM remoto. No se consultó CI hospedada en esta revisión.

## Entrega

Rama `feat/adr087-input-contract`, correspondiente al [PR #10](https://github.com/Migueld1324/agent-runtime/pull/10) contra `main`. Las correcciones se publican en esa misma rama por SSH. Se conserva la [descripción original preparada](adr087-pr.md) como antecedente de la entrega. No se ha efectuado merge.
