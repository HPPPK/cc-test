# Retry the smallest recorded recovery step and rerun scoped checks before resolving a quick task

<!-- SPECKIT_LEARNING_DATA_BEGIN -->
[
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
  }
]
<!-- SPECKIT_LEARNING_DATA_END -->

## Problem

Retry the smallest recorded recovery step and rerun scoped checks before resolving a quick task

## Lesson

Observed auto-capture evidence from quick STATUS.md

## When To Apply

sp-debug, sp-implement, sp-quick

## Trigger Signals

- medium
- recovery_path

## Evidence

Observed auto-capture evidence from quick STATUS.md
- workspace: .planning\quick\20260604-workflow-plus-menu-continuation
- status: resolved
- retry_attempts: 2
- goal: Let users start another workflow from a completed workflow session through the current session plus menu while preserving current conversation context.
- next_action: Optional browser/manual verification or broader desktop check if desired.
- blocker_reason: none
- recovery_action: none
- completed_checks: RED failed before production change because the Workflows button was absent., GREEN passed after production change: 1 test passed, 24 skipped.

## Prevention Or Recovery

Decisive signal: not recorded

False starts:
_No false starts recorded._

Rejected paths:
_No rejected paths recorded._

## Exceptions

_No exceptions recorded yet._
