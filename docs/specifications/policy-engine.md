# Especificación: Policy Engine y autorización dinámica

**Diseño:** v0.1 y enmienda v0.2 (ADR-058–072). **Implementación parcial:** Policy Gateway y grants restringidos en PoC 0.2/0.3.1.

## Propósito

Determinar si una operación solicitada por un agente puede ejecutarse, bajo qué restricciones y si exige intervención humana. La autorización se aplica a **modelos (egreso de datos), memoria (recall/admisión) y herramientas (efectos)**. La política decide, el Gateway impone, el Executor actúa: estas responsabilidades no deben fusionarse a favor del LLM.

## Datos mínimos para evaluar

```ts
interface AuthorizationRequest {
  context: ExecutionContext;
  capabilityId: string;
  action: string;
  resource: { type: string; id: string; scopeId: string };
  arguments: unknown;
  constraints?: {
    maxDurationMs?: number;
    maxAffectedFiles?: number;
    networkAccess?: boolean;
  };
}
```

Cinco dimensiones: **quién** solicita, **qué** operación, **sobre qué recurso**, **en qué ámbito** y **bajo qué restricciones**. El contexto y la identidad no son editables por el modelo. El recurso, la versión de herramienta y los argumentos son parte vinculante de la autorización.

## Decisiones (v0.2 sustituye al contrato v0.1)

```ts
type PolicyDecision =
  | { decision: 'allow'; constraints: ExecutionConstraints; grantId?: string }
  | { decision: 'require_approval'; approvalRequestId: string; proposedScope: AuthorizationScope }
  | { decision: 'registration_required'; capabilityId: string; reason: string }
  | { decision: 'deny'; reason: string };
```

`ExecutionConstraints` y `AuthorizationScope` se nombran en la conversación pero **no tienen esquema definitivo completo**. El implementador deberá formalizar y probar su composición (intersección, herencia, límites) antes de usar el contrato en producción.

### Orden normativo de evaluación

| Prioridad | Evaluación | Resultado |
|---|---|---|
| 1 | Prohibición obligatoria aplicable | `deny` |
| 2 | Grant explícito compatible, vigente y sin revocar | `allow` restringido |
| 3 | Política heredable por capacidad, verificada, dentro de los mismos límites | `allow` restringido |
| 4 | Capacidad confiable sin grant, acción aprobable | `require_approval` |
| 5 | Herramienta sin adaptación/registro confiable | `registration_required` |
| 6 | Ninguna regla aplicable | `deny` |

La enmienda se produjo porque la regla original «si no está registrada, denegar y terminar» impedía la extensibilidad. **Default deny sigue vigente para ejecutar**, pero ahora el sistema puede descubrir, registrar y pedir aprobación. Una política obligatoria `deny` jamás se supera solicitando una aprobación genérica.

## Duración/ámbitos de grants

Una aprobación podría valer **una vez**, **durante esta tarea** o **para un workspace**; la reutilización exige coincidencia de capacidad, riesgo, efectos, recursos, parámetros/restricciones y vigencia. Revocación y cambio de privilegios provocan nueva evaluación. El grant de un transformador de texto no autoriza escritura de archivos. El alcance de un workspace nunca se expande a toda la máquina por una traducción defectuosa de rutas.

## Restricciones de ejecución efectivas

```ts
interface ExecutionProfile {
  workspaceId: string;
  filesystem: { readPaths: string[]; writePaths: string[] };
  network: { enabled: boolean; allowedHosts?: string[] };
  privileges: 'unprivileged' | 'elevated';
  limits: { timeoutMs: number; maxMemoryMb?: number; maxProcesses?: number };
}
```

Este perfil **no constituye por sí mismo un sandbox OS**. Hay que construir mecanismos que apliquen realmente path boundaries, symlink protection, subprocess limits, red y privileges. El resultado de `allow` no debería emitirse cuando no es posible imponer las restricciones críticas.

## Ataques y superficies de riesgo

- Documentos y resultados de herramientas son datos no confiables: no se convierten en políticas ni pueden instruir al modelo a eludir controles.
- Los secretos no deben entrar en los prompts ordinarios ni quedar en auditoría por defecto.
- Antes de enviar datos a modelos remotos, evaluar clasificación y proveedor/destino permitidos.
- Validar JSON Schema y argumentos **antes** de solicitar aprobación y **otra vez** al ejecutar, incluidos descriptor fingerprint, versión y request hash.
- Una aprobación de un solo uso no se repite tras reinicio o reintento.
- Aislar registros de auditoría de contenido sensible; definir visibilidad, borrado y retención.

## Auditoría

```ts
interface PolicyAuditEvent {
  id: string;
  requestId: string;
  runId: string;
  agentId: string;
  capabilityId: string;
  decision: 'allow' | 'deny' | 'require_approval';
  policyId?: string;
  grantId?: string;
  timestamp: string;
}
```

La versión definitiva de auditoría debe admitir `registration_required` y revisiones de política, de forma compatible con la evolución del contrato.

## Cobertura real de PoC

**Validado:** se propuso `text.transform` desde un LLM remoto; el Gateway pidió aprobación, ejecutó y posteriormente pidió aprobación independiente para `filesystem.write`. En una segunda tarea se denegó la escritura: estado `DENIED`, archivo inexistente. Los tests v2 verificaron hash exacto, grants persistentes, revocación y límites de escritura.

**Pendiente:** clasificación formal de datos y egreso por scope, aprobación por tarea general, políticas heredables seguras, registro dinámico del sistema anfitrión, perfiles de aislamiento OS y auditoría avanzada. No declarar seguridad de producción.

**Fuentes:** conversación original, líneas 12012–12945; trazas de validación del usuario para PoC 0.3.1.
