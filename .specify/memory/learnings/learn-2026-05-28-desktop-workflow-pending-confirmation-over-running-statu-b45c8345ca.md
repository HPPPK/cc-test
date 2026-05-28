# Desktop workflow controls should let pendingConfirmation override stale running lifecycle status.

<!-- SPECKIT_LEARNING_DATA_BEGIN -->
[
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
  }
]
<!-- SPECKIT_LEARNING_DATA_END -->

## Problem

Desktop workflow controls should let pendingConfirmation override stale running lifecycle status.

## Lesson

In .planning/debug/workflow-phase-completion-confirmation-missing.md, a repeated submit returned Workflow already has a pending completion while the UI showed Complete Phase. RED test showed pendingConfirmation true plus status running rendered Complete Phase; moving the pending branch before manual completion fixed it and user verified the issue resolved.

## When To Apply

sp-debug,desktop workflow ui

## Trigger Signals

- Initial interpretation focused on missing confirmation prompt placement; live evidence showed the component had confirm controls but branch priority hid them when lifecycle status was stale.
- RED component test rendered only Complete Phase for pendingConfirmation true with status running.
- high
- observation-state-priority
- recovery_path

## Evidence

In .planning/debug/workflow-phase-completion-confirmation-missing.md, a repeated submit returned Workflow already has a pending completion while the UI showed Complete Phase. RED test showed pendingConfirmation true plus status running rendered Complete Phase; moving the pending branch before manual completion fixed it and user verified the issue resolved.

## Prevention Or Recovery

Decisive signal: RED component test rendered only Complete Phase for pendingConfirmation true with status running.

False starts:
- Initial interpretation focused on missing confirmation prompt placement; live evidence showed the component had confirm controls but branch priority hid them when lifecycle status was stale.

Rejected paths:
_No rejected paths recorded._

## Exceptions

_No exceptions recorded yet._
