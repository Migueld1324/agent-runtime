# feat: implement ADR-088 M1 portable maintenance protocol

Implementa M1 completo de ADR-088: contratos `maintenance/1`, digest canónico independiente, autorización administrativa por acción, estados/recuperación y deduplicación con un puerto de persistencia. Una solicitud con identidad falsa, consentimiento obsoleto o nonce reutilizado se rechaza; una intención sin resultado permanece indeterminada y no vuelve a ejecutar nada.

El backend portable permite probe/preview informativo y consulta administrativa cuando existe persistencia. No emite sesiones aplicables, publica cambios ni reabre servicios. M1 define las obligaciones transaccionales; journal/ancla e identidad/inventario reales siguen en M2, y exclusión/publicación en M3/M4. Los dobles de tests no acreditan garantías nativas.

Conserva ADR-085/086/087: ningún cambio al runtime v1/v2/v3, grants, huellas, ledger, checkpoints o dependencias. No habilita ADR-087 Incremento 2.

Validación en copia aislada con Node 24.22.1: typecheck, **90/90 tests** y las tres integraciones secuenciales PASS; diff sin errores. Incluye matriz completa de estados, autenticación/expiración/revocación, digest, replay, concurrencia lógica, respuesta perdida, corrupción y fallos de persistencia/auditoría. Pruebas nativas P03–P15/P19/P21 y C1–C8 no ejecutadas.

Documentación y evidencia:

- `docs/delivery/maintenance-m1-contract.md`: interfaces, codec y frontera M1/M2.
- `docs/delivery/maintenance-m1-validation.md`: comandos, resultados y trazabilidad.
- `docs/delivery/maintenance-m1-implementation.md`: continuidad de la entrega.

Requiere revisión antes del merge. No hacer merge automáticamente.

Revisión final de integridad: validación estricta de identidad, registro y variantes de claim; inspección rechaza registros parciales, colecciones dispersas y requests/nonces contradictorios. Nueve regresiones nuevas; evidencia y riesgos residuales en `docs/delivery/maintenance-m1-review.md`. PR existente: #11; esta descripción preparada no acredita edición del cuerpo remoto.
