# Cierre de PoC 0.3.1

Fecha: 26-10-2026. Resultado: **cerrada dentro del alcance de la PoC**.
Base: commit `72595fe`; validación sobre el árbol de trabajo con los cambios de este cierre, todavía sin commit. Entorno: CachyOS/Linux, Node v24.22.1, versión de paquete 0.3.1. Modelo real seleccionado: `gpt-5.6-luna`, mediante la cuenta ChatGPT ya conectada.

## Casos de cierre

| Caso | Evidencia observada | Resultado |
|---|---|---|
| 1. Reutilización de permisos reales | `close031-grant-20261026-a`: sin grants iniciales, transformación pendiente, aprobada con `--remember workspace`, escritura pendiente independiente y aprobada. `close031-grant-20261026-b`: transforma otro texto sin nueva aprobación; primera espera en `filesystem.write`. Ambas ejecuciones `completed`. | PASS |
| 2. Revocación | Revocado `text.transform` tras comprobar B. `close031-revoked-20261026-c` vuelve a `WAITING_APPROVAL` para transformar `permiso revocado`. Se deniega para terminar el ensayo: `denied`, cero observaciones, archivo inexistente. | PASS |
| 3. Routing automático real | `close031-auto-20261026-d`, con `AGENT_ALLOW_CLOUD=1`, `AGENT_AUTO_PRIORITY=chatgpt` y las tres API keys comerciales vacías. Selecciona `chatgpt`, razón `Auto: authorized provider priority (not quality ranking)`. Transformación y escritura aprobadas individualmente; `completed`. | PASS |
| 4. Fallos sin fallback | `test/v3-adapter-failures.test.ts`: grafo y adaptador completos con credenciales sintéticas aisladas y fetch interceptado. Quince escenarios de credencial ausente/malformada, refresh denegado o fallido, expiración inválida, pérdida de consentimiento, HTTP 401/403/429/500, red, timeout y streams fallidos/incompletos/truncados. Verifica URLs y número exacto de solicitudes, deadline asociado, ausencia de nueva propuesta/observación y error persistido tras reabrir el checkpoint. También verifica refresh exitoso, rotación y reutilización del token. | PASS |
| 5. Propuestas inválidas | `test/v3-closure.test.ts`: catorce propuestas controladas a través del parser y grafo, incluyendo operaciones inválidas, vacíos, campos ausentes/adicionales, rutas inseguras, exceso de tamaño, tipos incorrectos, ID desconocido y propuestas múltiples. Sin aprobación, observaciones ni archivo creado; error persistido. | PASS |
| 6. Límite de herramientas | `test/v3-closure.test.ts`: cinco propuestas de escritura y cinco aprobaciones exactas; SQLite reabierto antes de cada aprobación. Contador y observaciones persisten. Tras la quinta ejecución: `budget_exhausted`, sin sexta inferencia ni efecto al reanudar. | PASS |

## Efectos verificados después de las ejecuciones reales

| Run / archivo en `workspace/` | Contenido / estado final |
|---|---|
| `close031-grant-20261026-a` / `.md` | `PERMISO PERSISTENTE`; `completed`, 2 observaciones |
| `close031-grant-20261026-b` / `.md` | `SEGUNDO PERMISO`; `completed`, 2 observaciones |
| `close031-revoked-20261026-c` / `.md` | Archivo inexistente; `denied`, 0 observaciones |
| `close031-auto-20261026-d` / `.md` | `RUTA AUTOMATICA`; `completed`, 2 observaciones |

Se consultaron nuevamente los checkpoints desde otro proceso y se leyeron los archivos. No quedan aprobaciones pendientes de estos ensayos ni grants activos al finalizar. Se preservan checkpoints y archivos reales de demostración en las carpetas locales ignoradas por Git. No se exportan credenciales ni identidad de la cuenta.

## Cambios y regresión

- El Gateway rechaza argumentos adicionales y valores que no sean objetos. El parser rechaza campos adicionales en la propuesta para impedir llamadas múltiples ocultas junto a una llamada válida.
- `createGraphV3` permite inyectar la decisión y la ruta SQLite para pruebas deterministas; el CLI conserva sus valores predeterminados.
- Añadidos tres tests de cierre en dos archivos. Las suites `test:core` y `test:v3` los incluyen automáticamente.
- `npm run typecheck`: PASS.
- `npm run test:core`: PASS, seis archivos de pruebas. Los tres tests nuevos también se ejecutaron directamente y pasaron (2/2 y 1/1).
- `npm run test:v2:integration` y `npm run test:v3:integration`: PASS. Se ejecutaron después de comprobar la reutilización/revocación para no interferir con el grant del ensayo.

## Límites conservados y siguiente fase

Los fallos remotos se inyectan de forma determinista; no se provocó una caída real del proveedor ni se agotó la cuota real. El timeout simula la excepción de fetch y comprueba que se configura un AbortSignal; no mide el transcurso de los 90 segundos. El límite de cinco propuestas se valida con un decisor determinista y herramientas reales del Gateway, sin depender del comportamiento aleatorio de un modelo.

Los errores de inferencia/validación conservan el estado anterior (`queued` en los ensayos de fallo inicial), `next: model` y un error en la tarea del checkpoint; no existe todavía una transición general a `FAILED`. Esto queda documentado y diferido al diagnóstico/estado de la consolidación. No equivale a aislamiento de producción ni a reconciliación de efectos inciertos.

Los seis criterios del cierre han sido evaluados con evidencia observable. El siguiente trabajo es **Fase 0: consolidación del runtime**, conforme al roadmap. MemoryService, Context Manager y routing por capacidades siguen pendientes.
