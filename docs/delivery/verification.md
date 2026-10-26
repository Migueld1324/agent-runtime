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

Estos resultados son nuevos y locales. **La ejecución hospedada en GitHub está pendiente de abrir/actualizar el PR**; no se acredita todavía un run remoto ni una prueba en Ubuntu. Un resultado local satisfactorio no sustituye esa comprobación.

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
- Simular caída inmediatamente después de efecto: resultado `uncertain` o conciliado, jamás reejecución a ciegas.
- Generar contenido contradictorio: memoria no publica hipótesis como hecho.
- Probar recuperación a partir de backup y reconstrucción de índices con identidades estables.

## Registro de resultados

Para cada ensayo registrar `runId`, versión, commit, entorno, input no sensible, estado inicial/final, efectos observados, permisos/grants, comprobaciones y fallos. Evitar capturar tokens, credenciales u otros secretos. Separar observación real, expectativa y conclusión.
