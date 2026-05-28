# Desktop AskUserQuestion resume must parse persisted tool_result text, not only live structured answers.

<!-- SPECKIT_LEARNING_DATA_BEGIN -->
[
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

## Problem

Desktop AskUserQuestion resume must parse persisted tool_result text, not only live structured answers.

## Lesson

In .planning/debug/structured-question-selection-resume.md, AskUserQuestionTool persists answers as text (User has answered your questions...), chat history passes tool_result content to the renderer, and AskUserQuestion originally restored state only from result.answers. Regression test added at desktop/src/components/chat/AskUserQuestion.test.tsx.

## When To Apply

sp-debug,sp-implement

## Trigger Signals

- Focused RED test using persisted tool_result text rendered the unanswered prompt before the fix and passed after result-text normalization.
- Initial suspicion included ephemeral component state, but live evidence showed answers were already persisted as text.
- medium
- persistence-shape-mismatch
- pitfall

## Evidence

In .planning/debug/structured-question-selection-resume.md, AskUserQuestionTool persists answers as text (User has answered your questions...), chat history passes tool_result content to the renderer, and AskUserQuestion originally restored state only from result.answers. Regression test added at desktop/src/components/chat/AskUserQuestion.test.tsx.

## Prevention Or Recovery

Decisive signal: Focused RED test using persisted tool_result text rendered the unanswered prompt before the fix and passed after result-text normalization.

False starts:
- Initial suspicion included ephemeral component state, but live evidence showed answers were already persisted as text.

Rejected paths:
_No rejected paths recorded._

## Exceptions

_No exceptions recorded yet._
