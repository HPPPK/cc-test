# Quickstart: Workflow Phase Execution Contracts

## Goal

Use this sequence when `/sp.tasks` and `/sp.implement` turn the approved plan into code. Do not start implementation from `sp-plan`; this quickstart is execution guidance for the next workflow stages.

## Prerequisites

- Feature branch: `009-specify-discussions-workflows`
- Spec package exists under `.specify/features/009-specify-discussions-workflows/`
- Root dependencies installed with `bun install`
- Desktop dependencies installed under `desktop/` if touching desktop UI
- Startup guide reviewed before running local server or desktop app: `docs/starup/jiangxia-startup.md`

## Implementation Sequence

1. Build the requirement-to-surface matrix.
   - Map FR-001 through FR-030 to server, SkillTool, API, desktop, tests, and fixtures.
   - Mark each row as existing baseline, incomplete, missing, or hardening.

2. Add or harden tests first.
   - Server tests for validation, resolver, import/export, session snapshots, runtime completion, transition history, final reports, and SkillTool boundary guidance.
   - Desktop tests for grouped editor fields, recommended skill provenance, dependency diagnostics, recommended skill evidence, pending priority, blocked/unable controls, manual completion, and read-only artifacts.
   - Old-template fixtures for flat fields, unknown fields, and legacy skill references.

3. Implement the narrowest server/runtime changes.
   - Keep template/session ownership separate.
   - Reuse resolver/catalog/SkillTool.
   - Preserve unknown fields.
   - Do not add auto-execution, required gates, bundled skill export, or destructive migration.

4. Implement desktop changes.
   - Reuse existing workflow components and shared skill store.
   - Keep status and control semantics derived from runtime state.
   - Ensure text/controls are accessible and not color-only.

5. Run narrow checks.
   - `bun run check:server` for server/runtime/API/SkillTool changes.
   - `bun run check:desktop` for desktop UI/store/API changes.

6. Run full local PR gate.
   - `bun run verify`
   - Read latest report under `artifacts/quality-runs/<timestamp>/report.md`.
   - Read coverage report under `artifacts/coverage/<timestamp>/coverage-report.md`.
   - Fix concrete failures before claiming readiness.

## Server Validation

Run after server/runtime/API changes:

```powershell
bun run check:server
```

Expected coverage:

- template validation accepts compatibility shape and rejects invalid phase/skill references
- resolver covers every supported status
- export includes dependency manifest without bundled skill contents
- import preview reports diagnostics before commit
- session start snapshots template identity and phase skill resolutions
- runtime prompt includes recommended skill status without scheduled tool calls
- `submit_phase_completion` enforces required fields, active phase, stateVersion, and pending conflict
- blocked/unable remain recoverable
- final report preserves evidence/provenance

## Desktop Validation

Run after desktop changes:

```powershell
bun run check:desktop
```

Expected coverage:

- editor presents grouped phase contract fields and saves normalized fields
- skill picker preserves same-name provenance and unresolved references
- import/export dialog shows dependency diagnostics
- status panel shows recommended skill status/evidence only when relevant
- pending confirmation outranks stale running lifecycle status
- blocked/unable status shows reason/evidence and no advancement controls
- manual completion is separate from confirm pending
- artifacts are read-only in status/history views

## Full Verification

Before PR-ready handoff:

```powershell
bun run verify
```

Report the final:

- changed files
- tests added
- coverage report path
- quality report path
- pass/fail/skip counts
- E2E/live evidence or explicit blocker
- remaining risk

## Live Provider Baseline

Run only if implementation changes core agent-loop/provider execution or maintainer release confidence requires live evidence:

```powershell
bun run quality:providers
bun run quality:gate --mode baseline --allow-live --provider-model <provider:model[:label]>
```

If no provider is configured, run non-live verification anyway and report the live-baseline blocker.

## Stop Conditions

- A task requires destructive grouped persistence migration.
- A task makes recommended skills auto-run or required by default.
- A task mutates SkillTool permissions from workflow recommendations.
- Import/export starts bundling arbitrary skill package contents.
- Blocked/unable become terminal failures.
- Pending confirmation can be overwritten.
- Same-area tests cannot be added for changed production code without maintainer approval.
