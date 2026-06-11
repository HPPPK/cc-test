# Candidate Learnings

Passive candidate learnings captured from `sp-xxx` workflows.

---

<!-- SPECKIT_LEARNING_DATA_BEGIN -->
[
  {
    "id": "LRN-20260528-034826-951380",
    "summary": "API-bound tool schemas must expose a top-level object root even when runtime Zod validation uses a discriminated union.",
    "learning_type": "recovery_path",
    "source_command": "sp-debug",
    "evidence": "workflow_template_authoring caused provider 400 because z.discriminatedUnion converted to top-level oneOf with no type object; fix added explicit inputJSONSchema and regression through toolToAPISchema.",
    "recurrence_key": "tool-api-schema-object-root",
    "default_scope": "project",
    "applies_to": [
      "sp-debug",
      "sp-implement"
    ],
    "signal_strength": "high",
    "status": "candidate",
    "first_seen": "2026-05-28T03:48:26Z",
    "last_seen": "2026-05-28T03:48:26Z",
    "occurrence_count": 1,
    "pain_score": 0,
    "false_starts": [],
    "rejected_paths": [],
    "decisive_signal": "toolToAPISchema output lacked input_schema.type before fix; focused test passed after explicit inputJSONSchema.",
    "root_cause_family": "provider-tool-schema-contract",
    "injection_targets": [],
    "promotion_hint": ""
  },
  {
    "id": "LRN-20260528-072320-230663",
    "summary": "Desktop workflow controls should let pendingConfirmation override stale running lifecycle status.",
    "learning_type": "recovery_path",
    "source_command": "sp-debug",
    "evidence": "In .planning/debug/workflow-phase-completion-confirmation-missing.md, a repeated submit returned Workflow already has a pending completion while the UI showed Complete Phase. RED test showed pendingConfirmation true plus status running rendered Complete Phase; moving the pending branch before manual completion fixed it and user verified the issue resolved.",
    "recurrence_key": "desktop-workflow-pending-confirmation-over-running-status",
    "default_scope": "project",
    "applies_to": [
      "sp-debug,desktop workflow ui"
    ],
    "signal_strength": "high",
    "status": "candidate",
    "first_seen": "2026-05-28T07:23:20Z",
    "last_seen": "2026-05-28T07:23:20Z",
    "occurrence_count": 1,
    "pain_score": 3,
    "false_starts": [
      "Initial interpretation focused on missing confirmation prompt placement; live evidence showed the component had confirm controls but branch priority hid them when lifecycle status was stale."
    ],
    "rejected_paths": [],
    "decisive_signal": "RED component test rendered only Complete Phase for pendingConfirmation true with status running.",
    "root_cause_family": "observation-state-priority",
    "injection_targets": [
      "desktop workflow transition controls"
    ],
    "promotion_hint": "Promote if another workflow UI control state can conflict with stale lifecycle status."
  },
  {
    "id": "LRN-20260528-074835-235191",
    "summary": "Desktop AskUserQuestion resume must parse persisted tool_result text, not only live structured answers.",
    "learning_type": "pitfall",
    "source_command": "sp-debug",
    "evidence": "In .planning/debug/structured-question-selection-resume.md, AskUserQuestionTool persists answers as text (User has answered your questions...), chat history passes tool_result content to the renderer, and AskUserQuestion originally restored state only from result.answers. Regression test added at desktop/src/components/chat/AskUserQuestion.test.tsx.",
    "recurrence_key": "desktop-askuserquestion-persisted-tool-result-text",
    "default_scope": "project",
    "applies_to": [
      "sp-debug,sp-implement"
    ],
    "signal_strength": "medium",
    "status": "candidate",
    "first_seen": "2026-05-28T07:48:35Z",
    "last_seen": "2026-05-28T07:48:35Z",
    "occurrence_count": 1,
    "pain_score": 3,
    "false_starts": [
      "Initial suspicion included ephemeral component state, but live evidence showed answers were already persisted as text."
    ],
    "rejected_paths": [],
    "decisive_signal": "Focused RED test using persisted tool_result text rendered the unanswered prompt before the fix and passed after result-text normalization.",
    "root_cause_family": "persistence-shape-mismatch",
    "injection_targets": [
      "desktop chat structured question resume"
    ],
    "promotion_hint": ""
  },
  {
    "id": "LRN-20260602-121604-064994",
    "summary": "Workspace changed-files status should retry top-level untracked scanning when recursive git status cannot traverse a broad Windows profile repo.",
    "learning_type": "recovery_path",
    "source_command": "sp-debug",
    "evidence": "Debug session .planning/debug/changed-files-git-status-home-permission.md: live C:\\Users\\11034 repo reproduced AppData permission warnings with --untracked-files=all; WorkspaceService regression now retries --untracked-files=normal for traversal-style failures and workspace-service tests pass.",
    "recurrence_key": "recovery_path.workspace-changed-files-status-should-retry-top-level-untracked-scanning-when-recursive-git-status-cannot-traverse-a-broad-windows-profile-repo",
    "default_scope": "execution-heavy",
    "applies_to": [
      "sp-debug",
      "sp-implement",
      "sp-quick"
    ],
    "signal_strength": "medium",
    "status": "candidate",
    "first_seen": "2026-06-02T12:16:04Z",
    "last_seen": "2026-06-02T12:16:04Z",
    "occurrence_count": 1,
    "pain_score": 0,
    "false_starts": [],
    "rejected_paths": [],
    "decisive_signal": "",
    "root_cause_family": "",
    "injection_targets": [],
    "promotion_hint": ""
  },
  {
    "id": "LRN-20260604-031012-312706",
    "summary": "Retry the smallest recorded recovery step and rerun scoped checks before resolving a quick task",
    "learning_type": "recovery_path",
    "source_command": "sp-quick",
    "evidence": "Observed auto-capture evidence from quick STATUS.md\n- workspace: .planning\\quick\\20260604-workflow-plus-menu-continuation\n- status: resolved\n- retry_attempts: 2\n- goal: Let users start another workflow from a completed workflow session through the current session plus menu while preserving current conversation context.\n- next_action: Optional browser/manual verification or broader desktop check if desired.\n- blocker_reason: none\n- recovery_action: none\n- completed_checks: RED failed before production change because the Workflows button was absent., GREEN passed after production change: 1 test passed, 24 skipped.",
    "recurrence_key": "quick.retry-recovery-step-before-resolve",
    "default_scope": "execution-heavy",
    "applies_to": [
      "sp-debug",
      "sp-implement",
      "sp-quick"
    ],
    "signal_strength": "medium",
    "status": "candidate",
    "first_seen": "2026-06-04T03:10:12Z",
    "last_seen": "2026-06-04T03:10:12Z",
    "occurrence_count": 1,
    "pain_score": 0,
    "false_starts": [],
    "rejected_paths": [],
    "decisive_signal": "",
    "root_cause_family": "",
    "injection_targets": [],
    "promotion_hint": ""
  },
  {
    "id": "LRN-20260604-033758-629581",
    "summary": "Completed workflow sessions need terminal-source handling in linked workflow validation",
    "learning_type": "state_surface_gap",
    "source_command": "sp-debug",
    "evidence": "A desktop plus-menu continuation exposed completed workflow sessions, but WorkflowSessionLinkService rejected every source with workflow.mode == workflow. RED server test received 400; fix allowed status completed while guard tests preserved non-completed rejection.",
    "recurrence_key": "workflow-linked-source-terminal-status",
    "default_scope": "project",
    "applies_to": [
      "sp-debug"
    ],
    "signal_strength": "high",
    "status": "candidate",
    "first_seen": "2026-06-04T03:37:58Z",
    "last_seen": "2026-06-04T03:37:58Z",
    "occurrence_count": 1,
    "pain_score": 3,
    "false_starts": [
      "Checking only the desktop launcher made the Workflows entry visible but left the server source-session guard unchanged."
    ],
    "rejected_paths": [],
    "decisive_signal": "POST /api/sessions/:id/workflow/start returned WORKFLOW_SOURCE_INVALID for a session whose workflow metadata was completed.",
    "root_cause_family": "cross-layer-state-contract-drift",
    "injection_targets": [
      "linked workflow source validation"
    ],
    "promotion_hint": "Promote if another workflow continuation bug appears after UI gating changes."
  },
  {
    "id": "LRN-20260610-084242-504967",
    "summary": "Failed implementation tasks should keep execution in recovery until validation turns green",
    "learning_type": "pitfall",
    "source_command": "sp-implement",
    "evidence": "Observed auto-capture evidence from implement-tracker.md\n- feature_dir: F:\\github\\cc-jiangxia\\.specify\\features\\008-specify-discussions-settings\n- tracker_status: blocked\n- retry_attempts: 1\n- current_batch: closeout\n- failed_tasks: none\n- planned_checks: Focused checks specified by tasks.md and workflow-state.md., Required closeout command before final completion.\n- completed_checks: Prerequisites resolved active feature directory., Checklist requirements.md passed with 31 complete and 0 incomplete items., T001 pre-dispatch validation passed: executor role exists, dependencies are acyclic, read-scope paths exist, write scope is empty, forbidden paths include secrets/user config., T001 worker result consumed from native subagent and recorded in worker-results/T001.json., B1 pre-dispatch validation passed: executor roles exist, dependencies are acyclic, write scopes are isolated, missing write paths are expected new files., T002 and T003 worker handoffs consumed; leader review found B1 response contract mismatch before JP1 acceptance., B1 repair worker handoff consumed and recorded in worker-results/B1-contract-alignment-repair.json., JP1 focused schema validation passed: server schema imports, valid bundle parses, bundle-level activeId is rejected, secret-free present apiKey is rejected, commit result activeId metadata parses., B2 pre-dispatch validation passed: test-engineer roles exist, dependencies are completed, dependencies are acyclic, write scopes are isolated, read/write paths exist., JP2 RED validation accepted: server tests fail with 405 for missing `/api/providers/export`; desktop tests fail because `store.exportProviders` is missing., B3 pre-dispatch validation passed: executor roles exist, dependencies are completed, dependencies are acyclic, write scopes are isolated between server and desktop surfaces., JP3 accepted: T005 worker passed `bun test src/server/__tests__/providers.test.ts` and `bun run check:server`; T007 worker passed focused providerStore tests, a bounded test repair cleared desktop lint, and leader reran `bun run check:server` plus `bun run check:desktop` successfully., B4 pre-dispatch validation passed: test-engineer roles exist, dependencies are completed, dependencies are acyclic, write scopes are isolated, read/write paths exist., JP4 RED validation accepted: server import preview/commit tests fail with expected 405s; desktop import UI tests fail at missing Import providers control., B5 pre-dispatch validation passed: executor roles exist, dependencies are completed, dependencies are acyclic, write scopes are isolated between server and desktop surfaces., T009 and T011 worker handoffs consumed from worker-results/T009.json and worker-results/T011.json., JP5 accepted: `bun run check:server` passed with output captured at `.specify/features/008-specify-discussions-settings/validation-logs/jp5-check-server.log`; `bun run check:desktop` passed with output captured at `.specify/features/008-specify-discussions-settings/validation-logs/jp5-check-desktop.log`., B6 pre-dispatch validation passed: test-engineer roles exist, dependencies are completed, dependencies are acyclic, write scopes are isolated, read/write paths exist, and tests are expected to fail RED for missing secret export confirmation/labeling behavior., T012 and T014 worker handoffs consumed from worker-results/T012.json and worker-results/T014.json., JP6 RED validation accepted: server secret export tests fail with expected 405 for missing `/api/providers/export-with-secrets`; desktop secret export tests fail at missing separate `Export with credentials` action/warning flow. Logs captured under `.specify/features/008-specify-discussions-settings/validation-logs/jp6-red-server.log` and `jp6-red-desktop.log`., B7 pre-dispatch validation passed: executor roles exist, dependencies are completed, dependencies are acyclic, write scopes are isolated between server and desktop surfaces., T013 and T015 worker handoffs consumed from worker-results/T013.json and worker-results/T015.json., JP7 accepted: `bun run check:server` passed with output captured at `.specify/features/008-specify-discussions-settings/validation-logs/jp7-check-server.log`; `bun run check:desktop` passed with output captured at `.specify/features/008-specify-discussions-settings/validation-logs/jp7-check-desktop.log`., T016 pre-dispatch validation passed: build-fixer role exists, dependencies are completed, dependencies are acyclic, and verification may read the full repository while write scope is limited to implementation-touched files if checks fail., T016 worker handoff consumed from worker-results/T016.json., Final local verification accepted: `bun run check:server`, `bun run check:desktop`, `bun run check:coverage`, and all non-live `bun run verify` lanes passed. `bun run verify` remains PR-not-ready solely because live-provider-checks are escalated and maintainer-only.\n- blockers: Continue from live repository evidence and carry cognition coverage gap; inline closeout update or dirty marker will be handled after mutations if possible., Maintainer runs `bun run quality:gate --mode baseline --allow-live --provider-model <selector>` with an authorized selector or records an explicit live-provider waiver.",
    "recurrence_key": "implement.failed-tasks-keep-recovery-active-until-validation",
    "default_scope": "implementation-heavy",
    "applies_to": [
      "sp-debug",
      "sp-implement",
      "sp-quick"
    ],
    "signal_strength": "medium",
    "status": "candidate",
    "first_seen": "2026-06-10T08:42:42Z",
    "last_seen": "2026-06-10T08:42:42Z",
    "occurrence_count": 1,
    "pain_score": 0,
    "false_starts": [],
    "rejected_paths": [],
    "decisive_signal": "",
    "root_cause_family": "",
    "injection_targets": [],
    "promotion_hint": ""
  }
]
<!-- SPECKIT_LEARNING_DATA_END -->

## Managed Entries

### LRN-20260528-034826-951380 - API-bound tool schemas must expose a top-level object root even when runtime Zod validation uses a discriminated union.

- Status: `candidate`
- Type: `recovery_path`
- Source Command: `sp-debug`
- Recurrence Key: `tool-api-schema-object-root`
- Scope: `project`
- Applies To: sp-debug, sp-implement
- Signal: `high`
- Occurrence Count: 1
- First Seen: `2026-05-28T03:48:26Z`
- Last Seen: `2026-05-28T03:48:26Z`

#### Evidence

workflow_template_authoring caused provider 400 because z.discriminatedUnion converted to top-level oneOf with no type object; fix added explicit inputJSONSchema and regression through toolToAPISchema.

#### Structured Learning

- Decisive Signal: toolToAPISchema output lacked input_schema.type before fix; focused test passed after explicit inputJSONSchema.
- Root Cause Family: `provider-tool-schema-contract`


---

### LRN-20260528-072320-230663 - Desktop workflow controls should let pendingConfirmation override stale running lifecycle status.

- Status: `candidate`
- Type: `recovery_path`
- Source Command: `sp-debug`
- Recurrence Key: `desktop-workflow-pending-confirmation-over-running-status`
- Scope: `project`
- Applies To: sp-debug,desktop workflow ui
- Signal: `high`
- Occurrence Count: 1
- First Seen: `2026-05-28T07:23:20Z`
- Last Seen: `2026-05-28T07:23:20Z`

#### Evidence

In .planning/debug/workflow-phase-completion-confirmation-missing.md, a repeated submit returned Workflow already has a pending completion while the UI showed Complete Phase. RED test showed pendingConfirmation true plus status running rendered Complete Phase; moving the pending branch before manual completion fixed it and user verified the issue resolved.

#### Structured Learning

- Pain Score: `3`
- False Starts: Initial interpretation focused on missing confirmation prompt placement; live evidence showed the component had confirm controls but branch priority hid them when lifecycle status was stale.
- Decisive Signal: RED component test rendered only Complete Phase for pendingConfirmation true with status running.
- Root Cause Family: `observation-state-priority`
- Injection Targets: desktop workflow transition controls
- Promotion Hint: Promote if another workflow UI control state can conflict with stale lifecycle status.


---

### LRN-20260528-074835-235191 - Desktop AskUserQuestion resume must parse persisted tool_result text, not only live structured answers.

- Status: `candidate`
- Type: `pitfall`
- Source Command: `sp-debug`
- Recurrence Key: `desktop-askuserquestion-persisted-tool-result-text`
- Scope: `project`
- Applies To: sp-debug,sp-implement
- Signal: `medium`
- Occurrence Count: 1
- First Seen: `2026-05-28T07:48:35Z`
- Last Seen: `2026-05-28T07:48:35Z`

#### Evidence

In .planning/debug/structured-question-selection-resume.md, AskUserQuestionTool persists answers as text (User has answered your questions...), chat history passes tool_result content to the renderer, and AskUserQuestion originally restored state only from result.answers. Regression test added at desktop/src/components/chat/AskUserQuestion.test.tsx.

#### Structured Learning

- Pain Score: `3`
- False Starts: Initial suspicion included ephemeral component state, but live evidence showed answers were already persisted as text.
- Decisive Signal: Focused RED test using persisted tool_result text rendered the unanswered prompt before the fix and passed after result-text normalization.
- Root Cause Family: `persistence-shape-mismatch`
- Injection Targets: desktop chat structured question resume


---

### LRN-20260602-121604-064994 - Workspace changed-files status should retry top-level untracked scanning when recursive git status cannot traverse a broad Windows profile repo.

- Status: `candidate`
- Type: `recovery_path`
- Source Command: `sp-debug`
- Recurrence Key: `recovery_path.workspace-changed-files-status-should-retry-top-level-untracked-scanning-when-recursive-git-status-cannot-traverse-a-broad-windows-profile-repo`
- Scope: `execution-heavy`
- Applies To: sp-debug, sp-implement, sp-quick
- Signal: `medium`
- Occurrence Count: 1
- First Seen: `2026-06-02T12:16:04Z`
- Last Seen: `2026-06-02T12:16:04Z`

#### Evidence

Debug session .planning/debug/changed-files-git-status-home-permission.md: live C:\Users\11034 repo reproduced AppData permission warnings with --untracked-files=all; WorkspaceService regression now retries --untracked-files=normal for traversal-style failures and workspace-service tests pass.


---

### LRN-20260604-031012-312706 - Retry the smallest recorded recovery step and rerun scoped checks before resolving a quick task

- Status: `candidate`
- Type: `recovery_path`
- Source Command: `sp-quick`
- Recurrence Key: `quick.retry-recovery-step-before-resolve`
- Scope: `execution-heavy`
- Applies To: sp-debug, sp-implement, sp-quick
- Signal: `medium`
- Occurrence Count: 1
- First Seen: `2026-06-04T03:10:12Z`
- Last Seen: `2026-06-04T03:10:12Z`

#### Evidence

Observed auto-capture evidence from quick STATUS.md
- workspace: .planning\quick\20260604-workflow-plus-menu-continuation
- status: resolved
- retry_attempts: 2
- goal: Let users start another workflow from a completed workflow session through the current session plus menu while preserving current conversation context.
- next_action: Optional browser/manual verification or broader desktop check if desired.
- blocker_reason: none
- recovery_action: none
- completed_checks: RED failed before production change because the Workflows button was absent., GREEN passed after production change: 1 test passed, 24 skipped.


---

### LRN-20260604-033758-629581 - Completed workflow sessions need terminal-source handling in linked workflow validation

- Status: `candidate`
- Type: `state_surface_gap`
- Source Command: `sp-debug`
- Recurrence Key: `workflow-linked-source-terminal-status`
- Scope: `project`
- Applies To: sp-debug
- Signal: `high`
- Occurrence Count: 1
- First Seen: `2026-06-04T03:37:58Z`
- Last Seen: `2026-06-04T03:37:58Z`

#### Evidence

A desktop plus-menu continuation exposed completed workflow sessions, but WorkflowSessionLinkService rejected every source with workflow.mode == workflow. RED server test received 400; fix allowed status completed while guard tests preserved non-completed rejection.

#### Structured Learning

- Pain Score: `3`
- False Starts: Checking only the desktop launcher made the Workflows entry visible but left the server source-session guard unchanged.
- Decisive Signal: POST /api/sessions/:id/workflow/start returned WORKFLOW_SOURCE_INVALID for a session whose workflow metadata was completed.
- Root Cause Family: `cross-layer-state-contract-drift`
- Injection Targets: linked workflow source validation
- Promotion Hint: Promote if another workflow continuation bug appears after UI gating changes.


---

### LRN-20260610-084242-504967 - Failed implementation tasks should keep execution in recovery until validation turns green

- Status: `candidate`
- Type: `pitfall`
- Source Command: `sp-implement`
- Recurrence Key: `implement.failed-tasks-keep-recovery-active-until-validation`
- Scope: `implementation-heavy`
- Applies To: sp-debug, sp-implement, sp-quick
- Signal: `medium`
- Occurrence Count: 1
- First Seen: `2026-06-10T08:42:42Z`
- Last Seen: `2026-06-10T08:42:42Z`

#### Evidence

Observed auto-capture evidence from implement-tracker.md
- feature_dir: F:\github\cc-jiangxia\.specify\features\008-specify-discussions-settings
- tracker_status: blocked
- retry_attempts: 1
- current_batch: closeout
- failed_tasks: none
- planned_checks: Focused checks specified by tasks.md and workflow-state.md., Required closeout command before final completion.
- completed_checks: Prerequisites resolved active feature directory., Checklist requirements.md passed with 31 complete and 0 incomplete items., T001 pre-dispatch validation passed: executor role exists, dependencies are acyclic, read-scope paths exist, write scope is empty, forbidden paths include secrets/user config., T001 worker result consumed from native subagent and recorded in worker-results/T001.json., B1 pre-dispatch validation passed: executor roles exist, dependencies are acyclic, write scopes are isolated, missing write paths are expected new files., T002 and T003 worker handoffs consumed; leader review found B1 response contract mismatch before JP1 acceptance., B1 repair worker handoff consumed and recorded in worker-results/B1-contract-alignment-repair.json., JP1 focused schema validation passed: server schema imports, valid bundle parses, bundle-level activeId is rejected, secret-free present apiKey is rejected, commit result activeId metadata parses., B2 pre-dispatch validation passed: test-engineer roles exist, dependencies are completed, dependencies are acyclic, write scopes are isolated, read/write paths exist., JP2 RED validation accepted: server tests fail with 405 for missing `/api/providers/export`; desktop tests fail because `store.exportProviders` is missing., B3 pre-dispatch validation passed: executor roles exist, dependencies are completed, dependencies are acyclic, write scopes are isolated between server and desktop surfaces., JP3 accepted: T005 worker passed `bun test src/server/__tests__/providers.test.ts` and `bun run check:server`; T007 worker passed focused providerStore tests, a bounded test repair cleared desktop lint, and leader reran `bun run check:server` plus `bun run check:desktop` successfully., B4 pre-dispatch validation passed: test-engineer roles exist, dependencies are completed, dependencies are acyclic, write scopes are isolated, read/write paths exist., JP4 RED validation accepted: server import preview/commit tests fail with expected 405s; desktop import UI tests fail at missing Import providers control., B5 pre-dispatch validation passed: executor roles exist, dependencies are completed, dependencies are acyclic, write scopes are isolated between server and desktop surfaces., T009 and T011 worker handoffs consumed from worker-results/T009.json and worker-results/T011.json., JP5 accepted: `bun run check:server` passed with output captured at `.specify/features/008-specify-discussions-settings/validation-logs/jp5-check-server.log`; `bun run check:desktop` passed with output captured at `.specify/features/008-specify-discussions-settings/validation-logs/jp5-check-desktop.log`., B6 pre-dispatch validation passed: test-engineer roles exist, dependencies are completed, dependencies are acyclic, write scopes are isolated, read/write paths exist, and tests are expected to fail RED for missing secret export confirmation/labeling behavior., T012 and T014 worker handoffs consumed from worker-results/T012.json and worker-results/T014.json., JP6 RED validation accepted: server secret export tests fail with expected 405 for missing `/api/providers/export-with-secrets`; desktop secret export tests fail at missing separate `Export with credentials` action/warning flow. Logs captured under `.specify/features/008-specify-discussions-settings/validation-logs/jp6-red-server.log` and `jp6-red-desktop.log`., B7 pre-dispatch validation passed: executor roles exist, dependencies are completed, dependencies are acyclic, write scopes are isolated between server and desktop surfaces., T013 and T015 worker handoffs consumed from worker-results/T013.json and worker-results/T015.json., JP7 accepted: `bun run check:server` passed with output captured at `.specify/features/008-specify-discussions-settings/validation-logs/jp7-check-server.log`; `bun run check:desktop` passed with output captured at `.specify/features/008-specify-discussions-settings/validation-logs/jp7-check-desktop.log`., T016 pre-dispatch validation passed: build-fixer role exists, dependencies are completed, dependencies are acyclic, and verification may read the full repository while write scope is limited to implementation-touched files if checks fail., T016 worker handoff consumed from worker-results/T016.json., Final local verification accepted: `bun run check:server`, `bun run check:desktop`, `bun run check:coverage`, and all non-live `bun run verify` lanes passed. `bun run verify` remains PR-not-ready solely because live-provider-checks are escalated and maintainer-only.
- blockers: Continue from live repository evidence and carry cognition coverage gap; inline closeout update or dirty marker will be handled after mutations if possible., Maintainer runs `bun run quality:gate --mode baseline --allow-live --provider-model <selector>` with an authorized selector or records an explicit live-provider waiver.

