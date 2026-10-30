# ADR-088 M1 — contrato implementado y frontera M2

`src/maintenance/` implementa `maintenance/1`, independiente de runs, herramientas, grants y proveedores. No importa los módulos v1/v2/v3, abre bases, crea directorios, arranca ejecutores ni publica archivos. La composición disponible es `PortableMaintenanceBackend`; no tiene interruptor para habilitar un adaptador nativo.

## Frontera de persistencia

M1 define `MaintenancePersistence` y `RequestLedger`; **no incluye un store de producción**. M2 deberá implementar el journal administrativo y su ancla protegida, inventario, identidad y recuperación de almacenamiento. No se añaden tablas a SqliteSaver, grants, ledger v3 o control del runtime. El doble `test/helpers/maintenance.ts` modela commits, reapertura y fallos; no acredita durabilidad física ni detección de rollback.

El puerto exige estas operaciones de la autoridad:

| Operación | Obligación de M2 |
|---|---|
| `claim(identity)` | Reservar atómica y durablemente `(installationId, requestId)` y consumir `(installationId, nonce)` en la misma transacción. Comparar toda la identidad; devolver registro existente si coincide, `conflict` si cambia, `replay` si otro request consumió el nonce. No consumir un nonce al rechazar conflicto. |
| `complete(identity, result)` | Solo completar la reserva exacta, con resultado inmutable y durable. Una repetición idéntica es inocua; no sobrescribir un resultado diferente. |
| `read` / `readOperation` | Consultar registros sin inicializar ni reparar stores. Validar primero versión, integridad y correspondencia con ancla/generación. Ausencia, corrupción o rollback no equivalen a un journal vacío. |
| `recordRejection` | Añadir protocolo, método y código normalizado, sin consumir nonce ni registrar contenido/identidad aportados por un cliente no autenticado. |

Las claves de request no dependen de principal, acción ni generación: cambiarlos con el mismo ID produce conflicto. El digest vincula plan, autorización, request y sesión, cuando corresponda. El nonce no se recicla al avanzar generación. Los registros incluyen principal/consentimiento referenciados, operación, versión, generación y digest; no guardan tokens ni contenido de herramientas.

La autenticación y policy se evalúan **antes** de consultar/reservar una solicitud. Un intento de un tercero no consume consentimiento ajeno. Incluso una repetición exacta exige autoridad vigente; tras revocación/expiración, el resultado histórico puede consultarse mediante `inspect` con permiso administrativo independiente. Esto evita que deduplicación se convierta en autorización.

Un claim pendiente significa resultado desconocido: no vuelve a ejecutar nada. Si falla `claim`, se informa `maintenance_persistence_failed` y no se inicia efecto; el adaptador pudo haber confirmado la reserva antes de perder la respuesta. Si falla `complete`, se informa `maintenance_outcome_indeterminate`; inspección posterior determina qué quedó durable. No hay callback de efectos ni transacción sostenida durante una operación externa. Un recibo aplicado exacto se devuelve sin convertirlo artificialmente en `already_applied`; este último requiere la evidencia de recuperación de ADR-088.

La ausencia del puerto es la configuración por defecto: M1 rechaza operaciones mutantes, sin prometer deduplicación durable de esos rechazos ni crear almacenamiento. La presencia del puerto solo permite conservar solicitudes/rechazos; **no habilita sesiones, exclusión, publicación o reapertura**. M2–M4 deberán componer además fases/evidencia, journal/ancla, adaptador y publicador. No se ofrece una vía parcialmente segura para ejecutar mantenimiento antes de esas etapas.

## Datos y codec

Los validadores públicos están en `contracts.ts`: binding, plan, autorización, sesión, capacidades, evidencia y resultado. Todos exigen `protocol: maintenance/1`, campos exactos y objetos JSON planos; devuelven snapshots recursivamente congelados. Se rechazan getters sin invocarlos, prototipos ajenos, símbolos, ciclos, arrays dispersos/con propiedades extra, campos desconocidos, sustitutos Unicode aislados, `undefined`, bigint, números no finitos, fracciones, `-0` y enteros fuera del rango seguro.

Límites del snapshot: profundidad 32, 20.000 nodos y 262.144 unidades UTF-16 acumuladas entre claves/strings. Campos string: 1–4.096 unidades; listas: máximo 1.024 elementos. Versiones de operación admitidas: 1. IDs de request: 1–128 caracteres ASCII alfanuméricos o `._:-`. Los inventarios no pueden estar vacíos ni repetir IDs; los recursos del plan deben pertenecer al inventario y ser únicos. Las claves completas de grants afectados no se duplican. `historical_grant_revoke` representa exactamente una clave, como operación separada. Estos checks no prueban procedencia ni completitud del inventario.

Los digests/huellas se representan como `sha256:` seguido de 64 hexadecimales minúsculos. Las referencias de recursos son identidades lógicas, no rutas ejecutables ni handles. Las strings de cambios/restricciones/precondiciones son datos para revisión, nunca instrucciones ejecutables. El plan liga instalación/generación, raíz/volumen, inventario con esquema y presencia esperada, recursos, operación, huellas, contenido, grants, interrupción y recuperación.

El codec `maintenance-canonical/1` es propio; no usa ni modifica ADR-087:

1. Validar y copiar la entrada; para plan, aplicar además su validador completo.
2. Ordenar claves de cada objeto por unidades UTF-16 (`Array.sort()` sin comparador).
3. Mantener orden de arrays y Unicode exacto, sin NFC/NFD; rechazar sustitutos aislados.
4. Escapar strings y representar enteros con `JSON.stringify`; JSON compacto sin espacios.
5. SHA-256 sobre UTF-8 de `maintenance/1\nmaintenance-canonical/1\nplan\n` seguido del JSON canónico. Solicitudes usan dominio `request` en vez de `plan`.

Vector fijo: el plan sintético de `test/helpers/maintenance-plan.ts` produce `sha256:054fbada1cddb34d168121cb4a87c6c080a0c51a331d19a459276f8b5726b655`. Se comprobó independientemente con Python (`json.dumps`, claves ordenadas, separadores compactos y SHA-256); el vector contiene claves ASCII. La ordenación suplementaria se prueba por separado: `{"\uE000":1,"😀":2,"a":"\n"}` se codifica con claves `a`, `😀`, `\uE000`. Arrays invertidos y Unicode compuesto/descompuesto producen identidades distintas.

Un resultado aplicado/no aplicado confirmado exige referencia de evidencia y código nulo. Rechazo/incertidumbre exige código; incertidumbre no permite declarar admisión abierta. Una evidencia con resultado debe vincular la misma operación y referencia; una observación no disponible tiene valor desconocido. Son consistencia de formato, no prueba de que ocurrió el hecho.

## Autoridad y acciones

`MaintenancePolicy<C>` recibe una `Authority<C>` de composición confiable: autenticador de transporte, policy vigente, consulta de consentimiento no revocado y reloj. `C` es contexto del transporte, **nunca el JSON de principal enviado por el cliente**. Un futuro adaptador HTTP/IPC debe obtenerlo de su canal autenticado; M1 no añade ese transporte ni un emisor de consentimientos. La autoridad y la policy forman parte de la base de confianza.

La autorización presentada debe coincidir íntegramente con el consentimiento de la autoridad; principal y rol deben coincidir con la identidad autenticada, y la policy vigente debe conceder la acción. Se comprueban ID/versión de policy, acción, plan/digest, instalación/generación, nonce, interrupción exacta y vigencia `[notBefore, expiresAt)`. Las seis acciones son `inspect`, `interrupt`, `apply`, `revoke_historical`, `recover` y `reopen`. Inspección tiene permiso separado y no consume consentimiento mutante. Cada llamada mutante requiere su consentimiento de acción; M1 no implementa consentimientos que autoricen una secuencia implícita.

La futura autoridad debe revalidar justo antes de cada efecto; una comprobación anterior o un nonce reservado no autorizan por sí solos una publicación. Expiración/revocación no cancela una escritura ya aceptada ni acredita muerte del publicador.

## Estados y recuperación

`state.ts` implementa la tabla completa de ADR-088, guards con comprobaciones ternarias (`confirmed`, `denied`, `unknown`), arranque cerrado e interrupción a cuarentena. Solo `confirmed` permite avanzar. Reinicio ignora `NORMAL` histórico; cancelación, pérdida de autoridad y fallo de almacenamiento no abren admisión. No hay TTL ni `finally` de reapertura.

`transition` y `reconcile` son funciones de decisión puras: los checks pertenecen al futuro adaptador confiable, no a clientes. Ningún booleano ni estado declarativo acciona el SO. `reconcile` exige retirada del publicador, exclusión nueva, identidad/generación, inventario, intención y respaldo antes de clasificar. Origen exacto sin publicación permite recomendar `not_applied`; destino preparado/sincronizado con resultado ausente permite recomendar `applied`; destino/resultados exactos permiten `already_applied`. Contradicciones permanecen indeterminadas; runs no terminales rechazan migración. Todas las recomendaciones mantienen cuarentena, no publican ni reabren y todavía requieren registro/cierre durable por M2–M4.

## Uso y diagnóstico del backend portable

- `probe(binding)`: validación acotada e informe fijo de capacidades no disponibles, sin tocar almacenamiento.
- `preview(context, plan)`: inspección autorizada y plan validado con digest; `informative: true`, snapshot `caller_export_unverified`. No es lectura del inventario activo, autorización ni reserva; debe repetirse bajo exclusión futura.
- `enter`, `apply`, `recover`, `leave`: validan solicitud exacta, autorización y vínculos de sesión cuando proceda; deduplican mediante el puerto si existe y rechazan con `maintenance_exclusion_unavailable`. No emiten sesión utilizable.
- `validate`: inspección autenticada, sesión con forma válida y rechazo de exclusión; una referencia bien formada no concede autoridad.
- `inspect`: consulta administrativa de resultados persistidos por operación, sin reparar. Con puerto ausente, rechaza. Un resultado pendiente se informa indeterminado; generaciones inconsistentes o almacenamiento inválido fallan cerrados.

El backend informa admisión `unknown`: no tiene observador/actuador nativo para afirmar que el servicio real está detenido. El modelo de estados empieza cerrado como decisión administrativa; no confundirlo con una barrera OS instalada. Los resultados de inspección son recibos históricos, no observaciones actuales de admisión.

No existe CLI de mantenimiento ni instrucciones para aplicar cambios sobre datos del usuario. Para integrar la biblioteca se provee el canal administrativo confiable y, opcionalmente, el puerto de persistencia; los tests muestran la composición sintética. En un checkout normal solo tiene sentido probe/preview. Un error no se resuelve con permisos extra, borrado de locks o reintento automático: mantenimiento real sigue pendiente de M2–M4 y habilitación por perfil. ADR-087 Incremento 2 continúa cerrado.
