# ADR-087 — registro de aprobación del Incremento 1

**Estado actual:** ADR-087 Incremento 1 aprobado arquitectónicamente. ADR-088 también aprobada. **Implementación:** no iniciada; el PR #9 es exclusivamente documental. No se requiere una nueva ratificación.

**Fecha de aprobación confirmada:** 28-10-2026. **Inspección inicial:** 27-10-2026, America/Mexico_City. **Base inspeccionada:** `origin/main`, `a0af08d6505b2593197525661d7aac5a21209c72`. Este registro complementa [ADR-087](087-tool-gateway-input-contract.md); no cambia su contrato técnico ni aprueba el Incremento 2.

## Procedencia y efecto de la aprobación vigente

El responsable del proyecto confirmó explícitamente, mediante comunicación **fuera del repositorio** recibida en esta sesión de trabajo, que la aprobación arquitectónica de **ADR-087 Incremento 1 y ADR-088 fue confirmada el 28 de octubre de 2026**. Esta actualización registra esa confirmación externa; no la atribuye a una revisión de GitHub inexistente ni la deduce del merge de los PR #7/#8.

La instrucción del responsable establece que no se necesita nueva ratificación y que, **después de integrar el PR #9**, se debe comenzar la implementación de ADR-087 Incremento 1 en un PR independiente, manteniendo el alcance y los criterios de aceptación existentes. Esa implementación ya está autorizada con dicha secuencia; la aprobación arquitectónica no vuelve a ser un requisito pendiente. El PR #9 no contiene código funcional.

La aprobación no autoriza el Incremento 2 de ADR-087 ni operaciones reales de mantenimiento. ADR-088 conserva su inicio futuro por M1, protocolo portable sin privilegios OS prematuros; implementar Maintenance Backend sigue fuera del incremento del Gateway. Aceptación arquitectónica, implementación validada y autorización de una operación real son estados distintos.

## Evidencia histórica de la inspección inicial — 27-10-2026

Los hechos siguientes describen únicamente lo que estaba registrado en las fuentes inspeccionadas entonces. No invalidan la confirmación externa del 28-10-2026 ni representan el estado actual de aprobación.

- En la base inspeccionada, ADR-087 y el índice de decisiones mantienen el estado de propuesta no aprobada. ADR-085/086 sí están aceptadas; no se modifican.
- El [PR #7](https://github.com/Migueld1324/agent-runtime/pull/7) de ADR-087 está integrado desde `2026-10-28T04:37:22Z`. Al consultar la API de GitHub no tenía descripción, revisiones ni comentarios que documentaran aprobación arquitectónica. La integración del texto no sustituye esa aprobación.
- El [PR #8](https://github.com/Migueld1324/agent-runtime/pull/8) de ADR-088 está integrado desde `2026-10-28T05:24:18Z`, con resultado en `main` `a0af08d`. Tampoco tenía descripción, revisiones ni comentarios; su aprobación sí fue confirmada expresamente por el responsable en la instrucción posterior a ese merge.
- Esa instrucción aprueba ADR-088 con dos límites: no autoriza mantenimiento sobre datos reales y cualquier implementación futura del backend debe comenzar por M1, protocolo portable sin privilegios OS prematuros. El mismo encargo excluye implementar Maintenance Backend del trabajo del Gateway. M1 de ADR-088 e Incremento 1 de ADR-087 son entregas distintas; M1 no es requisito del primer incremento del Gateway.
- La solicitud de implementación del Gateway está expresamente condicionada a aprobación documentada e indica preparar este registro y detenerse antes de implementar si falta. No se extrapola la aprobación de ADR-088 a ADR-087 ni se usa este documento para autoaprobar el cambio.

**Actuación histórica:** se preparó el registro, se detuvo el trabajo funcional y se solicitó ratificación al no localizar aprobación en el repositorio/API. Esa solicitud queda superada por la confirmación explícita del responsable registrada arriba. La falta de una revisión o comentario en GitHub fue una observación sobre las fuentes disponibles, no prueba de que la aprobación arquitectónica no existiera fuera del repositorio.

## Alcance aprobado del Incremento 1

La confirmación mantiene el contrato técnico de `a0af08d`: validación común y compatibilidad de entradas del Tool Gateway, con las restricciones y pruebas siguientes. Se autoriza su implementación después de integrar el PR #9, sin incluir el Incremento 2 ni Maintenance Backend. La lista conserva el alcance técnico y los criterios de aceptación preparados en la inspección inicial.

1. Descriptores v2 para nuevos registros del adaptador confiable de transformación, con `inputSchema` y perfil plano `tool-input/1`, JSON Schema draft-07 y límites de ADR-087. Built-ins de filesystem permanecen en formato legado. No sustituir registros existentes ni añadir ejecutores/capacidades ajenos al alcance.
2. Ajv con filtro previo del perfil y opciones explícitas `strict:true`, `allErrors:false`, `coerceTypes:false`, `useDefaults:false`, `removeAdditional:false`, `ownProperties:true`; sin referencias/carga remotas, coerciones, defaults ni eliminación de argumentos. Versión concreta fijada y verificada en el lockfile al implementar.
3. Compatibilidad de representaciones y hashes v1, incluidos built-ins, aprobaciones y grants. Codec legado separado del objeto usado en su huella; sin reescribir checkpoints, ledger ni permisos existentes.
4. `descriptorFingerprint` v2 con dominio `tool-descriptor:v2\n` y canonicalización de claves de objetos por unidades UTF-16. Conservar orden de arrays y Unicode. `requestHash` mantiene `{descriptor, args}` y la identidad de `JSON.stringify` de argumentos; no canonicalizarlos.
5. Validación fail-closed antes de pedir aprobación y antes de reclamar/ejecutar; revalidación de descriptor, solicitud, policy y revocación. Copia interna inmutable del descriptor y cache por formato/huella. Mismo esquema estructural anunciado a proveedores, sin ampliar permisos ni introducir fallback.
6. No ampliación `SchemaV2(args) => EntradaLegada(args)`. Para transformación v2, input de al menos un carácter y como máximo 1.024 caracteres del schema, conservando el límite confiable de 2.048 unidades UTF-16. Coste explícito: ASCII v2 de 1.025–2.048 caracteres rechazado; v1 conserva su límite completo. Filesystem mantiene rutas seguras, contenido no vacío y máximo de 16.384 bytes UTF-8.
7. Errores y recuperación conservan ADR-085/086: propuesta inicial inválida termina `failed` sin aprobación/efecto, solicitud de aprobación equivocada no consume la válida, cambios de descriptor/policy bloquean antes del Executor y efectos inciertos no se reintentan. Sin cambio de presupuesto de recuperación ni de significado de `completed`.
8. Pruebas contra referencia legada congelada y vectores históricos independientes: Unicode/BMP/suplementarios/combinantes/sustitutos aislados, límites UTF-16/UTF-8, canonicalización de descriptor separada del hash de solicitud, schemas/argumentos inválidos y compatibilidad entre procesos. Typecheck, suites existentes, nuevas integraciones/casos adversariales y tres integraciones secuenciales en checkout aislado; evidencia persistida con commit, entorno, resultados y límites.

**Exclusiones:** migración administrativa de descriptores/grants, transferencia de permisos entre huellas, implementación de Maintenance Backend (incluido M1), privilegios OS, operaciones sobre datos reales y cambios de contratos de seguridad no aprobados. El Incremento 2 sigue sujeto a las dependencias de ADR-087/088.

## Inventario técnico previo a la implementación

| Punto existente | Contrato o evidencia inspeccionados | Trabajo futuro dentro del incremento |
|---|---|---|
| [registry.ts](../../src/v2/registry.ts) | Manifiesto legado, adaptadores permitidos, huella `SHA256(JSON.stringify(tool))`, registro sin sobrescritura | Unión v1/v2, codec legado, filtro de perfil, canonicalización v2 y carga acotada antes de parsear |
| [tools.ts](../../src/v2/tools.ts) | Validación por adaptador, campos adicionales, límite de transformación UTF-16 y escritura UTF-8 | Validación común y controles confiables preservados, sin convertir schema en autorización |
| [policy.ts](../../src/v2/policy.ts) | Hash exacto `{descriptor,args}`, aprobación vinculada, grants por capacidad/huella/scope | Mantener identidad de solicitud y compatibilidad de permisos sin migración |
| [tool-schema.ts](../../src/v3/tool-schema.ts), [models.ts](../../src/v3/models.ts), [chatgpt-inference.ts](../../src/v3/chatgpt-inference.ts) | Esquema estructural duplicado, consumido por proveedores | Fuente estructural común y controles locales para todas las rutas |
| [graph.ts v3](../../src/v3/graph.ts), [operations.ts](../../src/v3/operations.ts) | Validación previa a autorización y Executor, revalidación, lock y ledger de ADR-086 | Conservar fronteras y comprobar cero entradas al Executor ante rechazo |
| [v2-core](../../test/v2-core.test.ts), [v3-closure](../../test/v3-closure.test.ts) | Manifiestos, grants, vinculación, argumentos inválidos y presupuesto | Añadir vectores fijos, referencia legada, Unicode, schemas y canonicalización |
| [v3-durable](../../test/v3-durable.test.ts), [v3-objective](../../test/v3-objective.test.ts), [v3-adapter-failures](../../test/v3-adapter-failures.test.ts) | Caídas, persistencia, recuperación, objetivos y fallos | Regresión sin pérdida de evidencia, repetición de efectos o alteración de estados |
| [integración v1](../../test/integration.ts), [v2](../../test/v2-integration.ts), [v3](../../test/v3-integration.ts) | Aprobaciones, registro/grants y planner secuencial | Ejecutar en orden y aisladas; añadir integración del contrato v2 sin contaminar datos reales |

Ajv no figura en las dependencias directas actuales. No se instaló, no se congelaron fixtures nuevos ni se modificaron fuentes/tests durante esta revisión. Los resultados históricos de ADR-086 no prueban el cumplimiento de ADR-087. La verificación de este registro es exclusivamente documental; el incremento permanece sin implementar y sin declarar terminado.

## Evidencia de verificación documental

Comprobación local del 27-10-2026: enlaces relativos y anchors resueltos; diff restringido a Markdown en `docs/`; `git diff --check` satisfactorio; ADR-085/086 sin cambios y ninguna modificación funcional. ADR-087 solo recibe una nota de control previo; ADR-088 solo actualiza su estado/procedencia, conservando los contratos técnicos.

Typecheck, suites e integraciones no ejecutados en este corte documental. Deben ejecutarse y registrarse para el futuro PR funcional; no se declara PASS por inspección de tests ni por resultados de commits anteriores.

Actualización documental del 28-10-2026: se registra procedencia, fecha y alcance de la aprobación externa y se distingue el estado actual de la inspección histórica. Se mantienen los ocho puntos técnicos anteriores, las exclusiones y los contratos de ADR-085/086/087/088. La aprobación no constituye evidencia de implementación ni de pruebas funcionales.

Verificación local de esta actualización: **PASS**, 10 archivos Markdown modificados y 179 enlaces relativos/anchors resueltos; `git diff --check` sin errores. Comparación con `3a3f330`: los ocho puntos de alcance, las exclusiones, los cuerpos técnicos de ADR-087/088 y las etapas/criterios del plan de mantenimiento permanecen idénticos; ADR-085/086 no cambian. Sin ejecución de pruebas funcionales ni cambios de código, dependencias o datos.
