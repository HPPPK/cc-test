# Debug Session: Model Switch CLI Startup 143 And Desktop UI Squares

## Status
- stage: awaiting_human_verify
- created_at: 2026-06-15
- reporter: user
- symptom: Desktop session model switch fails with `Failed to switch provider/model: CLI exited during startup with code 143`; UI text appears as square boxes and the screen/window is too small to use.
- classification: new_issue
- execution_model: leader-inline
- dispatch_shape: leader-inline
- execution_surface: leader-inline
- dispatch_reason: Small focused first evidence chain after project cognition returned a constrained minimal live-read set; no safe independent subagent lane is needed before ownership is proven.
- blocked_reason:

## Project Cognition Intake
- readiness: review
- freshness: partial_refresh
- baseline_kind: brownfield_full
- lexicon_generation_id: GEN-20260610T112843.959253900Z
- selected_concepts:
  - concept:GEN-20260610T112843.959253900Z:N-030
- selection_reason: Broad coverage/path-universe concept was the only candidate covering desktop/server paths; it is not treated as evidence of ownership.
- rejected_concepts:
  - concept:GEN-20260610T112843.959253900Z:N-GIT-001
  - concept:GEN-20260610T112843.959253900Z:N-GIT-004
  - concept:GEN-20260610T112843.959253900Z:N-GIT-003
  - concept:GEN-20260610T112843.959253900Z:N-017
  - concept:GEN-20260610T112843.959253900Z:N-001
  - concept:GEN-20260610T112843.959253900Z:N-011
  - concept:GEN-20260610T112843.959253900Z:N-016
  - concept:GEN-20260610T112843.959253900Z:N-012
  - concept:GEN-20260610T112843.959253900Z:N-GIT-002
- semantic_intake:
  - normalized_query: Desktop chat session model selector fails to switch provider/model. The desktop service starts or restarts a CLI session with `runtimeOverride.providerId/modelId`, but the CLI exits during startup with code 143 and no stderr/stdout. Separately inspect desktop UI font/glyph fallback and minimum viewport/window sizing because the reporter sees square boxes and an unusably small screen.
  - intent_facets:
    - desktop chat model selector provider/model switch path
    - server session startup runtimeOverride providerId/modelId handling
    - provider registry/model catalog DeepSeek model id validation
    - diagnostic error construction for CLI startup exit code 143
    - desktop UI font/glyph fallback and minimum viewport/window sizing
  - negative_constraints:
    - Do not assume live DeepSeek credentials or quota are available.
    - Do not mutate user-owned provider settings, tokens, transcripts, or OAuth state.
    - Do not hide the startup failure with a UI-only message change.
    - Treat project cognition as weak navigation; live code and tests must prove claims.
- repository_search_terms:
  - ModelSelector
  - Failed to switch provider/model
  - runtimeOverride
  - activeProviderId
  - configuredProviders
  - deepseek-v4-flash
  - CLI exited during startup
  - code 143
  - font-family
  - min-width
  - min-height
  - window
- minimal_live_reads:
  - desktop/src/components/controls/ModelSelector.tsx
  - desktop/src/api/sessions.ts
  - desktop/src/stores
  - src/server
  - src/utils/sessionStart.ts
  - src/utils/runtimeEnv.ts
  - desktop/src/App.tsx
  - desktop/src/index.css
  - desktop/src-tauri/tauri.conf.json
  - .env.example
- coverage_gaps:
  - Project cognition does not directly name the model-switch owner or code-143 owner.
  - UI square-glyph report may be browser font loading, OS font fallback, or an encoded message rendering issue; live evidence required.

## Intake Gate
- causal_map_completed: true
- investigation_contract_completed: true
- log_investigation_plan_completed: true
- observer_framing_completed: true
- skip_observer_reason: map-backed-minimum-intake

## Causal Map
- symptom_anchor: Provider/model switch in desktop session fails before CLI startup emits stdout/stderr; separate visible UI render issues make the desktop screen hard to use.
- closed_loop_path: user selects provider/model -> desktop `ModelSelector`/session API submits runtime override -> server validates provider/model and starts CLI runtime -> CLI receives env/provider settings and starts session -> server publishes success/error back to desktop -> UI renders current model/error/status.
- break_edges:
  - desktop model selection may send stale or incomplete provider/model override.
  - server/provider registry may reject or mis-shape configured provider data before CLI startup.
  - CLI runtime may receive an environment or model selector that causes early termination with code 143.
  - desktop UI may be using missing local fonts or too-small min dimensions, producing square glyphs and unusable layout.
- bypass_paths:
  - Existing active provider can still work when no runtime override is sent.
  - A direct CLI launch outside desktop may work if desktop runtime override shaping is the failure.
  - UI square glyphs may occur even if model switching is fixed.
- family_coverage:
  - family: model-switch payload/state mismatch
    falsifier: focused test or live trace shows ModelSelector sends correct provider/model IDs and server receives them unchanged.
  - family: server startup/runtime override handling
    falsifier: server test starts a session with DeepSeek override and produces the expected provider/model env without exit-path diagnostics.
  - family: provider/model catalog mismatch
    falsifier: configured DeepSeek provider includes `deepseek-v4-flash` and startup path accepts it.
  - family: desktop font/window layout
    falsifier: CSS/Tauri config includes valid font fallback and minimum window constraints; screenshot/browser test renders CJK text and usable layout at small viewport.
- candidate_board:
  - C1: Server startup path terminates/restarts the CLI with the selected runtime override but surfaces only generic code 143 diagnostics.
  - C2: ModelSelector/session API sends a provider ID/model ID pair that is not validated against the configured provider before startup.
  - C3: Provider environment mapping for custom/DeepSeek providers misses required variables or command args during startup.
  - C4: Desktop local font stack or Tauri window constraints cause square glyphs and too-small layout.
- adjacent_risk_targets:
  - Existing session resume and active provider state.
  - Provider settings import/export and unknown fields.
  - Desktop chat error reporting and session lifecycle.
  - Tauri window config and web CSS used by all desktop views.

## Observer Framing
- primary_suspected_loop: Runtime override from desktop model switch reaches server CLI startup without enough preflight validation/diagnostics, so startup exits before emitting useful payload.
- primary_candidate: C1
- contrarian_candidate: C4, because the user's message emphasizes square glyphs and unusably small screen as a separate blocking UI path.
- recommended_first_probe: Inspect minimal live reads for the model switch request path, server runtime override handling, and UI font/window constraints; search only within the returned surfaces first.
- candidate_separating_signals:
  - If desktop sends correct IDs and server preflights them, focus on CLI env/startup and diagnostics.
  - If IDs/model catalog are mismatched, fix validation before startup.
  - If UI font/window constraints are missing, fix independently with desktop tests.

## Transition Memo
- first_candidate_to_test: C1
- why_first: The reported error includes server-generated diagnostics with `runtimeOverride`, `activeProviderId`, and `configuredProviders`, so the failure is already inside the model-switch/startup loop.
- evidence_unlock:
  - Locate the error construction and the startup code-143 handling.
  - Locate where runtimeOverride provider/model is validated and converted to CLI environment.
  - Locate desktop ModelSelector request call and UI rendering constraints.
- carry_forward_notes:
  - Keep provider settings and credentials user-owned.
  - Add regression coverage in the same surface as any production change.

## Investigation Contract
- primary_candidate_id: C1
- candidate_queue:
  - C1: server CLI startup/runtime override handling and diagnostic path
  - C2: desktop ModelSelector/session API payload mismatch
  - C3: provider/model catalog/env mapping mismatch
  - C4: desktop font/window minimum constraints
- related_risk_targets:
  - session resume after provider switch
  - provider registry active/default selection
  - desktop responsive layout and CJK rendering
  - error messages that may leak secrets
- required_success_evidence:
  - failing regression test before production change when a reliable automated surface exists
  - focused passing test after fix
  - same-area desktop/server check based on touched files

## Log Investigation Plan
- existing_log_targets:
  - current error text from reporter
  - server/session startup code and any existing tests around provider switching
  - desktop API/client tests around sessions/model selector
- candidate_signal_mapping:
  - C1: error builder references `CLI exited during startup`, exit code handling, captured stderr/stdout, SDK payload absence.
  - C2: request payload contains provider/model IDs and session/workDir.
  - C3: provider registry and runtime env conversion include DeepSeek/custom providers and model ID.
  - C4: CSS `@font-face`, `font-family`, min viewport, Tauri `minWidth`/`minHeight`.
- observability_escalation: If no test or code path reveals the early exit mechanism, add redacted startup diagnostics around provider/model preflight before changing behavior.

## Senior Consequence Analysis
### Affected Object Map
- desktop session model selector: user-visible control for provider/model switching.
- desktop sessions API/client/store: request/response and error surface.
- server session startup endpoint/service: truth owner for accepting runtime overrides and launching CLI.
- CLI runtime process: spawned worker whose exit code determines switch success.
- provider registry/config records: user-owned settings and model catalog.
- desktop CSS/Tauri window config: user-visible rendering, fonts, and minimum usable area.
- transcripts/session state: downstream consumers must not be mutated by repair paths.

### State-Behavior Matrix
- created: session should use selected provider/model or default active provider with clear validation errors before launch.
- running: switching provider/model should not corrupt active session state; failure should preserve previous usable state.
- failed: startup failure should surface actionable non-secret diagnostics.
- cancelled/terminated: code 143-like termination must be distinguished from validation failure where possible.
- resumed: session resume should preserve configured runtime truth and not silently switch providers.
- missing/stale provider: model switch should fail before launch with provider/model context, not start a doomed CLI.
- small viewport/font missing: desktop should remain readable and layout-constrained.

### Dependency Impact Table
- direct dependencies: `ModelSelector`, sessions API, server startup, provider config, runtime env, Tauri/CSS.
- indirect consumers: chat view, status bar/model display, provider settings, session resume, quality smoke tests.
- shared state: provider config files and session records are user-owned and protected.
- compatibility surfaces: provider/model IDs, error response shapes, desktop CSS/Tauri config.
- validation routes: focused server/desktop unit tests, `bun run check:server`, `bun run check:desktop`, `bun run verify` when feasible.
- adjacent workflows: provider settings import/export, live provider smoke, desktop agent-browser smoke.

### Recovery And Validation Contract
- rollback: keep changes narrowly scoped so previous provider/session behavior can be reverted cleanly.
- retry/idempotency: failed switch should be retryable without changing provider config or transcripts.
- cleanup: do not delete sessions, provider records, tokens, OAuth, or transcripts.
- migration: none expected unless persisted settings shape changes; persisted shape changes require fixture migration tests.
- observability: startup diagnostics must avoid secrets while showing provider/model IDs and branch context.
- validation: prove RED, apply minimal fix, run focused tests, run same-area check, report any live-provider blocker.

### Coverage Gaps
- Gap G1: No live provider credentials/DeepSeek quota are assumed. Owner: maintainer/user. Latest safe phase: live baseline. Routing: continue with mock/fixture tests and report live blocker if needed.
- Gap G2: User's exact desktop screenshot/window state is unavailable. Owner: user for final visual confirmation. Latest safe phase: human verification. Routing: continue with CSS/config checks and automated render where feasible.
- Gap G3: Cognition graph coverage is broad and partial-refresh. Owner: workflow closeout/update. Latest safe phase: finalization. Routing: continue with live evidence and inline cognition update after mutations.

### Consequence Obligations
- CA-001: Preserve user-owned provider settings, credentials, OAuth, transcripts, and session records. Affected objects: provider config, session state. Owner workflow: sp-debug. Latest resolve phase: fix. Status: satisfied_by_scope. Stop-and-reopen: any repair path mutates protected state.
- CA-002: Validate provider/model override before or during startup without masking real CLI failures. Affected objects: sessions API, server startup, CLI runtime. Owner workflow: sp-debug. Latest resolve phase: verify. Status: partially_satisfied_mocked; live DeepSeek startup remains a human/provider credential verification gap. Stop-and-reopen: tests only assert UI wording while startup loop remains broken.
- CA-003: Keep failed model switch retryable and preserve previous active provider/session state. Affected objects: desktop model selector, server session lifecycle. Owner workflow: sp-debug. Latest resolve phase: verify. Status: satisfied_by_tests. Stop-and-reopen: failed switch leaves session in corrupted or ambiguous state.
- CA-004: Desktop UI must remain readable for CJK/error text and usable at configured minimum dimensions. Affected objects: CSS, Tauri config, chat/session UI. Owner workflow: sp-debug. Latest resolve phase: human verification. Status: awaiting_human_verify. Stop-and-reopen: automated tests pass but user still sees square glyphs or unusably small window.

## Truth Ownership Map
- decision_truth_owner: server session startup/runtime selection path owns whether a provider/model override is valid and what CLI environment/arguments are launched.
- reflected_or_cached_layers:
  - desktop ModelSelector reflects available provider/model choices and sends requested override.
  - desktop UI reflects success/failure and current selection.
  - logs/error messages reflect process startup outcome.
- supporting_evidence: pending live reads.

## Control State And Observation State
- Control State:
  - selected providerId/modelId override
  - active provider ID
  - configured provider registry and model catalog
  - CLI process startup state and exit code
- Observation State:
  - desktop selected model label
  - toast/error text
  - server diagnostics string
  - visible glyph rendering and window size

## Current Focus
Run same-area quality checks after focused GREEN tests for server runtime rollback, desktop runtime-selection rollback, app zoom readability, and CJK font fallback.

## Evidence
- E1: User-reported error includes `runtimeOverride.providerId: f30580fb-6ac6-4f2c-b812-4939f5e87a54`, `runtimeOverride.modelId: deepseek-v4-flash`, active provider OpenAI, configured providers OpenAI/GLM/DeepSeek/小米mimo, and CLI startup exit code 143 with no captured stderr/stdout.
- E2: Project cognition returned readiness `review`, freshness `partial_refresh`, broad selected concept `N-030`, and minimal live reads including ModelSelector, sessions API, server, sessionStart/runtimeEnv, app CSS, and Tauri config.
- E3: `src/server/ws/handler.ts` handles `set_runtime_config` by writing `runtimeOverrides.set(sessionId, nextOverride)` before restart, then `restartSessionWithRuntimeConfig` calls `conversationService.stopSession(sessionId)` before `startSession`; the catch path sends an error but does not restore the previous override.
- E4: `ensureCliSessionStarted` reads `getRuntimeSettings(sessionId)` from `runtimeOverrides` when a later user turn starts a missing CLI session, so a failed override can become the next startup truth.
- E5: Desktop `ModelSelector` immediately persists the selected runtime in `useSessionRuntimeStore` and sends `set_runtime_config`; `chatStore.connectToSession` replays saved runtime selection on reconnect.
- E6: DeepSeek presets include `deepseek-v4-flash`, so the model ID itself is not absent from the built-in preset catalog.
- E7: Tauri config declares `minWidth: 960` and `minHeight: 640`; actual CSS entry is `desktop/src/theme/globals.css`, not the empty `desktop/src/index.css`.
- E8: `globals.css` self-hosts Latin/Latin-ext Inter/Manrope/JetBrains fonts and defines `--font-body: 'Inter', sans-serif`; CJK depends on system fallback. `appZoom.ts` can apply persisted zoom as low as `0.5`, which can make the desktop appear very small.
- E9: RED server regression in `src/server/__tests__/websocket-handler.test.ts` reproduced the stale runtime override: after a stable override succeeded and a bad override failed startup, later prewarm startup still used the bad model.
- E10: Server fix stores the previous runtime override and restores it on runtime restart failure after building diagnostics, so the failed override remains visible in the error but is not kept as control state.
- E11: RED desktop regressions in `desktop/src/stores/chatStore.test.ts` reproduced both local model-switch persistence and reconnect replay persistence of failed runtime selections.
- E12: Desktop fix records the previous saved runtime selection before switch/replay and restores or clears it when `CLI_RESTART_FAILED` arrives.
- E13: RED UI regressions proved persisted app zoom `0.5` was accepted and theme font tokens lacked explicit CJK fallback; GREEN fix raises `MIN_APP_ZOOM` to `0.8`, migrates/removes stale tiny zoom values through existing validation, and adds explicit CJK system fallback tokens.
- E14: Provider runtime mapping review found no obvious DeepSeek model ID drop: `ProviderService.getProviderRuntimeEnv` builds provider env with `ANTHROPIC_BASE_URL`, auth env, and role model envs; conversation startup then overrides `ANTHROPIC_MODEL` with the selected runtime model when a provider-scoped model is selected.
- E15: Focused full verification passed: `bun test src/server/__tests__/websocket-handler.test.ts` reported 28 passed; `cd desktop && bun run test -- src/stores/chatStore.test.ts src/stores/providerStore.test.ts src/components/controls/ModelSelector.test.tsx src/lib/appZoom.test.ts src/theme/globals.test.ts src/lib/persistenceMigrations.test.ts src/__tests__/generalSettings.test.tsx` reported 7 files and 158 tests passed, with existing React `act(...)` warnings in GeneralSettings tests.
- E16: Same-area checks passed after fixing a TypeScript helper signature: `bun run check:server` reported 1168 passed, 7 skipped, 0 failed; `bun run check:desktop` passed `tsc --noEmit`, 98 Vitest files / 872 tests, and Vite production build, with existing React `act(...)`/Tauri permission test warnings.
- E17: First `bun run verify` failed only the native lane because default `desktop/src-tauri/target/debug/claude-sidecar.exe` was locked by running repo desktop/sidecar processes. Re-running `check:native` with `CARGO_TARGET_DIR=target\quality-native-check` passed.
- E18: Re-running `bun run verify` with `CARGO_TARGET_DIR=target\quality-native-check` produced report `artifacts/quality-runs/2026-06-15T09-35-22-577Z/report.md`: passed=9, failed=0, skipped=2, coverage failures none. The script still exited 1 because the dirty worktree/impact policy marked PR readiness as NOT READY despite no failed lane.
- E19: `git diff --check` over this debug session's changed files exited 0; output only contained Git CRLF conversion warnings.

## Eliminated
- C2 as primary root cause: live tests show desktop can send correct provider/model IDs; the bug was failure rollback and replay behavior, not a missing request payload.
- C3 as obvious static mapping root cause: DeepSeek preset/model env paths exist and are covered by existing provider/preset tests. Live provider credentials/upstream behavior remain outside automated proof.

## Current Hypothesis
The confirmed defect is a failed provider/model switch corrupting control and observation state: the server left the failed runtime override as next-startup truth, while the desktop persisted and replayed the failed selection. The exact local reason the DeepSeek CLI startup returned code 143 still needs live provider verification, but the app must keep the previous usable model and make the failure retryable. The UI readability symptoms are explained by an overly low persisted zoom floor and missing explicit CJK fallback fonts.

## Reproduction Notes
- expected_behavior: Switching to a configured provider/model should either start the session with that provider/model or fail before launch with actionable, non-secret validation details while preserving prior session state.
- actual_behavior: Desktop reports model-switch failure after CLI exits during startup with code 143 and no captured output; UI is difficult to read/use due to square glyphs and small screen.
- reproduction_steps: covered by focused server and desktop regression tests; live reporter desktop confirmation remains pending.
- observed_errors:
  - `Failed to switch provider/model: CLI exited during startup with code 143; no CLI stderr/stdout or SDK error payload was captured before exit.`

## Root Cause
- status: confirmed_for_control_state_and_ui_readability
- details:
  - Server runtime switch wrote `runtimeOverrides` before restart and did not restore the previous override when `conversationService.startSession` failed.
  - Desktop runtime selection was persisted before the server confirmed restart success, then replayed on reconnect/startup.
  - App zoom accepted persisted values down to `0.5`, making the desktop appear too small.
  - Theme font tokens relied on generic `sans-serif` after Latin webfonts, which can render Chinese provider/error text as square glyphs on systems without a suitable fallback order.

## Fix Plan
- status: implemented_focused
- notes:
  - Restore prior server runtime override on runtime restart failure.
  - Restore or clear desktop saved runtime selection on `CLI_RESTART_FAILED`.
  - Pass previous runtime selection through model selector and provider refresh paths.
  - Raise minimum app zoom to `0.8` and validate stale persisted values through existing migration.
  - Add explicit CJK fallback font tokens to the desktop theme.

## Verification
- status: automated_lanes_passed_policy_blocked_by_dirty_worktree
- evidence:
  - RED then GREEN: `bun test src/server/__tests__/websocket-handler.test.ts -t "rolls back a failed runtime override before the next startup"`.
  - RED then GREEN: `cd desktop && bun run test -- src/stores/chatStore.test.ts -t "runtime selection"`.
  - GREEN: `cd desktop && bun run test -- src/components/controls/ModelSelector.test.tsx -t "runtime"`.
  - GREEN: `cd desktop && bun run test -- src/stores/providerStore.test.ts -t "runtime refresh"`.
  - RED then GREEN: `cd desktop && bun run test -- src/lib/appZoom.test.ts src/theme/globals.test.ts src/lib/persistenceMigrations.test.ts -t "zoom|CJK|app zoom"`.
  - RED then GREEN: `cd desktop && bun run test -- src/__tests__/generalSettings.test.tsx -t "UI zoom"`.
  - GREEN focused full: `bun test src/server/__tests__/websocket-handler.test.ts`.
  - GREEN focused full: `cd desktop && bun run test -- src/stores/chatStore.test.ts src/stores/providerStore.test.ts src/components/controls/ModelSelector.test.tsx src/lib/appZoom.test.ts src/theme/globals.test.ts src/lib/persistenceMigrations.test.ts src/__tests__/generalSettings.test.tsx`.
  - GREEN same-area: `bun run check:server`.
  - GREEN same-area: `bun run check:desktop`.
  - GREEN with environment workaround: `CARGO_TARGET_DIR=target\quality-native-check bun run check:native`.
  - `CARGO_TARGET_DIR=target\quality-native-check bun run verify`: all actual lanes passed (9 passed, 0 failed, 2 skipped); command returned exit 1 due policy/dirty-worktree readiness state.
  - GREEN hygiene: `git diff --check -- <debug session changed files>`.

## Changed Code Paths
- modified:
  - src/server/ws/handler.ts
  - src/server/__tests__/websocket-handler.test.ts
  - desktop/src/stores/chatStore.ts
  - desktop/src/stores/chatStore.test.ts
  - desktop/src/components/controls/ModelSelector.tsx
  - desktop/src/components/controls/ModelSelector.test.tsx
  - desktop/src/stores/providerStore.ts
  - desktop/src/stores/providerStore.test.ts
  - desktop/src/lib/appZoom.ts
  - desktop/src/lib/appZoom.test.ts
  - desktop/src/lib/persistenceMigrations.test.ts
  - desktop/src/theme/globals.css
  - desktop/src/theme/globals.test.ts
  - desktop/src/__tests__/generalSettings.test.tsx
  - .specify/memory/learnings/INDEX.md
- added:
  - .planning/debug/model-switch-cli-startup-143-ui-squares-small.md
  - .specify/project-cognition/updates/20260615-model-switch-runtime-rollback-ui-readability.json
  - .specify/memory/learnings/learn-2026-06-15-runtime-switch-rollback-and-locked-native-target-a91d4b2c7.md
- deleted: []
- renamed: []

## Project Cognition Closeout
- status: partial_refresh_recorded
- update_id: upd-20260615T094529.878191000Z
- result_state: partial_refresh
- notes:
  - Inline update completed and recorded changed paths, but project cognition still reports `review` / `partial_refresh`.
  - Passive learning `capture-auto` failed because this debug session file is a hand-written markdown artifact without YAML frontmatter.
  - Manual learning entry added: `.specify/memory/learnings/learn-2026-06-15-runtime-switch-rollback-and-locked-native-target-a91d4b2c7.md`.
