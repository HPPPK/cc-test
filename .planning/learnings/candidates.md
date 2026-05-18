# Candidate Learnings

Passive candidate learnings captured from `sp-xxx` workflows.

---

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

## Managed Entries

### LRN-20260517-060855-616522 - Runtime-scoped teammate model/provider fixes must make every model selector read through the runtime env overlay, not process.env directly.

- Status: `candidate`
- Type: `pitfall`
- Source Command: `sp-debug`
- Recurrence Key: `runtime-env-overlay-model-selection`
- Scope: `implementation-heavy`
- Applies To: sp-debug,implement
- Signal: `high`
- Occurrence Count: 1
- First Seen: `2026-05-17T06:08:55Z`
- Last Seen: `2026-05-17T06:08:55Z`

#### Evidence

sp-debug teammate-deepseek-runtime-chat: getAgentModel read process.env.CLAUDE_CODE_SUBAGENT_MODEL directly, bypassing runWithRuntimeEnv masking and overriding teammate provider/model selection until changed to getRuntimeEnvValue().

#### Structured Learning

- Decisive Signal: RED test with CLAUDE_CODE_SUBAGENT_MODEL=haiku plus overlay masking still returned haiku before patch.
- Root Cause Family: `runtime-env-bypass`

