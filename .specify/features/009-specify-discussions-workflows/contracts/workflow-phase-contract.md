# Contract: Workflow Phase Execution Contract

## Purpose

Define the template and runtime contract for a workflow phase. A phase is not only prose: it carries intent, execution rules, evidence expectations, transition authority, recommended skills, and runtime state behavior.

## Template Contract

### Compatibility Projection

Existing flat template fields must project into grouped semantics:

```json
{
  "intent": {
    "objective": "string",
    "role": "string",
    "intake": ["string"]
  },
  "contract": {
    "instructions": "string",
    "executionRules": ["string"],
    "actionPolicy": {
      "allowedActions": ["string"],
      "forbiddenActions": ["string"]
    },
    "transitionAuthority": "auto | user-confirmation"
  },
  "evidencePolicy": {
    "outputArtifact": {
      "id": "string",
      "name": "string",
      "kind": "string",
      "description": "string",
      "required": true
    },
    "requiredArtifacts": [],
    "completionCriteria": {
      "type": "manual-checklist | artifact-required | agent-reported",
      "description": "string"
    },
    "handoffRules": ["string"]
  }
}
```

This projection is allowed to be computed from existing fields. It must not require destructive persistence migration in first scope.

## Constraint Strengths

| Strength | Meaning | Runtime Behavior | Examples |
| --- | --- | --- | --- |
| guidance | Helps the agent choose how to work | Prompt emphasis only | Objective, role, background |
| policy | Defines allowed or forbidden actions | Prompt/tool policy and reviewable constraints | Action policy, safety restrictions |
| evidence | Defines proof required for completion | Completion submission and report evidence | Required artifacts, relevant skill audit |
| gate | Blocks transition when unmet | Runtime validation or user confirmation | stateVersion, required completion fields, pending confirmation |

Hard gates must remain sparse and explainable. Do not convert every instruction into a hard gate.

## Recommended Skill Bindings

Recommended phase skills are stored as `WorkflowPhaseSkillReference`:

```json
{
  "name": "sp-specify",
  "mode": "recommended",
  "source": "project",
  "pluginName": null,
  "namespace": null,
  "version": null,
  "contentHash": null,
  "referenceId": null,
  "reason": "Use when the phase needs formal specification alignment."
}
```

Rules:

- `name` is required.
- `mode` defaults to `recommended` and no other mode is valid in this scope.
- `source` and provenance fields disambiguate portability and duplicate names.
- Unknown fields are preserved when accepted by validation.
- Plugin identity is provenance/dependency metadata, not the primary target.

## Runtime Contract

Runtime prompt assembly must include:

- active phase id and instructions
- grouped phase prompt/context where available
- action policy
- recommended skill statuses for the active phase
- required artifacts
- completion criteria
- prior artifact summaries when available
- model request/fallback information when available

Runtime state remains session-owned:

- active phase status
- pending confirmation
- artifact lifecycle
- transition history
- skill snapshots and relevant evidence
- final report pointers

## Permission Boundary

Recommended skills do not:

- grant tools
- enable SkillTool globally
- invoke SkillTool automatically
- change model or effort
- fork agents
- install hooks
- bypass permission checks

Any actual skill invocation must go through the normal SkillTool validation and permission path.

## Validation Contract

Authoring, update, import, and session start paths must validate:

- valid phase ids and names
- required output artifact
- handoff intake and handoff rules
- valid completion criteria
- valid transition authority
- valid recommended skill references
- unknown-field preservation

## Stop And Reopen Conditions

- A design requires direct grouped persistence migration.
- Recommended skills become auto-executed or required by default.
- Workflow references bypass SkillTool permissions.
- Runtime state becomes editable template data.
- Invalid skill references are downgraded to silent warnings.
