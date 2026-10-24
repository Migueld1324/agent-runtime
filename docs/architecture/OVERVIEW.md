# Architectural baseline, as defined during the original planning

This is a map, not a replacement for the original contracts. Before implementation read the source chapters linked here and their refinements in `../decisions/ADRs.md`.

```text
User interface (CLI first; other interfaces later)
                |
       Agent Runtime / orchestrator  — Session/Run/Step/checkpoints
          |         |              |
    ContextManager  ModelRouter   PolicyEngine
          |         |              |
    MemoryService  ModelProvider  Tool Gateway / ToolProvider
          |         |              |
  MemoryProvider   Model Adapters  Registry + Trusted Executors
    |   |   |        |   |   |         |   |   |
  SQL Markdown Index local cloud  ...  OS-specific integration
    +-- knowledge / experiences / execution records --+
```

**The diagram is explanatory; implementation module boundaries have not all been built.**

## Foundational constraints

- Core agnostic to OS, model, UI, and physical storage. First deployment single-machine/local-first, but not single-host-forever.
- Registry vs authorization vs execution are distinct concerns; tool proposal by LLM never confers permission.
- Structured errors/capabilities/identities (user, agent, device, session, run, step) and stable/versioned contracts.
- Observation of each state-changing step and durable/resumable execution; retries of side-effecting tools must be idempotent or mitigated.
- Explicit consent and policy on external transmission of task/memory data; selection override cannot bypass policy.
- Degradation must fail safe and not silently change privacy/cost/permissions.

## Components, source specifications and ADR groups

| Component | Responsibilities and exclusions | Original detailed source | ADRs |
|---|---|---|---|
| Common Contracts | identity, scopes, capability IDs, error/result envelopes, stable revisions | [Original](../source/02-common-contracts.md) | 015–021 |
| ModelProvider/Registry/Router | capabilities/inference/tool proposals, catalog, manual/automatic selection, statusline | [Original](../source/03-models.md) | 022–037 (035 rejected) |
| MemoryService/MemoryProvider | scoped, typed knowledge/experience, SQL & Markdown, canonical ownership, indexes, recall, provenance | [Original](../source/04-memory.md) | 003–014, 038–048 |
| ToolProvider/Registry/Gateway | discovery, versioned descriptors, trusted execution, independent approval | [Original](../source/05-tools.md) | 049–057 |
| Policy Engine | decision structure, dynamic onboarding, scoped grants, default deny, audit, revocation | [Original](../source/06-policies.md) | 018–020, 058–072 |
| Agent Runtime | durable planner loop, state machine, steps/checkpoints, HITL, retry, budget, events, context | [Original](../source/07-runtime.md) | 073–084 |

## Design-state distinctions

**Baseline** means accepted as planning, **not implemented**. The planning explicitly anticipates multiple specialized agents and model providers, but the PoC does not yet implement multiagent concurrency or full hybrid memory. Treat the current 5-tool budget, serial execution, and `.md`-only workspace restriction as deliberate PoC limits, not architectural laws.
