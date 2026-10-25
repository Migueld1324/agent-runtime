# Flujos de extremo a extremo

Estos flujos describen el **diseño objetivo**; las notas «PoC» indican solo la parte que ya se ha probado.

## A. Petición y llamada a herramienta

```mermaid
sequenceDiagram
  actor U as Usuario
  participant RT as Agent Runtime
  participant C as Context Manager
  participant M as ModelRouter/Provider
  participant R as ToolRegistry
  participant P as Policy Engine
  participant G as Tool Gateway
  participant E as ToolExecutor
  U->>RT: Iniciar tarea
  RT->>C: Construir contexto autorizado
  C-->>RT: Context package
  RT->>M: Solicitar propuesta
  M-->>RT: ToolCall + argumentos
  RT->>R: Resolver y validar capacidad
  R-->>RT: Descriptor/verificación
  RT->>P: Evaluar autorización exacta
  alt Requiere aprobación
    P-->>RT: require_approval
    RT-->>U: Estado durable WAITING_APPROVAL
    U->>RT: Aprobar o denegar
  end
  alt Permitido
    RT->>G: Ejecutar con token y restricciones
    G->>P: Revalidar grant y argumentos
    G->>E: Ejecutar operación
    E-->>RT: Resultado comprobable
    RT->>M: Nueva inferencia con observación
  else Denegado
    RT-->>U: DENIED / alternativa segura
  end
```

**PoC 0.3.1 observada:** ChatGPT propuso `text.transform`, después `filesystem.write`. Hubo dos permisos independientes. En otra ejecución, se denegó `filesystem.write` y no apareció `workspace/denegado-v3.md`.

## B. Memoria y recuperación

```mermaid
sequenceDiagram
  participant RT as Agent Runtime
  participant CM as Context Manager
  participant PE as Policy Engine
  participant MS as Memory Service
  participant ST as SQL+Markdown+Index
  RT->>CM: Contexto necesario para tarea
  CM->>PE: Identidad, scope, política de lectura
  PE-->>CM: Conjunto de ámbitos autorizados
  CM->>MS: Recall query (scopes permitidos)
  MS->>ST: Filtrar y recuperar
  ST-->>MS: Hits, fuentes y relaciones
  MS-->>CM: Resultados y relevancia
  CM-->>RT: Context package dentro de token budget
```

**No implementado todavía**: la PoC solo agrega historial compacto de tool observations al prompt. No usa `MemoryService`.

## C. Almacenamiento de experiencia

```mermaid
flowchart LR
  A[Eventos verificados de Run] --> B[ExecutionRecord]
  B --> C[Consolidación de experiencia]
  C --> D[ExperienceRecord]
  D --> E[Extracción de conclusiones]
  E --> F{Admisión según scope}
  F -->|Aceptar| G[MemoryEntry]
  F -->|Revisión| H[Review Queue]
  F -->|Insuficiente evidencia| I[Conservar hipótesis / experiencia]
  D -.derived_from / evidencia.-> B
  G -.derived_from.-> D
```

Distinguir hecho observado, hipótesis, procedimiento probado y mera sugerencia. El sistema no reentrena el LLM por guardar experiencias.

## D. Recuperación tras interrupción

1. Persistir plan, estado y propuesta antes de pedir autorización.
2. Reanudar desde checkpoint identificando operación pendiente, ID del descriptor y hash de argumentos.
3. Verificar nuevamente registro, versión, ámbito y grant.
4. Para efecto externo en estado incierto, conciliar resultados con el mundo real antes de reintentar.
5. Continuar desde observación confirmada o detenerse con estado explícito.

**PoC:** checkpoints de LangGraph restauran interrupciones de aprobación entre procesos; no hay conciliación general de efectos irreversibles.

## E. Fallback de modelo sin fuga de datos

Modelo falla → runtime identifica paso y efectos previos → router propone alternativas compatibles → Policy Engine comprueba clasificación/egreso y costos → usuario aprueba cuando corresponda → nuevo modelo reanuda desde contexto seguro. Si el usuario fijó modelo, no reemplazarlo silenciosamente.

**PoC:** no se implementa fallback automático del modelo fijado. Es una garantía útil de los ensayos, no el motor de recuperación final.
