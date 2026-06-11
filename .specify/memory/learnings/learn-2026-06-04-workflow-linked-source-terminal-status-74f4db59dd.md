# Completed workflow sessions need terminal-source handling in linked workflow validation

<!-- SPECKIT_LEARNING_DATA_BEGIN -->
[
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
  }
]
<!-- SPECKIT_LEARNING_DATA_END -->

## Problem

Completed workflow sessions need terminal-source handling in linked workflow validation

## Lesson

A desktop plus-menu continuation exposed completed workflow sessions, but WorkflowSessionLinkService rejected every source with workflow.mode == workflow. RED server test received 400; fix allowed status completed while guard tests preserved non-completed rejection.

## When To Apply

sp-debug

## Trigger Signals

- Checking only the desktop launcher made the Workflows entry visible but left the server source-session guard unchanged.
- POST /api/sessions/:id/workflow/start returned WORKFLOW_SOURCE_INVALID for a session whose workflow metadata was completed.
- cross-layer-state-contract-drift
- high
- state_surface_gap

## Evidence

A desktop plus-menu continuation exposed completed workflow sessions, but WorkflowSessionLinkService rejected every source with workflow.mode == workflow. RED server test received 400; fix allowed status completed while guard tests preserved non-completed rejection.

## Prevention Or Recovery

Decisive signal: POST /api/sessions/:id/workflow/start returned WORKFLOW_SOURCE_INVALID for a session whose workflow metadata was completed.

False starts:
- Checking only the desktop launcher made the Workflows entry visible but left the server source-session guard unchanged.

Rejected paths:
_No rejected paths recorded._

## Exceptions

_No exceptions recorded yet._
