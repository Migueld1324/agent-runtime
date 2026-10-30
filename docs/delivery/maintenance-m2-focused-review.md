# M2 — revisión focalizada de recuperación y rutas

Base: `21b15604670025987ef56cb0d1509b4f1c62d20a`, rama
`feat/adr088-maintenance-m2`. Revisión solicitada antes de aprobar el PR.
No se reimplementa M2 ni se incorpora exclusión M3.

## Dictamen

Las dos reservas del revisor son válidas como límites de garantía. No se confirmó
un defecto bloqueante frente a usuarios ordinarios dentro de la base de confianza
M2. Sí se reprodujeron comportamientos que impiden prometer snapshot conjunto o
resistencia general a sustituciones concurrentes. Se acotaron contrato y comentarios;
la lógica de producción no cambia. Posteriormente, el responsable comunicó la
[aprobación de M2](maintenance-m2-approval.md) con tres condiciones de alcance,
no tareas pendientes: copias no atómicas, ausencia de protección frente a
sustituciones por la identidad de autoridad y SIGKILL sin acreditar durabilidad
frente a pérdida física de energía.

## Recuperación: copias observadas, no snapshot atómico

`recoverStorage` valida rutas, enumera y copia archivos por separado, escribe un
recibo de digests y después abre SQLite y solicita `BEGIN EXCLUSIVE`. No existe una
barrera anterior a la captura. La atomicidad transaccional journal/ancla de los
commits no se extiende a esas lecturas del filesystem.

Prueba reproducible: se intercepta el retorno de `readFileSync` del journal después
de leer sus bytes. En esa barrera, otro proceso real ejecuta `claim`, hace commit
y termina; luego continúa la copia del ancla. Se comprueba:

- Journal copiado: secuencia máxima 1; ancla copiada: secuencia 2.
- Cada digest del recibo coincide con el archivo capturado.
- La recuperación valida el estado activo y retorna; el claim concurrente permanece
  registrado y se deduplica como `existing`.

Es posible, por tanto, devolver éxito con copias que no representan un estado
conjunto. No es un ensayo probabilístico ni una inyección de bytes SQLite falsos:
el commit lo realiza la implementación normal en un proceso distinto. La barrera
es instrumentación del test; no se añadieron callbacks a la autoridad.

El recibo acredita bytes capturados, no coherencia temporal, completitud bajo
concurrencia o capacidad de restauración. La operación no reproduce estas copias
sobre las bases; valida las bases activas. Obtener una captura coherente exige
quiescencia de escritores administrativos dispuesta por el llamador confiable;
M2 no demuestra ni impone esa precondición. No se ofrece un flag como prueba.
Añadir un lock después de copiar o comparar hashes antes/después no supliría esa
frontera ni convertiría la captura en atómica.

Se corrigió además el comentario que afirmaba conservar tanto originales como
copias si fallaba la recuperación. Solo se promete conservar los archivos capturados:
al permitir la apertura SQLite, el origen y sus sidecars pueden ser modificados
por recuperación nativa antes de que falle una validación posterior.

## Rutas: defensa condicionada a propietarios confiables

`privateDirectory` comprueba directorios privados y ancestros confiables;
`protectedFile` observa tipo/propietario/permisos. `readRegular` compara identidad
antes de abrir, mediante fstat del descriptor y al terminar. Sus aperturas con
`O_NOFOLLOW` protegen el componente final, no fijan todo el árbol de ancestros.
`writeExclusive`, `syncDirectory` y las aperturas SQLite tampoco constituyen una
resolución atómica del namespace ni un mecanismo de fencing.

Se probaron tres situaciones:

1. Sustituir archivo o directorio padre entre la observación de identidad de
   `readRegular` y su apertura: ambas sustituciones se rechazan.
2. Hacer sustituible un ancestro para usuarios ordinarios o introducir symlink/
   hardlink estáticos: se rechazan.
3. Sustituir un archivo por otro de modo 0644 **con la identidad de autoridad**
   después de la observación de permisos de `protectedFile` y antes de la
   observación independiente de identidad de `readRegular`: devuelve los bytes del
   reemplazo. Una segunda lectura sin la carrera rechaza el modo 0644.

El tercer caso demuestra que los checks no componen una apertura atómica con
permisos comprobados. Es una caracterización del límite actual, no una propiedad
que deba mantenerse si un endurecimiento futuro la elimina. El escritor del test
controla un directorio privado de la autoridad: no representa al usuario ordinario
sin acceso de P19. Bajo M2 se confía en esos propietarios y se presupone que no
reemplazan rutas ni cambian permisos concurrentemente. Si se exige resistir a ese
actor, la garantía actual es insuficiente; no se presenta como resuelta por esta
revisión ni se rebaja la obligación futura de frontera M3.

## Validación reproducible

Archivo: `test/maintenance-storage-guarantees.test.ts` (cinco pruebas nuevas).
Se ejecutó junto a las 17 pruebas existentes de `maintenance-storage.test.ts`:
**22/22 PASS**, exit 0. Typecheck PASS. Node v24.22.1, Linux, temporales en btrfs;
no se leyeron ni modificaron stores reales del checkout.

Desde Bash, en un entorno que exponga los propietarios reales (fuera del sandbox
que remapea ancestros):

```bash
review_tmp=$(mktemp -d "$PWD/.adr088-m2-focused-XXXXXX")
TMPDIR="$review_tmp" node --disable-warning=ExperimentalWarning \
  --experimental-strip-types --test \
  test/maintenance-storage-guarantees.test.ts test/maintenance-storage.test.ts
npm run typecheck
```

Los fixtures individuales se eliminan al terminar; el directorio exterior queda
retenido. Las mutaciones instrumentadas se realizan bajo el uid de autoridad y
los mocks se restauran en finally. No se afirma haber hecho una carrera de un
usuario ordinario hostil ni una prueba de exclusión nativa.

Evidencia retenida: `evidence/adr088-m2-focused-storage-tests.txt`,
`evidence/adr088-m2-focused-typecheck.txt` y
`evidence/adr088-m2-focused-environment.json` (entorno, método y digests).
La regresión anterior 125/125, las tres integraciones y P19 conservan sus logs;
no se atribuye una nueva ejecución de esas suites a esta revisión. No se repiten
porque solo se añadieron pruebas y se precisaron comentarios/documentación.
