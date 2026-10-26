# Estado de implementación — corte PoC 0.3.1

**Actualización 26-10-2026:** PoC 0.3.1 cerrada dentro de su alcance. Los seis casos de cierre fueron evaluados; consultar [evidencia de cierre](poc-031-closure.md). El corte del 24-10-2026 que sigue se conserva como antecedente histórico; sus pendientes de cierre y observaciones de campos adicionales quedan sustituidos por ese registro. Las capacidades de arquitectura aún no implementadas siguen pendientes.

**Fecha de corte:** 24-10-2026. **Versión:** `0.3.1` en `package.json`. **Evidencia:** código y tests del repositorio contrastados con la documentación; resultados de validación en CachyOS reportados por el equipo de desarrollo. No se reejecutaron suites ni inferencias remotas durante esta revisión documental.

Este documento detalla el estado de implementación y su evidencia. El seguimiento de avances y pendientes se registra en [progress.md](progress.md). **Al corte del 24-10-2026, PoC 0.3.1 permanecía pendiente de cierre formal**; el registro del 26-10-2026 documenta su cierre.

## Implementado y validado

| Hito | Implementación | Evidencia |
|---|---|---|
| PoC 0.1: ejecución durable y aprobación | `src/{graph,policy,tool,cli}.ts` | Integración `PASS`, proceso reanudado y archivo creado solo tras aprobación; denegación también comprobada |
| PoC 0.2: capacidades y grants | `src/v2/{registry,policy,tools,graph,cli}.ts` | Registro `text.transform`, listado de herramientas, persistencia de grants, revocación, bloqueo de rutas/argumentos |
| PoC 0.3: planner secuencial | `src/v3/{graph,models,router,mock}.ts` | Mock propone transform y luego write; checkpoints LangGraph entre procesos |
| PoC 0.3.1: autenticación de cuenta | `src/v3/{chatgpt-auth,chatgpt-inference,siwc-protocol,auth-cli}.ts` | `auth:v3 login`, `status` y `models`: token activo, catálogo de modelos, permiso de plan |
| PoC 0.3.1: LLM real → gateway | `src/v3/graph.ts` con ruta `chatgpt` | `account-1`: transform aprobada, write aprobada, `COMPLETED`, contenido `PRUEBA DE IA` verificado en filesystem |
| PoC 0.3.1: denegación efectiva | Idem | `denial-1`: transform aprobada, `filesystem.write` denegada, `DENIED`, archivo inexistente |
| Regresión del núcleo y herramientas | `test/` | `npm run test:core`: **18/18**; `test:v2`: **5/5**; `test:v3`: **9/9**; `test:v2:integration` y `test:v3:integration`: PASS; el `typecheck` también fue ejecutado primero según el usuario |

La secuencia demuestra que la propuesta de un LLM externo no basta para ejecutar un efecto, y que la autorización de una transformación no concede autorización de escritura. El `mock` es lógica determinista de test, **no un LLM offline**.

## Componentes todavía no implementados conforme al diseño

| Componente de arquitectura | Estado real |
|---|---|
| MemoryService y MemoryProvider híbridos | Sin implementación de conocimiento, revisión, relaciones ni `ExperienceRecord` |
| Context Manager estructurado | Prompt ensamblado por tarea + observaciones; sin recall ni presupuesto integral |
| ModelRegistry estándar y router por capacidades/métricas | Selector rudimentario por ID y flags; sin benchmark/quality routing |
| EmbeddingProvider / índice semántico | No implementado |
| Tool discovery general / OS adapters / MCP | Solo adaptadores confiables limitados a la demo |
| Policy Engine transversal y herencia segura | Grants y policy para herramientas de demo; no clasifica egreso de modelos ni recuperación de memoria |
| TaskPlan, DAG y verificación genérica | Planner iterativo limitado a una herramienta por paso; sin criterios de éxito generalizados |
| Reconciliación de efectos inciertos | No garantizada por checkpoint; pendiente antes de operaciones reales críticas |
| Interfaces multi-host y agentes concurrentes | Diferido |

## Límites explícitos de la PoC

- `MAX_TOOL_CALLS = 5`; una propuesta de herramienta por inferencia. El contador aumenta al validar una propuesta, antes de autorizarla/ejecutarla. Al alcanzar cinco, el siguiente paso de modelo termina en `BUDGET_EXHAUSTED` sin nueva inferencia, incluso si esta hubiera podido emitir una respuesta final.
- Archivos seguros `.md` dentro de `workspace/`; no usar sobre carpetas personales o repos reales.
- Las credenciales y datos operacionales permanecen locales e ignorados por Git; `data/` y `.env` no deben publicarse.
- `--model auto` favorece mock offline salvo habilitación explícita de nube; con cloud no es routing inteligente.
- No se probó seguridad contra ejecución arbitraria, aislamiento OS, reintentos tras fallo en efectos no idempotentes, ni clasificación de datos real.
- `EEXIST` al registrar un descriptor ya presente evita sobrescritura; no es un fallo del flujo de agente.

## Deuda técnica identificada

1. Separar interfaces de dominio de adaptadores de framework y CLI.
2. Ampliar el esquema de run/step sin romper checkpoints existentes y con migraciones.
3. Unificar formalmente vocabulario de estados (`DENIED` de PoC vs diseño v0.1).
4. Revalidar y endurecer autorización en cada punto efectivo de operación.
5. Definir seguridad de secrets/OAuth, ciclo de vida de sesión y revocación.
6. Diseñar baterías de fallos e inyección (duplicaciones, tools maliciosas, cambios de scopes).

**Esta sección describe un punto de partida, no una garantía de producción ni la implementación completa de 84 ADR.**

## Evidencia de validación y alcance

Los siguientes resultados corresponden a pruebas automatizadas ejecutadas satisfactoriamente en CachyOS y reportadas por el equipo; no son resultados nuevos de esta revisión:

| Comando | Resultado reportado |
|---|---|
| `npm run typecheck` | PASS |
| `npm run test:core` | 18/18 |
| `npm run test:v2` | 5/5 |
| `npm run test:v2:integration` | PASS |
| `npm run test:v3` | 9/9 |
| `npm run test:v3:integration` | PASS |

`test:core` usa `test/*.test.ts`: incluye las pruebas unitarias v2 y v3, además de las cuatro de `core.test.ts`. Los conteos se solapan y no deben sumarse como pruebas independientes. Las integraciones se ejecutan por separado. `test/v2-core.test.ts` usa SQLite en memoria; la persistencia de grants entre procesos se comprueba en las integraciones.

Las siguientes son **pruebas manuales con ChatGPT real**, verificadas por el equipo en el entorno de desarrollo:

- `account-1`: el modelo propuso `text.transform`; se pidió autorización y la transformación produjo `PRUEBA DE IA`. Después propuso `filesystem.write`, que requirió otra autorización independiente. Terminó en `COMPLETED` y se comprobó el contenido de `workspace/cuenta-v3.md`.
- `denial-1`: se autorizó `text.transform` y se denegó `filesystem.write`. Terminó en `DENIED`, conservó el estado entre invocaciones del CLI y se comprobó que `workspace/denegado-v3.md` no existía.

Estos ensayos prueban comportamientos concretos; no acreditan todavía reutilización/revocación de grants con un LLM real, routing automático real ni manejo integral de fallos remotos.

## Diseño acordado, especificaciones y código

Las [ADR](../decisions/README.md) etiquetadas como baseline expresan diseño acordado, no funcionalidades completas. ADR-035 está retirada; ADR-059 debe interpretarse con ADR-068–072. Los contratos auxiliares aún sin esquema definitivo y las opciones abiertas del [roadmap](roadmap.md) siguen siendo preliminares.

La memoria híbrida acordada conserva SQLite para entidades/relaciones y Markdown Vault para documentos, con índices derivados y separación de `ExecutionRecord`, `ExperienceRecord` y `MemoryEntry` (ADR-048). No está implementada por las bases de checkpoints o grants. Esta revisión no cambia esa arquitectura ni añade decisiones. Los adaptadores de inferencia no son delegación a agentes externos; la coordinación y la autorización siguen perteneciendo al runtime propio.

## Pruebas pendientes para cerrar PoC 0.3.1

Orden recomendado de evaluación; la cobertura indicada proviene de inspeccionar los tests existentes:

| Orden | Caso | Cobertura automatizada parcial | Validación pendiente y criterio observable |
|---|---|---|---|
| 1 | Reutilización de permisos con ChatGPT | `test/v2-core.test.ts`: evaluación de grant; `test/v2-integration.ts`: reutilización entre procesos; `test/v3-integration.ts`: reutilización con mock | Conceder grant a `text.transform` con ChatGPT y reutilizarlo en otra ejecución real. Debe ejecutar la transformación sin pedir permiso otra vez y seguir pidiendo aprobación independiente para escribir. |
| 2 | Revocación y nueva autorización | Unitarios v2 y la integración v2 prueban revocación y nueva espera; integración v3 revoca para preparar/limpiar, sin comprobar una nueva ejecución tras revocación | Revocar el grant anterior y comenzar otra ejecución con ChatGPT: debe volver a solicitar autorización para `text.transform`. |
| 3 | Routing automático hacia ChatGPT sin API key | `test/v3-core.test.ts`: `auto` offline, opt-in cloud y ruta ChatGPT con entorno simulado; integración v3 mantiene cloud deshabilitado | Con cuenta/modelo configurados, `AGENT_ALLOW_CLOUD=1`, prioridad limitada a `chatgpt` y sin claves comerciales, comprobar selección real de `chatgpt` y ejecución. No equivale al router inteligente del diseño. |
| 4 | Errores de autenticación, red y proveedor sin fallback comercial | Unitarios v3 rechazan configuración incompleta; `test/v3-siwc.test.ts` rechaza stream truncado y evento `response.failed` | Nuevas pruebas controladas de credencial ausente/inválida/expirada, refresh fallido, HTTP de error, timeout/red y cuota/proveedor. Comprobar error explícito, estado persistido, ausencia de efectos adicionales y de llamadas comerciales; faltan pruebas del adaptador completo. |
| 5 | Propuestas inválidas | Tests SIWC rechazan JSON malformado, ID desconocido y argumentos con valores no string; tests v2 rechazan argumentos inválidos | Nuevas pruebas del grafo/adaptador con argumentos string semánticamente inválidos, campos ausentes/adicionales, rutas inseguras y propuestas múltiples. Comprobar que no se ejecutan ni reciben autorización válida. No depender de provocar esos errores de manera aleatoria con un LLM. |
| 6 | Límite de herramientas | La condición está en `src/v3/graph.ts`; no hay test dedicado al agotamiento | Nueva prueba determinista de cinco propuestas válidas y parada en `BUDGET_EXHAUSTED`, sin sexta propuesta/ejecución ni inferencia adicional; comprobar persistencia del contador y el comportamiento tras reanudar. Evaluación con LLM real solo como complemento. |

No se han añadido ni ejecutado estas pruebas pendientes en esta revisión.

## Retomar el trabajo

1. Leer este estado y la [estrategia de verificación](verification.md); revisar `git status` para conservar cambios existentes. Usar Node >=24.15 y las dependencias del proyecto. No borrar `data/`: contiene checkpoints, registro y grants; `workspace/` contiene efectos de las pruebas. Ambos son locales e ignorados por Git.
2. Consultar `npm run agent:v2 -- tools list` y `npm run agent:v2 -- grants list`. Registrar `examples/text-transform.tool.json` solo si falta `text.transform`; `EEXIST` no requiere sobrescribir el descriptor. Si hay un grant previo, documentar su estado y revocarlo antes del ensayo de primera concesión. Verificar que el run ID y el archivo objetivo no existan; si existen, usar identificadores y nombres nuevos y registrarlos.
3. Comprobar localmente `npm run auth:v3 -- status` y el modelo seleccionado. Si hace falta, usar el flujo `login`, `models`, `use` del README. No copiar credenciales ni salidas con identidad personal al registro de resultados. El acceso depende de la autorización efectiva de la cuenta; no requiere una API key comercial.
4. Realizar la siguiente prueba manual prevista, **en la próxima sesión; no ejecutada durante este cierre documental**:

```bash
npm run agent:v3 -- start grant-real-1 --model chatgpt --task 'Convierte "permiso persistente" a mayúsculas y guarda el resultado en grant-real-1.md'
npm run agent:v3 -- status grant-real-1
```

Cuando la propuesta pendiente sea `text.transform` con los argumentos esperados, conceder el permiso de workspace:

```bash
npm run agent:v3 -- approve grant-real-1 --remember workspace
```

El grant se guarda después de ejecutar correctamente la transformación y vincula capacidad, fingerprint y scope `poc-workspace`; no vincula los argumentos exactos de futuras transformaciones ni implementa caducidad. Solo el adaptador de transformación admite grants persistentes. La escritura sigue requiriendo aprobación de una vez: inspeccionar `status`, aprobarla si corresponde y comprobar `COMPLETED` y contenido `PERMISO PERSISTENTE` en `workspace/grant-real-1.md`.

Después, iniciar otra tarea con `--model chatgpt`, texto distinto y archivo nuevo: comprobar que se reutiliza el grant y que la primera aprobación pendiente corresponde a `filesystem.write`. Verificar los resultados antes de revocar:

```bash
npm run agent:v2 -- grants list
npm run agent:v2 -- grants revoke text.transform
```

Iniciar una tercera tarea real con ID/archivo nuevos y comprobar nueva solicitud para `text.transform`. El grant store es compartido por v2 y v3 (`data/tool-grants-v2.sqlite`); no ejecutar las integraciones v2/v3 entre concesión y comprobación de reutilización, pues revocan permisos. Las propuestas reales son no deterministas: si el modelo omite la transformación o propone otra secuencia, registrar el resultado sin considerarlo validación del caso previsto.

5. Continuar con los casos 3–6 de la tabla. Registrar para cada caso versión/commit, entorno, run ID, condiciones iniciales, resultado esperado/observado, grants, estados y efectos; separar automatización de comprobación manual y excluir secretos/datos personales. Cerrar formalmente la PoC solo al evaluar los seis casos y documentar fallos o pendientes. Después seguir la consolidación del roadmap, antes de ampliar capacidades.

## Diferencias documentales detectadas al contrastar código

- El README principal y `README-v03.md` conservan limitaciones de validación del contenedor de construcción. No invalidan los resultados posteriores del host documentados aquí; no deben leerse como ausencia de toda integración o inferencia real verificada.
- `README-v02.md` afirma que su integración revoca al inicio y al final; `test/v2-integration.ts` revoca antes de comprobar la nueva solicitud, pero su bloque `finally` solo elimina el archivo. La integración v3 sí revoca en `finally`.
- La expresión «5 tool calls» del CLI/documentación simplifica un contador de propuestas válidas previo a autorización; el comportamiento exacto se detalla en los límites anteriores.
- Los JSON Schemas enviados al modelo declaran `additionalProperties:false`, pero `validateToolArguments` no rechaza exhaustivamente claves adicionales. No afirmar validación integral de JSON Schema en el Gateway: aplica comprobaciones concretas por adaptador. Falta cubrir ese desajuste con pruebas.
- El grafo marca `completed` cuando el modelo devuelve una respuesta final; aún no aplica criterios genéricos de éxito del diseño. En `account-1`, la evidencia de éxito incluye la comprobación manual del archivo, además del estado.
- Las excepciones de inferencia/validación se propagan y el CLI devuelve error; no hay transición general explícita a `FAILED` en el grafo v3. Las pruebas pendientes deben inspeccionar el checkpoint real en lugar de asumir ese estado.

Estas diferencias se registran sin modificar código, tests ni decisiones arquitectónicas.
