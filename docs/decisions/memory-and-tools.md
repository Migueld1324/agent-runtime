# Memoria y herramientas

Este capítulo expresa la **decisión, el motivo y su efecto sobre el diseño**. Los ejemplos completos, límites y contratos viven en las especificaciones enlazadas; estas ADR no sustituyen el plan de pruebas.

## ADR-038

**Decisión:** `MemoryService` independiente de los agentes.

**Motivo y consecuencias:** El conocimiento es recurso común de agentes propios, no propiedad de un planner o interfaz.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Memoria](../specifications/memory.md). *Fuente histórica: export original L11378.*

---

## ADR-039

**Decisión:** `MemoryProvider` desacoplado del almacenamiento físico.

**Motivo y consecuencias:** Una interfaz de memoria evita anclar comportamiento a SQLite, Markdown o un motor vectorial concreto.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Memoria](../specifications/memory.md). *Fuente histórica: export original L11379.*

---

## ADR-040

**Decisión:** Memorias tipadas, versionadas y con procedencia.

**Motivo y consecuencias:** Tipo, estado, fecha, versión y origen son necesarios para decidir si recuperar, corregir o revisar información.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Memoria](../specifications/memory.md). *Fuente histórica: export original L11380.*

---

## ADR-041

**Decisión:** Persistencia híbrida mediante políticas de admisión.

**Motivo y consecuencias:** No todo candidato debe publicarse: session/project/personal/shared exigen políticas distintas de admisión.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Memoria](../specifications/memory.md). *Fuente histórica: export original L11381.*

---

## ADR-042

**Decisión:** Fuente canónica diferenciada para SQL y Markdown.

**Motivo y consecuencias:** Documentos tienen canon en Vault y entidades estructuradas en SQL; evitar duplicar y divergir autoridades.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Memoria](../specifications/memory.md). *Fuente histórica: export original L11382.*

---

## ADR-043

**Decisión:** Indexación derivada, regenerable y recuperable.

**Motivo y consecuencias:** La indexación es derivada y debe tolerar reconstrucción tras cambios de documentos, modelo de embeddings o corrupción.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Memoria](../specifications/memory.md). *Fuente histórica: export original L11383.*

---

## ADR-044

**Decisión:** Búsqueda unificada con filtros de ámbitos y permisos.

**Motivo y consecuencias:** Un único recall debe aplicar ámbito y permisos antes de combinar búsqueda textual, estructurada y semántica.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Memoria](../specifications/memory.md). *Fuente histórica: export original L11384.*

---

## ADR-045

**Decisión:** Relaciones explícitas entre recursos de conocimiento.

**Motivo y consecuencias:** Enlaces entre hechos, documentos, experiencias y fuentes facilitan recuperación y evaluación de evidencia.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Memoria](../specifications/memory.md). *Fuente histórica: export original L11385.*

---

## ADR-046

**Decisión:** Gestión de contradicciones, obsolescencia y correcciones.

**Motivo y consecuencias:** Correcciones, contradicciones e historial requieren estados explícitos sin borrar lo que fue válido en otro momento.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Memoria](../specifications/memory.md). *Fuente histórica: export original L11386.*

---

## ADR-047

**Decisión:** Exportación portable y operaciones de eliminación definidas.

**Motivo y consecuencias:** La portabilidad requiere exportación y restore; la eliminación tiene semánticas distintas para archive, supersede, forget y purge.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Memoria](../specifications/memory.md). *Fuente histórica: export original L11387.*

---

## ADR-048

**Decisión:** Separación entre experiencia operativa y conocimiento reutilizable.

**Motivo y consecuencias:** La experiencia documenta intentos y resultados; la memoria concisa documenta conocimiento contextual. ExecutionRecord es evidencia técnica aparte.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Memoria](../specifications/memory.md). *Fuente histórica: export original L11555.*

---

## ADR-049

**Decisión:** Herramientas identificadas por capacidades estables.

**Motivo y consecuencias:** Pedir capacidades semánticas permite operar sin acoplar al agente a comandos de cada OS.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Herramientas](../specifications/tools.md). *Fuente histórica: export original L11966.*

---

## ADR-050

**Decisión:** Registro y descubrimiento dinámico de herramientas.

**Motivo y consecuencias:** Nuevas herramientas deben describirse y descubrirse mediante registro, no codificarse una a una dentro del agente.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Herramientas](../specifications/tools.md). *Fuente histórica: export original L11967.*

---

## ADR-051

**Decisión:** `Tool Gateway` como punto obligatorio de autorización.

**Motivo y consecuencias:** Toda herramienta pasa por un mediador que verifica permisos y alcance, incluso si el modelo tiene tool calling nativo.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Herramientas](../specifications/tools.md). *Fuente histórica: export original L11968.*

---

## ADR-052

**Decisión:** Separación entre descriptor, autorización y ejecución.

**Motivo y consecuencias:** Descriptor, consentimiento y side effects no deben fusionarse en un callback controlado por el modelo.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Herramientas](../specifications/tools.md). *Fuente histórica: export original L11969.*

---

## ADR-053

**Decisión:** Preferencia por herramientas específicas frente a shell genérico.

**Motivo y consecuencias:** Una interfaz estrecha es más validable que comandos shell arbitrarios. El shell eventual exige límites propios.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Herramientas](../specifications/tools.md). *Fuente histórica: export original L11970.*

---

## ADR-054

**Decisión:** Ejecución delimitada por permisos, recursos y tiempos.

**Motivo y consecuencias:** Los límites de filesystem, red, tiempo, output y privilegios deben imponerse realmente en el Executor.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Herramientas](../specifications/tools.md). *Fuente histórica: export original L11971.*

---

## ADR-055

**Decisión:** Adaptadores por sistema operativo y entorno.

**Motivo y consecuencias:** Las capacidades deben poder resolverse a implementaciones de Hyprland, otras interfaces Linux o Windows sin cambiar planner.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Herramientas](../specifications/tools.md). *Fuente histórica: export original L11972.*

---

## ADR-056

**Decisión:** Auditoría y experiencias derivadas de ejecuciones.

**Motivo y consecuencias:** Registros de herramientas aportan evidencia para experiencia; no implican guardar automáticamente secretos ni salidas completas.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Herramientas](../specifications/tools.md). *Fuente histórica: export original L11973.*

---

## ADR-057

**Decisión:** Integraciones externas mediante adaptadores controlados.

**Motivo y consecuencias:** Servicios externos se integran mediante adaptadores controlados bajo las mismas políticas, no mediante una ruta privilegiada aparte.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Herramientas](../specifications/tools.md). *Fuente histórica: export original L11974.*

---

