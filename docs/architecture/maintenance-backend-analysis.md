# Maintenance Backend — investigación, amenazas y alternativas

**Estado del análisis original:** soporte a la propuesta de [ADR-088](../decisions/088-maintenance-backend.md) al corte del 27-10-2026, entonces sin aprobación registrada ni implementación. **Actualización 28-10-2026:** ADR-088 y ADR-087 Incremento 1 aprobadas por confirmación explícita externa del responsable; [procedencia y alcance](../decisions/087-increment-1-approval.md). El análisis conserva su evidencia histórica y límites técnicos; no acredita implementación ni autoriza el Incremento 2 o mantenimiento real.

**Corte:** 27-10-2026, código y documentación de `5aa4eac` en `origin/main`. Revisión estática y consulta de documentación primaria; no se ejecutaron ensayos de aislamiento ni migraciones. Las recomendaciones son inferencias de diseño, no garantías acreditadas por las fuentes o por la presencia de una API.

## Evidencia del repositorio

El árbol de trabajo inicial estaba limpio en `docs/tool-gateway-contract`, `a67024b`. Se actualizó la referencia remota: `main` en `5aa4eac` contiene el mismo árbol, con ADR-087 integrada documentalmente y todavía marcada como propuesta. ADR-088 no existía. Crear una rama desde esa base no aprueba ADR-087 ni habilita su implementación.

| Recurso / código inspeccionado | Función actual | Límite relevante |
|---|---|---|
| [paths.ts](../../src/paths.ts) | `data/` y `workspace/` relativos a la raíz del proyecto | No hay aprovisionamiento de instalación administrada ni autoridad que cierre todas las vías de acceso |
| [graph.ts v1](../../src/graph.ts), [graph.ts v2](../../src/v2/graph.ts) | SqliteSaver en `runtime.sqlite` y `runtime-v2.sqlite`; aprobaciones y efectos históricos | No toman lock v3; v1 no tiene el mismo vocabulario de terminalidad ni ledger de invocaciones |
| [graph.ts v3](../../src/v3/graph.ts) | `runtime-v3.sqlite`; fachada `locked`, checkpoints síncronos, reparación y migración conservadoras | APIs confiables y CLI pasan por esa fachada; no contiene procesos ajenos ni es sandbox |
| [operations.ts](../../src/v3/operations.ts), `withRuntimeLock` | `runtime-control.sqlite`, `BEGIN IMMEDIATE`, `busy_timeout=0`, rollback/cierre al terminar | Exclusión de mutantes cooperativos v3, global y local; no es barrera de grants/registry ni de lectores antiguos |
| `OperationsStore` en el mismo módulo | `runtime-operations.sqlite`, esquema v1, UUID propio, runs, invocaciones y recuperaciones; `synchronous=FULL` | Reclamación durable y resultado separado del checkpoint. No transacción con efecto/JSON/grant; identidad del ledger no es identidad de toda la instalación |
| [registry.ts](../../src/v2/registry.ts) | JSON en `data/tool-registry`, validación, rechazo de symlinks en inspección; registro con `COPYFILE_EXCL` | Evita sobrescritura silenciosa; no implementa reemplazo durable de mantenimiento ni frontera OS. `listTools` puede crear el directorio |
| [policy.ts](../../src/v2/policy.ts), `GrantStore` | `tool-grants-v2.sqlite`, clave `(capability, descriptor_hash, scope)`; v2/v3 comparten grants | El constructor crea tabla si falta. Revocación usa descriptor actual; falta operación por huella histórica exacta |
| [cli.ts v2](../../src/v2/cli.ts) | Listar/registrar herramientas y listar/revocar grants | No lock v3 ni consentimiento administrativo diferenciado. Listado muestra solo prefijo de huella |
| [tools.ts](../../src/v2/tools.ts), [objective.ts](../../src/v3/objective.ts) | Validación de argumentos, rutas acotadas y comprobación de archivos | Controles de recurso útiles; no demuestran aislamiento completo del directorio ni de todos los procesos |
| [pruebas durables](../../test/v3-durable.test.ts), [worker de caídas](../../test/helpers/v3-crash-worker.ts) | Competencia cooperativa, barreras y muerte real antes/después de reclamación/efecto/resultado | No incluyen adversarios que eviten el lock, escape de contención o reinicio del supervisor de mantenimiento |

Las bases pueden usar sidecars de SQLite según su modo efectivo; hay que inventariar WAL, SHM y journals existentes, no asumir su ausencia a partir de la extensión `.sqlite`. SqliteSaver controla su propio esquema y conexiones. Abrir los stores actuales mediante constructores que inicializan directorios/tablas no sirve como inspector de mantenimiento sin efectos.

La evidencia histórica de [verificación](../delivery/verification.md#recuperación-durable--adr-086) registra 51/51 tests e integraciones v1/v2/v3 para ADR-086 y CI del PR #4. Acredita su alcance, no G1–G8 de ADR-088. No se inspeccionaron ni modificaron los datos personales de `data/` o efectos de `workspace/` para este estudio.

## Dependencias y precedencia

| Contrato | Estado en el corte | Dependencia y límite |
|---|---|---|
| ADR-001/014/021/055/067 | Baseline de diseño | Portabilidad, datos respaldables y formatos versionados; no obligan a emular garantías ausentes en otro SO |
| ADR-019/051/058/061/063/066/072 | Baseline de diseño | Runtime confiable, autorización exacta y cumplimiento separado; un administrador del host no sustituye consentimiento de operación |
| ADR-085 | Aceptada, implementación incremental | Incertidumbre sin retry, objetivo verificado, recuperación explícita de hasta dos intentos; conciliación pendiente |
| ADR-086 | Aceptada e implementada | Lock cooperativo, ledger y checkpoints separados, resultados antes de grants, conservación de identidades/historial; no coordinación de v1/v2 ni multi-host |
| ADR-087 | Propuesta, no implementada | Incremento 1: validación/compatibilidad; Incremento 2: migración de un descriptor, grants no transferidos, todos los runs terminales y exclusión impuesta por OS |
| ADR-088 | Nueva propuesta | Define cómo acreditar y conservar exclusión/autorización/evidencia. Su aceptación no aprueba ADR-087 ni modifica ADR-085/086 |

El mantenimiento no puede «arreglar» una invocación `uncertain`, inventar terminalidad, resetear presupuesto ni reactivar una aprobación para cumplir la precondición. Aun cuando no haya procesos, un run pausado bloquea la migración. Tampoco `completed` legado demuestra el éxito verificado que exige ADR-085 para runs nuevos.

## Modelo de amenazas

**Activos:** integridad y coherencia del registro, grants, checkpoints, ledger, archivo de control, journal/ancla administrativa y respaldos; autoridad de aprobación; disponibilidad; confidencialidad de evidencia; identidad del conjunto de datos y de la sesión. El workspace y posibles efectos externos importan para interpretar interrupciones, aunque la operación inicial no los modifica.

**Adversarios considerados:** CLI obsoletos; procesos del mismo usuario que ignoran locks; ejecutores administrados que intentan escapar, bifurcarse o transferir acceso; dos administradores concurrentes; automatizaciones de reinicio; clientes que repiten solicitudes, falsifican sesiones o pierden conexión; fallos de proceso, disco y host. Un usuario sin autoridad no debe poder adquirir la identidad de servicio. Root/Administrator, kernel y supervisor confiable están dentro de la base de confianza; su compromiso no está cubierto.

| ID | Amenaza / caso adversarial | Control propuesto y garantía | Observación que debe probarse / riesgo residual |
|---|---|---|---|
| T1 | CLI v1/v2 ignora lock o arranca tras la inspección | Frontera de datos y admisión efectiva, G2 | Apertura directa y arranque administrativo denegados durante toda la ventana; un listado de procesos no basta |
| T2 | Proceso conserva FD, mmap, cwd o hijo después de parar al padre | Contención heredada, retirada total, G3 | Hijos/grupo y accesos extinguidos antes de publicación; timeout no es éxito |
| T3 | Fork/doble fork, migración a otro grupo, llamada a servicio externo, paso de FD | Restringir creación/delegación, IPC, identidad y configuración, G2/G3 | Intentos desde proceso adversarial fracasan. Si no se cubre una vía, perfil no conforme |
| T4 | Acceso externo por hardlink, symlink, bind mount, share, raw device o copia activa | Aprovisionamiento cerrado, inventario de recursos y montajes, G2/G4 | No hay alias accesible por identidades ordinarias; datos previamente compartidos requieren importación offline |
| T5 | Dos migradores, supervisor duplicado o cliente reintenta tras timeout | Serialización por instalación, nonce y generación, G1/G4 | Solo una publicación; respuesta perdida se consulta por ID; no se autoriza otro dueño mientras viva el anterior |
| T6 | PID reutilizado, recibo viejo, ruta sustituida, restauración parcial | Identidades de objetos y generación protegida, G4/G7 | Rechazo antes de publicar. Un PID, pathname, timestamp o hash aislados no acreditan propiedad actual |
| T7 | `SIGKILL`, desconexión, supervisor cae o host reinicia | Arranque cerrado y journal durable, G5/G7 | No reinicio automático de ejecutores; recuperar requiere nueva exclusión. I/O ya aceptado puede completarse |
| T8 | ENOSPC, error de sync/rename/commit, archivo parcial o corrupción | Staging, respaldo durable, publicación atómica y verificación, G5 | No éxito anticipado; conservar cuarentena. Dispositivo que miente sobre flush fuera de la garantía |
| T9 | Run no terminal, ledger ausente, invocación huérfana o grant ambiguo | Inventario completo y codecs confiables, G6 | Aplicación rechazada sin alterar estados. La integridad SQLite sola no demuestra coherencia entre stores |
| T10 | Solicitud de modelo, administrador no autorizado, replay o plan cambiado | Canal autenticado y consentimiento vinculado, G4 | Permiso de herramienta o acceso OS no habilitan mantenimiento; denegación no consume consentimiento ajeno |
| T11 | Restaurar descriptor antiguo reactiva permisos o se copian grants a nueva huella | No rollback automático ni transferencia, G6 | Grants históricos identificables/revocables; prueba de que destino exige nueva autorización |
| T12 | Borrar/truncar audit log, restaurar backup o filtrar secretos por errores | Journal/ancla protegidos, integridad y sanitización, G5 | Usuario ordinario no modifica evidencia; restauración privilegiada total no detectable sin ancla independiente |
| T13 | Supervisor reinicia por socket/timer/watchdog o consola alternativa | Única puerta de admisión persistente, G2/G7 | Todas las activaciones denegadas con sesión pendiente, incluso tras reinicio |
| T14 | Proceso en espera no interrumpible, I/O asíncrono pendiente o efecto remoto | Drenaje probado y perfil limitado, G3/G6 | No asumir quiescencia por enviar kill ni por grupo vacío. Efecto remoto no se cancela ni reconcilia por mantenimiento |
| T15 | Cambio de policy, privilegios o configuración durante la ventana | Configuración protegida, revalidación antes de cada acción, G4 | Rechazo/cuarentena; no revocación retroactiva de un syscall aceptado |

La demostración combina una premisa de instalación verificable, un control que permanece activo y evidencia del estado actual. No existe una comprobación universal que pruebe retrospectivamente que nunca se filtró un FD. La procedencia de la frontera es por ello una condición de admisión, no una advertencia opcional.

## Alternativas comparadas

Las valoraciones son conclusiones de este análisis. «Candidata» significa que necesita implementación y pruebas, no que habilite ahora el Incremento 2.

| Alternativa | Exclusión frente a no cooperativos | Caídas / portabilidad / privilegios | Decisión propuesta y límite |
|---|---|---|---|
| Lock SQLite actual o mutex dentro del proceso | Solo quienes participan | Portable; muerte libera lock; no conserva cierre de admisión | Conservar como capa interna de compatibilidad, descartar como barrera suficiente |
| Lockfile, flock/fcntl, PID/TTL/heartbeat | No impide acceso directo ni dueño antiguo vivo | Amplia disponibilidad con semánticas diferentes; TTL no es fencing | Descartar como autoridad de mantenimiento. Locks advisory descritos en [flock](https://man7.org/linux/man-pages/man2/flock.2.html) |
| `ps`/`lsof`, confirmación «todo detenido», modo offline declarado | Observación parcial; carrera inmediata de relanzamiento | Barato y portable como diagnóstico | Descartar como prueba de exclusión; no `--force` |
| Detener servicio o congelar procesos | No retira necesariamente hijos/handles ni cierra otras entradas | Depende del supervisor; descongelar revive estado obsoleto | Parada ordenada es un paso; freezer solo no satisface G3 |
| cgroup v2 aislado | Agrupa procesos, no protege archivos de procesos fuera | Linux; control/delegación privilegiada o administrada | Descartar como solución única |
| DAC/ACL o `chmod` al entrar | Restringe nuevas aperturas de ciertas identidades; no acredita retirada de accesos previos | Nativo en varios SO; cambios de propietario pueden requerir privilegios | Necesario dentro de un perfil, insuficiente para adoptar datos compartidos |
| Namespace/contenedor con volumen bind y mismo usuario exterior | Puede ocultar rutas; el host puede conservar acceso | Herramientas Linux u otras plataformas; coste operativo | Insuficiente si volumen/FD/identidad siguen accesibles afuera; no confundir contenedor con frontera certificada |
| Supervisor + identidad privada + contención + admisión durable | Puede cubrir G1–G8 con prohibición de escape/transferencia y prueba de I/O | Adaptador OS, aprovisionamiento privilegiado, servicio detenido durante operación | Candidato inicial Linux; coste y base de confianza explícitos |
| Broker único de almacenamiento; clientes sin acceso directo | La autoridad puede drenar solicitudes y rechazar generaciones obsoletas | Contrato portable; autenticación IPC y ACL por SO; cambios de acceso a stores | Alternativa estratégica portable. No basta añadir token a clientes mientras v1/v2 conservan acceso a archivos |
| VM/volumen de uso exclusivo apagados | Frontera fuerte si no quedan mounts/shares/accesos host | Hypervisor y gestión de volumen confiables, mayor coste | Candidata para aislamiento más fuerte; snapshot o apagado de guest por sí solos no prueban coherencia ni falta de acceso host |
| Entorno de rescate/importación offline comprobada | Puede retirar accesos de la sesión anterior y crear una raíz nueva privada | Procedimiento por plataforma; requiere autoridad de host y downtime | Candidato para incorporación inicial, no sustituto de la sesión normal de mantenimiento |
| Snapshot/backup, copy-on-write o swap de directorio | No detiene escritores ni invalida handles viejos | Útil para recuperación; semántica por filesystem | Complemento. Copias por archivo pueden mezclar generaciones y no cercan procesos |
| Base servidor con transacciones/fencing | Puede cercar escritores que solo acceden por servidor | Infraestructura nueva; datos JSON/efectos externos siguen fuera | Diferida; no justifica sustituir SQLite de ADR-086 ni añadir dependencia obligatoria |

Se prefiere investigar el perfil administrado antes de cambiar todo acceso a almacenamiento: conserva las bases actuales y hace explícito su coste de despliegue. Si no se demuestra contención frente a procesos no cooperativos, debe elegirse broker/VM u otro perfil, o mantener la aplicación deshabilitada. La facilidad de desarrollo no justifica rebajar las invariantes.

## Adaptador Linux propuesto

### Fronteras y requisitos de privilegios

El siguiente es un diseño candidato, no una receta de configuración validada:

| Actor / recurso | Permisos y controles requeridos |
|---|---|
| Administrador de instalación | Aprovisiona cuenta(s), directorios, configuración y supervisor protegido. Privilegios de host para gestión de identidades, permisos y contención; fuera del núcleo portable |
| Supervisor/autoridad | Puede iniciar/retirar procesos de las identidades administradas, gestionar su subárbol, cerrar activaciones, inspeccionar objetos y persistir journal/ancla. Configuración no escribible por runtime ni usuario interactivo |
| Runtime y CLI históricos administrados | Identidad sin login ni acceso concedido a usuarios interactivos mediante sudo/su, cron o servicios alternos. Sin facultad de cambiar contención, privilegios, política, montajes ni crear procesos a través de un broker exterior |
| Publicador | Identidad separada y controlada; acceso mínimo a recursos del plan y staging/respaldo, sin ejecutar manifiestos o código suministrado por clientes. Todos sus descendientes/accesos también supervisados |
| Usuario/CLI administrativo | Solo API autenticada del supervisor; no acceso directo a datos, journal/ancla, identidad de servicio o handles del publicador |
| Datos | Raíz y padres protegidos; propietario/ACL y montajes comprobados desde creación. Sin aliases, shares o servicios auxiliares no inventariados con acceso |

Una implementación podría usar un servicio de sistema y un helper privilegiado pequeño en vez de ejecutar todo el runtime como root. La lista exacta de capabilities y políticas MAC debe derivarse del perfil concreto y probarse; no se prescribe `CAP_SYS_ADMIN` global como atajo. La delegación de cgroups a un usuario que también puede lanzar procesos con la identidad propietaria de datos no satisface el contrato.

Ser propietario de archivos también puede permitir ampliar sus modos/ACL: quitar capabilities no basta para impedirlo. El perfil debe impedir que un ejecutor cambie esa frontera (incluida la de archivos que crea), publique enlaces accesibles, altere código/configuración del supervisor o delegue acceso. La política MAC u otra restricción equivalente debe demostrarlo; una cuenta dedicada con permisos iniciales restrictivos sigue siendo insuficiente frente a ese adversario. Las versiones de binarios admitidas deben vincularse a una instalación de código protegida, no a un pathname sustituible.

### Proceso de exclusión

1. La autoridad serializa la transición de admisión, persiste intención/generación y cierra todas las rutas de lanzamiento. La ausencia/caída del supervisor deja la puerta cerrada; el gestor de servicios no debe resucitar ejecutores al margen de ella.
2. Los procesos deben entrar en contención **antes** de ejecutar código con acceso a datos. Mover después un PID no demuestra dónde quedaron hijos anteriores. Prohibir migración/escape y delegación de acceso a través de IPC, sockets, FD passing, ptrace o credenciales. Una cuenta separada y cgroup no prueban por sí solos esa prohibición; hace falta un perfil adicional de restricciones verificadas (p. ej. MAC, restricciones de IPC y lanzamiento).
3. Solicitar parada ordenada; si se autorizó terminación forzada, usar el mecanismo del perfil y esperar su resultado. La documentación del [kernel cgroup v2](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html) define `populated=0` para ausencia de procesos vivos en el subárbol y `cgroup.kill` para terminarlo; el freezer conserva procesos y no impide toda entrada/salida. Esas observaciones solo hablan del subárbol, no de todo el host.
4. Con el grupo de ejecutores vacío y la admisión cerrada, comprobar retiro de accesos y barrera de I/O del perfil. Trabajo asíncrono en kernel o delegado no se declara terminado por leer `populated`. El primer perfil debe prohibir acceso mediante AIO/io_uring u otros caminos no cubiertos, o demostrar su drenaje; los mecanismos exactos y pruebas son requisito de conformidad. Escrituras ya aceptadas y errores diferidos requieren sincronización e integridad comprobadas.
5. Abrir sesión del publicador en dominio separado, fijar identidades de raíces/volúmenes/stores, tomar el lock de ADR-086 y repetir todas las precondiciones. Inspeccionar y publicar mediante handles confiables relativos a una raíz fijada; rechazar symlinks, aliases inesperados y cambios de identidad. Rutas canónicas y `stat` previos por sí solos dejan carreras.
6. Al cerrar, comprobar destino/evidencia, extinguir publicador y sus handles, liberar lock y autorizar admisión. Reabrir no habilita versiones de ejecutor incompatibles con el registro; su admisión debe estar limitada por configuración protegida y formatos soportados.

`KillMode=control-group` de [systemd](https://www.freedesktop.org/software/systemd/man/latest/systemd.kill.html) puede contribuir a terminar procesos de una unidad; no demuestra por sí mismo que otras unidades o sockets no arranquen con acceso. También debe probarse el cierre ante muerte/reinicio de systemd o del supervisor y un arranque de host con mantenimiento pendiente.

Un FD abierto mantiene referencia a un objeto aunque cambie su nombre ([open](https://man7.org/linux/man-pages/man2/open.2.html)); reemplazar una ruta no retira ese acceso. [Landlock](https://www.kernel.org/doc/html/latest/userspace-api/landlock.html) permite restricciones heredadas por procesos, con derechos que dependen del ABI; podría complementar un perfil, pero no se presume que revoca handles existentes o que controle procesos externos. Para mantenimiento, degradación silenciosa por falta de derechos/ABI es inadmisible.

No se fija una versión mínima de kernel/systemd sin ensayo. El adaptador debe verificar en la instalación las interfaces utilizadas, su configuración y su perfil aprobado; una versión nominal no prueba soporte. Sistemas sin privilegios o facultades de inspección suficientes responden `maintenance_exclusion_unavailable`.

## Alternativas para otros sistemas operativos

**Windows, candidato nativo:** servicio protegido que controle admisión y una identidad de servicio sin acceso interactivo; DACL de raíz/datos/control y tokens restringidos; Job Object con hijos contenidos y breakaway deshabilitado. Crear procesos suspendidos, asociarlos antes de ejecutarlos y verificar la terminación del conjunto. Los [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects) no cubren por defecto todas las formas de lanzamiento (por ejemplo mediante WMI), y algunas notificaciones no tienen entrega garantizada. Se necesita consulta autoritativa del estado y bloqueo de brokers externos, no solo recibir un evento. Las [ACL de archivos](https://learn.microsoft.com/en-us/windows/win32/fileio/file-security-and-access-rights) forman otra frontera; no asumir que renombrar cambia el descriptor de seguridad. También faltan pruebas de handles heredados/duplicados, reparse points, semántica de reemplazo/flush y caída del servicio. Viable como investigación; no acreditado.

**macOS/BSD, candidato mediado u offline:** identidad y datos privados más un broker que sea el único propietario de conexiones de almacenamiento; los clientes antiguos no pueden seguir abriendo bases directamente. Launchd sirve para gestionar y activar servicios, incluso a demanda ([Apple, guía archivada](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)); no se toma esa documentación como prueba de una barrera equivalente de descendientes/accesos. Un grupo POSIX y señales no bastan para un proceso que se desliga. Un adaptador nativo necesitará evidencia específica de contención, IPC, handles y durabilidad, o usar entorno offline/VM. No se afirma imposibilidad del SO, sino ausencia de una solución acreditada en este estudio.

**Portable con broker:** coordinador, plan, policy, journal, errores y pruebas de estados pueden compartirse. ACL, autenticación local, identidad de procesos, sync y retiro de handles necesitan adaptadores. La barrera se traslada al broker, que serializa/drena todas las solicitudes y no entrega acceso directo. Se debe resolver también quién cerca al broker antiguo al reiniciar. Convertir todas las rutas v1/v2/v3 y el checkpointer es un cambio de arquitectura/acceso a datos que requiere revisión independiente; no es un polyfill de cgroup.

**Portable solo para previsualización:** admite planes y diagnósticos sin acceso de escritura a datos activos. Es el comportamiento requerido mientras falte un backend conforme; no rebaja semántica por plataforma. Un test doble puede comprobar el protocolo común, pero no sustituye ensayos nativos.

## Incorporación de datos no administrados

Cambiar permisos a la carpeta del checkout no demuestra que hayan desaparecido todos los accesos. La instalación administrada nueva debe crear recursos privados con identidades propias y una cadena de procedencia registrada. Para importar datos existentes se propone un procedimiento independiente:

1. Acreditar una frontera offline real del origen (por ejemplo host de origen detenido y volumen presentado a un entorno de rescate confiable sin otros montajes/escritores). Inventariar todas las bases, manifiestos, sidecars e identidad del origen. Un checkbox del operador no sustituye esa evidencia.
2. Obtener un conjunto coherente bajo esa exclusión; verificar integridad y relaciones entre stores. La [API de backup SQLite](https://www.sqlite.org/backup.html) permite copias consistentes de una base, pero no crea por sí sola una transacción global de varias bases y JSON. No copiar archivos activos omitiendo journals/WAL.
3. Importar en una raíz nueva protegida, sin compartir inodes/handles con el origen, conservando identidades lógicas e historial y registrando un nuevo vínculo de instalación. Rechazar datos ambiguos; nunca inventar resultados pasados. Preservar original como respaldo protegido, no como segunda instalación activa con las mismas autorizaciones.
4. Registrar la incorporación y validar el perfil antes de admitir procesos. Inconsistencias o datos inciertos siguen bloqueando la migración de ADR-087. La importación no certifica que el sistema anterior nunca produjo efectos desconocidos.

Este procedimiento aún requiere diseño detallado y pruebas; para datos importados es una dependencia del desbloqueo. Una instalación nueva administrada desde su creación puede acreditar la procedencia sin ejecutar una importación. No hay adopción automática del `data/` actual.

## Riesgos residuales y decisiones diferidas

- El fallo cerrado puede causar indisponibilidad prolongada; un proceso no terminable bloquea la operación. No se promete tiempo máximo de recuperación.
- La terminación puede interrumpir efectos externos que persisten después de morir el proceso. Las reglas de ADR-085/086 siguen mandando; mantenimiento no es conciliación.
- Integridad de archivos y hashes no prueban veracidad de una historia desconocida ni resistencia a restauración coordinada por root. Anclaje remoto/WORM, doble aprobación y atestación hardware no son requisitos de este primer corte; serán necesarios si se amplía el modelo de amenazas.
- Un escritor legítimo malicioso pudo falsificar checkpoints/ledger antes de entrar en mantenimiento. Este contrato cubre exclusión durante la ventana, no autenticidad retrospectiva frente a ese escritor. Los datos operacionales deben proceder de componentes confiables; sospecha de manipulación bloquea la operación. Cubrir esa amenaza adicional exige broker o evidencia autenticada independiente, no solo controles de integridad estructural.
- Interfaces de almacenamiento aparentemente read-only pueden recuperar journals o crear estructuras. Los inspectores futuros deben declarar sus efectos y probar que no ocultan inicialización, reparación ni pérdida de evidencia.
- El perfil Linux exacto de aislamiento/IPC/I/O, el formato del journal y su ancla, la semántica Windows/macOS y la importación offline quedan pendientes de implementación y validación. No son detalles que puedan omitirse al habilitar `apply`.
- No se selecciona un SO obligatorio, una base remota ni un framework de supervisor para el core. Tampoco se habilitan restauración general, cambio de esquemas de invocaciones, migración de built-ins filesystem o grants hacia otra huella.

Las decisiones descartadas lo son como **mecanismo suficiente** de exclusión; algunas siguen siendo capas útiles. Los criterios medibles y la trazabilidad G/T/pruebas se encuentran en el [plan de implementación](../delivery/maintenance-backend-plan.md).
