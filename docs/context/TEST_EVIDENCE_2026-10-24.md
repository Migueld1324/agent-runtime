# Evidencia de validación en host — 2026-10-24

**Origen:** salidas del terminal aportadas directamente por el usuario después de ejecutar la PoC 0.3.1 localmente en CachyOS. **Sanitizado:** se omitieron direcciones personales, identidad de cuenta, tokens y datos sensibles. El archivo registra comportamiento histórico; no es un script reejecutable ni sustituye futuras pruebas.

## Acceso al modelo

```text
npm run auth:v3 -- login
ChatGPT authorization saved locally. No API key required.

npm run auth:v3 -- status
Connected: [cuenta omitida]
Model: (not selected) [antes de escoger]
Plan permission: yes
Token: active

npm run auth:v3 -- models
[catalogo retornado por proveedor; usar slugs exactos vigentes]
```

**Nota:** inicial intento de `auth:v3 use MODEL_SLUG` y luego del **display name** de un modelo falló; se necesita el slug exacto del catálogo. No registrar aquí el nombre de la cuenta ni asumir catálogo permanente.

## Caso positivo — `account-1`

Comando original:

```fish
npm run agent:v3 -- start account-1 --model chatgpt --task 'Convierte "prueba de IA" a mayúsculas y guarda el resultado en cuenta-v3.md'
```

Resumen de salidas:

```text
WAITING_APPROVAL / text.transform
Arguments: {"input":"prueba de IA","operation":"uppercase"}

npm run agent:v3 -- approve account-1
WAITING_APPROVAL / filesystem.write
Result: PRUEBA DE IA
Arguments: {"fileName":"cuenta-v3.md","content":"PRUEBA DE IA"}

npm run agent:v3 -- approve account-1
Status: COMPLETED
Result: Listo: se guardó «PRUEBA DE IA» en cuenta-v3.md.
  ✓ text.transform: PRUEBA DE IA
  ✓ filesystem.write: filesystem.write: created (cuenta-v3.md)

cat workspace/cuenta-v3.md
PRUEBA DE IA
```

Se probó la relectura de `status` entre aprobaciones y tras finalizar.

## Caso negativo — `denial-1`

Comando original:

```fish
npm run agent:v3 -- start denial-1 --model chatgpt --task 'Convierte "esta escritura debe ser denegada" a mayúsculas y guarda el resultado en denegado-v3.md'
```

Resumen de salidas:

```text
test ! -e workspace/denegado-v3.md
PASS: archivo inexistente

WAITING_APPROVAL / text.transform
Arguments: {"input":"esta escritura debe ser denegada","operation":"uppercase"}

npm run agent:v3 -- approve denial-1
WAITING_APPROVAL / filesystem.write
Result: ESTA ESCRITURA DEBE SER DENEGADA
Arguments: {"fileName":"denegado-v3.md","content":"ESTA ESCRITURA DEBE SER DENEGADA"}

npm run agent:v3 -- deny denial-1
Status: DENIED
Result: Denied by user
  ✓ text.transform: ESTA ESCRITURA DEBE SER DENEGADA

npm run agent:v3 -- status denial-1
Status: DENIED

test ! -e workspace/denegado-v3.md
PASS: escritura bloqueada
```

**Interpretación exacta:** denegar `filesystem.write` impidió **esa** escritura y persistió `DENIED`; no invalida retroactivamente una `text.transform` ya autorizada y ejecutada.

## Tests de regresión ejecutados en host

| Comando | Resultado reportado |
|---|---|
| `npm run test:v3` | 9 tests, 9 pass, 0 fail |
| `npm run test:v3:integration` | PASS: mock secuencial, checkpoints LangGraph entre procesos, grants limitados, denegación y aprobación |
| `npm run test:v2` | 5 tests, 5 pass, 0 fail |
| `npm run test:v2:integration` | PASS: registro, persistencia de grants, revocación y políticas de lectura/escritura |
| `npm run test:core` | 18 tests, 18 pass, 0 fail (incluye familias v2/v3) |
| `npm run typecheck` | Ejecutado antes por el usuario; sin error comunicado; stdout no preservado |

## Para futuros desarrolladores

La evidencia constituye un **baseline**, no una certificación de seguridad ni sustituto de `npm run ...` en un checkout nuevo. Preservar estos escenarios como pruebas regresivas y añadir cobertura de nuevos proveedores/memoria antes de abrir permisos.
