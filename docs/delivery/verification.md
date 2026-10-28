# Estrategia de verificación

## Objetivos de pruebas

Probar el **runtime como autoridad efectiva**, no solo obtener un texto plausible de un LLM. La ejecución real y el mock cumplen papeles diferentes: el mock permite regresión determinista; el modelo remoto prueba el contrato de inferencia y propuestas reales no deterministas.

## Niveles

| Nivel | Qué prueba |
|---|---|
| Contratos | Schemas, invariantes de identidades, versiones y resultados |
| Policy | Hash exacto, scope, grants, revocaciones, denies y límites de recursos |
| Runtime | Máquina de estados, checkpoints, aprobación y continuación entre procesos |
| LLM adapter | Stream completo, errores, tool-call válido, aislamiento de ejecución |
| Integración OS | Ejecución real dentro de boundaries y verificación de efectos |
| Memory | Admission, fuentes, relaciones, scopes, rectificaciones, recall y forget |
| Fallos | Crash entre ejecución y checkpoint, idempotencia, cambios de grants/modelos |

## Evidencia de cierre del 26-10-2026

Los seis casos de cierre se evaluaron y pasaron. Los ensayos reales, nuevas pruebas deterministas, regresiones y límites están en [poc-031-closure.md](poc-031-closure.md). PoC 0.3.1 queda cerrada dentro de su alcance.

## Integración continua offline

[Workflow Offline CI](../../.github/workflows/ci.yml): evento `pull_request` con rama destino `main`; un job en runner hospedado `ubuntu-24.04`, Node 24, permisos `contents: read` y límite de 15 minutos. Las acciones de checkout y setup-node están fijadas a commits de sus referencias v7. El checkout no conserva credenciales Git. Una nueva revisión del mismo PR cancela la ejecución anterior.

La instalación usa `npm ci --no-audit --no-fund` y el lockfile versionado. El job ejecuta, en este orden y sin ignorar errores:

1. `npm run typecheck` (este repositorio no define un script de build).
2. `npm run test:core` (incluye todos los archivos `*.test.ts` de v1/v2/v3 y del cierre; no repetir las suites unitarias parciales).
3. `npm run test:integration`.
4. `npm run test:v2:integration`.
5. `npm run test:v3:integration`.

Las integraciones comparten registry y grants y deben ser secuenciales. Los efectos en `data/`, `workspace/` y temporales pertenecen al runner desechable; no se exportan ni se cachean. `AGENT_AUTH_DIR` apunta a `.ci-auth` dentro del checkout aislado, `AGENT_ALLOW_CLOUD=0`, el modelo ChatGPT y las claves comerciales están vacíos. No se consultan credenciales personales. Las pruebas del adaptador usan credenciales sintéticas temporales y fetch simulado. Las pruebas de routing evalúan configuraciones simuladas sin llamar proveedores.

La descarga del código, Node y dependencias requiere red; las pruebas no requieren servicios externos. OAuth interactivo, catálogo remoto e inferencia ChatGPT real permanecen como validaciones manuales separadas; su evidencia histórica está en [el cierre](poc-031-closure.md). Esta configuración no representa aislamiento de red del proceso ni demuestra compatibilidad con todos los sistemas operativos. No configura reglas de protección de ramas.

### Reproducción y validación

Usar un checkout desechable limpio con Node >=24.15. No ejecutar las integraciones sobre los datos operacionales personales: revocan y crean grants, checkpoints y descriptores. En Bash:

```bash
export AGENT_AUTH_DIR="$PWD/.ci-auth" AGENT_ALLOW_CLOUD=0
export CHATGPT_MODEL= OPENAI_API_KEY= ANTHROPIC_API_KEY= GOOGLE_GENERATIVE_AI_API_KEY=
npm ci --no-audit --no-fund
npm run typecheck
npm run test:core
npm run test:integration
npm run test:v2:integration
npm run test:v3:integration
```

Validación local del 26-10-2026 sobre la base integrada `efcb035` y el workflow de consolidación: instalación limpia desde lockfile PASS; Node v24.22.1, npm 11.19.1; typecheck PASS; `test:core` **21/21 PASS**; integraciones v1/v2/v3 PASS. Se utilizó una copia temporal independiente con dependencias recién instaladas, sin credenciales reales. `actionlint` v1.7.12: PASS para sintaxis, expresiones y configuración. El lockfile no cambió.

### Evidencia hospedada en GitHub

Workflow [Offline CI — run 40284439972](https://github.com/Migueld1324/agent-runtime/actions/runs/40284439972), **intento 4: `completed` / `success`**, comprobado mediante la API de GitHub. Evento `pull_request`, rama `ci/offline-validation`, commit fuente `d2ea60545d9ada7283d6d9f26fa24bfb198d3380`, archivo `.github/workflows/ci.yml`.

[Job Node 24 offline checks](https://github.com/Migueld1324/agent-runtime/actions/runs/40284439972/job/121447653880): runner `ubuntu-24.04`; inicio **2026-10-26 07:22:15 UTC**, final **07:22:52 UTC**. GitHub informa `success` para todos los pasos de instalación y validación:

| Paso | Resultado hospedado |
|---|---|
| Install locked dependencies | PASS |
| Typecheck | PASS |
| Core and provider contract tests | PASS |
| Durable approval integration | PASS |
| Registry and grants integration | PASS |
| Sequential planner integration | PASS |

Esta evidencia confirma la ejecución real en el runner hospedado y sustituye el pendiente anterior. El conteo **21/21** del apartado anterior corresponde a la ejecución local documentada; los resultados hospedados aquí se acreditan por las conclusiones de los pasos del job, sin atribuirles un conteo no inspeccionado. No incluye inferencia ni credenciales reales de ChatGPT.

La configuración de CI quedó integrada mediante [PR #2](https://github.com/Migueld1324/agent-runtime/pull/2), commit de `main` `1a36ba5`. El run citado valida el PR con el commit fuente indicado, no los cambios documentales posteriores ni la implementación futura de ADR-085.

## Verificador de objetivos — primer incremento de ADR-085

Contrato aprobado e implementado en `src/v3/objective.ts`, grafo y CLI v3. La [especificación](../specifications/runtime.md) describe criterio, evidencia, estados y límites. Ocho tests nuevos en `test/v3-objective.test.ts` cubren criterios inválidos y su vinculación, lectura real, policy, symlinks, límites de bytes, ausencia/incumplimiento del objetivo, evidencia durable, cambio de criterio durante aprobación, suspensión y dos recuperaciones acotadas sin replay de modelo/herramientas. Las dependencias inyectadas del grafo son confiables y se usan para simular errores transitorios; no son callbacks suministrados por el modelo.

Validación local nueva sobre la base `1a36ba5` más el árbol de trabajo del incremento, Node v24.22.1, en copia temporal aislada y sin credenciales reales: `typecheck` PASS, `test:core` **29/29 PASS**, integraciones v1/v2/v3 PASS. La integración v3 conserva aprobaciones y grants e incluye recuperación del verificador desde otro proceso CLI. Las pruebas existentes de fallos de proveedor y presupuesto se conservan, añadiendo el criterio requerido al input inicial.

El run remoto de CI documentado arriba corresponde a la configuración de CI anterior, no a este incremento. Su ejecución hospedada nueva sigue pendiente. No se ejecutaron inferencias remotas nuevas. Ese primer incremento no acreditaba migración ni recuperación de fallos generales; la cobertura posterior se registra a continuación.

## Recuperación durable — ADR-086

Contrato aprobado de [ADR-086](../decisions/086-durable-invocations-and-recovery.md), implementado sobre la base `ba88410` (PR #3 integrado), en la rama `feat/durable-recovery`. La comprobación local del 26-10-2026 utiliza Node v24.22.1 y npm 11.19.1, copia desechable del código, autenticación aislada y claves comerciales vacías. Reutiliza las dependencias locales instaladas mediante enlace a `node_modules`; no representa una nueva instalación limpia ni modifica el lockfile.

| Comprobación | Resultado local |
|---|---|
| `npm run typecheck` | PASS |
| `npm run test:core` | **51/51 PASS** |
| `npm run test:integration` | PASS |
| `npm run test:v2:integration` | PASS |
| `npm run test:v3:integration` | PASS |

`test/v3-durable.test.ts` aporta 22 pruebas. Incluye barreras deterministas y `SIGKILL` en procesos auxiliares antes de reclamar, después de reclamar, después del efecto y después de confirmar el resultado; competencia con otro proceso y otro run; consulta durante ejecución; recuperación del lock al morir el propietario. Se contabilizan entradas al Executor y se comprueban observaciones únicas, efectos, estados y presupuestos.

También cubre fallo de inferencia después de una herramienta confirmada, presupuesto compartido modelo/verificador, órdenes inválidas o reutilizadas, pérdida/reemplazo del ledger y pérdida del checkpoint, fallos reales de escritura SQLite, fallos inyectados del checkpointer, grant fallido o pendiente, error previo al efecto frente a incertidumbre, migración de aprobación v0/v1 y verificador v1, preservación del historial y rechazo de versiones/ejecuciones ambiguas.

Las pruebas existentes del adaptador simulan autenticación, red, timeout, errores HTTP, eventos de fallo y stream truncado: ahora exigen `paused` o `failed` explícito, sin efecto ni fallback. Las propuestas inválidas deben terminar en `failed`, antes de autorización. Los escenarios del objetivo y las tres integraciones conservan sus garantías anteriores; la integración v3 recupera la verificación desde otro proceso CLI.

La ejecución usa el cargador TypeScript nativo del script `test:core`, también utilizado por CI. Los procesos de prueba se ejecutan fuera del sandbox del asistente porque este impedía observar sus barreras/stdout; sus datos y efectos permanecen en temporales y en el checkout de validación. No se usaron credenciales reales ni inferencias remotas.

### Cierre e integración comprobados el 27-10-2026

[PR #4](https://github.com/Migueld1324/agent-runtime/pull/4) integrado en `main` el **27-10-2026 a las 08:52:24 UTC**, commit de integración `a7b5c02676c9cfab4830e2e2170c0a46b1fac4ce`. La comprobación se hizo mediante la API de GitHub.

[Offline CI — run 40324649673](https://github.com/Migueld1324/agent-runtime/actions/runs/40324649673), intento **1**, evento `pull_request`, commit fuente `b8758e94b4c66e9aced499425c547715e5bd5cd6`: **completed / success**. El [job 121578120058](https://github.com/Migueld1324/agent-runtime/actions/runs/40324649673/job/121578120058) acredita `success` para instalación desde lockfile, typecheck, pruebas del núcleo/proveedores y las tres integraciones v1/v2/v3. Esta evidencia corresponde al incremento de ADR-086, separado del run histórico de CI; no se atribuye un conteo de tests a logs remotos no inspeccionados.

Revalidación local del 27-10-2026 sobre `b8758e9`, en copia temporal aislada con Node v24.22.1 y npm 11.19.1: typecheck **PASS**, `test:core` **51/51 PASS** e integraciones v1/v2/v3 secuenciales **PASS**. Se reutilizó `node_modules` por enlace, sin instalación nueva, claves comerciales ni inferencia remota. El intento de pruebas del núcleo dentro del sandbox quedó bloqueado y se interrumpió; la integración inicial fue rechazada por `EPERM` en el IPC de tsx. Las ejecuciones completas satisfactorias se realizaron fuera del sandbox, manteniendo datos y autenticación en la copia temporal. No se modificó código de runtime para esta revalidación.

**Límites:** estas pruebas no acreditan garantía universal de exactly-once, tolerancia a fallo físico del disco, coordinación multi-host, restauración coherente desde backups ni conciliación externa. Una operación incierta queda detenida. El incremento de ADR-086 está integrado y validado dentro de ese alcance; la consolidación completa de Fase 0 continúa.

## Maintenance Backend — propuesta documental ADR-088

La entrega del 27-10-2026 sobre `5aa4eac` añade [ADR-088](../decisions/088-maintenance-backend.md), [investigación](../architecture/maintenance-backend-analysis.md) y [plan de aceptación](maintenance-backend-plan.md). No implementa un backend ni ejecuta mantenimiento. La validación documental comprueba alcance del diff, enlaces internos y consistencia de estados; no acredita aislamiento OS, durabilidad del backend ni migración de grants.

Comprobación local documental: **PASS**, 10 archivos Markdown bajo `docs/`, 183 enlaces relativos (incluidos anchors) resueltos, `git diff --check` sin errores y contenido de ADR-085/086/087 idéntico a la base. No se añadieron fuentes, dependencias ni archivos operacionales.

P01–P23 cubren contrato portable y adversarios; C1–C8 cubren interrupciones; D1–D10 son condiciones acumulativas para habilitar el Incremento 2 de ADR-087. Todas permanecen pendientes. Se requieren ensayos privilegiados en entornos desechables por perfil, incluidos procesos que ignoran locks, handles externos, escape, I/O pendiente, muerte del supervisor y reinicio de host. Los 51 tests y la CI de ADR-086 no sustituyen esa evidencia. No se reejecutaron suites de runtime para este cambio exclusivamente documental.

## Evidencia histórica disponible de 0.3.1

```fish
npm run typecheck
npm run test:core
npm run test:v2
npm run test:v2:integration
npm run test:v3
npm run test:v3:integration
```

**Salidas reportadas:** 18/18 `test:core`, 5/5 `test:v2`, 9/9 `test:v3`, integración v2/v3 PASS y `typecheck` ejecutado sin objeciones. Dos ejecuciones reales de `chatgpt`: finalización aprobada (`account-1`) y denegación (`denial-1`).

Las recetas actuales de instalación, ejecución offline y aprobaciones están en [la guía inicial](../guides/getting-started.md); el login y ensayo de inferencia real están en [la guía de ChatGPT](../guides/chatgpt.md). Utilizar IDs y archivos nuevos: los siguientes pasos documentan evidencia histórica, no comandos para reutilizar runs existentes.

## Protocolo real de autorización/denegación probado

1. `start --model chatgpt` con objetivo de transformar texto y guardar Markdown.
2. Gateway interrumpe en `text.transform`; estado persistido `WAITING_APPROVAL`.
3. `approve` transforma texto; modelo propone `filesystem.write`; segundo `WAITING_APPROVAL`.
4. Rama A: `approve` escribe archivo; `status` muestra `COMPLETED` y se verificó `cat workspace/cuenta-v3.md`.
5. Rama B: `deny` detiene escritura; `status` muestra `DENIED` y `test ! -e workspace/denegado-v3.md` devuelve PASS.

Esto **no** demuestra que una operación no idempotente sea reconciliable tras caída ni aislamiento fuerte del SO; esos son tests nuevos que deben añadirse.

## Pruebas de seguridad que deben incorporarse

- Instrumentar herramienta que cambie huella/efectos tras aprobación: no debe ejecutarse.
- Cambiar argumentos/ruta durante pausa: el hash anterior deja de autorizar.
- Revocar grant durante interrupción: revalidación impide uso.
- Inyectar instrucciones maliciosas dentro del resultado de una herramienta: no deben cambiar políticas.
- Simular datos confidenciales y ruta cloud sin consentimiento: no debe transmitirse contenido.
- Ampliar la caída después del efecto a adaptadores externos: el caso de escritura local ya produce `uncertain` sin reejecución; conciliación aún pendiente.
- Generar contenido contradictorio: memoria no publica hipótesis como hecho.
- Probar recuperación a partir de backup y reconstrucción de índices con identidades estables.

## Registro de resultados

Para cada ensayo registrar `runId`, versión, commit, entorno, input no sensible, estado inicial/final, efectos observados, permisos/grants, comprobaciones y fallos. Evitar capturar tokens, credenciales u otros secretos. Separar observación real, expectativa y conclusión.
