# ADR-088 M1 — evidencia de implementación portable

Fecha: 29-10-2026. Rama `feat/adr088-maintenance-m1`. Base funcional `4ea8430`; preparación `e1f1a49`; implementación `3762c8b` y `2cf81fb`. Especificación de interfaces, codec y obligaciones M2: [contrato](maintenance-m1-contract.md).

**Revisión final sobre `72e2a17`:** corregida validación de registros persistidos; **90/90 pruebas**, typecheck y tres integraciones PASS. Hallazgos confirmados/descartados y límites en [revisión final](maintenance-m1-review.md). Los resultados 81/81 que siguen se conservan como evidencia anterior. PR existente [#11](https://github.com/Migueld1324/agent-runtime/pull/11), confirmado abierto por API antes de publicar estos cambios.

## Ejecución

Linux `6.18.55-2-cachyos-lts`, Node `v24.22.1`, npm `11.19.1`. Copia desechable `/tmp/adr088-m1-d_zzuz4v`, sin copiar `data/`, `workspace/`, configuración de credenciales ni `.git`. Dependencias locales mediante symlink; no se ejecutó `npm ci` ni se modificó el lockfile. Proveedores cloud deshabilitados y directorio de autenticación desechable. No se hicieron inferencias remotas.

| Verificación | Resultado |
|---|---|
| `npm run typecheck` | PASS, salida 0 |
| `npm run test:core` | **81/81 PASS**, 0 fallos; 58 regresiones existentes y 23 tests M1 |
| `npm run test:integration` | PASS, salida 0 |
| `npm run test:v2:integration` | PASS, salida 0 |
| `npm run test:v3:integration` | PASS, salida 0 |
| Vector de plan calculado independientemente con Python | Coincide con SHA-256 fijo |
| `git diff --check` | PASS |

Las tres integraciones se ejecutaron secuencialmente después de la suite. Evidencia: [typecheck](evidence/adr088-m1-typecheck.txt), [suite](evidence/adr088-m1-core.txt), [integraciones](evidence/adr088-m1-integrations.txt). Una pasada anterior dio 79/79; tras añadir controles de corrupción/auditoría se repitieron typecheck, suite e integraciones y la evidencia retenida es la final de 81/81.

Dentro del sandbox, `node --test` solo reportó archivos y la suite quedó detenida en pruebas entre procesos; se interrumpió y no se cuenta como PASS. Las pruebas M1 ejecutadas directamente sí reportaron sus casos. La evidencia completa retenida corresponde a ejecución autorizada fuera del sandbox sobre la copia aislada.

## Trazabilidad portable

| Criterio | Evidencia M1 | Límite |
|---|---|---|
| P01/P22 | `maintenance-backend.test.ts`: capacidades no disponibles, protocolo inválido, preview informativo; todos los métodos mutantes rechazan aun con consentimiento y sesión bien formada; sin stores por defecto | No conformidad Linux/Windows/macOS ni prueba OS |
| P02 | `maintenance-policy.test.ts`, backend y persistencia: seis acciones separadas, identidad falsa y grants de herramienta rechazados, cambio de policy, expiración/revocación, plan/generación/interrupción exactos, nonce/replay, solicitud conflictiva | Canal/consentimiento confiables sintéticos; sin autenticador IPC real ni autoridad aprovisionada |
| P16 | `maintenance-persistence.test.ts`: reserva única ante concurrencia lógica, respuesta perdida, reapertura del doble, resultado exacto inmutable, pendiente indeterminado | Contrato de persistencia; no durabilidad física ni competencia entre procesos nativos |
| P17 portable | `maintenance-state.test.ts`: cancelación/pérdida de autoridad llevan a cierre/cuarentena; ninguna apertura ni ejecución/republicación en reconciliación | No cancelación de syscalls ni escritor real |
| P18 portable | Intención pendiente, resultados corruptos/ajenos, fallo antes/después de claim/complete, discrepancias origen/destino y generación desconocida | No journal/ancla reales, rollback ni pérdida de energía |
| P20 portable | Tabla completa 8×8; apertura denegada con publicador/handles/lock/cierre/compatibilidad desconocidos; inicio ignora `NORMAL` histórico | Checks confiables sintéticos, no observación de handles reales |
| P23 | 58 pruebas existentes más tres integraciones; ningún cambio en código v1/v2/v3 ni dependencias | Sin nueva CI hospedada acreditada |

`maintenance-contracts.test.ts` valida los siete objetos, versiones/campos, vínculos y restricciones; snapshot sin getters, ciclos, arrays dispersos, Unicode ambiguo y números fuera de perfil; congelación profunda, orden de claves, cambios relevantes del plan y separación de dominios. El vector fijo se verificó también por implementación independiente para el plan de claves ASCII.

Los fallos de almacenamiento no producen éxito ni habilitan ejecución. Un error al guardar resultado conserva incertidumbre; una inspección posterior puede revelar el rechazo durable. Las denegaciones administrativas usan auditoría sanitizada sin consumir consentimiento ajeno; si esa auditoría falla se devuelve error, y una intención pendiente continúa indeterminada.

La regresión existente conserva confirmación durable de invocaciones, máximo dos recuperaciones explícitas, incertidumbre sin retry, huellas/requests/grants históricos y validación de entradas de ADR-085/086/087. No se tocaron bases del usuario ni se alteraron sus registros.

## Límites de la evidencia

P03–P15/P19/P21 nativos y C1–C8: **NOT RUN**. No se afirma aislamiento OS, ancla protegida, detección de restauración, integridad/terminalidad de un inventario real, publicación, fsync o durabilidad ante reinicio/pérdida de energía. El doble de persistencia solo demuestra semántica portable; el journal/ancla y sus verificaciones pertenecen a M2.

La revisión local comprobó separación de imports, ausencia de acceso al filesystem/ejecutores en `src/maintenance`, snapshots antes de awaits, policy antes de nonce, rechazo de sesiones inventadas, resultados pendientes y coherencia de documentación. No sustituye revisión arquitectónica/de seguridad independiente ni habilita un perfil nativo. M1 no desbloquea ADR-087 Incremento 2. La entrega queda lista para revisión mediante un PR único; no se hace merge automático.

## Publicación

Rama `feat/adr088-maintenance-m1` publicada por SSH. La entrega inicial quedó en `42b960b` y su continuidad en `72e2a17`. El PR se creó posteriormente: [#11](https://github.com/Migueld1324/agent-runtime/pull/11), confirmado abierto por API pública durante esta revisión. Corrección funcional adicional `4af73d4`; se publica en la misma rama para actualizar ese PR. No se abre otro PR ni se hace merge. No se acredita CI hospedada en esta revisión; evidencia local completa en [revisión final](maintenance-m1-review.md).
