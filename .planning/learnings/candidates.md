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

