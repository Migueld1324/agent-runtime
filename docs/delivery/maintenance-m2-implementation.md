# ADR-088 M2 — implementación y continuidad

Estado: implementación y validación local M2 completas; entrega en `feat/adr088-maintenance-m2`; PR a cargo del responsable.
No habilita M3/M4 ni ADR-087 Incremento 2.

## Base verificada

El 30-10-2026 se consultó la API pública del PR #11: merged=true,
merged_at=2026-10-30T03:40:28Z, merge_commit_sha=4627b5b5a0341b3684106d74e99dc74e9459778d.
Tras git fetch origin, main y origin/main coinciden con ese commit. El diff de
árbol contra 778b415 es vacío: incluye la corrección de integridad 4af73d4 aunque
la integración reescribió los hashes. Árbol local inicialmente limpio; rama única
feat/adr088-maintenance-m2 creada tras git merge --ff-only origin/main.

## Decisiones de implementación autorizadas

ADR-088, secciones Datos y autoridad, Autorización/auditoría/persistencia y
Publicación/recuperación; plan M0–M6, fila M2 y P10/P11/P14/P18/P19/P21:

- Identidad aleatoria persistente creada únicamente por aprovisionamiento explícito
  en directorios nuevos. Identidad física de raíz/volumen y recursos observada por
  adaptador local; nunca derivada exclusivamente del pathname ni del cliente.
- Inventario versionado protegido separado de observaciones. Ausencia esperada
  exige registro de aprovisionamiento; abrir nunca crea recursos perdidos.
- Journal SQLite administrativo separado del ledger y de SqliteSaver. Eventos
  secuenciales encadenados; reconstrucción validada de requests/nonces/resultados.
- Ancla en otra base y directorio protegido fuera de recursos de negocio. Commit
  conjunto mediante ATTACH, rollback journals DELETE y synchronous=EXTRA, sin WAL.
  SQLite documenta atomicidad multiarchivo bajo este perfil:
  https://sqlite.org/lang_attach.html y https://sqlite.org/tempfiles.html.
  No hay transacción abierta durante efectos de negocio ni callbacks privilegiados.
- Ancla conserva identidad y cabeza de cadena: detecta sustitución/corrupción y
  rollback parcial respecto del ancla conservada. Restauración coordinada por
  administrador privilegiado queda fuera de la garantía, como exige ADR-088.
- Consultas son read-only y no recuperan journals silenciosamente. Almacenamiento
  ambiguo bloquea; recuperación nativa explícita con conservación de evidencia
  previa. Nunca borrar WAL ni recrear bases para continuar.
- Protección local exige identidad de autoridad y directorios privados, sin enlaces
  ni acceso ordinario. No equivale a frontera histórica de procesos M3; el backend
  portable seguirá rechazando sesiones, apply y reapertura.
- Staging/respaldo son artefactos privados verificados; no publican ni restauran
  recursos activos. Importación de checkout no administrado no es adopción por chmod.

## Continuidad verificada el 30-10-2026

La reconstrucción, cambios y matriz actual se conservan en
[validación M2](maintenance-m2-validation.md). Los hashes recibidos coincidían con
la evidencia previa: typecheck, 112 tests y tres integraciones PASS. Esa evidencia
no se descartó. La matriz anterior `NOT RUN` no reflejaba las ejecuciones existentes.

Se continuó con inspectores, cobertura negativa y fallos de artefactos, y se añadió
un runner reproducible: `python3 test/validate-maintenance-m2.py`. Evidencia nueva
separada en `evidence/adr088-m2-resume-*`, con hashes y copia aislada retenida.
Resultado final: 125/125 core, typecheck, tres integraciones e inspección PASS.

**P19 nativa PASS**, ejecutada manualmente por el responsable con uid 65534,
exit 0. Log, entorno tmpfs y digest del runner conservados; supera el bloqueo
de sudo y el fallo inicial por Node bajo NVM. Ver evidencia y límites en validación.
El responsable autorizó commit y push de esta entrega en la misma rama;
creará y revisará el PR. Las copias temporales de validación se conservan localmente
y no forman parte del commit.

Pérdida de energía/VM: no verificada. SIGKILL no la acredita.
Exclusión, publicación y reapertura efectivas son M3/M4 y permanecen deshabilitadas.

## Revisión focalizada solicitada por el responsable

Tras `21b1560`, se aclararon los límites de las copias previas a recuperación y las
comprobaciones por pathname. Las pruebas reproducen mezcla de commits y distinguen
sustituciones detectadas de carreras fuera del modelo de confianza. No se añadió
exclusión M3 ni cambió la lógica de producción. Ver
[revisión focalizada](maintenance-m2-focused-review.md); aprobación del PR pendiente.
