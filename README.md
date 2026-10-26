# Agent Runtime — PoC 0.3.1: account-first authentication fix

This is a narrowly scoped correction to the **previous 0.3 package**. The tested v2 Policy Gateway, Registry, LangGraph planner/checkpointer, approvals, request hashes, grants and CLI commands are unchanged. The model-selection layer no longer assumes that cloud = paid API key.

## Verified objectives after PoC 0.3.1

New v3 runs require an explicit acceptance criterion from the caller:
`--expect-file SAFE_NAME.md --expect-content 'EXACT EXPECTED CONTENT'`.
The criterion is fixed before execution and bound to the run, objective and scope.
A model's final answer triggers an authorized, bounded read of the real workspace
file. Only matching bytes produce `COMPLETED`; a missing/different file produces
`FAILED`. Inconclusive checks produce `PAUSED`; denied reads produce `DENIED`.

A transient verification failure may be retried explicitly with
`npm run agent:v3 -- retry-verification RUN_ID` (at most two recoveries).
This repeats only the check, preserving confirmed tool results. It never retries
an uncertain write. The first verifier supports one Markdown file and at most
16 KiB of expected UTF-8 content; it does not verify arbitrary objectives or
prove that a particular tool was used. Such requirements need additional criteria.

Historical checkpoints remain readable; historical `COMPLETED` results are
labelled as unverified legacy results. Continuing legacy runs requires an explicit
migration, which is still pending. General model/tool error recovery and durable
markers for uncertain effects are subsequent increments of
[ADR-085](docs/decisions/085-runtime-failures-and-recovery.md).

## What changed

- `--model chatgpt`: uses OpenAI's **official Sign in with ChatGPT (SIWC)** OAuth flow for eligible open-source applications and approved private clients. No API key required. This is an inference adapter, **not a Codex/Hermes/OpenClaw agent handoff**.
- `npm run auth:v3 -- login|status|models|use|logout` manages local ChatGPT credentials (mode 0600, no secrets in project files or logs), token refresh, model catalog and explicit model choice.
- Separate `src/v3/chatgpt-inference.ts` sends `store:false`, `stream:true` to the documented `/v1/responses` route. It collects completed SSE replies and asks for **JSON proposals** (one trusted tool ID or final text); the app never gives the model a direct execution callback.
- Original `--model openai|anthropic|google` API-key adapters are still available for a future time but **not required** and **never used as a fallback** from ChatGPT.
- `auto` stays offline (`mock`) unless `AGENT_ALLOW_CLOUD=1` is explicitly set. When enabled, it prefers connected `chatgpt` ahead of paid API connections. This is provider routing, not intelligent model optimization.

## Requirements and honest limitations

- Node >=24.15 on the target machine; Fish shell instructions below. Run `npm install` in the extracted directory.
- **SIWC is available for eligible open-source clients and selected private clients**. Having ChatGPT Plus alone does **not guarantee authorization for a private application**. The login flow will tell you if your account/app isn't authorized. Do not work around denied OAuth access, and do not use ChatGPT web session cookies as credentials.
- Account token usage is subject to plan allowance, regional and model eligibility restrictions. Only models from `auth:v3 models` should be selected.
- v0.3.1 supports only one locally connected ChatGPT identity at a time; login again must match the same validated identity. This is not a general multi-user authentication system.
- SIWC tool proposals are returned as **JSON text**, not provider-native function calls. The runtime still validates registered tool IDs, argument schemas, permission hashes and explicit approval before executing. This format is a PoC choice; compare against native namespaced function tools in a later iteration.
- OAuth tokens are stored outside the repo, e.g. `~/.config/agent-runtime-poc/chatgpt.json` on Linux. Never share the file. `logout` clears local tokens and attempts remote refresh-token revocation.
- Network/OAuth login, model catalog, real inference and full LangGraph/SQLite integration **cannot be verified in this build container**; they must be checked on the host. Offline unit tests have passed here. If anything in the online path fails, the run should fail without invoking paid API providers.
- Real inference sends the task, available tool descriptors and recorded tool results to the selected cloud provider. Use only demo data.

## Fresh install (CachyOS/Fish)

```fish
cd ~/Downloads
unzip agent-runtime-poc-v031-authfix.zip
cd agent-runtime-poc-v031-authfix
npm install
npm run test:v3
npm run typecheck
```

If npm asks for approval of `better-sqlite3` or `esbuild` install scripts, review those native dependencies individually, as in the earlier PoC. Do not broadly approve all scripts.

## Connect ChatGPT (no API key)

```fish
npm run auth:v3 -- login
npm run auth:v3 -- status
npm run auth:v3 -- models
```

After choosing an **exact slug returned by** `models`, run:

```fish
npm run auth:v3 -- use MODEL_SLUG
```

If OpenAI denies plan-token sharing, stop here. The remaining steps do NOT switch to an API key.

## Test B replacement: real model through your account

First register the built-in transform descriptor in **this package**:

```fish
npm run agent:v2 -- tools register examples/text-transform.tool.json
```

Then execute **your own** LangGraph agent with the authenticated provider:

```fish
npm run agent:v3 -- start account-1 --model chatgpt --task 'Convierte "prueba de IA" a mayúsculas y guarda el resultado en cuenta-v3.md' --expect-file cuenta-v3.md --expect-content 'PRUEBA DE IA'
npm run agent:v3 -- status account-1
```

Inspect each `WAITING_APPROVAL` proposal before authorizing. The model may produce unexpected or malformed JSON; malformed proposals fail safely rather than executing anything.

```fish
npm run agent:v3 -- approve account-1
npm run agent:v3 -- status account-1
# If a new approval is waiting and the exact arguments are safe:
npm run agent:v3 -- approve account-1
npm run agent:v3 -- status account-1
cat workspace/cuenta-v3.md
```

The expected *goal* is `PRUEBA DE IA`, but a real model is nondeterministic; do not blindly approve unexpected parameters. The graph can also choose to reply without a tool.

## Existing offline tests (still apply)

Pull requests targeting `main` are configured to run [Offline CI](.github/workflows/ci.yml)
on an isolated Ubuntu runner with Node 24 and `npm ci`. The job runs typecheck,
all unit/contract tests and the v1/v2/v3 integrations sequentially, without model
credentials. See [verification](docs/delivery/verification.md#integración-continua-offline)
for scope, local reproduction and the distinction from manual ChatGPT tests.

```fish
npm run test:v3
npm run test:v3:integration
npm run test:v2
npm run test:v2:integration
npm run test:core
```

Test A remains exactly the same as `README-v03.md`, including the old `--model mock` and per-tool approval sequence. The previous `--model auto` case stays offline by default.

## Routing guarantees

| Model selector | Authentication | Default action |
| --- | --- | --- |
| `mock` | None | Deterministic offline test fixture; not a real LLM |
| `chatgpt` | SIWC OAuth + consent + model slug | Remote inference on ChatGPT plan; no API key |
| `openai` / `anthropic` / `google` | API key (optional in the future) | Only when explicitly selected/configured |
| `auto` | Available providers | Offline `mock`, unless explicitly enabled by `AGENT_ALLOW_CLOUD=1` |

No model can execute tools by itself. Graph limits 5 tool calls, persists proposal checkpoints, validates tool arguments and rechecks authorizations before the trusted Tool Gateway performs a side effect. No auto fallback on auth, quota, or network errors. This is a prototype safety boundary, not a production sandbox.

## References (official)

- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
