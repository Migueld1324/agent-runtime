# ADR-088 M2 — aprobación y condiciones de alcance

**Estado: M2 aprobado por el responsable del proyecto el 30-10-2026.**

Procedencia: confirmación explícita del responsable en la conversación de trabajo,
después de la revisión focalizada publicada en `6d7ac9b`, sobre la implementación
M2 de `21b1560`, en la rama `feat/adr088-maintenance-m2`. El responsable solicitó
registrar esta aprobación y publicar el registro en la misma rama.

## Condiciones de la aprobación

El responsable indicó expresamente: «La aprobación tiene tres condiciones de
alcance, no tareas pendientes de M2»:

1. Las copias de recuperación no deben tratarse como snapshots atómicos.
2. Las comprobaciones de rutas no protegen frente a sustituciones concurrentes
   realizadas por la propia identidad de autoridad.
3. No se debe interpretar la validación de SIGKILL como una prueba de durabilidad
   frente a pérdida física de energía.

Estas condiciones delimitan las garantías aceptadas. No constituyen defectos
pendientes, nuevos criterios de aceptación ni tareas requeridas para cerrar M2.
M2 queda aprobado dentro de ese alcance; la aprobación no amplía sus garantías.

## Evidencia y separación de fases

La [validación M2](maintenance-m2-validation.md) conserva la regresión 125/125,
typecheck, tres integraciones, inspección de stores y P19 manual. La
[revisión focalizada](maintenance-m2-focused-review.md) documenta las reproducciones
de los límites de recuperación y rutas, con 22/22 pruebas y typecheck PASS.
El [contrato de almacenamiento](maintenance-m2-contract.md) mantiene esos límites.

Este registro acredita la aprobación comunicada por el responsable; no afirma un
merge ni un estado de revisión en GitHub que no se haya verificado. No habilita
M3/M4, ejecución, publicación de descriptores, reapertura ni ADR-087 Incremento 2.
No modifica la ADR-088 ni el protocolo `maintenance/1`.
