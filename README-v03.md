# Agent Runtime — PoC 0.3: LLM-selected tools, durable approval

> Historical PoC reference. Current v3 runs additionally require `--expect-file` and `--expect-content`; see [current execution guide](docs/guides/getting-started.md).

This builds **on the PoC 0.2 already verified on your CachyOS** and leaves its files and commands intact. It adds `src/v3/`, with a bounded, sequential planner. The planner may request tools but **can never execute them directly**. LangGraph checkpoints and the existing ToolRegistry + Policy Gateway control each invocation.

**Status of validation:** Pure v3 unit tests run successfully in the build environment. The complete LangGraph + SQLite test and real cloud API integration **must be validated on your machine**; packages could not be downloaded into the build environment. The mock provider is deterministic test logic **not** an LLM, while cloud calls use real providers via Vercel AI SDK.

## Environment

- Your Node.js **24.22.1** via NVM is supported (Node >=24.15).
- Fish shell, npm, internet for package installation.
- All file operations are scoped to the project's `workspace/` and to safe `.md` filenames, *not* a general file-system sandbox. No privileged commands, plugins, shell commands or network tools are exposed to the model.
- `data/`, `.env`, `node_modules/`, and local workspace content are excluded from sharing by `.gitignore` and not included in the archive.

```fish
cd ~/Downloads
unzip agent-runtime-poc-v03.zip
cd agent-runtime-poc-v03
npm install
npm run test:v3
npm run typecheck
```

If npm warns that native/install scripts were not approved (as happened in v0.2), review and selectively approve `better-sqlite3` and `esbuild` using the commands npm prints, then rebuild. Avoid globally allowing all install scripts.

## Test A — Fully offline, deterministic

First register `text.transform` in this **new directory**. The registration is a descriptor for an already-trusted adapter; it does **not** load arbitrary third-party code.

```fish
npm run agent:v2 -- tools register examples/text-transform.tool.json
npm run agent:v2 -- tools list
```

The goal contains a quoted text and a Markdown basename:

```fish
npm run agent:v3 -- start natural-1 --model mock --task 'Convierte "hola agente" a mayúsculas y guarda el resultado en ejemplo-v3.md'
```

Expected: `WAITING_APPROVAL` for **text.transform**, no file created. Inspect:

```fish
npm run agent:v3 -- status natural-1
```

Approve the transformation only for this project scope (persists as a limited grant):

```fish
npm run agent:v3 -- approve natural-1 --remember workspace
```

The graph should resume, execute `text.transform`, generate the **next** tool proposal, then suspend again at `filesystem.write`. Review the new filename and **exact content** first:

```fish
npm run agent:v3 -- status natural-1
npm run agent:v3 -- approve natural-1
npm run agent:v3 -- status natural-1
cat workspace/ejemplo-v3.md
```

Expected file content: `HOLA AGENTE` and `Status: COMPLETED`.

An independent run should reuse the text transformation grant, but **still pause before writing**:

```fish
npm run agent:v3 -- start natural-2 --model auto --task 'Convierte "segunda prueba" a mayúsculas y guarda el resultado en segunda-v3.md'
```

Expected: first pending tool is `filesystem.write`, not `text.transform` (because of the grant); `auto` remains offline unless cloud is opted in.

You can deny instead of approve to prove the file isn't created:

```fish
npm run agent:v3 -- deny natural-2
test ! -e workspace/segunda-v3.md; and echo 'PASS: no file created'
```

Revoke the reusable permission:

```fish
npm run agent:v2 -- grants revoke text.transform
```

## Automated end-to-end regression

```fish
npm run test:v3:integration
```

This uses independent CLI processes and unique filenames; checks model mock proposals, persistent interruption, reuse of scope-limited grants, denied write with no file creation, approved write, and final content. This test revokes the `text.transform` workspace grant at start and finish; don't run it while depending on a previous grant.

The older PoC 0.1 and 0.2 remain available:

```fish
npm run test:core
npm run test:v2
npm run test:v2:integration
```

## Test B — Real LLM (optional: API key and possible usage fees)

Start with an OpenAI API key and a model from your account that **supports tool calling**. Never add a key to the repository or paste it into this chat. In Fish, use a non-echoing prompt (don't include the secret in shell history):

```fish
read --silent --export --prompt-str 'OpenAI API key: ' OPENAI_API_KEY
set -gx OPENAI_MODEL '<your-tool-capable-model-id>'
```

Replace the placeholder model ID with one your API account can access; we deliberately don't force one fixed version. An explicit `--model openai` transmits the task and relevant tool observations to that provider and can incur charges. Use **only non-sensitive demo text**.

```fish
npm run agent:v3 -- start cloud-1 --model openai --task 'Convierte "prueba de IA" a mayúsculas y guarda el resultado en nube-v3.md'
```

A real LLM may propose a different sequence or decline to use a tool; that is precisely what we are testing. Inspect the pending arguments and do not approve unexpected actions. `npm run agent:v3 -- status cloud-1` shows the persisted state. If an approval is requested, resume with `approve` or `deny` as above.

Similarly, for Anthropic use `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL` and `--model anthropic`; for Google use `GOOGLE_GENERATIVE_AI_API_KEY` + `GOOGLE_MODEL` and `--model google`. Model names and availability depend on provider accounts.

### Hybrid routing scope **in this PoC**

- `--model mock|openai|anthropic|google`: explicit, never silently falls back.
- `--model auto`: selects **mock** by default even if credentials exist. To opt into automatic cloud access, set `AGENT_ALLOW_CLOUD=1` and configure a provider. Optional `AGENT_AUTO_PRIORITY` lists provider priority, e.g. `openai,anthropic,google`.
- This preliminary auto mode uses configured availability / priority, **not** intelligent model quality, benchmarks, privacy classification, token costs or latency. Those belong to later routing iterations.
- Status includes the chosen provider and reason. Only user/task/workspace text from this PoC is sent to a selected cloud API, but **do not place secrets in the workspace or prompts**.

## How the v0.3 graph works

```
start → ModelProvider (select one tool) → checkpoint → Policy/approval
  → trusted ToolProvider execute → checkpoint observation → ModelProvider
  → ... → final answer (or deny / 5-tool budget)
```

- `src/v3/models.ts`: AI SDK 7 adapters; tools are declared **without execute callbacks**.
- `src/v3/router.ts`: pure hybrid selection and explicit cloud opt-in.
- `src/v3/mock.ts`: deterministic fixture for offline regression.
- `src/v3/graph.ts`: LangGraph plan → authorization → execute → plan loop, checkpoint SQLite in `data/runtime-v3.sqlite`.
- `src/v3/cli.ts`: start / inspect / approve / deny.
- Existing v2 code still enforces trusted manifest IDs, schemas, exact request hash, workspace grants and safe `.md` operations.

## Deliberate limitations / safety boundaries

1. The model only picks **one tool per inference**, with a max of **five tool calls**; simultaneous calls are safely rejected.
2. The existing v2 gateway is reused and revalidates before execution. This is not an OS sandbox, multi-user authorization system, or production security architecture.
3. Read and write permissions are restricted to the controlled workspace; create-only writes are checked for conflicting content. Never grant access to real secrets for this PoC.
4. Cloud model outputs are nondeterministic; no assertion that they *will* choose a particular tool. Automated regression intentionally uses mock only.
5. External API failures (network, quotas, unsupported models) cause the run to fail safely; **no automatic cloud-provider fallback**.
6. The context is reassembled from task + a compact log of tool observations. Rich provider-native tool-message replay, streaming, per-token cost controls and robust operational recovery remain future work.
7. No untrusted executable tool plugins, shell, desktop control, or multi-agent parallelism are added in this test.
8. LangGraph resumes interruption nodes by restarting them. The authorization node does no side effects before `interrupt()`, and model selection occurs in a separate checkpointed node. A real production workflow requires stronger crash recovery for tools with irreversible side effects.
