# Agent Runtime

Runtime local-first para un asistente de IA, con control propio de tareas, herramientas, autorizaciones y estado durable. Los modelos proponen acciones; el runtime valida cada operación, solicita el consentimiento necesario y ejecuta mediante adaptadores confiables.

El proyecto busca mantener la coordinación independiente del proveedor de inferencia y del sistema operativo. La arquitectura se construye mediante incrementos verificables; las especificaciones distinguen el diseño objetivo de lo que está implementado.

## Estado del proyecto

La PoC 0.3.1 está cerrada y el proyecto está en consolidación. El runtime actual incluye:

- Ejecución con LangGraph y checkpoints SQLite, con aprobaciones reanudables entre procesos.
- Registro de capacidades, Policy Gateway, permisos persistentes y revocación para las herramientas de demostración.
- Inferencia mediante cuenta ChatGPT autorizada y adaptadores opcionales de API; modo `mock` offline para pruebas deterministas.
- Verificación del objetivo antes de completar una tarea: el primer verificador comprueba un archivo Markdown y su contenido esperado.
- Pruebas unitarias, de contratos e integración, con CI offline en pull requests hacia `main`.

La memoria híbrida, el Context Manager completo y el routing por capacidades/métricas siguen pendientes. También faltan recuperación general de errores, migración de checkpoints antiguos y reconciliación de efectos inciertos. El alcance actual y su evidencia están en [estado de implementación](docs/delivery/current-state.md) y [progreso](docs/delivery/progress.md).

## Primeros pasos

Requiere **Node.js >=24.15** y npm. Desde un checkout del repositorio:

```bash
npm ci
npm run typecheck
```

Continúa con la [guía de instalación y ejecución](docs/guides/getting-started.md) para ejecutar una tarea offline, inspeccionar sus propuestas y aprobar o denegar cada operación. Para inferencia real, consulta [autenticación y uso de ChatGPT](docs/guides/chatgpt.md).

El modo predeterminado es `mock`, una implementación determinista de pruebas. El acceso cloud y las credenciales de proveedor se configuran por separado; no son necesarios para ejecutar las pruebas offline.

## Documentación

| Tema | Referencia |
|---|---|
| Índice técnico y convenciones | [Documentación](docs/README.md) |
| Objetivo del producto y alcance | [Visión](docs/architecture/vision.md) |
| Componentes y fronteras de confianza | [Arquitectura](docs/architecture/system.md) |
| Estado durable, objetivos y recuperación | [Runtime](docs/specifications/runtime.md) |
| Capacidades, registro y ejecución | [Herramientas](docs/specifications/tools.md) |
| Inferencia, autenticación y selección | [Modelos](docs/specifications/models.md) |
| Autorizaciones y permisos | [Policy Engine](docs/specifications/policy-engine.md) |
| Decisiones y enmiendas | [ADR](docs/decisions/README.md) |
| Pruebas, CI y evidencia ejecutada | [Verificación](docs/delivery/verification.md) |
| Prioridades de implementación | [Roadmap](docs/delivery/roadmap.md) |

Las instrucciones de operación viven en `docs/guides/`; los contratos en `docs/specifications/`; las decisiones en `docs/decisions/`; el progreso y las validaciones en `docs/delivery/`. Los README de versiones anteriores son referencias históricas.

## Desarrollo y pruebas

```bash
npm run typecheck
npm run test:core
```

`test:core` incluye las pruebas unitarias y de contratos de las distintas etapas del runtime. Las integraciones se ejecutan por separado y de forma secuencial en un checkout desechable, porque crean checkpoints y modifican permisos de demostración. Los comandos completos y los resultados comprobados están en [verificación](docs/delivery/verification.md).

## Organización del código

- `src/v3/`: planner, proveedores, autenticación, verificador de objetivos y CLI actual.
- `src/v2/`: registro, policy, herramientas y CLI de administración compartidos con v3.
- `src/`: primer corte durable y utilidades compartidas.
- `test/`: regresiones unitarias, contratos e integraciones.
- `examples/`: descriptores de herramientas de demostración.
- `docs/`: arquitectura, guías, contratos, decisiones y entrega.

Los datos operacionales de `data/` y los archivos de demostración de `workspace/` son locales y están ignorados por Git. Las credenciales de cuenta se almacenan por separado. El prototipo permite evaluar las fronteras de autorización; todavía no constituye un sandbox de producción.
