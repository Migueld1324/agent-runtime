# Guía de trabajo con cualquier CLI de desarrollo

## Instalación del paquete de contexto

Añadir **solo** estos Markdown al checkout existente. No reemplazar `src/`, `test/`, `package.json`, `README.md`, `data/` ni el estado de `workspace/`. Hacer commit normal de los documentos; no versionar claves.

## Comenzar sesión

```fish
cd ~/Downloads/agent-runtime-poc-v03  # sustituye por el checkout real de agent-runtime
codex
```

Codex CLI lee `AGENTS.md` en la raíz del proyecto al empezar. Claude Code lee `CLAUDE.md`; Gemini CLI lee `GEMINI.md`; Copilot puede leer `.github/copilot-instructions.md`. Los cuatro remiten a la **misma** documentación. No mezclar **herramienta de desarrollo** (Codex CLI/Claude Code/Gemini CLI) con **proveedor de inferencia** del producto (ChatGPT, Claude, Gemini, LLM local).

Primer prompt recomendado, válido para cualquier CLI:

> Lee `AGENTS.md`, `PROJECT_CONTEXT.md` y el índice `docs/context/README.md`. Revisa los documentos de arquitectura, decisiones, progreso y pruebas, y contrástalos con el código actual. Resume lo aprobado, lo implementado, lo validado y lo pendiente. No implementes nada todavía y no inventes ADRs.

Una vez confirmado el resumen, puedes pedir:

> Propón el siguiente vertical slice de `MemoryService`, `MemoryEntry` y `ExperienceRecord`, incluyendo contratos, migraciones, casos de prueba y riesgos, sin cambiar aún la arquitectura aprobada.

## Comandos actuales (verificar contra package.json)

```fish
npm install
npm run typecheck
npm run test:core
npm run test:v2
npm run test:v2:integration
npm run test:v3
npm run test:v3:integration

# Estado de cuenta/selección de un modelo (no imprimir tokens)
npm run auth:v3 -- status
npm run auth:v3 -- models

# Runtime controlado (no automatizar aprobaciones)
npm run agent:v3 -- status <run-id>
```

No ejecutar un run que escriba datos sensibles como simple prueba. No hacer `auth:v3 -- login` si ya está autorizado sin necesidad; `models` retorna catálogo cambiante, usar slugs, no display name.

## Después de cada sesión

1. Actualizar `ROADMAP.md` con estado y siguiente paso.
2. Registrar evidencia: cambios, comandos, resultados, plataforma, riesgos, discrepancias en `POC_HISTORY.md` o archivo de evidencia nuevo.
3. Escribir ADR solo ante decisión explícita; mantener `DECISIONS.md` como tabla de referencia.
4. Asegurar que archivos locales/secrets/noise no entraron a Git: `git status --short` y `git diff --cached --stat` antes de commit; revisar staged diffs sin imprimir tokens.
5. Completar `HANDOFF_TEMPLATE.md` en una nota de sesión opcional para que el próximo agente retome sin inventar progreso.

## Resistencia a pérdida de contexto

Nunca confiar en que un CLI recuerda sesiones anteriores. `AGENTS.md` es un **bootstrap corto**; los detalles viven en el repo. Si la ventana de contexto se pierde, releer `PROJECT_CONTEXT.md` y los documentos relevantes. Los archivos reflejan intenciones y estados históricos; el código y tests actuales demuestran qué funciona hoy.
