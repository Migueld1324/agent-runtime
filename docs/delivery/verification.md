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

## Evidencia disponible de 0.3.1

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
