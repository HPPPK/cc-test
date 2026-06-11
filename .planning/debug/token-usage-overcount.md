# Debug Session: token-usage-overcount

## Status

- stage: complete
- user_report: Token usage dashboard shows Today = 230M tokens for 8 sessions, which appears implausibly high compared with Yesterday = 3.5M and 30 days = 3.4B.
- started_at: 2026-06-02
- workflow: sp-debug
- execution_model: leader-inline
- dispatch_shape: leader-inline
- execution_surface: leader-inline
- dispatch_reason: Small focused investigation with one visible metric anomaly and one likely aggregation/display chain.
- blocked_reason:

## Project Cognition Intake

- readiness: review
- freshness: partial_refresh
- selected_concepts:
  - concept:GEN-20260528T034105.715065300Z:node.services.api
- rejected_concepts:
  - POSIX CLI Launcher: incidental "Claude CLI" wording; not evidence of usage aggregation ownership.
  - Windows CLI Launcher: incidental "Claude CLI" wording; not evidence of usage aggregation ownership.
  - Agent/Desktop docs corpus: runtime metric defect, not documentation ownership.
  - Main CLI Runtime Entry: too broad until API usage ownership is disproven.
  - Workflow API client: workflow status API is unrelated to usage aggregation.
- minimal_live_reads:
  - src/services/api/emptyUsage.test.ts
  - src/services/api/firstTokenDate.ts
  - src/services/api/claude.ts
  - src/services/api/client.ts
- coverage_gaps:
  - Project cognition did not name the desktop usage dashboard component or local Claude Code transcript parser.

## Map-Backed Minimum Intake

- causal_map_completed: true
- investigation_contract_completed: true
- log_investigation_plan_completed: true
- observer_framing_completed: true
- skip_observer_reason: map-backed-minimum-intake

### Observer Framing

- symptom_anchor: Today usage total is displayed as 230M tokens for 8 sessions.
- primary_suspected_loop: local Claude Code session records -> usage parser/aggregator -> daily date bucket -> dashboard total formatting -> token usage UI.
- primary_candidate: Aggregator double-counts token fields or cumulative usage records for sessions occurring today.
- contrarian_candidate: Display unit/formatting or date-boundary logic maps a broader range into "today" without the raw token aggregation being wrong.
- recommended_first_probe: Inspect minimal usage-related API files, then locate the dashboard parser/aggregation code with targeted search.

### Investigation Contract

- primary_candidate_id: aggregate-overcount
- candidate_queue:
  - aggregate-overcount: Parser adds overlapping token fields, duplicates messages, or treats cumulative per-turn totals as independent deltas.
  - date-bucket-overinclude: Today bucket includes more than one local day because timestamp parsing or timezone handling is wrong.
  - display-scale-error: Raw total is plausible but compact formatter multiplies or labels values incorrectly.
- related_risk_targets:
  - 30-day/monthly totals must not regress while fixing today.
  - Session count and token total must be derived from the same filtered record set.
  - Local transcript parsing must preserve unknown fields and avoid mutating user-owned Claude Code logs.

### Log Investigation Plan

- existing_log_targets:
  - local Claude Code transcript/session records if parser paths identify them
  - unit tests around usage aggregation or first-token date
  - desktop UI tests for usage totals if present
- candidate_signal_mapping:
  - aggregate-overcount: raw records show repeated cumulative totals or duplicated token fields being summed.
  - date-bucket-overinclude: records outside 2026-06-02 appear in the Today bucket.
  - display-scale-error: raw Today total differs from formatted label by orders of magnitude.
- observability_escalation: If no existing test or parser output can isolate the total, add a small fixture-based unit test before changing production behavior.

## Senior Consequence Analysis

### Affected Object Map

- local Claude Code CLI session records: source data, user-owned, read-only.
- usage parser/aggregator: truth owner for token totals and session counts.
- date bucket filters: control state for Today, Yesterday, 30-day, and month bins.
- token usage dashboard: observation state for totals and heatmap.
- tests/fixtures: regression evidence for corrected aggregation.

### State-Behavior Matrix

- created/recorded sessions: should be counted once when they contain usage data.
- missing usage: should not inflate totals; may count session only if product semantics say so.
- stale or malformed records: should be ignored or safely defaulted without corrupting totals.
- today bucket: should include only records whose normalized local date is 2026-06-02.
- completed sessions: should not be recounted through both transcript turns and summary totals.

### Dependency Impact Table

- parser -> dashboard: token totals and session counts.
- parser -> tests: fixture expectations must match real Claude Code record shape.
- date normalization -> all range totals: Today fix can affect Yesterday, 30-day, monthly, weekly heatmap.
- compact formatter -> user-visible trust: label must not hide a scale bug.

### Recovery And Validation Contract

- Add or update a focused regression test with fixture data reproducing the overcount family.
- Verify Today no longer includes duplicated/cumulative tokens.
- Verify Yesterday/30-day/monthly totals still use the intended buckets.
- Do not mutate local Claude Code CLI records.

### Coverage Gaps

- CA-001 gap: Actual dashboard source path is not in cognition bundle. Resolve during current workflow with targeted live search after minimal reads.
- CA-002 gap: Exact local Claude Code usage record shape must be proven from code/tests or safe fixture, not assumed. Resolve before fix.

### Consequence Obligations

- CA-001: Locate the real usage dashboard aggregation owner before modifying behavior. Owner workflow: sp-debug. Latest resolve phase: evidence investigation. Status: resolved. Evidence: `src/utils/stats.ts` owns aggregation and `desktop/src/pages/ActivitySettings.tsx` owns the visible cards.
- CA-002: Preserve read-only handling of user-owned Claude Code logs. Owner workflow: sp-debug. Latest resolve phase: fix. Status: resolved. Evidence: local transcript replay was read-only; fix changes app stats/API/UI code and cache schema only.
- CA-003: Validate date bucket semantics for Today, Yesterday, 30-day, and monthly totals. Owner workflow: sp-debug. Latest resolve phase: verification. Status: resolved-partial. Evidence: stats regression covers date bucketing and future exclusion; full coverage gate was blocked by expired quarantine entries.

## Current Focus

Add a regression test for activity summary token breakdown, then implement an additive daily token category field and UI detail text.

## Evidence

- 2026-06-02: Project cognition query returned readiness=review and minimal reads under src/services/api; it did not name the dashboard owner.
- 2026-06-02: Minimal API read found `src/services/api/claude.ts` documents streaming usage as cumulative, not incremental; relevant to overcount family but not yet proven to own the dashboard.
- 2026-06-02: Targeted search found user-visible activity text under `desktop/src/i18n/locales/zh.ts`, `/api/status/usage` in `src/server/api/status.ts`, CLI usage command files, `src/utils/stats.ts`, and session transcript usage parsing in `src/server/services/sessionService.ts`.
- 2026-06-02: `desktop/src/pages/ActivitySettings.tsx` renders the Today/Yesterday/30-day headline from `dailyModelTokens`, summing all models without token category breakdown.
- 2026-06-02: `src/server/api/activityStats.ts` returns `aggregateClaudeCodeStatsForRange('all')`; `src/utils/stats.ts` owns the activity dashboard aggregation.
- 2026-06-02: `src/utils/stats.ts#getTotalUsageTokens` intentionally counts `input_tokens + output_tokens + cache_read_input_tokens + cache_creation_input_tokens`; the existing stats test explicitly expects cache tokens to be included.
- 2026-06-02: Read-only local transcript aggregation for 2026-06-02 produced 246,202,200 total tokens from 8 parent sessions / 20 files / 1,947 assistant usage records: input=7,426,293, output=777,315, cache_read=237,998,592, cache_creation=0.
- 2026-06-02: Non-cache usage for today is approximately 8,203,608 tokens; the 230M-class headline is dominated by cache-read usage.

## Eliminated

- UI scale/formatter multiplication: eliminated. `ActivitySettings.formatTokens` divides by 1,000,000 for M labels; raw local aggregation already lands in the 230M-250M range.
- UTC/local date bucket mismatch: eliminated for current machine/time. Both UTC and local day keys for 2026-06-02 produced the same total in the read-only transcript aggregation.
- Broad accidental multi-day inclusion: eliminated for Today. Top-level read-only aggregation filtered records to 2026-06-02 and still produced 246.2M.

## Root Cause

- status: confirmed
- summary: The Today headline is not a simple arithmetic or formatter bug. It is using a broad "total tokens" semantic that includes cache-read prompt tokens for every assistant usage record. Heavy cached-context sessions and subagents make cache-read tokens dominate the daily total, so the headline looks implausible when users expect non-cache input/output tokens or current conversation size.
- owning_layer: `src/utils/stats.ts` aggregation semantics plus `desktop/src/pages/ActivitySettings.tsx` headline presentation.
- broken_control_state: Product semantic for "Token 用量" is ambiguous; control aggregation intentionally includes cache-read tokens, while UI presents it as one undifferentiated headline.
- failure_mechanism: Daily usage aggregation sums every assistant message's `cache_read_input_tokens`; today has 237.998M cache-read tokens, which drives the headline.
- loop_break: local transcript usage records -> stats aggregation includes cache read -> dailyModelTokens total -> ActivitySettings headline hides category composition -> user sees 230M without explanation.
- decisive_signal: Replaying the current aggregation over local transcripts produced 246.2M total with 237.998M cache read and only 8.2M non-cache input/output.

## Fix

- status: implemented
- fix_scope: observation-boundary
- note: Preserve existing aggregation truth (`dailyModelTokens` total includes cache tokens) and repair the UI observation boundary by exposing category composition.
- changes:
  - Added `dailyTokenBreakdown` to Claude Code activity stats so input/output/cache-read/cache-create categories remain observable per day.
  - Bumped `stats-cache.json` schema from v5 to v6 because older caches cannot reconstruct token categories; pre-v6 caches are rejected and recomputed.
  - Updated Activity settings summary details to show cache token contribution for Today/Yesterday when cache usage is present.
  - Added localized cache detail labels for English and Chinese.
- affected_paths:
  - src/utils/stats.ts
  - src/utils/statsCache.ts
  - src/utils/__tests__/stats.test.ts
  - desktop/src/api/activityStats.ts
  - desktop/src/pages/ActivitySettings.tsx
  - desktop/src/pages/ActivitySettings.test.tsx
  - desktop/src/i18n/locales/en.ts
  - desktop/src/i18n/locales/zh.ts

## Verification

- status: partially_verified_global_gate_blocked
- passed:
  - `cd desktop && bun run test ActivitySettings.test.tsx`: passed 2 tests. The first run before implementation failed as the intended red test because the UI only showed session count and no cache detail.
  - `bun test src\utils\__tests__\stats.test.ts`: passed 6 tests / 19 expects.
  - `bun run check:persistence-upgrade`: passed server persistent JSON migrations and desktop localStorage migration checks.
  - `bun run check:desktop`: passed 96 test files / 828 tests plus desktop build/typecheck.
- blocked:
  - `bun run check:server`: blocked before relevant server checks by existing expired quarantine entries: `server:cron-scheduler`, `server:providers-real`, `server:tasks`, `server:e2e:business-flow`, `server:e2e:full-flow`.
  - `bun run check:coverage`: blocked by the same expired quarantine entries before coverage calculation.
- residual_risk:
  - Live desktop screenshot/browser smoke was not run in this pass.
  - Running desktop client/server instances may need restart to pick up the server-side stats/cache schema changes.

## Project Cognition Closeout

- status: partial_refresh
- update_id: `upd-20260602T104741.412297600Z`
- recommended_next_action: `review_project_cognition_update`
- minimal_live_reads:
  - desktop/src/api/activityStats.ts
  - desktop/src/i18n/locales
  - desktop/src/pages/ActivitySettings.tsx
  - desktop/src/pages/ActivitySettings.test.tsx
  - src/utils
  - src/utils/__tests__/stats.test.ts
  - src/utils/stats.ts
  - src/utils/statsCache.ts

## Human Verification

- status: accepted
- confirmed_at: 2026-06-02
- user_response: 应该没问题
- result: Token usage overcount/debug workflow accepted after exposing cache-token contribution in the UI.
