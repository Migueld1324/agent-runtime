# Agent Runtime — engineering handoff and documentation

**Start with:** `PROJECT_CONTEXT.md` in repository root → `docs/PROJECT_STATUS.md` → `docs/architecture/OVERVIEW.md` → `docs/decisions/ADRs.md`.

## What this package is

A *source-grounded* and model-independent handoff of the original, long technical design conversation, with original complete specification messages preserved in `docs/source/`. It is **not** a newly proposed architecture. The architecture was planned extensively before the PoCs; the original conversation records its technical detail. Historical text can contain early ideas that were later corrected; read later decisions as authoritative.

## Reading order for an autonomous development agent

1. `AGENTS.md` and `PROJECT_CONTEXT.md`: rules, invariants, orientation.
2. `docs/PROJECT_STATUS.md`: what was verified, what remains design.
3. `docs/architecture/OVERVIEW.md`: components, dependencies, key invariants.
4. `docs/decisions/ADRs.md`: **84 original decisions and critical supersessions**.
5. The technical chapter relevant to the task in `docs/source/` (do not rely on the summary alone).
6. Inspect the *actual code* and test results: README, `src/v2`, `src/v3`, integration and unit tests.

## Exact historical source chapters

| File | Primary content |
|---|---|
| `source/01-foundations.md` | Why design before tool selection, architectural v0.1–v0.4, local-first, memory hybrid, portable storage |
| `source/02-common-contracts.md` | IDs, capability schemas, result/errors, policy contexts, structured type contracts |
| `source/03-models.md` | Registry/provider/router, inference, tool calling, streaming, hybrid routing, statusline, corrections |
| `source/04-memory.md` | Memory Service, records, admission, scopes, SQL/Markdown, recall, indexing, experience versus knowledge |
| `source/05-tools.md` | Dynamic ToolRegistry, stable capabilities, trusted execution and interfaces |
| `source/06-policies.md` | Policy evaluation, scopes, grants, revocation, dynamic discovery and approval on demand |
| `source/07-runtime.md` | Session/Run/Step, checkpoint, retries/idempotence, plans, events, context, budgets |
| `source/08-research-selection.md` | Technology selection and the rationale for the initial PoC |

**Source provenance:** `docs/SOURCE_AND_PROVENANCE.md`. This extraction uses only the architecture/design portion of the user-supplied export rather than embedding the unrelated Linux boot and GUI troubleshooting discussion in a public repository.
