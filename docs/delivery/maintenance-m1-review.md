# ADR-088 M1 — revisión final de persistencia

Revisión del 29-10-2026 sobre `72e2a17`, rama `feat/adr088-maintenance-m1`. Se leyeron ADR-088 completa, criterios M1/M2 y P01/P02/P16/P18/P23, contratos, evidencia, continuidad, estado, los seis módulos de mantenimiento y sus pruebas. PR existente confirmado por API pública: [#11](https://github.com/Migueld1324/agent-runtime/pull/11), abierto y con HEAD `72e2a178a01fdc983e22b0dcd495ac70693f6727` antes de esta revisión. Corrección funcional: `4af73d4`. No se crea otro PR.

## Hallazgos reproducidos

Las nueve pruebas de `test/maintenance-records.test.ts` se ejecutaron contra las fuentes originales extraídas de `72e2a17` en `/tmp/adr088-review-baseline-zt1sxqb_`: **7 grupos FAIL esperados, 2 PASS**. [Salida previa a corrección](evidence/adr088-m1-review-red.txt). No se tocaron datos reales ni se invocó un publicador; el store es un doble sintético.

| Hallazgo confirmado | Reproducción / efecto anterior | Corrección |
|---|---|---|
| Identidad histórica incompleta o mal formada aceptada | Con instalación/generación/operación correctas, eliminar o malformar protocolo, request ID, método, principal, autorización, nonce o digest seguía devolviendo `applied` sintético | Validación estricta de todos los campos de `RequestIdentity`, compartida con el ledger |
| Registro parcial confundido con pendiente | Omitir `result` se interpretaba como reserva pendiente; también pasaban valores falsy que no son `null` y campos extra | Forma exacta de `RequestRecord`; solo `null` significa pendiente |
| Colección no válida aceptada | Un array disperso se devolvía con huecos; faltaba la barrera de snapshot para datos del puerto | Snapshot JSON estricto de la colección; rechazo de accesores sin ejecutarlos |
| Historia contradictoria aceptada | Dos filas con el mismo request y resultados contradictorios, o dos requests con el mismo nonce, podían devolverse juntas | Unicidad de request y nonce dentro del snapshot de operación |
| Ledger aceptaba identidad inválida | Digest mal formado e identidades con terminadores de línea llegaban a `claim`; un puerto permisivo podía también aceptar `complete` | Validación previa a llamadas de almacenamiento, sin reservas/escrituras ante identidad inválida |
| Respuestas de claim contradictorias aceptadas | `{kind: 'new', record: ...}` se trataba como reserva nueva; campos extra de registros/respuestas se ignoraban | Unión discriminada estricta de respuestas de `claim` y validación del registro |

Se trata de brechas de validación frente a datos inconsistentes de un puerto defectuoso, no de un bypass de autenticación demostrado para clientes externos. El backend portable sigue sin emitir sesiones aplicables ni ejecutar mantenimiento real.

## Sospechas descartadas y contrato contrastado

- **Inspección sin permiso o dependiente del antiguo consentimiento:** descartada. Ya se comprobaba autoridad antes de leer el store. El nuevo control positivo usa un auditor diferente con solo `inspect`, y una consulta al consentimiento antiguo que lanzaría error si se invocara; la lectura autorizada pasa, la identidad falsa falla antes del store y ningún nonce se consume.
- **Reautorización omitida al devolver caché:** descartada. Policy antecede al ledger. Tests nuevos confirman que expiración y retirada del permiso impiden incluso el lookup; los tests existentes cubren revocación. No se modificó policy.
- **Comparación parcial de identidad en deduplicación:** descartada para requests válidos. Antes y después, el ledger rechaza diferencias de método, principal, autorización, nonce, request ID, generación o digest frente al request actual. El defecto confirmado era aceptar formas inválidas y envoltorios contradictorios.
- **Reserva no atómica, replay permitido, resultado sobrescribible o éxito inventado tras fallo:** no reproducidos dentro de la semántica del doble. La suite conserva reserva conjunta identidad/nonce, conflicto previo a consumo, replay, resultado inmutable, respuesta perdida, pendiente indeterminado y fallos antes/después de claim/complete. Eso verifica el contrato portable; no prueba una implementación durable nativa, que sigue ausente.
- **Un hash histórico prueba por sí solo autenticidad:** no es una garantía de M1. El digest se genera con el snapshot exacto después de autorizar; en deduplicación hay una identidad actual de referencia. En inspección histórica solo están las referencias y el digest, no la preimagen o una firma. Cambios sintácticamente válidos, omisión de registros o rollback requieren integridad/procedencia/completitud del puerto y ancla M2. No se añadió una comparación redundante contra otra lectura del mismo store que simulara autenticidad.

## Cambios acotados

- `contracts.ts`: esquemas/validadores de identidad, registro y respuesta de claim; tipos derivados, sin cambiar el formato `maintenance/1`.
- `persistence.ts`: conserva exportaciones y semántica; valida identidades/claim y reutiliza el validador del registro en vez de duplicar comprobaciones parciales.
- `backend.ts`: snapshot completo, validación del registro, unicidad y distinción estricta entre `null` y corrupción en inspección.
- `test/maintenance-records.test.ts`: nueve pruebas nuevas, siete grupos de reproducción y dos de controles ya correctos.
- Documentación de contrato, validación, estado y continuidad; evidencia adicional separada de la histórica 81/81.

No se modificaron ADR-085/086/087/088, estados/recuperación, policy, digest canónico, runtime v1/v2/v3, dependencias, grants, checkpoints ni ledger operacional. No se inició M2 ni se requirió cambiar una decisión arquitectónica.

## Validación final

Copia desechable `/tmp/adr088-review-3lbnft2v`. Linux `6.18.55-2-cachyos-lts`, Node `v24.22.1`, npm `11.19.1`. Sin copiar datos, workspace, credenciales o `.git`; node_modules reutilizado por symlink, sin npm ci. Proveedores cloud deshabilitados y autenticación apuntada a directorio desechable. Ejecución fuera del sandbox, conforme al procedimiento documentado para pruebas entre procesos. Se comprobó igualdad byte a byte de fuentes/tests M1 entre copia y árbol de trabajo.

| Comando | Resultado |
|---|---|
| `npm run typecheck` | PASS, salida 0 |
| `npm run test:core` | **90/90 PASS**, 81 existentes más 9 nuevas |
| `npm run test:integration` | PASS, salida 0 |
| `npm run test:v2:integration` | PASS, salida 0 |
| `npm run test:v3:integration` | PASS, salida 0 |
| `git diff --check` | PASS |

Las tres integraciones se ejecutaron secuencialmente tras la suite. Evidencia nueva: [typecheck](evidence/adr088-m1-review-typecheck.txt), [suite](evidence/adr088-m1-review-core.txt), [integraciones](evidence/adr088-m1-review-integrations.txt). El expediente anterior 81/81 permanece como antecedente.

## Conclusión y riesgos residuales

M1 cumple sus criterios aprobados de protocolo portable, estados, replay, autorización y fallo cerrado dentro de la frontera documentada, tras corregir los hallazgos reproducidos. No queda bloqueo técnico M1 identificado por esta revisión. La aceptación/revisión del PR sigue siendo previa al merge; no se hace merge automáticamente.

Persisten las obligaciones M2 de integridad/procedencia/completitud del store y journal/ancla, y M3/M4 de exclusión/publicación. Validar forma y vínculos observables no detecta toda alteración sintácticamente válida ni acredita durabilidad física, aislamiento nativo o rollback. Ensayos nativos P03–P15/P19/P21 y C1–C8 no ejecutados; ADR-087 Incremento 2 no habilitado. La inspección no reconstruye evidencia faltante ni concede reapertura.
