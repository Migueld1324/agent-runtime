# Policy Gateway, herramientas y fronteras de confianza

## Objetivo de seguridad aprobado

**Default-deny**, pero descubrimiento y registro de capacidades nuevas no deben quedar bloqueados por la falta de una política preexistente. Registrar una herramienta **no** significa permitir su ejecución. La aprobación debe ser «on demand» y limitada a identidad/operación/scope; cambios de descriptor invalidan autorizaciones que ya no correspondan.

## Ya implementado y probado en la PoC

- Registro de herramientas con manifiestos/descriptores confiables; validación de ID, schema y argumentos.
- Solicitud pendiente ligada al `run`, descriptor y argumentos mediante hash de solicitud exacto. Revalidación antes de ejecutar.
- Aprobación explícita; grants reutilizables limitados por scope para transformaciones seguras; revocación. Escritura revisable por separado.
- Suspensión durable `WAITING_APPROVAL` con LangGraph y reanudación en invocaciones CLI posteriores.
- Resultado denegado `DENIED`, bloqueo efectivo de `filesystem.write` y ausencia de archivo, verificado con **LLM real** el 2026-10-24.
- `filesystem.write` está limitado a `.md` de basename permitido bajo `workspace/`; política create-once con rechazo de sobrescrituras indebidas/symlinks. No extrapolar a un sandbox completo.

## Flujo vigente

```text
Propuesta no confiable del LLM
  -> lookup en ToolRegistry (trusted)
  -> validar args + fingerprint descriptor + SHA256 de solicitud
  -> Policy Gateway: allow | deny | approval_required
  -> (si corresponde) interrupción/continuación de CLI
  -> revalidación + ejecución por adaptador confiable
  -> observación registrada/checkpoint
```

## Restricciones explícitas del PoC

Una tool por turno de inferencia; máximo 5 llamadas. Herramientas implementadas: transformación de texto, escritura controlada de Markdown (y operaciones ya expuestas/permitidas por v2); no shell arbitraria, sistema completo de archivos, navegador, red, plugins ejecutables no confiables ni control de escritorio. `data/`, el almacén OAuth y `workspace/` **no** deben entrar a Git. El estado persistente de la PoC y sus grants no es autorización multiusuario segura en producción.

## Próximos asuntos, no decisiones de implementación

Modelo explícito de identidad/actor/scope, auditoría durable y revisable, segregación de descubrimiento/registro/capability review/approval, expiración/rotación de grants y control de concurrencia; manejo de reintentos e idempotencia de herramientas con efectos irreversibles; aislamiento de herramientas ejecutables y permisos externos. Abrir ADR específica antes de habilitar OS/shell/network o herramientas con impacto económico. Evitar prometer rollback genérico de efectos irreversibles.
