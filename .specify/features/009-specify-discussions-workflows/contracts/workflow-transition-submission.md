# Contract: Workflow Transition And Completion Submission

## Purpose

Define how agents and users complete, block, retry, confirm, reject, or manually complete workflow phases without conflating lifecycle state with completion attempt status.

## Completion Submission

The workflow-only completion tool accepts:

```json
{
  "phaseId": "plan",
  "stateVersion": 7,
  "status": "ready",
  "handoff": {
    "summary": "Planning artifacts are ready.",
    "artifacts": []
  },
  "rationale": "All required planning artifacts were generated and reviewed.",
  "evidence": [
    {
      "kind": "artifact",
      "ref": ".specify/features/009-specify-discussions-workflows/plan.md"
    }
  ]
}
```

Required fields:

- `phaseId`
- `stateVersion`
- `status`
- `handoff`
- `rationale`
- `evidence`

Allowed statuses:

- `ready`
- `blocked`
- `unable`

## Ready Behavior

When status is `ready`:

- validate phase id matches active phase
- validate stateVersion if provided
- reject duplicate ready submission while pending confirmation exists
- record completion artifact
- if user confirmation is required, set phase/session to `pending-confirmation`
- if auto authority is allowed, advance or complete workflow
- append transition history

## Blocked And Unable Behavior

When status is `blocked` or `unable`:

- keep phase/session recoverable inside `running`
- record reason/evidence
- clear pending confirmation
- append transition history with result `blocked` or `unable`
- notify runtime UI that retry is available
- do not expose advancement controls

## Pending Confirmation Contract

Pending confirmation stores:

- `confirmationId`
- `phaseId`
- `fromPhaseId`
- `toPhaseId`
- `completionCheckId`
- `artifactRefs`
- `createdAt`
- `status`
- optional original submission

Allowed actions:

- Confirm: accept pending artifacts and advance/complete.
- Reject: reject pending artifacts and return to running.
- Retry: supersede pending artifacts and return to running.

No other advancement controls should appear while pending.

## Manual Completion Contract

Manual completion is a user override, not the same as confirming an agent-ready pending submission.

Manual completion must:

- collect summary and optional evidence
- submit action `manual_complete`
- use stateVersion
- record accepted artifact evidence
- advance only after explicit confirmation by the user

## StateVersion And Idempotency

- Stale stateVersion returns conflict.
- Existing transition ids should be safe to retry without duplicating state changes.
- Artifact lifecycle updates should be idempotent by artifact id and transition context.

## UI Contract

Desktop controls must:

- show Confirm, Reject, Retry for pending confirmation
- show manual completion only for running phases with user-confirmation authority and no pending confirmation
- show Retry only for blocked/unable/failed completion states
- not show confirm/complete for blocked or unable outcomes
- include stateVersion and transitionId in commands
- prioritize `pendingConfirmation` over stale `running` status

## Final Report Contract

Final reports must preserve:

- accepted completion artifacts
- transition provenance
- materially relevant recommended skill audit
- model resolution when available
- final status and verification result

## Stop And Reopen Conditions

- `blocked` or `unable` becomes terminal workflow failure.
- Pending ready submissions can overwrite an existing pending confirmation.
- UI allows advancement while blocked/unable.
- Manual completion is confused with confirming an agent-ready submission.
- Completion evidence is lost across resume, compaction, or final report generation.
