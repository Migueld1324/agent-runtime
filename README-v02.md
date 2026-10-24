# Agent Runtime PoC 0.2 — Dynamic ToolRegistry & Scoped Grants

Built on **the PoC 0.1 you already validated**: LangGraph.js + SQLite checkpoints + interrupt/resume + safe create-only files. All of `src/` (PoC 0.1) remains available; new code resides in `src/v2/`.

> **Scope:** A deterministic, offline tool-routing test, **not yet an autonomous LLM planner**. The CLI chooses tools to simulate tool calls. This is **not a production security sandbox**.

## Requirements

- Node.js **24.15+** (your existing Node `v24.22.1` works)
- `npm install`
- Runs on Linux, macOS and Windows, but only a local workspace is touched.
- No API keys, no model inference or cloud calls in PoC 0.2.

## Installation in Fish

Extract `agent-runtime-poc-v02.zip` into a **new** folder, not on top of your old tested PoC:

```fish
cd ~/Downloads
unzip agent-runtime-poc-v02.zip
cd agent-runtime-poc-v02
npm install
npm run test:core
npm run test:v2
npm run typecheck
```

**1. Discover built-in capabilities** (only two are registered initially):

```fish
npm run agent:v2 -- tools list
```

**2. Register a new tool without editing the runtime:**

```fish
npm run agent:v2 -- tools register examples/text-transform.tool.json
npm run agent:v2 -- tools list
```

`text.transform` now appears. It uses a **pre-reviewed built-in adapter**, loaded from a validated *declarative* manifest. It does **not** load arbitrary JavaScript, scripts or binaries from tool manifests.

**3. Run unapproved capability; check durable approval:**

```fish
npm run agent:v2 -- start transform-1 --tool text.transform --input "hola agente" --operation uppercase
npm run agent:v2 -- status transform-1
```

Expected: `WAITING_APPROVAL` and a SHA256 hash binding the run/tool/arguments/descriptor.

**4. Approve and remember only this scoped capability:**

```fish
npm run agent:v2 -- approve transform-1 --remember workspace
npm run agent:v2 -- grants list
npm run agent:v2 -- start transform-2 --tool text.transform --input "segunda prueba" --operation uppercase
```

Expected: `transform-1` completes and shows `HOLA AGENTE`; `transform-2` completes **without another prompt**. The grant is stored in `data/tool-grants-v2.sqlite` and bound to tool ID + descriptor fingerprint + `poc-workspace`.

**5. Revoke and recheck:**

```fish
npm run agent:v2 -- grants revoke text.transform
npm run agent:v2 -- start transform-3 --tool text.transform --input "tercera prueba" --operation lowercase
```

Expected: `transform-3` waits for approval again. To deny:

```fish
npm run agent:v2 -- deny transform-3
```

**6. Prove registry is extensible beyond a single named tool:**

```fish
npm run agent:v2 -- tools register examples/text-case.tool.json
npm run agent:v2 -- tools list
npm run agent:v2 -- start case-1 --tool text.case --input "HOLA OTRA VEZ" --operation lowercase
```

`text.case` is another **capability ID**, implemented by the already-trusted transformation adapter. It receives its own approval policy. Run `npm run agent:v2 -- approve case-1` to finish it.

**7. Confirm preauthorized read and approval-gated write:**

```fish
npm run agent:v2 -- start write-1 --tool filesystem.write --file demo-v2.md --content "# Mi nota"
npm run agent:v2 -- approve write-1
npm run agent:v2 -- start read-1 --tool filesystem.read --file demo-v2.md
```

Read is automatically allowed **inside the PoC workspace**; file creation requires explicit approval each time. Writes remain create-only. A symlink target, directory traversal or unsafe name is rejected.

## Automated acceptance test

```fish
npm run test:v2:integration
```

This test runs **multiple separate CLI processes**; checks dynamic registration, approvals, persistent reuse and revocation, denial without file creation, and automatic workspace reading. It generates unique run IDs and cleans its temporary file. It also revokes `text.transform` at the beginning and end to keep results deterministic, so don't run it while relying on an existing grant.

To run the original integration too:

```fish
npm run test:integration
```

## Files and data separation

```text
src/v2/registry.ts     Manifest validation + dynamic discovery
src/v2/tools.ts        Trusted adapters + strict argument validation
src/v2/policy.ts       Scoped policy evaluation + persistent SQLite grants
src/v2/graph.ts        LangGraph authorization → execution flow
src/v2/cli.ts          CLI commands, inspection, authorization, revocation
examples/              Two declarative transformation manifests
test/v2-core.test.ts   No LangGraph needed; tests authorization and manifests
test/v2-integration.ts Full flow across independent CLI processes

data/runtime-v2.sqlite      LangGraph checkpoints for v0.2
data/tool-grants-v2.sqlite  Persistent authorization grants
data/tool-registry/*.json  Registered descriptors
workspace/                  Only permitted file I/O target
```

The v0.1 `data/runtime.sqlite` and all original command names remain separate.

## What's genuinely proven / not proven

**The new code is designed to verify:**
- Discovery/registration without editing the agent's core runtime
- Mandatory approval on first use of a new capability
- Approval bound to the *exact* run, arguments and descriptor
- Persistent reusable grants scoped to a capability, version/fingerprint and workspace
- Graceful revoke and reapproval
- Read-only default for trusted, constrained filesystem.read
- Checkpoint/resume using LangGraph and SQLite

**Not yet implemented:**
- LLM dynamically choosing tools (CLI simulates a tool selection)
- Running downloaded arbitrary tool implementations or plugins
- OS-level process sandboxing or credential isolation
- General-purpose capability schema and policy language
- Concurrency-safe approvals across simultaneously running agents
- Fine-grained user identity, audit trails and revocation of already-running operations

Tools do not become trusted merely because an installed program declares itself read-only. New implementations will require trusted adapters and actual sandboxing. `node:sqlite` is a Node 24 release-candidate API; for our PoC, the version is pinned by the Node engine constraint rather than assumed portable to all Node versions.
