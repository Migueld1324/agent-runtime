# Modelos y Hybrid Routing

Este capítulo expresa la **decisión, el motivo y su efecto sobre el diseño**. Los ejemplos completos, límites y contratos viven en las especificaciones enlazadas; estas ADR no sustituyen el plan de pruebas.

## ADR-022

**Decisión:** Separar `ModelProvider`, `ModelRegistry` y `ModelRouter`.

**Motivo y consecuencias:** Catálogo, selección e inferencia son problemas diferentes; separarlos permite medir y cambiar la ruta sin reemplazar proveedores.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Modelos](../specifications/models.md). *Fuente histórica: export original L10406.*

---

## ADR-023

**Decisión:** Inferencia y respuestas mediante contratos normalizados.

**Motivo y consecuencias:** Normalizar mensajes, tool calls, finish reasons y usage permite que LangGraph opere sin detalles de cada API.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Modelos](../specifications/models.md). *Fuente histórica: export original L10407.*

---

## ADR-024

**Decisión:** Descubrimiento explícito de capacidades y límites.

**Motivo y consecuencias:** Los modelos difieren en modalidades, tool calling, streaming y límites; el router no debe asumir capacidades no verificadas.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Modelos](../specifications/models.md). *Fuente histórica: export original L10408.*

---

## ADR-025

**Decisión:** Tool Calling mediado obligatoriamente por el Agent Runtime.

**Motivo y consecuencias:** Una herramienta solicitada es solo un dato no confiable hasta que registry, runtime y Policy Engine la aprueben.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Modelos](../specifications/models.md). *Fuente histórica: export original L10409.*

---

## ADR-026

**Decisión:** Routing híbrido: elección manual y automatización opcional.

**Motivo y consecuencias:** Se necesita poder fijar un modelo explícitamente, con automatización subordinada a esa preferencia.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Modelos](../specifications/models.md). *Fuente histórica: export original L10410.*

---

## ADR-027

**Decisión:** Autorización de privacidad antes de transmitir datos.

**Motivo y consecuencias:** Elegir cloud también es transferir información; clasificación y consentimiento se evalúan antes del envío.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Modelos](../specifications/models.md). *Fuente histórica: export original L10411.*

---

## ADR-028

**Decisión:** Gestión de contexto fuera del ModelProvider.

**Motivo y consecuencias:** La memoria y el presupuesto de contexto pertenecen al runtime/context manager, no al proveedor de inferencia.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Modelos](../specifications/models.md). *Fuente histórica: export original L10412.*

---

## ADR-029

**Decisión:** Streaming, cancelación y métricas como parte del contrato.

**Motivo y consecuencias:** La interfaz debe conocer progreso, cancelación y consumo aun cuando los proveedores emitan protocolos distintos.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Modelos](../specifications/models.md). *Fuente histórica: export original L10413.*

---

## ADR-030

**Decisión:** Fallback compatible con políticas y estado de ejecución.

**Motivo y consecuencias:** Fallback no puede ignorar límites de coste/datos ni repetir acciones ya ejecutadas: requiere estado durable.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Modelos](../specifications/models.md). *Fuente histórica: export original L10414.*

---

## ADR-031

**Decisión:** `EmbeddingProvider` separado de la inferencia generativa.

**Motivo y consecuencias:** Vectores y generación de texto son operaciones distintas aunque utilicen modelos similares; se evita acoplar el índice a un LLM.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Modelos](../specifications/models.md). *Fuente histórica: export original L10415.*

---

## ADR-032

**Decisión:** Hybrid Routing con selección explícita por tarea o sesión.

**Motivo y consecuencias:** La preferencia de tarea o sesión tiene precedencia sobre sugerencias automáticas del router; no cambiar una elección fijada en silencio.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Modelos](../specifications/models.md). *Fuente histórica: export original L10659.*

---

## ADR-033

**Decisión:** Routing automático basado en capacidades, políticas y métricas.

**Motivo y consecuencias:** Cuando no exista elección explícita, el router debe basarse en capacidades, restricciones y métricas reales, no en marketing.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Modelos](../specifications/models.md). *Fuente histórica: export original L10660.*

---

## ADR-034

**Decisión:** Estado del modelo activo expuesto mediante eventos independientes de la interfaz.

**Motivo y consecuencias:** El estado del modelo activo debe ser consultable por CLI u otra UI mediante eventos del sistema, no lógica de una statusline concreta.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Modelos](../specifications/models.md). *Fuente histórica: export original L10661.*

---

## ADR-035

**Decisión:** Contratos distintos para inferencia y delegación a agentes externos.

**Motivo y consecuencias:** Retirada explícitamente tras aclarar que solo se quieren proveedores de modelos. No introducir adaptadores de delegación a plataformas externas.

**Estado:** retirada/sustituida por corrección explícita del usuario.

**Referencia técnica:** [Modelos](../specifications/models.md). *Fuente histórica: export original L10662.*

---

## ADR-036

**Decisión:** Registro extensible de proveedores, sin modificar el núcleo.

**Motivo y consecuencias:** Incorporar un proveedor no debe exigir nuevas ramas específicas dentro del núcleo del runtime.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Modelos](../specifications/models.md). *Fuente histórica: export original L10663.*

---

## ADR-037

**Decisión:** Fallback controlado, sin sustituir silenciosamente modelos fijados ni eludir políticas.

**Motivo y consecuencias:** Los modelos seleccionados explícitamente y los límites de política prevalecen sobre intentos de recuperación automática.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Modelos](../specifications/models.md). *Fuente histórica: export original L10664.*

---

