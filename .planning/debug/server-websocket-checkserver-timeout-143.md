# Debug Session: server-websocket-checkserver-timeout-143

## Status
- workflow: sp-debug
- understanding_confirmed: true
- causal_map_completed: true
- investigation_contract_completed: true
- log_investigation_plan_completed: true
- observer_framing_completed: true
- execution_model: leader-inline
- status: investigating

## User Report
Last blocker is `check:server` / full `verify` hanging or failing around server WebSocket integration after coverage passed. User asked to locate first, then execute debug, without spending too long on broad verification.

## Known Evidence
- `check:coverage --changed` passed: `Summary: passed=5 failed=0`.
- `src/server/__tests__/skills.test.ts` passed: 8 tests.
- Full verify twice reached server-checks then wrapper did not complete cleanly.
- Standalone `check:server` showed `WebSocket Chat Integration > keeps the default startup status for current-worktree repository sessions` timed out after 20000ms and `CLI exited during startup with code 143`.
- After user interruption, repo-owned `bun test --isolate ...` PID 9436 and child `mock-sdk-cli.ts` processes remained.
- Project learning relevant: `.specify/memory/learnings/learn-2026-06-15-runtime-switch-rollback-and-locked-native-target-a91d4b2c7.md` links code 143 to stop/restart process generation and residual process interference.

## Observer Framing
- Primary candidate: stale/dangling mock CLI or WebSocket test process from interrupted server lane contaminates subsequent server tests and causes false timeout/code 143.
- Contrarian candidate: a specific WebSocket integration test cleanup/startup expectation is broken independent of residue.
- First probe: stop exact repo-owned residual PID tree, then run minimal failing test file/pattern.

## Investigation Contract
- Do not run full `verify` until minimal repro and `check:server` status are known.
- Do not parallelize server/WebSocket tests because they share ports, mock SDK processes, and session cleanup.
- Only terminate exact PIDs whose command line clearly belongs to this repo/test run.

## Log Investigation Plan
- Inspect active PIDs before cleanup.
- If minimal repro fails, inspect `src/server/__tests__/conversations.test.ts` and the relevant server WebSocket/conversation cleanup code.
- If minimal repro passes after cleanup, treat previous failure as residue and rerun `check:server` once.
