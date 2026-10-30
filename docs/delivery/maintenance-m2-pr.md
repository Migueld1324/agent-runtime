# ADR-088 M2: identidad, inventario y evidencia administrativa

Descripción preparada para el único PR de `feat/adr088-maintenance-m2`.
**M2 aprobado por el responsable con tres condiciones de alcance, no tareas
pendientes**, registradas en [aprobación M2](maintenance-m2-approval.md).
Este documento no acredita edición del cuerpo del PR ni merge en GitHub.

Implementa almacenamiento administrativo separado con identidad persistente,
inventario protegido, journal SQLite/ancla y deduplicación durable. La pérdida o
sustitución de una base esperada bloquea la instalación; abrir o inspeccionar no
crea stores perdidos. Los inspectores v1/v2/v3 evalúan todos los runs y rechazan
formatos, agendas, vínculos o estados inciertos. Staging/respaldo conservan bytes y
digests; la recuperación explícita conserva observaciones secuenciales de los
archivos antes de permitir el rollback SQLite, sin prometer un snapshot conjunto.

Conserva el backend portable cerrado: no concede sesiones, exclusión, aplicación ni
reapertura. No inicia M3/M4 ni ADR-087 Incremento 2. Importación no habilitada;
procedimiento y límites en `maintenance-m2-import-plan.md`.

Validación reproducible: `python3 test/validate-maintenance-m2.py`, sobre copia nueva
con datos sintéticos. Evidencia y matriz en `maintenance-m2-validation.md`.
Incluye pruebas de concurrencia real, SIGKILL, rollback parcial, SQLITE_FULL y fallos
inyectados de escritura/sync. No acredita pérdida de energía ni EIO físico.

Validación: 125/125 tests core, typecheck, tres integraciones e inspección PASS.
P19 ejecutada manualmente por el responsable: uid 65534 sin acceso de lectura ni
escritura al journal/ancla, exit 0. Permisos probados en tmpfs; regresión de
almacenamiento en btrfs. No hay merge automático ni perfil nativo desplegado.

Revisión focalizada: copias forenses no atómicas y comprobaciones de rutas
condicionadas a propietarios confiables sin sustituciones concurrentes. Cinco
pruebas nuevas de caracterización y 17 de almacenamiento PASS; ver
`maintenance-m2-focused-review.md`. Sin cambios funcionales ni ampliación a M3.
