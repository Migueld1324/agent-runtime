# M2 — importación y evolución del inventario

El aprovisionamiento implementado crea una instalación nueva, sin reutilizar inodes,
con ID aleatorio y stores nunca utilizados registrados como ausentes. No adopta
`data/` del checkout ni interpreta una base perdida como nueva.

La importación de instalaciones existentes permanece **no habilitada**. Conforme a
ADR-088 y al análisis, su procedimiento debe acreditar: origen realmente offline,
inventario completo (incluidos WAL/SHM/rollback journals), coherencia de conjunto,
copia en raíz nueva sin inodes/handles compartidos, integridad/terminalidad por
versiones conocidas y conservación de incertidumbre histórica. La comprobación
puntual de hashes antes/después no acredita esa frontera.

Los inspectores y snapshots M2 permiten examinar copias sintéticas y conservar
los inputs de recuperación. Siempre informan `boundary: unavailable`. No hay flag
para convertir esa observación en exclusión demostrada, ni importación por chmod.

## Recursos nuevos y evolución del inventario

El aprovisionamiento acepta únicamente IDs de stores allowlisted y crea sus
esquemas conocidos mediante código confiable, antes de sellar el inventario. Puede
crear todos los stores v1/v2/v3, ledger, grants y control, o dejar versiones nunca
usadas como ausentes. La identidad física se observa después de crearlos; no se
acepta un binding de cliente. Un fallo deja un aprovisionamiento incompleto que
no se adopta automáticamente al reiniciar.

No existe enrolamiento posterior ni migración de inventario: la aparición de un
store declarado ausente, un sidecar inesperado o la sustitución de un inode exige
cuarentena. Añadir recursos después del aprovisionamiento requiere un procedimiento
administrativo futuro con evidencia; no se permite arrancar una versión no
aprovisionada y luego confiar en lo que apareció. El primer perfil candidato
inspecciona recursos con identidad estable y sin sidecars inesperados. No es un
perfil de servicio desplegado o habilitado.

Las referencias de staging/respaldo pueden guardarse con la evidencia anclada.
Se verifican nuevamente al leer la historia; pérdida/corrupción bloquea en vez de
purgar o reconstruir. La autoridad conserva los artefactos; no existe API de borrado.

M3 aporta la frontera efectiva y retirada de accesos; M4 publica y recupera el
manifiesto con esa frontera. La recuperación de copias de SQLite no modifica el
origen ni convierte un snapshot observado en prueba de exclusión.
