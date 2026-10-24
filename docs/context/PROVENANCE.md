# Procedencia, cobertura y limitaciones de la transferencia

**Se preparó el 2026-10-24** a partir de: (a) conversaciones recuperadas/resúmenes de decisiones del proyecto; (b) `README.md` y contenido fuente de los paquetes PoC 0.3/0.3.1, contrastados con el repositorio público `Migueld1324/agent-runtime`; y (c) salidas detalladas de validación local aportadas por el usuario.

## Qué está corroborado

- Las decisiones centrales: local-first portable, interfaces agnósticas, no agentes externos como backend, memoria híbrida y separación `MemoryEntry`/`ExperienceRecord`, routing manual/auto objetivo, tool default-deny y descubrimiento separado de permisos.
- Los archivos, comandos y limitaciones descritos de PoC 0.3.1 y resultados reportados de la máquina del usuario (test/v2/v3, aprobaciones, denegación y archivo en disco).
- La decisión del usuario de versionar y continuar incrementalmente `agent-runtime` y usar documentación compatible con diferentes CLI.

## Qué NO está incluido / no afirmar

- La transcripción íntegra de semanas de chat; nombres/justificaciones formales de **todas** las ADR históricas. Se conoce la referencia a ADR-035 y un bloque ADR-038–047, pero no sus textos completos. No simular que este paquete constituye una exportación literal exhaustiva.
- Hash de commit exacto de GitHub ni trazabilidad asociada a cada línea de código; verificar `git rev-parse HEAD` cuando se ejecute en el host.
- Evidencia de que `npm run typecheck` pasó en un entorno propio de este paquete (el usuario lo corrió sin error reportado y así consta).
- Cualquier token/clave, email personal, cookie, datos privados del asistente o SQLite de runtime. El estado real de la cuenta NO pertenece a Git.
- Implementación de memoria híbrida, router inteligente, LLM local real, scheduler, multiagente o sandbox, que siguen pendientes.

## Mantenimiento del historial

Cuando se recuperen archivos ADR o decisiones de chat no incluidas, agregarlas textualmente con fuente/fecha y reconciliar con `DECISIONS.md`; no sobreescribir evidencia histórica silenciosamente. Distinguir `Recuperado` de `Reproducido y comprobado`; los ejemplos de diseño son solo ilustraciones. Si documentación y código difieren, comprobar branch/commit actual antes de declarar regresión. Atribuir decisiones al usuario cuando estén confirmadas, no a inferencias del agente.

## Referencias públicas sobre carga de instrucciones de CLI

- Codex y AGENTS.md: https://learn.chatgpt.com/docs/agent-configuration/agents-md
- Claude Code y CLAUDE.md: https://support.claude.com/en/articles/14553240-give-claude-context-claude-md-and-better-prompts
- Gemini CLI y GEMINI.md: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md
- GitHub Copilot `.github/copilot-instructions.md`: https://docs.github.com/en/copilot/how-tos/copilot-in-your-ide/customize-copilot/configure-custom-instructions/add-repository-instructions-in-your-ide
- Repositorio: https://github.com/Migueld1324/agent-runtime
