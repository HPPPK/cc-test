# Project Context

## Cognition Gate

Checked at 2026-05-17T22:04:19+08:00, rechecked at 2026-05-17T22:23:25+08:00, and rechecked again at 2026-05-17T23:25:57+08:00.

Result: available for broad source-grounded technical recommendations.

Evidence:

- `.specify/project-cognition/status.json` reports `freshness: stale`.
- The same status file has `manual_force_stale: true` and dirty reasons tied to desktop active session/member transcript behavior changes.
- `.specify/project-cognition/slices/change.json` does not exist.
- A later recheck shows `dirty_origin_command: sp-map-update`, confirming an update attempt happened.
- The update attempt is still blocked: changed paths are missing from project cognition `path_index`, and `slices/change.json` remains missing.
- The latest recheck shows `freshness: fresh`, `manual_force_stale: false`, `dirty: false`, `baseline_state: ready`, and `last_refresh_reason: map-build`.
- `.specify/project-cognition/slices/change.json` is still absent, so this discussion should avoid claims that require a current change slice. The fresh full map is sufficient for broad test architecture options.

Project-grounded test and gate surfaces:

- `package.json` maps `bun run verify` to `bun run quality:pr`.
- `scripts/quality-gate/modes.ts` defines PR, baseline, and release lanes.
- PR mode currently includes impact report, policy checks, path-aware desktop/server/adapter/native/docs checks, persistence upgrade, quarantine, and coverage.
- `scripts/quality-gate/runner.ts` already skips area-specific command lanes when `impact-report` does not require them.
- `scripts/pr/impact-report.ts` already emits required local checks, test coverage signals, risk notes, and an agent/model testing policy.
- `scripts/pr/change-policy.ts` already classifies desktop, server, adapters, docs, release, and cli-core areas, and enforces same-area test signals.
- `scripts/quality-gate/coverage.ts` runs root server/tools/utils coverage, adapter coverage, desktop coverage, threshold checks, ratchet checks, and changed-line coverage.
- `check:desktop` currently combines desktop typecheck, Vitest run, and production build in one command.
- `check:server` currently runs all non-quarantined `.test.ts` files under `src/server`, `src/tools`, and `src/utils`.
- `check:adapters` runs all adapter tests.
- Cognition coverage identifies server tests under `src/server/__tests__/`, desktop colocated/`__tests__` tests, adapter `__tests__`, and coverage gaps in agent-tools, agent-utils, and desktop functions.

## Known Project Rules From User-Provided AGENTS.md

These are product/process constraints already available from the user's prompt and do not require source inspection:

- `bun run verify` is the unified local PR verification entrypoint and maps to `bun run quality:pr`.
- Production changes under `desktop/src`, `src/server`, `src/tools`, `src/utils`, or `adapters` require same-area tests unless explicitly approved by a maintainer.
- Coverage reports are expected under `artifacts/coverage/<timestamp>/`.
- Quality reports are expected under `artifacts/quality-runs/<timestamp>/`.
- The project distinguishes checks such as `check:server`, `check:desktop`, `check:native`, `check:adapters`, `check:docs`, `check:quarantine`, `check:coverage`, smoke, baseline, and release gates.

## Inference Notes

- The project already has a mature, multi-lane quality system.
- Test slimming should probably be framed as lane design, signal quality, and changed-surface routing rather than simply deleting tests.
- The strongest implementation lever is likely reusing the existing impact-report/change-policy/quality-gate lane architecture rather than introducing an unrelated test runner.
