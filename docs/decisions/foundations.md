# Fundamentos, memoria conceptual y Common Contracts

Este capítulo expresa la **decisión, el motivo y su efecto sobre el diseño**. Los ejemplos completos, límites y contratos viven en las especificaciones enlazadas; estas ADR no sustituyen el plan de pruebas.

## ADR-001

**Decisión:** Core independiente del sistema operativo.

**Motivo y consecuencias:** El núcleo debe conservar su semántica al pasar de CachyOS a Windows o macOS. Los comandos de host se resuelven en adaptadores, nunca en el contrato central.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../architecture/system.md). *Fuente histórica: export original L8701.*

---

## ADR-002

**Decisión:** Modelos LLM intercambiables mediante adaptadores.

**Motivo y consecuencias:** La elección de un LLM no debe forzar reescribir el planner, las tools o la memoria. Cada proveedor traduce sus formatos al contrato común.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../architecture/system.md). *Fuente histórica: export original L8702.*

---

## ADR-003

**Decisión:** Memoria relacional con tags y relaciones explícitas.

**Motivo y consecuencias:** Etiquetas ayudan a clasificar, pero la procedencia, la causalidad y las correcciones exigen relaciones explícitas entre recursos.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../architecture/system.md). *Fuente histórica: export original L8703.*

---

## ADR-004

**Decisión:** SQLite inicial, persistencia desacoplada.

**Motivo y consecuencias:** SQLite permite arrancar local y sin servicio; el repositorio lógico deberá poder migrar sin cambiar consumers.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../architecture/system.md). *Fuente histórica: export original L8704.*

---

## ADR-005

**Decisión:** Markdown Vault para conocimiento documental.

**Motivo y consecuencias:** El conocimiento documental debe poder revisarse con editores comunes y exportarse sin una base propietaria.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../architecture/system.md). *Fuente histórica: export original L8705.*

---

## ADR-006

**Decisión:** Servicio unificado de recuperación de memoria.

**Motivo y consecuencias:** Una sola interfaz de consulta evita que cada agente construya su propia semántica de recuperación y permisos.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../architecture/system.md). *Fuente histórica: export original L8706.*

---

## ADR-007

**Decisión:** Índices textuales y semánticos regenerables.

**Motivo y consecuencias:** Los índices se reconstruyen desde contenido canónico: pérdida de caché no debe equivaler a pérdida de memoria.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../architecture/system.md). *Fuente histórica: export original L8707.*

---

## ADR-008

**Decisión:** Memoria híbrida con revisión por políticas.

**Motivo y consecuencias:** Memoria híbrida une entidades y documentos; admisión y recall siguen políticas en lugar de persistir todo sin filtro.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../architecture/system.md). *Fuente histórica: export original L9149.*

---

## ADR-009

**Decisión:** Memory Service independiente de los agentes.

**Motivo y consecuencias:** El servicio pertenece al sistema, no a una conversación ni a un único agente; así preserva conocimiento entre modelos.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../architecture/system.md). *Fuente histórica: export original L9150.*

---

## ADR-010

**Decisión:** Ámbitos por sesión, proyecto, persona y conocimiento compartido.

**Motivo y consecuencias:** Alcance de sesión, proyecto, persona y compartido evita mezclar contexto efímero con preferencias y conocimiento publicado.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../architecture/system.md). *Fuente histórica: export original L9151.*

---

## ADR-011

**Decisión:** Relaciones explícitas y procedencia verificable.

**Motivo y consecuencias:** Cada registro recuperable debe enlazarse con evidencia y recursos relacionados para auditar sus conclusiones.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../architecture/system.md). *Fuente histórica: export original L9152.*

---

## ADR-012

**Decisión:** Versiones, estados de vigencia y correcciones.

**Motivo y consecuencias:** Los hechos pueden caducar o ser contradichos; estados/versiones previenen presentar una regla obsoleta como vigente.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../architecture/system.md). *Fuente histórica: export original L9153.*

---

## ADR-013

**Decisión:** Recuperación híbrida con filtrado previo por permisos.

**Motivo y consecuencias:** Una búsqueda semántica no justifica filtrar permisos después; el ámbito autorizado restringe desde el principio.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../architecture/system.md). *Fuente histórica: export original L9154.*

---

## ADR-014

**Decisión:** Persistencia portable, exportable y respaldable.

**Motivo y consecuencias:** Backups, restauración y portabilidad se diseñan antes de la futura sincronización entre PCs, sin implementarla ahora.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../architecture/system.md). *Fuente histórica: export original L9155.*

---

## ADR-015

**Decisión:** Identidades explícitas para usuarios, agentes, dispositivos y ejecuciones.

**Motivo y consecuencias:** Session, run, request, device y principal no son la misma entidad. IDs estables evitan ambigüedad y facilitan trazabilidad futura.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../specifications/common-contracts.md). *Fuente histórica: export original L9860.*

---

## ADR-016

**Decisión:** Capacidades identificadas mediante nombres y versiones estables.

**Motivo y consecuencias:** Un ID/version semántico de capacidad permite elegir adaptadores por operación y no por programa instalado.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../specifications/common-contracts.md). *Fuente histórica: export original L9861.*

---

## ADR-017

**Decisión:** Resultados y errores estructurados, independientes del provider.

**Motivo y consecuencias:** Un error estructurado permite al runtime distinguir falta de soporte, denegación, fallo y oportunidad de reintento.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../specifications/common-contracts.md). *Fuente histórica: export original L9862.*

---

## ADR-018

**Decisión:** Separación entre disponibilidad y autorización.

**Motivo y consecuencias:** Que una herramienta exista no implica autorización para usarla; deben verificarse ambas cosas de manera independiente.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../specifications/common-contracts.md). *Fuente histórica: export original L9863.*

---

## ADR-019

**Decisión:** Contexto y permisos controlados por el runtime confiable.

**Motivo y consecuencias:** El LLM no puede autoproclamarse otro usuario, dispositivo, scope o privilegio; el contexto lo emite el runtime confiable.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../specifications/common-contracts.md). *Fuente histórica: export original L9864.*

---

## ADR-020

**Decisión:** Degradación elegante sin eludir políticas.

**Motivo y consecuencias:** La degradación solo es aceptable si no cambia alcance, privacidad, autorización o efectos de forma encubierta.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../specifications/common-contracts.md). *Fuente histórica: export original L9865.*

---

## ADR-021

**Decisión:** Esquemas y contratos versionados para facilitar migraciones.

**Motivo y consecuencias:** Al cambiar esquemas se requieren migraciones o adaptadores versionados; los registros persistidos deben seguir interpretándose correctamente.

**Estado:** baseline de diseño; implementación conforme a [estado actual](../delivery/current-state.md).

**Referencia técnica:** [Contratos/arquitectura](../specifications/common-contracts.md). *Fuente histórica: export original L9866.*

---

