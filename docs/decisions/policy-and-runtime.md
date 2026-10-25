# Políticas y Agent Runtime

Este capítulo expresa la **decisión, el motivo y su efecto sobre el diseño**. Los ejemplos completos, límites y contratos viven en las especificaciones enlazadas; estas ADR no sustituyen el plan de pruebas.

## ADR-058

**Decisión:** Separar decisión y cumplimiento de políticas.

**Motivo y consecuencias:** El Policy Engine decide, el Gateway hace cumplir y el Executor ejecuta. Cada responsabilidad debe ser auditable.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Políticas](../specifications/policy-engine.md). *Fuente histórica: export original L12603.*

---

## ADR-059

**Decisión:** Default deny y principio de mínimo privilegio.

**Motivo y consecuencias:** El principio de mínimo privilegio no autoriza efectos sin grant; la enmienda 068–072 añade onboarding/aprobación bajo demanda, no allow implícito.

**Estado:** vigente con enmienda ADR-068–072; debe leerse junto a ellas.

**Referencia técnica:** [Políticas](../specifications/policy-engine.md). *Fuente histórica: export original L12604.*

---

## ADR-060

**Decisión:** Permisos por operación, tarea y workspace.

**Motivo y consecuencias:** Un grant debe delimitar operación, workspace, recurso, alcance temporal y parámetros, no ser permiso global permanente.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Políticas](../specifications/policy-engine.md). *Fuente histórica: export original L12605.*

---

## ADR-061

**Decisión:** Aprobaciones vinculadas a recursos y restricciones.

**Motivo y consecuencias:** La aprobación está ligada a petición, argumentos, recurso y huella; el cambio de cualquiera invalida la autorización.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Políticas](../specifications/policy-engine.md). *Fuente histórica: export original L12606.*

---

## ADR-062

**Decisión:** Autorización transversal para modelos, memoria y herramientas.

**Motivo y consecuencias:** Acceder a memoria o enviar contexto a cloud requiere política, al igual que modificar archivos o ejecutar procesos.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Políticas](../specifications/policy-engine.md). *Fuente histórica: export original L12607.*

---

## ADR-063

**Decisión:** Restricciones efectivas de ejecución y recursos.

**Motivo y consecuencias:** El permiso lógico no basta sin entorno capaz de imponer límites de procesos, filesystem, red y privilegios.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Políticas](../specifications/policy-engine.md). *Fuente histórica: export original L12608.*

---

## ADR-064

**Decisión:** Datos externos sin autoridad para modificar políticas.

**Motivo y consecuencias:** Texto de internet, repositorio o salida de herramienta jamás cambia reglas ni identidad del ejecutor.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Políticas](../specifications/policy-engine.md). *Fuente histórica: export original L12609.*

---

## ADR-065

**Decisión:** Delegación de permisos sin escalamiento de privilegios.

**Motivo y consecuencias:** Agentes futuros solo pueden delegar subconjuntos de permisos ya autorizados; no crear privilegios superiores.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Políticas](../specifications/policy-engine.md). *Fuente histórica: export original L12610.*

---

## ADR-066

**Decisión:** Auditoría y revocación de autorizaciones.

**Motivo y consecuencias:** Las concesiones dejan huella auditada y deben poder revocarse, incluso al reanudar checkpoints antiguos.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Políticas](../specifications/policy-engine.md). *Fuente histórica: export original L12611.*

---

## ADR-067

**Decisión:** Políticas portables y desacopladas del sistema operativo.

**Motivo y consecuencias:** Las reglas se formulan en capacidades/recursos/ámbitos; no dependen de Linux o PowerShell.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Políticas](../specifications/policy-engine.md). *Fuente histórica: export original L12612.*

---

## ADR-068

**Decisión:** Separar registro, disponibilidad, confianza y autorización.

**Motivo y consecuencias:** Descubrimiento e instalación no son lo mismo que confianza ni autorización. Nuevas capacidades deben ser visibles sin permitir ejecución insegura.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Políticas](../specifications/policy-engine.md). *Fuente histórica: export original L12928.*

---

## ADR-069

**Decisión:** Approval on Demand para capacidades sin políticas específicas.

**Motivo y consecuencias:** Si una capacidad validada carece de política concreta, solicitar consentimiento contextual en lugar de bloquear permanentemente el crecimiento.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Políticas](../specifications/policy-engine.md). *Fuente histórica: export original L12929.*

---

## ADR-070

**Decisión:** Herencia controlada de permisos por capacidades.

**Motivo y consecuencias:** Los grants pueden corresponder a categorías verificadas, nunca a un nombre de binario que afirma ser seguro.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Políticas](../specifications/policy-engine.md). *Fuente histórica: export original L12930.*

---

## ADR-071

**Decisión:** Registro validado de herramientas e integraciones nuevas.

**Motivo y consecuencias:** Una herramienta sin adaptador validado necesita registro confiable antes de someterla a aprobación de uso.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Políticas](../specifications/policy-engine.md). *Fuente histórica: export original L12931.*

---

## ADR-072

**Decisión:** Reevaluación de permisos cuando cambian los privilegios de una herramienta.

**Motivo y consecuencias:** Cambios en efectos, descriptor o privilegios requieren revalidación y, si amplían alcance, nueva autorización.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Políticas](../specifications/policy-engine.md). *Fuente histórica: export original L12932.*

---

## ADR-073

**Decisión:** Runtime como coordinador, independiente del LLM.

**Motivo y consecuencias:** La autoridad de estado reside en el runtime propio. El LLM propone, no inicia efectos directamente.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Runtime](../specifications/runtime.md). *Fuente histórica: export original L13677.*

---

## ADR-074

**Decisión:** Separación entre Session, Run y Step.

**Motivo y consecuencias:** Una sesión puede contener múltiples runs; cada run contiene steps e identidades distintas para auditoría y recuperación.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Runtime](../specifications/runtime.md). *Fuente histórica: export original L13678.*

---

## ADR-075

**Decisión:** Máquina de estados persistente.

**Motivo y consecuencias:** El proceso no debe depender de permanecer vivo; cada transición válida se persiste como parte de la ejecución.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Runtime](../specifications/runtime.md). *Fuente histórica: export original L13679.*

---

## ADR-076

**Decisión:** Planificación incremental y verificable.

**Motivo y consecuencias:** Los planes se adaptan conforme llega evidencia; los criterios de éxito y versiones evitan planes ciegos.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Runtime](../specifications/runtime.md). *Fuente histórica: export original L13680.*

---

## ADR-077

**Decisión:** Checkpoints y recuperación tras interrupciones.

**Motivo y consecuencias:** Checkpoints permiten continuar sin repetir el contexto completo y conservan posición de interrupción.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Runtime](../specifications/runtime.md). *Fuente histórica: export original L13681.*

---

## ADR-078

**Decisión:** Control de reintentos y efectos secundarios.

**Motivo y consecuencias:** Efectos secundarios inciertos deben conciliarse antes de reintentar; no existe exactly-once universal para sistemas externos.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Runtime](../specifications/runtime.md). *Fuente histórica: export original L13682.*

---

## ADR-079

**Decisión:** Aprobaciones que suspenden y reanudan ejecuciones.

**Motivo y consecuencias:** Una aprobación suspende el estado de forma durable; otra interfaz puede resolverla sin cambiar el núcleo.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Runtime](../specifications/runtime.md). *Fuente histórica: export original L13683.*

---

## ADR-080

**Decisión:** Context Manager independiente de MemoryProvider.

**Motivo y consecuencias:** El paquete de contexto para inferencia es distinto del MemoryProvider y del snapshot de ejecución.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Runtime](../specifications/runtime.md). *Fuente histórica: export original L13684.*

---

## ADR-081

**Decisión:** Presupuestos de ejecución y detección de estancamiento.

**Motivo y consecuencias:** Los límites de pasos, modelos, tools, duración y costo evitan loops y consumo sin control.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Runtime](../specifications/runtime.md). *Fuente histórica: export original L13685.*

---

## ADR-082

**Decisión:** Eventos observables para cualquier interfaz.

**Motivo y consecuencias:** Eventos de progreso, estado y modelos deben exponerse de forma neutral a CLI, paneles o UI futuras.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Runtime](../specifications/runtime.md). *Fuente histórica: export original L13686.*

---

## ADR-083

**Decisión:** Consolidación de experiencias al cerrar una ejecución.

**Motivo y consecuencias:** Al terminar una tarea, consolidar los intentos en experiencia; publicar conocimiento requiere reglas de admisión.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Runtime](../specifications/runtime.md). *Fuente histórica: export original L13687.*

---

## ADR-084

**Decisión:** Extensibilidad multiagente sin dependencia inicial.

**Motivo y consecuencias:** Mantener IDs y scopes preparados para varios agentes sin desplegar paralelismo ni delegación externa ahora.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Runtime](../specifications/runtime.md). *Fuente histórica: export original L13688.*

---

