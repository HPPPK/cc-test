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

