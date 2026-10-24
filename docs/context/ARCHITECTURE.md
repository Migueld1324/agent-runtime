# Arquitectura: implementado frente a objetivo

Fecha de referencia: 2026-10-24. **El diseño completo aún no está implementado.**

## Flujo actualmente ejecutable (PoC 0.3.1)

```text
CLI (start/status/approve/deny)
       |
Model router (mock | chatgpt | adaptadores API optativos)
       |
ModelProvider -> propuesta única de herramienta / respuesta final
       |
LangGraph + checkpoint SQLite
       |
ToolRegistry -> validación descriptor/args/hash -> Policy Gateway
       |                        |
       |                        +----> WAITING_APPROVAL -> approve/deny
       v
Trusted Tool Executor -> observación -> checkpoint -> modelo
       |
     COMPLETED / DENIED / límite de tools
```

- `src/v3/cli.ts`: operaciones de una corrida y estado.
- `src/v3/graph.ts`: LangGraph, interrupciones, aprobación, reanudación, presupuesto de 5 operaciones, SQLite `data/runtime-v3.sqlite`.
- `src/v3/router.ts`: `mock|chatgpt|openai|anthropic|google`, `auto` seguro por defecto.
- `src/v3/models.ts`, `chatgpt-inference.ts`, `chatgpt-auth.ts`, `siwc-protocol.ts`: adaptadores y sesión ChatGPT; la propuesta es JSON estructurado, no función ejecutada por el proveedor.
- `src/v3/mock.ts`: fixture offline determinista; no es modelo local.
- `src/v2/registry.ts`, `policy.ts`, `tools.ts`: manifiestos trusted, schemas, request hashes, grants y ejecución controlada.
- `src/{cli,graph,policy,tool,models}.ts`: núcleo de PoC 0.1 legado que continúa en el repositorio.

## Arquitectura objetivo aprobada (contratos, no necesariamente clases ya implementadas)

```text
Interfaz de usuario / sesiones / trabajo
            |
         Agent Runtime propio
       /        |         \
  ModelService  Policy     ToolRegistry/ToolProvider
       |        Engine             |
   ModelProvider   + autorización / auditoría / capacidades
    (cloud/local)
            |
      MemoryService (ciclo de vida, políticas, retrieval)
            |
      MemoryProvider (contrato) -> SQLite / Vault MD / índices
```

**Regla de diseño:** separar contratos de política, proveedor y persistencia. El diagrama objetivo muestra relaciones lógicas, **no** una implementación ya existente ni un árbol definitivo de paquetes. Los nombres `ModelProvider`, `ToolProvider`, `MemoryProvider`, `MemoryService` son nombres conceptuales recuperados; firmas concretas por definir. Los contratos deben expresar capacidades/degradación controlada: si un proveedor carece de embeddings o tool calling nativo, el núcleo no debe asumirlas ni saltarse permisos.

## Lo que el código no hace todavía

- No hay `MemoryService`, esquema `MemoryEntry`/`ExperienceRecord`, retrieval semántico ni Markdown Vault sincronizado.
- No hay ejecución multiagente, planificación paralela o scheduler de producción.
- No hay integración de modelos locales: `mock` no es Ollama ni un LLM real.
- No hay routing de calidad/coste/latencia/privacidad; el auto actual es selección por prioridad/credenciales con opt-in.
- No hay sandbox del sistema operativo ni control de shell, navegador, escritorio o red expuesto al modelo.
- La recuperación fiable de side effects irreversibles y el replay fiel de mensajes nativos del modelo son posteriores.

## Criterios para cambios arquitectónicos

Cada nueva capacidad debe conservar límites de confianza, compatibilidad de interfaces, evidencias con tests, mecanismos para fallar de forma segura y migración de estado. Nunca extrapolar limitaciones deliberadas de una PoC como exigencias permanentes, pero nunca levantarlas sin diseño + pruebas.
