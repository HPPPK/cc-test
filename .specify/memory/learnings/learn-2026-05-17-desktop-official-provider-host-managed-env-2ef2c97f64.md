# Desktop official provider mode must mark provider routing as host-managed.

<!-- SPECKIT_LEARNING_DATA_BEGIN -->
[
  {
    "id": "LRN-20260517-073950-2EF2C9",
    "summary": "Desktop official provider mode must set host-managed provider routing so stale cc-haha settings env cannot override OAuth.",
    "learning_type": "pitfall",
    "source_command": "sp-debug",
    "evidence": "Desktop diagnostics showed SDK 401 invalid API key while /api/providers reported official mode. The child CLI applied stale ~/.claude/cc-haha/settings.json ANTHROPIC_* env because official mode set CLAUDE_CODE_ENTRYPOINT but not CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST, so managedEnv.ts did not filter provider-routing settings env.",
    "recurrence_key": "desktop-official-provider-host-managed-env",
    "default_scope": "implementation-heavy",
    "applies_to": [
      "sp-debug",
      "implement",
      "provider-runtime",
      "desktop"
    ],
    "signal_strength": "high",
    "status": "candidate",
    "first_seen": "2026-05-17T07:39:50Z",
    "last_seen": "2026-05-17T07:39:50Z",
    "occurrence_count": 1,
    "pain_score": 0,
    "false_starts": [
      "Initial evidence looked like a user config issue because provider auth failed with an invalid key.",
      "The decisive code path was not ProviderService.activateOfficial(), but child CLI env filtering during official-mode startup."
    ],
    "rejected_paths": [
      "Do not auto-edit ~/.claude/cc-haha/settings.json during diagnosis; protected user config should not be mutated without explicit consent."
    ],
    "decisive_signal": "providers.json had activeId null/providers [] while diagnostics still showed stale provider auth key tail e99b reaching the SDK.",
    "root_cause_family": "runtime-env-bypass",
    "injection_targets": [],
    "promotion_hint": ""
  }
]
<!-- SPECKIT_LEARNING_DATA_END -->

## Problem

Desktop official provider mode can appear active while stale provider-routing env remains in `~/.claude/cc-haha/settings.json`.

## Lesson

Official desktop child processes must mark provider routing as host-managed (`CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST=1`) in addition to setting `CLAUDE_CODE_ENTRYPOINT=claude-desktop`. Otherwise `managedEnv.ts` will still apply cc-haha settings env and stale `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` can override official OAuth.

## When To Apply

sp-debug, implement, provider-runtime, desktop

## Trigger Signals

- `/api/providers` reports `activeId: null` and no active provider.
- Desktop diagnostics show SDK/provider 401 errors from an API key or auth token.
- Local terminal Claude Code works, but desktop chat does not reply.
- `~/.claude/cc-haha/settings.json` contains provider-routing env in official mode.

## Evidence

Desktop diagnostics recorded `authentication_failed` / HTTP 401 for key tail `e99b`. Live provider state showed official mode (`providers: []`, `activeId: null`), but sanitized cc-haha settings still contained provider env. Code inspection showed settings-sourced provider env is filtered only when `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST` is truthy.

## Prevention Or Recovery

Add a regression test for `providers.json` with `{ "activeId": null, "providers": [] }` plus stale cc-haha settings env. Assert official mode sets both `CLAUDE_CODE_ENTRYPOINT=claude-desktop` and `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST=1`.

False starts:

- Treating the failure purely as invalid local user config misses the runtime filtering bug.

Rejected paths:

- Do not silently mutate protected provider/settings files as part of the fix.

## Exceptions

Legacy env-only custom provider mode without a providers index remains supported; do not force host-managed official mode solely because cc-haha settings env exists.
