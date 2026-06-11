# Project Learning Index

Thin first-read index of reusable engineering lessons for later `sp-xxx` workflows.

Read this file after `.specify/memory/project-rules.md` and before command-local
context. Open only the linked detail documents whose `applies_to` or
`trigger_signals` match the current work.

---

<!-- SPECKIT_LEARNING_DATA_BEGIN -->
[
  {
    "id": "learn-2026-05-28-tool-api-schema-object-root-a243dccf96",
    "problem": "API-bound tool schemas must expose a top-level object root even when runtime Zod validation uses a discriminated union.",
    "lesson": "workflow_template_authoring caused provider 400 because z.discriminatedUnion converted to top-level oneOf with no type object; fix added explicit inputJSONSchema and regression through toolToAPISchema.",
    "learning_type": "recovery_path",
    "source_command": "sp-debug",
    "recurrence_key": "tool-api-schema-object-root",
    "applies_to": [
      "sp-debug",
      "sp-implement"
    ],
    "trigger_signals": [
      "high",
      "provider-tool-schema-contract",
      "recovery_path",
      "toolToAPISchema output lacked input_schema.type before fix; focused test passed after explicit inputJSONSchema."
    ],
    "detail": "./learn-2026-05-28-tool-api-schema-object-root-a243dccf96.md",
    "first_seen": "2026-05-28T03:48:26Z",
    "last_seen": "2026-05-28T03:48:26Z",
    "occurrence_count": 1,
    "signal_strength": "high"
  },
  {
    "id": "learn-2026-05-28-desktop-workflow-pending-confirmation-over-running-statu-b45c8345ca",
    "problem": "Desktop workflow controls should let pendingConfirmation override stale running lifecycle status.",
    "lesson": "In .planning/debug/workflow-phase-completion-confirmation-missing.md, a repeated submit returned Workflow already has a pending completion while the UI showed Complete Phase. RED test showed pendingConfirmation true plus status running rendered Complete Phase; moving the pending branch before manual completion fixed it and user verified the issue resolved.",
    "learning_type": "recovery_path",
    "source_command": "sp-debug",
    "recurrence_key": "desktop-workflow-pending-confirmation-over-running-status",
    "applies_to": [
      "sp-debug,desktop workflow ui"
    ],
    "trigger_signals": [
      "Initial interpretation focused on missing confirmation prompt placement; live evidence showed the component had confirm controls but branch priority hid them when lifecycle status was stale.",
      "RED component test rendered only Complete Phase for pendingConfirmation true with status running.",
      "high",
      "observation-state-priority",
      "recovery_path"
    ],
    "detail": "./learn-2026-05-28-desktop-workflow-pending-confirmation-over-running-statu-b45c8345ca.md",
    "first_seen": "2026-05-28T07:23:20Z",
    "last_seen": "2026-05-28T07:23:20Z",
    "occurrence_count": 1,
    "signal_strength": "high"
  },
  {
    "id": "learn-2026-05-28-desktop-askuserquestion-persisted-tool-result-text-2c908b1efc",
    "problem": "Desktop AskUserQuestion resume must parse persisted tool_result text, not only live structured answers.",
    "lesson": "In .planning/debug/structured-question-selection-resume.md, AskUserQuestionTool persists answers as text (User has answered your questions...), chat history passes tool_result content to the renderer, and AskUserQuestion originally restored state only from result.answers. Regression test added at desktop/src/components/chat/AskUserQuestion.test.tsx.",
    "learning_type": "pitfall",
    "source_command": "sp-debug",
    "recurrence_key": "desktop-askuserquestion-persisted-tool-result-text",
    "applies_to": [
      "sp-debug,sp-implement"
    ],
    "trigger_signals": [
      "Focused RED test using persisted tool_result text rendered the unanswered prompt before the fix and passed after result-text normalization.",
      "Initial suspicion included ephemeral component state, but live evidence showed answers were already persisted as text.",
      "medium",
      "persistence-shape-mismatch",
      "pitfall"
    ],
    "detail": "./learn-2026-05-28-desktop-askuserquestion-persisted-tool-result-text-2c908b1efc.md",
    "first_seen": "2026-05-28T07:48:35Z",
    "last_seen": "2026-05-28T07:48:35Z",
    "occurrence_count": 1,
    "signal_strength": "medium"
  },
  {
    "id": "learn-2026-06-02-recovery-path-workspace-changed-files-status-should-retr-4fa233566f",
    "problem": "Workspace changed-files status should retry top-level untracked scanning when recursive git status cannot traverse a broad Windows profile repo.",
    "lesson": "Debug session .planning/debug/changed-files-git-status-home-permission.md: live C:\\Users\\11034 repo reproduced AppData permission warnings with --untracked-files=all; WorkspaceService regression now retries --untracked-files=normal for traversal-style failures and workspace-service tests pass.",
    "learning_type": "recovery_path",
    "source_command": "sp-debug",
    "recurrence_key": "recovery_path.workspace-changed-files-status-should-retry-top-level-untracked-scanning-when-recursive-git-status-cannot-traverse-a-broad-windows-profile-repo",
    "applies_to": [
      "sp-debug",
      "sp-implement",
      "sp-quick"
    ],
    "trigger_signals": [
      "medium",
      "recovery_path"
    ],
    "detail": "./learn-2026-06-02-recovery-path-workspace-changed-files-status-should-retr-4fa233566f.md",
    "first_seen": "2026-06-02T12:16:04Z",
    "last_seen": "2026-06-02T12:16:04Z",
    "occurrence_count": 1,
    "signal_strength": "medium"
  },
  {
    "id": "learn-2026-06-03-workflow-authoring-skill-create-catalog-visibility-7d1a6f0c2b",
    "problem": "Workflow authoring skill creation must be visible through the same authoring tool, guide, policy, and installed skill catalog used by agents and the client.",
    "lesson": "A server skill file write is not enough: workflow_template_authoring must expose skill_create in the API-bound schema and prompt, guide agents to run skill_catalog first, validate generated SKILL.md, reject overwrites, confirm catalog visibility, and keep skill_create phase-policy gated.",
    "learning_type": "pitfall",
    "source_command": "sp-quick",
    "recurrence_key": "workflow-authoring-skill-create-catalog-visibility",
    "applies_to": [
      "sp-quick",
      "sp-implement",
      "sp-workflow_template_authoring",
      "sp-server workflow api"
    ],
    "trigger_signals": [
      "workflow phase skills",
      "skill_create",
      "installed skill catalog",
      "agent-facing tool schema",
      "phase-policy gated mutation",
      "medium",
      "pitfall"
    ],
    "detail": "./learn-2026-06-03-workflow-authoring-skill-create-catalog-visibility-7d1a6f0c2b.md",
    "first_seen": "2026-06-03T07:55:00Z",
    "last_seen": "2026-06-03T07:55:00Z",
    "occurrence_count": 1,
    "signal_strength": "medium"
  },
  {
    "id": "learn-2026-06-04-quick-retry-recovery-step-before-resolve-51ac9dc626",
    "problem": "Retry the smallest recorded recovery step and rerun scoped checks before resolving a quick task",
    "lesson": "Observed auto-capture evidence from quick STATUS.md",
    "learning_type": "recovery_path",
    "source_command": "sp-quick",
    "recurrence_key": "quick.retry-recovery-step-before-resolve",
    "applies_to": [
      "sp-debug",
      "sp-implement",
      "sp-quick"
    ],
    "trigger_signals": [
      "medium",
      "recovery_path"
    ],
    "detail": "./learn-2026-06-04-quick-retry-recovery-step-before-resolve-51ac9dc626.md",
    "first_seen": "2026-06-04T03:10:12Z",
    "last_seen": "2026-06-04T03:10:12Z",
    "occurrence_count": 1,
    "signal_strength": "medium"
  },
  {
    "id": "learn-2026-06-04-workflow-linked-source-terminal-status-74f4db59dd",
    "problem": "Completed workflow sessions need terminal-source handling in linked workflow validation",
    "lesson": "A desktop plus-menu continuation exposed completed workflow sessions, but WorkflowSessionLinkService rejected every source with workflow.mode == workflow. RED server test received 400; fix allowed status completed while guard tests preserved non-completed rejection.",
    "learning_type": "state_surface_gap",
    "source_command": "sp-debug",
    "recurrence_key": "workflow-linked-source-terminal-status",
    "applies_to": [
      "sp-debug"
    ],
    "trigger_signals": [
      "Checking only the desktop launcher made the Workflows entry visible but left the server source-session guard unchanged.",
      "POST /api/sessions/:id/workflow/start returned WORKFLOW_SOURCE_INVALID for a session whose workflow metadata was completed.",
      "cross-layer-state-contract-drift",
      "high",
      "state_surface_gap"
    ],
    "detail": "./learn-2026-06-04-workflow-linked-source-terminal-status-74f4db59dd.md",
    "first_seen": "2026-06-04T03:37:58Z",
    "last_seen": "2026-06-04T03:37:58Z",
    "occurrence_count": 1,
    "signal_strength": "high"
  },
  {
    "id": "learn-2026-06-10-implement-failed-tasks-keep-recovery-active-until-valida-1633451b90",
    "problem": "Failed implementation tasks should keep execution in recovery until validation turns green",
    "lesson": "Observed auto-capture evidence from implement-tracker.md",
    "learning_type": "pitfall",
    "source_command": "sp-implement",
    "recurrence_key": "implement.failed-tasks-keep-recovery-active-until-validation",
    "applies_to": [
      "sp-debug",
      "sp-implement",
      "sp-quick"
    ],
    "trigger_signals": [
      "medium",
      "pitfall"
    ],
    "detail": "./learn-2026-06-10-implement-failed-tasks-keep-recovery-active-until-valida-1633451b90.md",
    "first_seen": "2026-06-10T08:42:42Z",
    "last_seen": "2026-06-10T08:42:42Z",
    "occurrence_count": 1,
    "signal_strength": "medium"
  },
  {
    "id": "learn-2026-06-10-desktop-export-save-picker-fallback-a8f3c2d1",
    "problem": "Desktop export save-file UX should confirm an available write path before replacing it with a plain download.",
    "lesson": "Provider export modals need copyable JSON plus a save-file path. Tauri dialog save permission alone is not enough without a file write API; use an available browser File System Access picker when present and keep a download fallback, with same-area tests for the picker branch.",
    "learning_type": "pitfall",
    "source_command": "sp-quick",
    "recurrence_key": "desktop-export-save-picker-fallback",
    "applies_to": [
      "sp-quick",
      "sp-implement",
      "desktop settings ui"
    ],
    "trigger_signals": [
      "desktop export UI",
      "save file",
      "download fallback",
      "Tauri dialog save",
      "File System Access",
      "medium",
      "pitfall"
    ],
    "detail": "./learn-2026-06-10-desktop-export-save-picker-fallback-a8f3c2d1.md",
    "first_seen": "2026-06-10T12:03:00Z",
    "last_seen": "2026-06-10T12:03:00Z",
    "occurrence_count": 1,
    "signal_strength": "medium"
  }
]
<!-- SPECKIT_LEARNING_DATA_END -->

## Managed Entries

### learn-2026-05-28-tool-api-schema-object-root-a243dccf96 - API-bound tool schemas must expose a top-level object root even when runtime Zod validation uses a discriminated union.

- Type: `recovery_path`
- Source Command: `sp-debug`
- Recurrence Key: `tool-api-schema-object-root`
- Applies To: sp-debug, sp-implement
- Trigger Signals: high, provider-tool-schema-contract, recovery_path, toolToAPISchema output lacked input_schema.type before fix; focused test passed after explicit inputJSONSchema.
- Signal: `high`
- Occurrence Count: 1
- First Seen: `2026-05-28T03:48:26Z`
- Last Seen: `2026-05-28T03:48:26Z`
- Detail: `./learn-2026-05-28-tool-api-schema-object-root-a243dccf96.md`

#### Lesson

workflow_template_authoring caused provider 400 because z.discriminatedUnion converted to top-level oneOf with no type object; fix added explicit inputJSONSchema and regression through toolToAPISchema.


---

### learn-2026-05-28-desktop-workflow-pending-confirmation-over-running-statu-b45c8345ca - Desktop workflow controls should let pendingConfirmation override stale running lifecycle status.

- Type: `recovery_path`
- Source Command: `sp-debug`
- Recurrence Key: `desktop-workflow-pending-confirmation-over-running-status`
- Applies To: sp-debug,desktop workflow ui
- Trigger Signals: Initial interpretation focused on missing confirmation prompt placement; live evidence showed the component had confirm controls but branch priority hid them when lifecycle status was stale., RED component test rendered only Complete Phase for pendingConfirmation true with status running., high, observation-state-priority, recovery_path
- Signal: `high`
- Occurrence Count: 1
- First Seen: `2026-05-28T07:23:20Z`
- Last Seen: `2026-05-28T07:23:20Z`
- Detail: `./learn-2026-05-28-desktop-workflow-pending-confirmation-over-running-statu-b45c8345ca.md`

#### Lesson

In .planning/debug/workflow-phase-completion-confirmation-missing.md, a repeated submit returned Workflow already has a pending completion while the UI showed Complete Phase. RED test showed pendingConfirmation true plus status running rendered Complete Phase; moving the pending branch before manual completion fixed it and user verified the issue resolved.


---

### learn-2026-05-28-desktop-askuserquestion-persisted-tool-result-text-2c908b1efc - Desktop AskUserQuestion resume must parse persisted tool_result text, not only live structured answers.

- Type: `pitfall`
- Source Command: `sp-debug`
- Recurrence Key: `desktop-askuserquestion-persisted-tool-result-text`
- Applies To: sp-debug,sp-implement
- Trigger Signals: Focused RED test using persisted tool_result text rendered the unanswered prompt before the fix and passed after result-text normalization., Initial suspicion included ephemeral component state, but live evidence showed answers were already persisted as text., medium, persistence-shape-mismatch, pitfall
- Signal: `medium`
- Occurrence Count: 1
- First Seen: `2026-05-28T07:48:35Z`
- Last Seen: `2026-05-28T07:48:35Z`
- Detail: `./learn-2026-05-28-desktop-askuserquestion-persisted-tool-result-text-2c908b1efc.md`

#### Lesson

In .planning/debug/structured-question-selection-resume.md, AskUserQuestionTool persists answers as text (User has answered your questions...), chat history passes tool_result content to the renderer, and AskUserQuestion originally restored state only from result.answers. Regression test added at desktop/src/components/chat/AskUserQuestion.test.tsx.


---

### learn-2026-06-02-recovery-path-workspace-changed-files-status-should-retr-4fa233566f - Workspace changed-files status should retry top-level untracked scanning when recursive git status cannot traverse a broad Windows profile repo.

- Type: `recovery_path`
- Source Command: `sp-debug`
- Recurrence Key: `recovery_path.workspace-changed-files-status-should-retry-top-level-untracked-scanning-when-recursive-git-status-cannot-traverse-a-broad-windows-profile-repo`
- Applies To: sp-debug, sp-implement, sp-quick
- Trigger Signals: medium, recovery_path
- Signal: `medium`
- Occurrence Count: 1
- First Seen: `2026-06-02T12:16:04Z`
- Last Seen: `2026-06-02T12:16:04Z`
- Detail: `./learn-2026-06-02-recovery-path-workspace-changed-files-status-should-retr-4fa233566f.md`

#### Lesson

Debug session .planning/debug/changed-files-git-status-home-permission.md: live C:\Users\11034 repo reproduced AppData permission warnings with --untracked-files=all; WorkspaceService regression now retries --untracked-files=normal for traversal-style failures and workspace-service tests pass.


---

### learn-2026-06-03-workflow-authoring-skill-create-catalog-visibility-7d1a6f0c2b - Workflow authoring skill creation must be visible through the same authoring tool, guide, policy, and installed skill catalog used by agents and the client.

- Type: `pitfall`
- Source Command: `sp-quick`
- Recurrence Key: `workflow-authoring-skill-create-catalog-visibility`
- Applies To: sp-quick, sp-implement, sp-workflow_template_authoring, sp-server workflow api
- Trigger Signals: workflow phase skills, skill_create, installed skill catalog, agent-facing tool schema, phase-policy gated mutation, medium, pitfall
- Signal: `medium`
- Occurrence Count: 1
- First Seen: `2026-06-03T07:55:00Z`
- Last Seen: `2026-06-03T07:55:00Z`
- Detail: `./learn-2026-06-03-workflow-authoring-skill-create-catalog-visibility-7d1a6f0c2b.md`

#### Lesson

A server skill file write is not enough: workflow_template_authoring must expose skill_create in the API-bound schema and prompt, guide agents to run skill_catalog first, validate generated SKILL.md, reject overwrites, confirm catalog visibility, and keep skill_create phase-policy gated.


---

### learn-2026-06-04-quick-retry-recovery-step-before-resolve-51ac9dc626 - Retry the smallest recorded recovery step and rerun scoped checks before resolving a quick task

- Type: `recovery_path`
- Source Command: `sp-quick`
- Recurrence Key: `quick.retry-recovery-step-before-resolve`
- Applies To: sp-debug, sp-implement, sp-quick
- Trigger Signals: medium, recovery_path
- Signal: `medium`
- Occurrence Count: 1
- First Seen: `2026-06-04T03:10:12Z`
- Last Seen: `2026-06-04T03:10:12Z`
- Detail: `./learn-2026-06-04-quick-retry-recovery-step-before-resolve-51ac9dc626.md`

#### Lesson

Observed auto-capture evidence from quick STATUS.md


---

### learn-2026-06-04-workflow-linked-source-terminal-status-74f4db59dd - Completed workflow sessions need terminal-source handling in linked workflow validation

- Type: `state_surface_gap`
- Source Command: `sp-debug`
- Recurrence Key: `workflow-linked-source-terminal-status`
- Applies To: sp-debug
- Trigger Signals: Checking only the desktop launcher made the Workflows entry visible but left the server source-session guard unchanged., POST /api/sessions/:id/workflow/start returned WORKFLOW_SOURCE_INVALID for a session whose workflow metadata was completed., cross-layer-state-contract-drift, high, state_surface_gap
- Signal: `high`
- Occurrence Count: 1
- First Seen: `2026-06-04T03:37:58Z`
- Last Seen: `2026-06-04T03:37:58Z`
- Detail: `./learn-2026-06-04-workflow-linked-source-terminal-status-74f4db59dd.md`

#### Lesson

A desktop plus-menu continuation exposed completed workflow sessions, but WorkflowSessionLinkService rejected every source with workflow.mode == workflow. RED server test received 400; fix allowed status completed while guard tests preserved non-completed rejection.


---

### learn-2026-06-10-implement-failed-tasks-keep-recovery-active-until-valida-1633451b90 - Failed implementation tasks should keep execution in recovery until validation turns green

- Type: `pitfall`
- Source Command: `sp-implement`
- Recurrence Key: `implement.failed-tasks-keep-recovery-active-until-validation`
- Applies To: sp-debug, sp-implement, sp-quick
- Trigger Signals: medium, pitfall
- Signal: `medium`
- Occurrence Count: 1
- First Seen: `2026-06-10T08:42:42Z`
- Last Seen: `2026-06-10T08:42:42Z`
- Detail: `./learn-2026-06-10-implement-failed-tasks-keep-recovery-active-until-valida-1633451b90.md`

#### Lesson

Observed auto-capture evidence from implement-tracker.md


---

### learn-2026-06-10-desktop-export-save-picker-fallback-a8f3c2d1 - Desktop export save-file UX should confirm an available write path before replacing it with a plain download.

- Type: `pitfall`
- Source Command: `sp-quick`
- Recurrence Key: `desktop-export-save-picker-fallback`
- Applies To: sp-quick, sp-implement, desktop settings ui
- Trigger Signals: desktop export UI, save file, download fallback, Tauri dialog save, File System Access, medium, pitfall
- Signal: `medium`
- Occurrence Count: 1
- First Seen: `2026-06-10T12:03:00Z`
- Last Seen: `2026-06-10T12:03:00Z`
- Detail: `./learn-2026-06-10-desktop-export-save-picker-fallback-a8f3c2d1.md`

#### Lesson

Provider export modals need copyable JSON plus a save-file path. Tauri dialog save permission alone is not enough without a file write API; use an available browser File System Access picker when present and keep a download fallback, with same-area tests for the picker branch.
