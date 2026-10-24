# Read-only first prompt for any coding CLI

Run your coding CLI **from the repository root**, then paste:

> Lee AGENTS.md, PROJECT_CONTEXT.md, docs/PROJECT_STATUS.md y docs/decisions/ADRs.md. Después lee los capítulos técnicos completos que correspondan en docs/source/ (no te quedes con resúmenes). Revisa README, package.json, src y tests. Quiero un análisis en español de (a) acuerdos vigentes y correcciones posteriores, (b) componentes implementados y evidencia de pruebas, (c) diferencias reales entre el código y los contratos, (d) siguiente incremento mínimo sin introducir nuevas decisiones. NO modifiques código ni archivos todavía.

## Recommended installation in existing repo (Fish)

```fish
cd ~/Downloads/agent-runtime-poc-v03
# Review the contents of the ZIP before extraction (public repo):
unzip -l ~/Downloads/agent-runtime-handoff-completo.zip
# Unpack into the repository root. This package replaces earlier generic context docs,
# not src/, tests, project data, secrets or npm dependencies:
unzip -o ~/Downloads/agent-runtime-handoff-completo.zip -d .
git diff --stat
git status --short
# Review the docs before pushing a public repository, especially docs/source/
```

**Avoid** committing both stale `docs/context/` documentation from the prior superficial package and the newer canonical docs without a clear deprecation note; the earlier pack was explicitly rejected as insufficient. This new package does **not** automatically delete any existing files.
