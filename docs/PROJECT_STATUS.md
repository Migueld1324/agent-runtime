# Engineering status — evidence versus plans

**Snapshot: 2026-10-24.** Grounded in the user-provided export, the user-provided PoC logs in the current conversation, and the PoC 0.3 README. Git branch/working-tree contents can diverge; inspect real files before changes.

## Completed PoC milestones

### PoC 0.1 — durable guarded file operations
- Scoped file operations; PolicyGateway exact authorization; safe create-only/idempotent writes, path/symlink restrictions.
- Early tests and integration were reported passing. Use the current `test:core` to ensure regression.

### PoC 0.2 — registry, tools and approvals
- Trusted manifest/descriptor registration; stable capability identity; fine-grained grants persisted; approval bound to request; revocation.
- User ran `npm run test:v2`: 5/5 PASS and `npm run test:v2:integration`: PASS. [Current-turn logs]
- Dynamic permission behavior validated within limited, built-in/trusted adapters; **not** arbitrary executable plugin loading.

### PoC 0.3 — LLM-directed sequential tools
- LangGraph run with SQLite checkpoint; mock fixture; independent process CLI `start/status/approve/deny`; PolicyGateway retained; at most 5 tool calls and a single tool per inference.
- `npm run test:v3:integration`: PASS; checkpoints and grant reuse/denial/approval were observed.

### PoC 0.3.1 — ChatGPT plan authentication and live LLM
- `npm run auth:v3 -- login/status/models`: user reported account connected, plan permission yes, active token, available model catalog. Model selected by **slug**, not friendly display name.
- Real run `account-1 --model chatgpt`: ChatGPT proposed `text.transform`, runtime paused for approval; after approval model proposed `filesystem.write`, paused again; after second approval state `COMPLETED` and `workspace/cuenta-v3.md` contained `PRUEBA DE IA`.
- Real run `denial-1 --model chatgpt`: transform approved, write request rejected via `deny`, persisted `DENIED`, and `workspace/denegado-v3.md` remained absent.
- User reported successful `typecheck`; `npm run test:v3`: 9/9 PASS; `npm run test:core`: 18/18 PASS; `test:v3:integration`: PASS; `test:v2:integration`: PASS.

## Not yet validated / not implemented

- Full MemoryProvider v0.3/v0.2 (SQL + Markdown ownership, scope-aware recall, embeddings/reindex, `ExperienceRecord` consolidation).
- Intelligent auto-routing with measured costs, latency, privacy and model capabilities; current `auto` selection defaults to offline mock unless opt-in.
- Cross-OS integrations beyond the local test host; robust cross-device migration, backup or sync.
- Production-grade isolation, concurrent/parallel multi-agent execution, arbitrary tool/plugin installation and trust onboarding, streaming/cancel/observability full lifecycle, complete human review UX, crash-safety for irreversible effects.
- Commercial cloud API keys are optional and currently not part of available tests. Authentication/plan access depends on provider rules and quotas.

## Regression & deployment safety

```fish
npm run typecheck
npm run test:core
npm run test:v2
npm run test:v2:integration
npm run test:v3
npm run test:v3:integration
```

Tests may touch persistent grants: check the README before running them in a working local profile. Never commit OAuth tokens, local SQLite, private workspace, `.env`, session dumps or full personal conversation exports.

## Next engineering stage

1. Preserve passing PoC features and add a clean architecture boundary without reimplementing already validated logic.
2. Reconcile actual `src/` with original Common Contracts and ADRs; record divergences rather than rewriting past decisions.
3. Design and implement the **minimum MemoryProvider slice** with typed records, provenance, policy-controlled admission and scope; test each behavior with fixtures.
4. Introduce experience tracking only after execution-data interfaces are stable; keep experience distinct from learned facts.
5. Extend model adapters and interfaces as needed; user account OAuth and local models first, commercial API access optional. Do not make an API key prerequisite.
