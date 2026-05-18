# Runtime-scoped teammate model/provider fixes must make every model selector read through the runtime env overlay, not process.env directly.

<!-- SPECKIT_LEARNING_DATA_BEGIN -->
[
  {
    "id": "LRN-20260517-060855-616522",
    "summary": "Runtime-scoped teammate model/provider fixes must make every model selector read through the runtime env overlay, not process.env directly.",
    "learning_type": "pitfall",
    "source_command": "sp-debug",
    "evidence": "sp-debug teammate-deepseek-runtime-chat: getAgentModel read process.env.CLAUDE_CODE_SUBAGENT_MODEL directly, bypassing runWithRuntimeEnv masking and overriding teammate provider/model selection until changed to getRuntimeEnvValue().",
    "recurrence_key": "runtime-env-overlay-model-selection",
    "default_scope": "implementation-heavy",
    "applies_to": [
      "sp-debug,implement"
    ],
    "signal_strength": "high",
    "status": "candidate",
    "first_seen": "2026-05-17T06:08:55Z",
    "last_seen": "2026-05-17T06:08:55Z",
    "occurrence_count": 1,
    "pain_score": 0,
    "false_starts": [],
    "rejected_paths": [],
    "decisive_signal": "RED test with CLAUDE_CODE_SUBAGENT_MODEL=haiku plus overlay masking still returned haiku before patch.",
    "root_cause_family": "runtime-env-bypass",
    "injection_targets": [],
    "promotion_hint": ""
  }
]
<!-- SPECKIT_LEARNING_DATA_END -->

## Problem

Runtime-scoped teammate model/provider fixes must make every model selector read through the runtime env overlay, not process.env directly.

## Lesson

sp-debug teammate-deepseek-runtime-chat: getAgentModel read process.env.CLAUDE_CODE_SUBAGENT_MODEL directly, bypassing runWithRuntimeEnv masking and overriding teammate provider/model selection until changed to getRuntimeEnvValue().

## When To Apply

sp-debug,implement

## Trigger Signals

- RED test with CLAUDE_CODE_SUBAGENT_MODEL=haiku plus overlay masking still returned haiku before patch.
- high
- pitfall
- runtime-env-bypass

## Evidence

sp-debug teammate-deepseek-runtime-chat: getAgentModel read process.env.CLAUDE_CODE_SUBAGENT_MODEL directly, bypassing runWithRuntimeEnv masking and overriding teammate provider/model selection until changed to getRuntimeEnvValue().

## Prevention Or Recovery

Decisive signal: RED test with CLAUDE_CODE_SUBAGENT_MODEL=haiku plus overlay masking still returned haiku before patch.

False starts:
_No false starts recorded._

Rejected paths:
_No rejected paths recorded._

## Exceptions

_No exceptions recorded yet._
