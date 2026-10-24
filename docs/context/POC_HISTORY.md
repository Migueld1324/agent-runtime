# Historia del runtime y evolución de las PoC

**Código de referencia del corte:** repo `Migueld1324/agent-runtime`, rama `main` y archivo `README.md` que encabezaba «PoC 0.3.1: account-first authentication fix». Validaciones de máquina entregadas por el usuario el 2026-10-24. Este registro no prueba que ningún host futuro tenga idénticos paquetes/permisos.

## PoC 0.1 — control básico

**Implementado:** CLI inicial, políticas y operaciones limitadas sobre archivos, estado/orquestación básicos. El código legado persiste en `src/` (`cli.ts`, `graph.ts`, `models.ts`, `policy.ts`, `tool.ts`). **Heredado:** `test:core` comprueba validación de rutas, aprobación, idempotencia y protección symlink. No se reconstruyen fechas ni resultados de tests individuales de una época no disponible.

## PoC 0.2 — herramientas y autorizaciones

**Implementado:** `ToolRegistry` basado en descriptores confiables y operaciones registrables; `Policy Gateway`, hashing de solicitudes y fingerprint de descriptores; grants acotados/revocables y persistidos; aprobación/reanudación y ejecución con validación. Código `src/v2/`.

**Validado en máquina por el usuario:** `npm run test:v2` **5/5**, `npm run test:v2:integration` **PASS**: registro dinámico, autorización persistente entre procesos, revocación, límites de lectura/escritura.

## PoC 0.3 — LLM propone herramientas

**Implementado:** LangGraph en `src/v3`, flujo secuencial plan → policy/approval → execute → observación → plan, SQLite de checkpoints; fixture mock; enrutamiento de proveedores y adaptadores por AI SDK. Diseño limitado a una tool por inferencia, cinco tools por corrida. **Error arquitectónico de primera implementación:** el test con LLM real asumió APIs comerciales con keys. El usuario no había aprobado ese requisito y no podía utilizarlo en sus pruebas actuales.

## PoC 0.3.1 — acceso por cuenta (corrección, no reinicio)

**Implementado:** `chatgpt` usa el flujo de cuenta Sign in with ChatGPT y catálogo de modelos; rutas de API keys quedan opcionales, sin fallback; el resto del gateway/graph se reutiliza. Los tokens no se guardan en Git.

**Validado en máquina por el usuario el 2026-10-24:**

- Inicio de sesión SIWC, plan autorizado, token activo, catálogo visible y selección de un slug; no se requiere API key comercial.
- `start account-1 --model chatgpt`: propuso `text.transform`, pausa `WAITING_APPROVAL`, tras aprobar propuso `filesystem.write`, nueva pausa, luego `COMPLETED`. Archivo generado con `PRUEBA DE IA` y comprobado con `cat`.
- `start denial-1 --model chatgpt`: tras aprobar solo `text.transform`, `filesystem.write` quedó pendiente y `deny denial-1` produjo `DENIED`; `status` persistió y el test de inexistencia del archivo devolvió `PASS: escritura bloqueada`.
- `npm run test:v3`: **9/9**; `npm run test:v3:integration`: **PASS**.
- `npm run test:v2`: **5/5**; `npm run test:v2:integration`: **PASS**.
- `npm run test:core`: **18/18**. Es un superset que incluye tests v2/v3; no sumar 18+9+5 como si fueran conjuntos independientes.
- `npm run typecheck`: usuario indicó que lo ejecutó primero, sin errores reportados. No se proporcionó la salida literal para archivarla.

## Lo que estas pruebas *no* demuestran

Sandbox de OS, plugin externo seguro, compatibilidad de todas las cuentas/modelos, operación multiusuario, robustez contra crash a mitad de un side effect irreversible, memoria híbrida, vector search, multiagente, herramientas genéricas, métricas de cost/quality routing o soporte nativo de modelos locales.

## Reglas de continuidad

No descartar código ya validado sin motivo. Mantener tests y evolucionar componentes; si se reemplaza un adaptador, preservar invariantes de permisos y checkpointing. Archivar fallos/reparaciones como experiencias **solo cuando** exista el subsistema de memoria, con su contexto y procedencia; no convertir logs sin revisión en conocimiento universal.
