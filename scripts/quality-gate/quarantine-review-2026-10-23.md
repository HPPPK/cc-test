# Quarantine review — 2026-10-23

Behavior surfaces: server, desktop, native test runners. Reviewed on macOS with Bun 1.3.14. No coverage baseline or threshold was changed. All five existing entries retain their original exit criteria, owners and exclusion behavior; next review is 2026-11-06.

## Isolated evidence

Each command ran in a separate Bun process. Logs are generated locally under `artifacts/quality-runs/quarantine-review-2026-10-23/` and are not committed.

| Command | Result | Evidence log | Disposition |
| --- | --- | --- | --- |
| `bun test src/server/__tests__/cron-scheduler.test.ts` | 26 pass, 4 fail, 3 asynchronous errors | `cron-before.log` | Retain: execution starts real CLI subprocesses; 5-second timeouts let pending executions outlive fixture cleanup. Needs deterministic executor controls. |
| `bun test src/server/__tests__/providers-real.test.ts` | 6 pass, 0 fail | `providers-before.log` | Retain as live: connectivity contacts the MiniMax endpoint with a fake key; authentication failure is not inference success. Other cases use temporary local configuration. |
| `bun test --timeout=60000 src/server/__tests__/tasks.test.ts` (five fresh consecutive processes) | 10 pass, 0 fail on each run | `tasks-run-1.log` through `tasks-run-5.log` | Retain: repeated isolated success is encouraging, but timing hardening and five complete check:server passes required by the existing criterion have not been demonstrated. |
| `bun test src/server/__tests__/e2e/business-flow.test.ts` | 63 pass, 10 fail | `business-before.log` | Retain: catalog/default-model assertions, session fixture assumptions and WebSocket state fail. |
| `bun test src/server/__tests__/e2e/full-flow.test.ts` | 31 pass, 1 fail | `full-before.log` | Retain: catalog cardinality is host-dependent; deterministic fixtures still needed. |

The initial tasks run also passed 10/10 (`tasks-before.log`). A longer timeout for repeat runs matches the check:server runner default; it does not change repository policy.

## Desktop runner repair

The initial targeted Vitest run reproduced two suite-load failures: `bun:test` is unavailable under Vitest, and Bun's `import.meta.dir` is unavailable there. It also reproduced the stale ThinkingBlock expectation (7 passed, 1 failed). The component already hides thinking until expanded; the test now verifies hidden content/cursor first and visible content/cursor after clicking.

`desktop`'s normal `test` script now runs the two Bun-specific native script suites and the packaged updater-config regression through `test:scripts` before Vitest. Vitest excludes only those two exact files. Existing build-sidecar Vitest suites remain included. The chained command also applies during check:desktop, while coverage calls Vitest directly for frontend source instrumentation.

The new runner contract suite failed all 3 assertions before configuration changes (`runner-red.log`). After repair, the normal targeted desktop command passed 5 Bun tests plus 11 Vitest tests (`desktop-after.log`), covering both the runtime boundary and collapsed/expanded thinking behavior. This changes test execution only, not the application UI or persisted data.

The final desktop lane passed all 9 Bun script/config tests and all 1130 Vitest tests across 119 suites, followed by a successful production frontend build. Evidence: `artifacts/quality-runs/2026-10-23T03-06-45-082Z/logs/desktop-checks.log`. The earlier support-link integration failure was corrected before this full run.

## Remaining work

These quarantines are not declarations that their underlying failures are fixed. Scheduler execution needs a separate deterministic harness; broad server flows need fixture reconstruction; live connectivity needs an explicit smoke-lane migration. The current PR restores review governance using fresh evidence rather than silently deleting coverage or claiming full acceptance.
