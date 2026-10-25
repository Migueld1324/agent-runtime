# Especificación: contratos comunes

**Origen:** Common Contracts v0.1 (ADR-015–021). **Naturaleza:** contratos objetivo; no asumir que todos se implementaron en la PoC.

## Normas

- Contratos-first: consumidores dependen de interfaces, no de una implementación concreta.
- Identificadores persistentes opacos y globalmente únicos; los alias humanos no reemplazan IDs.
- Versionar descriptores, esquemas y mensajes cuando rompan compatibilidad.
- Contexto confiable construido por runtime, no por el texto del modelo.
- Diferenciar disponibilidad, autorización y resultados de ejecución.

## Identidades

| ID | Semántica |
|---|---|
| `userId` | Principal solicitante |
| `agentId` | Agente propio del sistema |
| `deviceId` | Host de origen o ejecución |
| `sessionId` | Conversación/interacción |
| `runId` | Una tarea durable |
| `scopeId` | Espacio de acceso y conocimiento |
| `requestId` | Operación individual trazable |

```ts
interface ExecutionContext {
  requestId: string;
  runId: string;
  sessionId: string;
  userId: string;
  agentId: string;
  deviceId: string;
  scopeId: string;
  createdAt: string;  // ISO 8601 UTC
  deadline?: string;
}
```

**Invariante:** el LLM no puede modificar el `ExecutionContext` para ampliar acceso o fingir otra identidad.

## Capacidades

```ts
type Availability = 'available' | 'degraded' | 'unavailable' | 'unsupported';
type Effect = 'read' | 'write' | 'execute' | 'external';
interface CapabilityDescriptor {
  id: string;
  version: string;
  availability: Availability;
  effects: Effect[];
  inputSchemaId: string;
  outputSchemaId: string;
  description: string;
}
```

Nomenclatura estable como `filesystem.read`, `git.diff` o `desktop.window.focus`. Una implementación Hyprland del último capability puede tener detalles privados, pero no condiciona el contrato. `availability = available` **no** implica que la política conceda `allow`.

## Operaciones y errores

```ts
type ErrorCode =
  | 'INVALID_ARGUMENT' | 'NOT_FOUND' | 'UNSUPPORTED' | 'UNAVAILABLE'
  | 'APPROVAL_REQUIRED' | 'POLICY_DENIED' | 'TIMEOUT' | 'CANCELLED'
  | 'EXECUTION_FAILED';
interface OperationError { code: ErrorCode; message: string; retryable: boolean; }
type OperationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: OperationError };
```

**Conducta normativa:** `POLICY_DENIED` no es fallback elegible; `TIMEOUT` no justifica repetir un efecto sin conciliación; `UNSUPPORTED` requiere otra capacidad válida; no falsificar éxito cuando el estado del mundo no fue verificado.

## Autorización transversal básica

```ts
interface PolicyRequest {
  context: ExecutionContext;
  capabilityId: string;
  resourceId?: string;
  operation: string;
  arguments: unknown;
  dataClassification?: string;
}
```

La forma de la decisión se refina en [Policy Engine](policy-engine.md): el primer contrato de tres variantes (`allow` / `require_approval` / `deny`) fue ampliado con `registration_required` para capacidades sin integración confiable.

## Clasificación de datos

- `public`: destino autorizado por política.
- `internal`: dentro del ámbito autorizado.
- `confidential`: transmisión y lectura sujetas a controles más fuertes.
- `secret`: credencial/clave gestionada fuera de memorias y prompts ordinarios.

Es una **taxonomía inicial de diseño**; aún requiere integración real con MemoryService y ModelRouter.

## Reglas de evolución

Una modificación incompatible crea versión de contrato y migración o adaptador; no se reinterpreta silenciosamente un evento antiguo con semántica nueva. Incluye compatibilidad de checkpoints restaurados tras actualizaciones y huellas de descriptores que afectan permisos.

**Fuente:** export original, líneas 9505–9870.
