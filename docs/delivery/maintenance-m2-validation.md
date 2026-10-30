# ADR-088 M2 — validación y pendientes

Estado: **implementación y validación local M2 completas**. P19 nativa PASS,
ejecutada manualmente por el responsable. Entrega en `feat/adr088-maintenance-m2`; creación y revisión del PR a cargo del responsable.
No se habilitan M3/M4, publicación, reapertura ni ADR-087 Incremento 2.

## Reconstrucción del punto de partida (30-10-2026)

Rama `feat/adr088-maintenance-m2`, HEAD `4627b5b`, sin commits M2.
Los archivos M2 estaban sin seguimiento; no había modificaciones de archivos
versionados. Se conservaron las tres carpetas `.adr088-m2-validation-*` y toda la
evidencia previa. Se comparó SHA-256 de **cada** entrada de
`evidence/adr088-m2-source-digests.json` con el working directory: cero diferencias.

Por tanto, la evidencia previa sí corresponde al código recibido: typecheck,
112/112 tests core, las tres integraciones y la inspección de sus stores pasaron.
El `NOT RUN` global del documento de implementación estaba desactualizado; los
resultados no significaban que los criterios de aceptación completos estuvieran
satisfechos. No se repitió el aprovisionamiento ni se adoptó `data/` del checkout.

## Cambios tras la reanudación

- El inspector exige una historia de checkpoints enlazada, sin ciclos, ramas ni
  terminales desconectados seleccionados solo por orden de ID. Historias ambiguas
  se rechazan conservadoramente.
- Valida nodos de agenda conocidos por versión, forma de `versions_seen` y presencia
  de versión para canales de scheduling. No interpreta una agenda desconocida como
  ausencia de trabajo.
- Grants con estado desconocido se rechazan. Recuperaciones inconsistentes con el
  contador del checkpoint, targets desconocidos o vínculos ausentes no permiten
  terminalidad.
- El archivo de control se inspecciona: vacío aprovisionado o SQLite vacío conocido;
  tablas ajenas/corrupción/sidecars bloquean, sin inicializar ni reparar el archivo.
- Pruebas adicionales de pausados/recuperables, ledger huérfano, bindings, grants
  históricos y registro; inyección EIO/ENOSPC en escritura, fsync de archivo y
  fsync de directorio de artefactos. Estas últimas son fallos **inyectados**, no
  ensayos de hardware o filesystem lleno.
- La prueba de competencia comprueba como máximo un claim aceptado y concordancia
  con el journal. El contrato `busy_timeout=0` admite que ambos contendientes fallen
  cerrados: una pasada anterior falló por exigir exactamente un ganador. Se retuvo
  en `evidence/adr088-m2-contention-failure-*`. Una solicitud posterior verifica si
  el nonce quedó libre o consumido; no se añadió retry implícito a la autoridad.

## Reproducción y evidencia

Desde el repositorio: `python3 test/validate-maintenance-m2.py`.
El runner copia código/tests/examples a un directorio nuevo y privado del mismo
filesystem, enlaza dependencias y ejecuta secuencialmente typecheck, core, las tres
integraciones mock e inspección de los stores generados. Retiene los inputs; no usa
ni modifica datos operacionales del checkout. Los tests usan TMPDIR propio.

La ejecución requiere que el entorno exponga los propietarios reales de los
ancestros. El sandbox de esta sesión remapea propietarios y bloquea correctamente
las premisas de `privateDirectory`; la primera ejecución dentro del sandbox no
acredita un RED funcional (`adr088-m2-resume-sandbox-blocked.txt`). La validación
se ejecutó fuera del sandbox con autorización, sin relajar la protección del código.

Resultado final: **125/125 tests core**, typecheck, tres integraciones y la
inspección de stores PASS (todos exit 0), en `.adr088-m2-resume-_nel_4id`.
Las fuentes y tests de esa copia siguen coincidiendo, salvo el runner P19,
corregido y validado manualmente después; su digest se registra por separado.

Evidencia actual bajo `docs/delivery/evidence/adr088-m2-resume-*`:

- `environment.json`: checkout retenido, kernel, Node, filesystem btrfs y exit codes.
- `source-digests.json`: SHA-256 de fuentes y tests de la copia ejecutada.
- `typecheck.txt`, `test-core.txt`, `test-integration.txt`,
  `test-v2-integration.txt`, `test-v3-integration.txt`: logs de cada comando.
- `real-store-inspection.txt`: informes v1/v2/v3; el run v2 revocado permanece no
  terminal, los tres runs v3 conservan terminalidad con sus vínculos de ledger.

La evidencia anterior sin prefijo `resume` se conserva como revisión previa,
no como validación de los cambios posteriores.

## Matriz de aceptación M2

| Criterio | Resultado verificable | Pendiente/límite |
|---|---|---|
| Identidad/generación, ausencia y sustitución | PASS: reapertura, generación, inodes, bases ausentes/sustituidas y restore parcial en SQLite real | No prueba frontera histórica M3 |
| Inventario, sidecars, esquemas | PASS: ausencia aprovisionada, stores presentes/perdidos, WAL en copias, registro/grants/control | Importación permanece no habilitada |
| Terminalidad v1/v2/v3 | PASS: fixtures positivos/negativos y stores generados por integraciones; todos los runs inspeccionados | Autenticidad retrospectiva fuera de garantía; formatos desconocidos bloquean |
| claim/nonce/resultados | PASS: reapertura, identidad completa, inmutabilidad, dos procesos concurrentes y composición M1 | No acredita exclusión de ejecutores |
| Cadena/ancla/rollback parcial | PASS: manipulación, restore parcial de ambas contrapartes, pérdida y sustitución | Restore coordinado privilegiado fuera de garantía |
| Recuperación administrativa explícita | PASS: SIGKILL con páginas modificadas, lectura bloqueada y copias antes del rollback nativo | SIGKILL no equivale a corte de energía; no recupera negocio; copias secuenciales no son snapshot conjunto |
| Fallos y retención de artefactos | PASS: bytes/digests y referencias ancladas, corrupción; EIO/ENOSPC inyectados en write/fsync; SQLITE_FULL real al reclamar | No se probó fallo físico EIO/ENOSPC; publicación/rename/cierre son M4 |
| Protección P19 | PASS: modos/ancestros, canario/policy y ejecución manual con uid 65534; lectura y escritura denegadas en journal/ancla, exit 0 | Ensayo en tmpfs: acredita permisos, no persistencia tras reinicio ni frontera M3 |
| P23 | PASS: typecheck, 125/125 core, tres integraciones e inspección; todos exit 0 | No se atribuye CI hospedada |

## P19: bloqueo inicial resuelto y entrega pendiente

El primer intento automatizado fuera del sandbox terminó en `sudo: a password is
required`, exit 1. El responsable ejecutó después el runner manualmente con sudo.
No se modificaron cuentas, sudoers ni permisos de datos reales.

La rama sigue siendo única: `feat/adr088-maintenance-m2`. La implementación y su
validación local están completas dentro del alcance M2 descrito por esta matriz.
El responsable autorizó commit y push de M2 y creará/revisará el único PR.
El agente no crea el PR ni hace merge; no se desbloquean M3/M4 o ADR-087 Incremento 2.

## Intento manual P19 y corrección del runner

El 30-10-2026 el usuario ejecutó P19 con sudo, Node v24.22.1 y `/tmp` tmpfs.
El padre privilegiado arrancó, pero el hijo uid 65534 no pudo ejecutar el binario
bajo `/home/migue/.nvm`: `spawnSync ... EACCES`, exit 1. Este resultado no prueba
acceso denegado al journal/ancla: el hijo nunca llegó a comprobarlos. Log conservado
en `evidence/adr088-m2-native-permissions-nvm-failure.txt`.

El runner ahora copia el ejecutable Node al fixture temporal propiedad de root,
con modo 0755 y padre atravesable. No modifica permisos del home, de NVM ni de los
directorios administrativos. La copia se elimina en el mismo finally del fixture.
El responsable repitió la prueba en la misma sesión y obtuvo:

```text
PASS P19: distinct uid denied read/write on journal and anchor; no business resources used
Exit code: 0
```

Se comprobaron los archivos guardados `evidence/adr088-m2-native-permissions.txt` y
`evidence/adr088-m2-native-permissions-environment.txt`: Linux
6.18.55-2-cachyos-lts, Node v24.22.1, `/tmp` tmpfs. La ejecución fue manual, no del
agente. El digest del runner y los logs revisados figuran en
`evidence/adr088-m2-native-permissions-validation.json`.

El runner comprueba que el hijo realmente arranca con uid 65534 y exige EACCES
para lectura y apertura r+ de ambos archivos. El PASS supera el fallo previo de
NVM. Typecheck pasó tras corregir el runner; producción y tests core no cambiaron.
P19 acredita permisos bajo este entorno; no acredita persistencia de tmpfs,
retirada de handles ni despliegue de autoridad separada M3.

## Revisión focalizada posterior al commit 21b1560

Ver [recuperación y sustitución de rutas](maintenance-m2-focused-review.md).
Se reproducen los límites de captura secuencial y comprobaciones por pathname;
no se declara exclusión adicional. Cinco pruebas nuevas de caracterización y las
17 pruebas de almacenamiento existentes: 22/22 PASS. La regresión completa 125/125
y P19 anteriores conservan su alcance; no se presentan como nuevas ejecuciones.
