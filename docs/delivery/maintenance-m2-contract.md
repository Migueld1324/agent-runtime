# M2 — contrato de almacenamiento candidato

Estado: implementación y validación local M2 completas; entrega en `feat/adr088-maintenance-m2`; PR a cargo del responsable.
La ADR y `maintenance/1` no se modifican. Este contrato describe APIs internas de
la autoridad, no endpoints para clientes ni permisos de mantenimiento.

## Composición y confianza

`SqliteMaintenancePersistence` implementa `MaintenancePersistence`. Se conecta
como segundo argumento de `PortableMaintenanceBackend`, después de la policy M1.
La composición conserva autorización antes de claim/lookup. Sus métodos directos
son internos de la autoridad; no autentican una declaración del cliente.
El backend conserva capacidades no disponibles, sesiones denegadas y admisión
`unknown`. El modelo de arranque M1 continúa cerrado. No hay integración con CLI,
supervisor, ejecutores, locks operacionales, publicación o reapertura.

`StorageLocation` procede de configuración confiable y fija tres directorios:
datos, journal y ancla. Aprovisionamiento crea directorios nuevos, rechazando
adopción de existentes. UUID aleatorio, generación 0, identidad dev/inode de raíz,
volumen y recursos, inventario de esquema conocido y ausencias esperadas se sellan
en el primer evento. El ancla incluye además los inodes del journal y del ancla.
Un restore sobre otros inodes se rechaza aunque los bytes coincidan.

El adaptador local exige Linux, directorios 0700 propiedad de la autoridad,
ancestros no sustituibles por otros usuarios (ancestro sticky permitido), archivos
sin symlinks/hardlinks y sin permisos para grupo/otros. La identidad de autoridad
forma parte de la base de confianza. **La implementación no configura cuentas ni
impide accesos de procesos de esa misma identidad.** Debe desplegarse mediante una
autoridad separada del runtime/CLI; ese despliegue no está acreditado. No resiste a
root/kernel/autoridad comprometidos ni dispositivos que incumplen flush.

Las comprobaciones por pathname son observaciones sucesivas, no una resolución
atómica de todo el árbol ni fencing. `O_NOFOLLOW` cubre el componente final de las
aperturas que lo usan; no fija sus ancestros. `readRegular` compara dev/inode antes,
en el fd abierto y después, pero no vuelve atómica la comprobación previa de
permisos de `readProtected`. Las aperturas de SQLite también son por pathname.
Se presupone que los propietarios confiables no cambian rutas/permisos durante la
operación. Un escritor con la misma identidad de autoridad o privilegios sobre
esos directorios puede violar esa premisa; no se promete resistencia a sus carreras.
P19 prueba denegación a otro uid en los fixtures, no inmunidad a sustitución por la
autoridad. Ejemplos reproducibles y alcance en [revisión focalizada](maintenance-m2-focused-review.md).

La lista técnica de filesystems candidatos no es lista de perfiles habilitados:
ext4, XFS, btrfs, overlayfs y tmpfs permiten pruebas de proceso; tmpfs no acredita
persistencia a reinicio. NFS/SMB y tipos desconocidos se rechazan. La validación
retenida distingue disco btrfs de ensayos anteriores en tmpfs.

## Journal y ancla

Formato interno `maintenance-journal/1`, tabla `events` y base adjunta `anchor.seal`.
No se añaden tablas a stores operacionales. SHA-256 con dominio propio sobre
secuencia, hash previo y payload JSON canónico; no cambia ningún digest M1.
Todos los eventos se reconstruyen y validan antes de cada consulta o mutación.
La cabeza/longitud deben coincidir con el ancla; una lista vacía solo es legítima
si proviene de una historia íntegra y no tiene solicitudes de esa operación.

`BEGIN IMMEDIATE`, `journal_mode=DELETE`, `synchronous=EXTRA` en ambas bases y
commit conjunto ATTACH serializan solicitudes/nonce/ancla. No hay callbacks de
negocio dentro de la transacción. Los archivos deben estar en el mismo dispositivo.
La correspondencia se verifica en un snapshot transaccional. Contención puede
producir fallo cerrado; no hay reintento implícito ni robo por timeout.

La reconstrucción conserva request key `(installationId,requestId)` independiente
de principal/generación, nonce no reciclable, identidad completa y resultado
inmutable. `complete` no crea solicitudes. Referencias de evidencia deben existir,
corresponder a operación/autorización/generación y contener el resultado exacto.
`recordEvidence` conserva plan, consentimiento referenciado, observaciones M1 y
referencias de artefactos. Rechazos almacenan solo protocolo/método/código.

`advanceGeneration` es un contador durable con comparación de generación esperada;
no acredita muerte del dueño anterior ni crea una sesión sucesora. La inspección
de generaciones históricas no cambia resultados.

Se detectan alteración, omisión, truncamiento y rollback parcial de journal o ancla
contra la contraparte retenida. No se detecta necesariamente una restauración
coordinada de ambos por el administrador privilegiado. Identidad física y hashes
no autentican retrospectivamente una historia operacional falsificada por un
escritor legítimo. No hay promesa de detección universal de rollback de datos.

## Recuperación y artefactos

Consultas rechazan sidecars y modos incompatibles antes de abrir SQLite. No
inicializan bases faltantes ni recuperan journals silenciosamente.
`recoverStorage` es explícito, solo sobre las bases administrativas existentes:
conserva primero copias privadas y recibo de digests, permite a SQLite su rollback
nativo, comprueba cadena/ancla/inventario y añade recibo durable de recuperación.
No borra journals/WAL ni elige historia por timestamps. Datos incompatibles siguen
bloqueados. Se ensayó SIGKILL con páginas modificadas; eso no es corte de energía.

Las copias de `recoverStorage` se leen secuencialmente **antes** del bloqueo SQLite.
El recibo `maintenance-storage-recovery/1` y sus digests acreditan los bytes capturados,
no simultaneidad, completitud frente a escritores concurrentes ni una copia
restaurable. Sin quiescencia externa pueden mezclar commits y contener datos de una
escritura en curso. El llamador confiable debe disponer ausencia de escritores
administrativos si necesita una captura forense coherente; M2 no impone ni acredita
esa condición y no proporciona un flag que la convierta en garantía.

El `BEGIN EXCLUSIVE` posterior y la validación de cadena/ancla/inventario se aplican
a las bases activas, no certifican retroactivamente las copias. Un retorno exitoso
no certifica coherencia de la captura. Las copias no se usan para restaurar ni para
elegir una historia. Si la validación falla, se conservan los archivos capturados,
pero SQLite puede haber recuperado/modificado originales o sidecars al abrirlos:
no se promete que el origen permanezca byte a byte intacto tras un fallo.

`MaintenanceArtifacts` sincroniza archivo y directorio y verifica bytes/digest.
Las referencias incorporadas al journal se revalidan al reconstruirlo; pérdida o
cambio bloquea. No hay publicación, restauración de descriptor, purga ni rollback
de grants. Artefactos no referenciados todavía no prueban preparación durable.

`prepareInspectionSnapshot` conserva DB y sidecars y recupera **solo copias** para
crear una base de inspección DELETE. Conserva evidencia de la operación de copia.
Devuelve siempre frontera no disponible: estabilidad de hashes antes/después y
consistencia por base no demuestran exclusión ni coherencia global.

## Inspectores e inventario

Inventario `maintenance-inventory/1`: layouts fijos de stores, registry, control y
WAL/SHM/journals. Presencia inesperada, pérdida de recurso esperado, enlace,
sustitución y esquema desconocido bloquean. Los stores nuevos se crean únicamente
en aprovisionamiento explícito; nunca en inspección. Registro se interpreta sin
`listTools`; grants se leen sin `GrantStore` y se conservan claves históricas.

Inspectores v1/v2/v3 interpretan esquema SqliteSaver conocido y checkpoint v4.
Exigen integridad SQLite, versiones/namespaces conocidos, vínculos de checkpoints y
writes, scheduling sin tareas pendientes y semántica específica de cada versión.
V1 no obtiene un status inventado; terminales históricos no reciben evidencia de
éxito. V3 verifica vínculos de ledger/run/criterio/proveedor, invocaciones,
observaciones, grants inciertos y recuperaciones. Status terminal aislado no basta.
Formatos o agendas desconocidas se rechazan, sin actualización del store.

La reanudación amplió cobertura negativa del intérprete y añadió fallos EIO/ENOSPC
inyectados en escritura/sync de artefactos. Se rechazan ciclos/ramas de checkpoints,
agendas desconocidas, grants desconocidos, recuperaciones contradictorias y esquema
ajeno en control. P19 con uid 65534 pasó en ejecución manual del responsable,
en tmpfs; no acredita persistencia tras reinicio ni despliegue M3. La validación
local M2 queda documentada; evidencia, reproducción y límites en [validación M2](maintenance-m2-validation.md).
