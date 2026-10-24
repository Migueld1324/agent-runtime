# Provenance, completeness and source policy

## What was recovered

- A **complete single-conversation export** supplied by the user on 2026-10-24 in both Markdown and HTML. The original conversation is titled “Solucionar Secure Boot Invalid”; the architecture discussion started late in the thread and contains substantive responses, unlike an earlier browser/PDF export that omitted most responses.
- Original detailed planning occupies source conversation turns **T309 through T344**. Chapters in `docs/source/` reproduce those relevant turns in order, with explicit user/assistant labels. These historical excerpts include code samples and proposals subsequently superseded.
- Subsequent PoC results in the original conversation plus **PoC 0.3.1 live results** were reported in the later conversation and are summarized in `docs/PROJECT_STATUS.md`.
- `docs/decisions/ADRs.md` indexes **all 84 IDs** and their original title text; original discussions are preserved for deeper reading.

## Source limitations

- This package does **not** include the unrelated, personally identifying troubleshooting part of the full conversation, nor raw authentication artifacts.
- Some narrative examples from the conversation mention CachyOS and host hardware. They are historical examples, not hard dependencies.
- The source is a dialogue that includes preliminary options later corrected. Explicit user revisions supersede earlier assistant proposals; special attention to ADR-035, policy-on-demand, and later OAuth integration.
- This document pack was generated from the conversation, **not validated as a working code patch**. Test and interface claims must be checked against the latest Git checkout.
- Quoted original excerpts in `docs/source/` are authoritative evidence of what was discussed. `docs/architecture/` is a navigation-level summary, not a replacement for full technical contracts.

## Public repo privacy

Review `docs/source/` before committing to a **public** GitHub repository; it contains direct excerpts from a personal chat. No access tokens, API keys or email addresses were found in the selected design excerpts in a basic content scan; this is not a formal secret audit. Running a secrets scanner before pushing is still advised. Never commit the full unredacted original PDF/HTML/Markdown.

## Updating

When new decisions are made, add an amendment entry to the ADR index and explain effects on implementation. Maintain implementation evidence with exact commands and observed outputs. Do not silently alter historical source excerpts to make them agree with newer decisions.
