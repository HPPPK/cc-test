---
slug: gui-smoothness-latency
status: fixed_with_gate_blockers
source_quick_task: .planning/quick/002-gui-smoothness-latency/STATUS.md
created: 2026-05-28T21:41:30+08:00
updated: 2026-05-28T22:13:10+08:00
execution_model: leader-inline
dispatch_shape: leader-inline
execution_surface: leader-inline
dispatch_reason: Small focused intake is needed first; current runtime only permits spawn_agent when user explicitly asks for sub-agents/delegation.
blocked_reason: none
causal_map_completed: true
investigation_contract_completed: true
log_investigation_plan_completed: true
observer_framing_completed: true
legacy_session_needs_reintake: false
---

## Current Focus

Investigate the desktop GUI feeling globally laggy/unsmooth. Existing local Vite/Tauri logs contain a React `Maximum update depth exceeded` warning, and focused composer tests proved concrete over-broad subscriptions: `ChatInput` rerendered for unrelated background chat session changes and for active-session streaming text changes.

Next action: hand off with the desktop fix and verification evidence. Root PR gate still has unrelated/local blockers recorded below.

## Intake

- Project cognition lexicon/query selected `term:gui`.
- Project cognition readiness is `blocked`; baseline health is dirty/stale/blocked.
- Returned minimal live reads: `desktop/src`, `desktop/src-tauri`.
- Query candidates were broad and partly irrelevant to global smoothness, so live repository evidence must drive the investigation.

## Observer Framing

Primary suspected loop: user input or app state update -> React/store subscriptions/effects or CSS/layout work -> WebView main thread frame budget -> visible GUI smoothness.

Recommended first probe: map desktop shell/root components and search for high-frequency state updates, broad subscriptions, expensive render/effect loops, global CSS transitions/filters, and Tauri/webview configuration that could force low refresh or main-thread stalls.

Contrarian candidate: perceived lag may be environment/runtime related, such as dev server/HMR overhead, WebView GPU/compositing settings, app startup/server IPC, or system display settings rather than an application bug.

## Investigation Contract

Truth owner candidates:
- React render root and top-level providers.
- Global stores and subscriptions that can trigger broad re-renders.
- Chat/session update streams, WebSocket handlers, and status polling if they mutate frequently.
- CSS/layout/animation surfaces that can trigger paint or layout work.
- Tauri window/WebView configuration if shell-level rendering is constrained.

Control state vs observation state:
- Control state: app stores, session update streams, render scheduling, window/WebView config.
- Observation state: visual stutter, delayed interaction, low-refresh feeling, profiler frame drops, browser performance traces.

Evidence requirements before fixing:
- Identify a concrete candidate mechanism with file/line evidence or a reproducible measurement.
- Add or use the smallest available RED/repro/diagnostic check before production edits.
- If visual-only performance cannot be unit-tested, record the browser/Tauri smoke or profiler evidence used instead.

## Log Investigation Plan

- Check existing source/runtime scripts before adding new probes.
- Look for existing Playwright/browser smoke tooling and desktop dev startup scripts.
- If source evidence is inconclusive, run a narrow local desktop web build/dev check or add a temporary, controlled diagnostic harness only if needed.

## Candidate Board

Primary candidate: React update loop or broad re-render in desktop app shell/store/chat/session/sidebar update path.

Contrarian candidates:
- CSS/layout/animation/compositing choices causing expensive paint.
- Tauri/WebView config or GPU/compositing/platform settings.
- Dev-only Vite/HMR/runtime overhead mistaken for production GUI smoothness.
- Backend/server/WebSocket message cadence flooding UI state.

Elimination criteria:
- Candidate eliminated only by live code evidence, targeted test output, profiler trace, or runtime observation.

## Senior Consequence Analysis

Gate status: triggered_bounded.

Affected objects:
- Desktop GUI responsiveness and perceived input latency.
- React render root, components, stores, effects, CSS, and possibly Tauri shell config.
- Desktop verification surfaces.

State behavior matrix:
- idle: no recurring main-thread work should degrade interaction.
- active session/chat updates: updates should not block input or frame rendering.
- startup/loading: initialization should avoid long unobserved stalls.
- dev vs production: evidence must distinguish dev-only overhead from product behavior when possible.

Dependency impact:
- Store subscription changes can affect all screens.
- Tauri/window config changes can affect packaged platform behavior.
- CSS/compositing changes can affect visual design and accessibility.

Recovery and validation:
- Keep patches scoped and reversible.
- Verify with same-area desktop tests, lint/typecheck, and visual/performance smoke if code changes are made.

Coverage gaps:
- No user-provided specific slow screen yet; latest safe resolve phase is before claiming final fix.
- Project cognition stale/dirty; use live evidence and inline cognition update only if source/runtime behavior changes.

Consequence obligations:
- CA-001: no production performance fix before root cause evidence.
- CA-002: distinguish dev-only smoothness issues from packaged product behavior when evidence allows.
- CA-003: record unverified visual/performance surfaces before closeout.

## Evidence

- source_type: user_report
  source_ref: chat
  finding: User reports the entire GUI feels delayed, unsmooth, and like refresh rate is too low.
- source_type: project_cognition
  source_ref: project-cognition lexicon/query
  finding: Only `term:gui` matched; readiness blocked/stale/dirty; minimal live reads are `desktop/src` and `desktop/src-tauri`.
- source_type: log
  source_ref: desktop/.tauri-vite-1421.err.log:90
  finding: Vite client logged `Warning: Maximum update depth exceeded`, which is a plausible direct cause of global jank or an unsmooth GUI.
- source_type: log
  source_ref: desktop/.tauri-vite-1421.err.log:2-89
  finding: Scheduled task notification polling also logged repeated failed fetch warnings, but only on mount/30s cadence in the visible log and is not yet sufficient to explain continuous low-refresh feeling.
- source_type: test
  source_ref: `bun run test -- src/components/layout/ContentRouter.test.tsx src/pages/ActiveSession.test.tsx`
  finding: 31 existing tests passed; the visible active-session/content-router paths did not reproduce the update-depth warning.
- source_type: test
  source_ref: `bun run test -- src/components/layout/AppShell.test.tsx src/__tests__/pages.test.tsx`
  finding: 41 existing tests passed, but AppShell tests mock the real Sidebar and ContentRouter, so they do not exercise global sidebar refresh or preference effects.
- source_type: test_red
  source_ref: `bun run test -- src/components/chat/ChatInput.test.tsx -t "does not rerender the composer controls for unrelated chat session updates"`
  finding: Failed before the production change; updating a non-active background chat session rerendered ChatInput controls once, confirming over-broad chat store subscription.
- source_type: code
  source_ref: `desktop/src/components/chat/ChatInput.tsx:141`
  finding: `ChatInput` subscribed to the entire `useChatStore()` just to read `sendMessage` and `stopGeneration`, so every chat store mutation could rerender the composer.
- source_type: test_green
  source_ref: `bun run test -- src/components/chat/ChatInput.test.tsx -t "does not rerender the composer controls for unrelated chat session updates"`
  finding: Passed after selecting `sendMessage` and `stopGeneration` separately.
- source_type: test
  source_ref: `bun run test -- src/components/chat/ChatInput.test.tsx`
  finding: 23 ChatInput tests passed after the subscription narrowing.
- source_type: test_red
  source_ref: `bun run test -- src/components/chat/ChatInput.test.tsx -t "active streaming text updates"`
  finding: Failed before the production change; changing only the active session `streamingText` rerendered composer controls, proving high-frequency streaming updates were coupled to the input controls.
- source_type: code
  source_ref: `desktop/src/components/chat/ChatInput.tsx:151-155`
  finding: ChatInput now selects only the chat state fields it actually needs: `chatState`, `slashCommands`, `composerPrefill`, `connectionState`, and `messages.length`, instead of the full active session object.
- source_type: test_green
  source_ref: `bun run test -- src/components/chat/ChatInput.test.tsx -t "does not rerender the composer controls"`
  finding: Both render isolation tests passed after narrowing chat-store selectors.
- source_type: test
  source_ref: `bun run test -- src/components/chat/ChatInput.test.tsx`
  finding: 24 ChatInput tests passed after adding the active-streaming regression test.
- source_type: verification
  source_ref: `cd desktop && bun run lint`
  finding: Desktop TypeScript no-emit check passed.
- source_type: verification
  source_ref: `bun run check:desktop`
  finding: Passed desktop lint, all 94 desktop test files / 801 tests, and production web build.
- source_type: verification
  source_ref: `bun run verify`
  finding: Root PR gate failed with 6 passed, 2 failed, 3 skipped. Desktop checks passed; failures were coverage server/tool suites due missing `ANTHROPIC_API_KEY`/OAuth env in WorkflowTemplateAuthoringTool test, and native checks due Windows PermissionDenied during Tauri build with existing native dirtiness/file lock.
- source_type: project_cognition
  source_ref: `project-cognition update --changed-path desktop/src/components/chat/ChatInput.tsx --changed-path desktop/src/components/chat/ChatInput.test.tsx --scope desktop/src/components/chat --reason workflow-finalize --format json`
  finding: Inline update recorded `update_id=upd-20260528T141233.741662900Z`; readiness remained blocked/review due existing cognition state, not because the update failed.

## Eliminated

- Sidebar refresh/preference effects are not the first proven owner of the reported smoothness issue. They remain unproven but lower priority than the confirmed ChatInput subscription path.

## Active Hypothesis

The confirmed owner fixed in this pass is broad chat-store subscription in the composer. Background/other-session chat mutations and high-frequency active streaming text changes were able to rerender the active input controls.

## Next Experiment

No next experiment required for this scoped fix. Remaining visual smoothness risk should be validated in the running Tauri app or profiler if the user still perceives lag.

## Fix State

fix_scope: narrow_desktop_chat_input_subscription
root_cause: ChatInput used full chat store and full active-session subscriptions, causing unrelated chat store changes and active streaming text updates to rerender composer controls.
changed_code_paths: `desktop/src/components/chat/ChatInput.tsx`, `desktop/src/components/chat/ChatInput.test.tsx`
changed_behavior_surfaces: desktop chat composer render behavior
verification_evidence: focused REDs failed, focused GREENs passed, full ChatInput test file passed, desktop lint passed, `bun run check:desktop` passed
project_cognition_refresh: inline update recorded `upd-20260528T141233.741662900Z`; readiness remained blocked/review
