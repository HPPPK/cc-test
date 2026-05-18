# Project Learning Index

Thin first-read index of reusable engineering lessons for later `sp-xxx` workflows.

Read this file after `.specify/memory/project-rules.md` and before command-local
context. Open only the linked detail documents whose `applies_to` or
`trigger_signals` match the current work.

---

<!-- SPECKIT_LEARNING_DATA_BEGIN -->
[
  {
    "id": "learn-2026-05-17-runtime-env-overlay-model-selection-cd8d4e2949",
    "problem": "Runtime-scoped teammate model/provider fixes must make every model selector read through the runtime env overlay, not process.env directly.",
    "lesson": "sp-debug teammate-deepseek-runtime-chat: getAgentModel read process.env.CLAUDE_CODE_SUBAGENT_MODEL directly, bypassing runWithRuntimeEnv masking and overriding teammate provider/model selection until changed to getRuntimeEnvValue().",
    "learning_type": "pitfall",
    "source_command": "sp-debug",
    "recurrence_key": "runtime-env-overlay-model-selection",
    "applies_to": [
      "sp-debug,implement"
    ],
    "trigger_signals": [
      "RED test with CLAUDE_CODE_SUBAGENT_MODEL=haiku plus overlay masking still returned haiku before patch.",
      "high",
      "pitfall",
      "runtime-env-bypass"
    ],
    "detail": "./learn-2026-05-17-runtime-env-overlay-model-selection-cd8d4e2949.md",
    "first_seen": "2026-05-17T06:08:55Z",
    "last_seen": "2026-05-17T06:08:55Z",
    "occurrence_count": 1,
    "signal_strength": "high"
  },
  {
    "id": "learn-2026-05-17-desktop-official-provider-host-managed-env-2ef2c97f64",
    "problem": "Desktop official provider mode must set host-managed provider routing so stale cc-haha settings env cannot override OAuth.",
    "lesson": "sp-debug desktop-message-no-reply: official mode set CLAUDE_CODE_ENTRYPOINT but not CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST, so managedEnv.ts still applied stale ~/.claude/cc-haha/settings.json provider env and the SDK used an invalid API key.",
    "learning_type": "pitfall",
    "source_command": "sp-debug",
    "recurrence_key": "desktop-official-provider-host-managed-env",
    "applies_to": [
      "sp-debug",
      "implement",
      "provider-runtime",
      "desktop"
    ],
    "trigger_signals": [
      "/api/providers reports activeId null/providers [] while desktop SDK diagnostics show provider 401.",
      "local terminal Claude Code works but desktop chat does not reply.",
      "~/.claude/cc-haha/settings.json contains stale ANTHROPIC_* provider env.",
      "runtime-env-bypass"
    ],
    "detail": "./learn-2026-05-17-desktop-official-provider-host-managed-env-2ef2c97f64.md",
    "first_seen": "2026-05-17T07:39:50Z",
    "last_seen": "2026-05-17T07:39:50Z",
    "occurrence_count": 1,
    "signal_strength": "high"
  }
]
<!-- SPECKIT_LEARNING_DATA_END -->

## Managed Entries

### learn-2026-05-17-runtime-env-overlay-model-selection-cd8d4e2949 - Runtime-scoped teammate model/provider fixes must make every model selector read through the runtime env overlay, not process.env directly.

- Type: `pitfall`
- Source Command: `sp-debug`
- Recurrence Key: `runtime-env-overlay-model-selection`
- Applies To: sp-debug,implement
- Trigger Signals: RED test with CLAUDE_CODE_SUBAGENT_MODEL=haiku plus overlay masking still returned haiku before patch., high, pitfall, runtime-env-bypass
- Signal: `high`
- Occurrence Count: 1
- First Seen: `2026-05-17T06:08:55Z`
- Last Seen: `2026-05-17T06:08:55Z`
- Detail: `./learn-2026-05-17-runtime-env-overlay-model-selection-cd8d4e2949.md`

#### Lesson

sp-debug teammate-deepseek-runtime-chat: getAgentModel read process.env.CLAUDE_CODE_SUBAGENT_MODEL directly, bypassing runWithRuntimeEnv masking and overriding teammate provider/model selection until changed to getRuntimeEnvValue().

### learn-2026-05-17-desktop-official-provider-host-managed-env-2ef2c97f64 - Desktop official provider mode must set host-managed provider routing so stale cc-haha settings env cannot override OAuth.

- Type: `pitfall`
- Source Command: `sp-debug`
- Recurrence Key: `desktop-official-provider-host-managed-env`
- Applies To: sp-debug, implement, provider-runtime, desktop
- Trigger Signals: /api/providers reports activeId null/providers [] while desktop SDK diagnostics show provider 401., local terminal Claude Code works but desktop chat does not reply., ~/.claude/cc-haha/settings.json contains stale ANTHROPIC_* provider env., runtime-env-bypass
- Signal: `high`
- Occurrence Count: 1
- First Seen: `2026-05-17T07:39:50Z`
- Last Seen: `2026-05-17T07:39:50Z`
- Detail: `./learn-2026-05-17-desktop-official-provider-host-managed-env-2ef2c97f64.md`

#### Lesson

sp-debug desktop-message-no-reply: official mode set CLAUDE_CODE_ENTRYPOINT but not CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST, so managedEnv.ts still applied stale ~/.claude/cc-haha/settings.json provider env and the SDK used an invalid API key.

