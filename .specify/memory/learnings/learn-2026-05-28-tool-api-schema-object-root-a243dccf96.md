# API-bound tool schemas must expose a top-level object root even when runtime Zod validation uses a discriminated union.

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
  }
]
<!-- SPECKIT_LEARNING_DATA_END -->

## Problem

API-bound tool schemas must expose a top-level object root even when runtime Zod validation uses a discriminated union.

## Lesson

workflow_template_authoring caused provider 400 because z.discriminatedUnion converted to top-level oneOf with no type object; fix added explicit inputJSONSchema and regression through toolToAPISchema.

## When To Apply

sp-debug, sp-implement

## Trigger Signals

- high
- provider-tool-schema-contract
- recovery_path
- toolToAPISchema output lacked input_schema.type before fix; focused test passed after explicit inputJSONSchema.

## Evidence

workflow_template_authoring caused provider 400 because z.discriminatedUnion converted to top-level oneOf with no type object; fix added explicit inputJSONSchema and regression through toolToAPISchema.

## Prevention Or Recovery

Decisive signal: toolToAPISchema output lacked input_schema.type before fix; focused test passed after explicit inputJSONSchema.

False starts:
_No false starts recorded._

Rejected paths:
_No rejected paths recorded._

## Exceptions

_No exceptions recorded yet._
