# Debug Session: Changed Files Git Status Home Permission

## Status
- state: awaiting_human_verify
- created_at: 2026-06-02T19:59:46.6638942+08:00
- user_report: Desktop "已更改文件" panel shows `Failed to read git status (git status --porcelain=v1 -z --untracked-files=all in C:\Users\11034): warning: could not open directory 'AppData/...': Permission denied`.
- classification: new_issue

## Project Cognition Intake
- readiness: review
- baseline_freshness: partial_refresh
- selected_concepts:
  - `concept:GEN-20260528T034105.715065300Z:desktop.workflow.runtime-status` selected as weak desktop/status UI route hint only.
- rejected_concepts:
  - desktop release workflow and docs publishing concepts rejected because `git` overlap is incidental.
  - API, adapters, docs corpus, agent tool, analytics, attachment, and auto-dream concepts rejected as unrelated to changed-files git status behavior.
- concept_decisions:
  - The selected concept covers desktop/status only and misses changed-files panel, git status command, and cwd selection.
  - Cognition coverage is insufficient as proof; use constrained live reads.
- route_pack:
  - `desktop/src`
  - `src/server`
  - `src/services`
  - `src/tools`
  - `desktop/src/components/workflow/WorkflowReportLink.tsx`
- coverage_gaps:
  - Project cognition did not name the changed-files panel owner or git status service path.

## Execution Routing
- execution_model: leader-inline
- dispatch_shape: leader-inline
- execution_surface: leader-inline
- dispatch_reason: Small focused investigation with one screenshot error, one likely git status command path, and a short evidence chain.
- blocked_reason:

## Intake Package
- causal_map_completed: true
- investigation_contract_completed: true
- log_investigation_plan_completed: true
- observer_framing_completed: true
- skip_observer_reason: map-backed-minimum-intake with weak cognition plus explicit screenshot command string

### Observer Framing
- symptom_anchor: Changed-files panel tries to enumerate git status from `C:\Users\11034` and descends into protected `AppData` directories.
- primary suspected loop: UI panel requests changed files -> backend/service chooses working directory -> git status runs with untracked traversal -> stderr permission warnings are treated as read failure -> panel shows error.
- primary_candidate: Working directory is incorrectly set to user home instead of the active project/repository root.
- contrarian_candidate: Working directory is correct for a home-level repository, but git command should tolerate untracked directory permission warnings or narrow untracked scanning.
- recommended first probe: Locate the exact `git status --porcelain` implementation and verify how cwd is chosen.
- candidate-separating signals:
  - If cwd comes from bottom bar/current project path and is `C:\Users\11034`, root selection is wrong for a repo-specific changed-files view.
  - If cwd intentionally supports home worktrees, handling of unreadable untracked dirs is the failure boundary.
- nearest_neighbor_related_risk_target: Git branch/status display in the same desktop footer may use the same cwd source.

### Investigation Contract
- primary_candidate_id: P1-cwd-home
- candidate_queue:
  - P1-cwd-home: Changed files git status uses user home instead of active repo root.
  - C1-untracked-warning: Git stderr warning is treated as fatal even when porcelain output might still be usable.
  - C2-path-discovery: Repo discovery fails and falls back to home/current working directory.
- related_risk_targets:
  - Desktop footer branch/worktree selector.
  - Server git status API if shared with desktop panel.
  - Any changed-files refresh action.

### Log Investigation Plan
- existing_log_targets:
  - Screenshot error text.
  - Source search for `Failed to read git status`.
  - Source search for `--porcelain=v1`, `untracked-files=all`, and changed-files panel components.
- candidate_signal_mapping:
  - P1-cwd-home: code passes selected/home cwd directly into git status without resolving repository root.
  - C1-untracked-warning: code rejects any stderr/warning or non-zero git status without distinguishing warning-only output.
  - C2-path-discovery: code has fallback to `process.cwd()`, user home, or missing project path.
- observability_escalation: If source does not show cwd/error boundary, reproduce git command manually in current visible cwd and inspect service logs.

## Current Focus
Second fix applied. Await human verification that the changed-files panel no longer reports `unknown git failure` for `C:\Users\11034`.

## Reproduction Record
- expected_behavior: Changed-files panel should read status for the active project/repository or report a precise non-repo path problem without traversing protected home AppData directories.
- actual_behavior: Panel reports failed `git status --porcelain=v1 -z --untracked-files=all in C:\Users\11034` with AppData permission warnings.
- reproduction_steps:
  - Open desktop app.
  - Show right-side "已更改文件" panel for a session whose footer cwd is `C:\Users\11034`.
  - Observe failure text in screenshot.
- observed_errors:
  - `Failed to read git status (git status --porcelain=v1 -z --untracked-files=all in C:\Users\11034): warning: could not open directory 'AppData/Local/Application Data/': Permission denied ...`
  - Human verification screenshot after first fix: `Failed to read git status (git status --porcelain=v1 -z --untracked-files=all in C:\Users\11034): unknown git failure`

## Truth Ownership Map
- decision_truth_owner: Unknown until source read; expected to be desktop/server git status service that chooses cwd.
- reflecting_layers:
  - Desktop changed-files panel renders service result/error.
  - Footer cwd display may reflect selected session/worktree path but may not own git command decisions.
- evidence_supporting_ownership_claim:
  - Screenshot includes exact git command and cwd, indicating a command-runner/service owns the failure before UI projection.

## Control And Observation State
- control_state:
  - Selected workspace/project cwd for the active session.
  - Resolved git repository root used for status command.
  - Git command exit/stderr handling.
- observation_state:
  - Changed-files panel error message.
  - Footer cwd/branch/worktree labels.

## Closed Loop
Session/project selection -> cwd/repo-root decision -> `git status --porcelain=v1 -z --untracked-files=all` execution -> status parsing/error classification -> changed-files panel render.

## Evidence
- Screenshot shows the status command is run in `C:\Users\11034`, not a named project folder, and git attempts to traverse unreadable `AppData` subdirectories.
- Source search found `src/server/services/workspaceService.ts` runs `git status --porcelain=v1 -z --untracked-files=all`; the desktop workspace panel renders `WorkspaceService.getStatus` errors via `desktop/src/stores/workspacePanelStore.ts`.
- Live command evidence from `C:\Users\11034`: `git rev-parse --show-toplevel` returns `C:/Users/11034`, so the user home is itself a Git repository root.
- Live command evidence from `C:\Users\11034`: `git status --porcelain=v1 -z --untracked-files=all` emits a very large untracked file stream and warnings for protected/long paths under `AppData`, `Local Settings`, `My Documents`, and similar Windows profile paths.
- Live command evidence from `C:\Users\11034`: `git status --porcelain=v1 -z -uno` completes quickly with no output; `git status --porcelain=v1 -z --untracked-files=normal` completes quickly and reports top-level untracked directories/files while preserving warning output.
- RED test evidence: `bun test src/server/__tests__/workspace-service.test.ts -t "falls back to top-level untracked status"` failed before the fix with `Expected: "ok"; Received: "error"`.
- Fix evidence: `WorkspaceService.getStatusEntries` now retries with `--untracked-files=normal` only when the recursive `--untracked-files=all` result contains traversal-style warning signals such as `could not open directory`, `permission denied`, or `filename too long`.
- Diagnostic evidence: If the fallback status command also fails, the formatted error now reports the fallback `--untracked-files=normal` command rather than the original recursive command.
- Focused verification: `bun test src/server/__tests__/workspace-service.test.ts -t "falls back to top-level untracked status"` passed after the fix.
- Area verification: `bun test src/server/__tests__/workspace-service.test.ts` passed with 14 pass, 2 skip, 0 fail.
- Human verification failed: screenshot shows the same changed-files panel still errors, but stderr details collapsed to `unknown git failure`. This means the first retry condition did not fire for the runtime failure shape.
- Node `execFile` reproduction with `timeout: 5000` and `maxBuffer: 2_000_000` in `C:\Users\11034` returns an error with `code: null`, `signal: SIGTERM`, `killed: true`, and empty stdout/stderr. This exactly explains the panel's `unknown git failure`.
- MaxBuffer reproduction shows `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` can also occur for recursive untracked scans; the error may contain partial warning output.
- RED test evidence: `bun test src/server/__tests__/workspace-service.test.ts -t "falls back to top-level untracked status when recursive untracked scan times out"` failed before the second fix with `Expected: "ok"; Received: "error"`.
- Second fix evidence: `runGit` now preserves child-process message/signal and flags timeout/maxBuffer failures; the recursive untracked status retry path now treats empty output, timeout, and maxBuffer failure as reasons to retry `--untracked-files=normal`.

## Eliminated
- P1-cwd-home as a pure wrong-directory bug: live `git rev-parse --show-toplevel` in `C:\Users\11034` returns `C:/Users/11034`, so the service is not accidentally inventing that repo root; the user home is actually a Git root.
- Generic git failure handling: the existing test for synthetic non-traversal git status failure still expects an explicit error and remains covered.

## Hypothesis
- active: C1-untracked-warning refined again. The recursive untracked scan can also fail through Node `execFile` timeout/maxBuffer paths that yield no stdout/stderr and a non-numeric code, so `runGit` collapses the failure to code 1 with empty output. The retry classifier only sees an empty `GitCommandResult`, cannot recognize this as recursive scan pressure, and no fallback is attempted.
- expected_test_result: A mocked recursive untracked scan result with code 1 and empty stdout/stderr should currently return `unknown git failure`; after the fix it should retry with top-level untracked scanning.

## Root Cause
- summary: The workspace changed-files service used recursive untracked scanning for every Git repo. In a Windows user-profile repo, that command traverses protected profile links/cache paths and can fail or exceed limits, causing the whole panel to show an error.
- owning_layer: `src/server/services/workspaceService.ts`
- broken_control_state: Git status collection treated recursive untracked scan as the only acceptable status source.
- failure_mechanism: `git status --porcelain=v1 -z --untracked-files=all` recurses into protected or very long profile paths under `C:\Users\11034`; when Git returns traversal warnings/failure, `WorkspaceService` returns `state: error` instead of a degraded top-level changed-files list.
- second_failure_mechanism: When recursive status is killed by Node timeout before it emits stderr/stdout, `runGit` produced an empty `GitCommandResult`, so retry classification missed the traversal-pressure failure and the UI displayed `unknown git failure`.
- loop_break: cwd/repo-root decision -> git status execution. The execution step is too aggressive for broad repos and breaks before parsing/rendering.
- decisive_signal: Live `--untracked-files=normal` completed quickly in the same repo while recursive `all` produced the screenshot-class warnings; the RED test reproduced service-level error and passed after fallback.
- alternative_hypotheses_considered:
  - Wrong fallback cwd/home path.
  - UI projection/store error rendering bug.
  - Generic stderr warning should always be ignored.
- alternative_hypotheses_ruled_out:
  - Wrong fallback cwd/home path: `C:\Users\11034` is an actual Git repo root.
  - UI projection/store error rendering bug: UI only reflected the service error.
  - Generic stderr warning ignore: non-traversal synthetic git failure still returns explicit error.
- root_cause_confidence: confirmed

## Verification
- status: focused_passed_full_gate_blocked
- evidence:
  - `bun test src/server/__tests__/workspace-service.test.ts -t "falls back to top-level untracked status"` passed.
  - `bun test src/server/__tests__/workspace-service.test.ts -t "falls back to top-level untracked status when recursive untracked scan times out"` passed.
  - `bun test src/server/__tests__/workspace-service.test.ts -t "reports the fallback git status command"` passed.
  - `bun test src/server/__tests__/workspace-service.test.ts` passed with 15 pass, 2 skip, 0 fail.
  - Node execFile simulation in `C:\Users\11034` with WorkspaceService timeout/maxBuffer settings showed recursive `--untracked-files=all` triggers retry and fallback `--untracked-files=normal` returns code 0.
  - Latest `bun run check:server` failed before running tests because quarantine entries have expired review dates: `server:cron-scheduler`, `server:providers-real`, `server:tasks`, `server:e2e:business-flow`, `server:e2e:full-flow`.
  - `bun run verify` wrote `artifacts/quality-runs/2026-06-02T12-09-46-499Z/report.md` with passed=4, failed=5, skipped=2. Server, coverage, and policy lanes are blocked by the same quarantine issue; native failed in Tauri build with Windows permission denied.

## Changed Paths
- modified:
  - `src/server/services/workspaceService.ts`
  - `src/server/__tests__/workspace-service.test.ts`
  - `.planning/debug/changed-files-git-status-home-permission.md`
- added:
  - `.planning/debug/changed-files-git-status-home-permission.md`
- deleted:
- renamed:

## Changed Behavior Surfaces
- server workspace status API
- desktop changed-files panel status data source
- debug-session artifact

## Project Cognition Closeout
- required_if_source_changes: true
- status: partial_refresh
- update_id: `upd-20260602T121204.933561100Z`
- latest_update_id: `upd-20260602T121526.899406200Z`
- second_fix_update_id: `upd-20260602T122729.725739000Z`
- result_state: `partial_refresh`
- minimal_live_reads:
  - `desktop/src/components/workspace/WorkspacePanel.tsx`
  - `desktop/src/stores/workspacePanelStore.ts`
  - `src/server/__tests__/workspace-service.test.ts`
  - `src/server/services/workspaceService.ts`
- known_unknowns:
  - Full PR/server gate cannot complete until expired quarantine review dates are resolved.
  - Human verification is needed in the desktop UI.

## Human Verification
- awaiting: User should restart/refresh the desktop server/app if needed, then refresh/open the desktop "已更改文件" panel for the session rooted at `C:\Users\11034` and confirm that neither the original permission warning nor the `unknown git failure` message appears.

## Learning Capture
- auto_capture_status: blocked
- auto_capture_reason: `specify learning capture-auto --command debug --session-file .planning/debug/changed-files-git-status-home-permission.md --format json` failed because this manually created debug session lacks the YAML frontmatter expected by the debug persistence parser.
- manual_capture_status: candidate_recorded
- learning_id: `LRN-20260602-121604-064994`
- learning_detail: `.specify/memory/learnings/learn-2026-06-02-recovery-path-workspace-changed-files-status-should-retr-4fa233566f.md`
- reusable_lesson: Broad Windows profile repositories should not make recursive untracked git status the only changed-files path; retry with top-level untracked status for traversal-style failures.
