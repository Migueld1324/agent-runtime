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

## Entrega

Rama `feat/adr087-input-contract`, para PR independiente contra `main`. Por instrucción del responsable se usa solo SSH: el push publica commits, pero la creación del PR requiere la interfaz web o API autenticada. [Descripción preparada](adr087-pr.md). No se ha efectuado merge.
