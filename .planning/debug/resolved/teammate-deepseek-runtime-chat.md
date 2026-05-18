# Debug Session: Teammate DeepSeek Runtime Chat

## Status

- stage: resolved
- terminal_status: human_verified
- user_report: Lead sees a DeepSeek provider/model roster and attempts a team test with two teammates using DeepSeek Flash. The reported run claims members were created with DeepSeek Flash but they did not autonomously chat through SendMessage; the user suspects the provider/model information or runtime selection is not actually working.
- created_at: 2026-05-17

## Cognition Gate

- readiness: ready
- selected capability: n-cap-agent / Multi-Agent Orchestration
- affected nodes: n-cap-agent
- query terms carried forward: Agent Teams Collaboration, Multi-Agent Orchestration, Multi-Model Provider Support, Agent Tool Ecosystem, src/tools, src/utils, src/server/services, src/server/ws, src/query.
- minimal_live_reads: none returned
- unresolved coverage gaps: query did not return detailed node coverage for the new provider-runtime surfaces; evidence phase must use narrowly scoped reads after observer gate.

## Required Flags

- causal_map_completed: true
- investigation_contract_completed: true
- log_investigation_plan_completed: true
- observer_framing_completed: true

## Current Focus

Root cause confirmed and patched: `getAgentModel()` read `process.env.CLAUDE_CODE_SUBAGENT_MODEL` directly, bypassing teammate runtime env masking. This could force the inherited global subagent model over both default teammate model choices and explicit teammate runtime selections. Running focused verification now.

## Observer Framing

- scope_boundary: Investigate autonomous team-member chat failure using evidence from real teammate runtime path; do not infer success from manual chat simulation.
- key_constraints:
  - Manual `SendMessage` simulation is invalid evidence.
  - Preserve distinction between configured roster state, persisted member config, runtime binding, scheduler activity, tool availability, and observer reporting.
  - Do not declare root cause until C1/C2/C4/C7/C10 evidence distinguishes the break edge.
- affected_surface_area: team creation, provider roster, member config persistence, runtime member instantiation, provider/model resolver, agent loop scheduler, member prompt/context, `SendMessage` tool exposure and dispatch, observer/websocket reporting, lead summaries.
- known_unknowns:
  - Whether configured provider/model is passed into runtime member instances.
  - Whether model alias normalization or resolver behavior changes `deepseek-v4-flash`.
  - Whether autonomous turns are scheduled after creation.
  - Whether `SendMessage` is available and permitted for team members.
  - Whether idle hides failed activity or swallowed errors.
- recommended_next_step: Correlate creation/config/runtime/provider selection/scheduler/tool exposure evidence for the teammate path.
- primary_suspected_loop: lead creates team -> member config records provider/model -> runtime instantiates members -> runtime selects configured provider/model -> agent loop schedules autonomous turns -> `SendMessage` is available/permitted -> members emit `SendMessage` -> observer records autonomous chat.
- primary_candidate: C1 configured model not passed into runtime.
- contrarian_candidate: C5 prompt lacks collaboration objective.

## Causal Map

- symptom_anchor: Team members reported as created with `deepseek-v4-flash` went idle and did not autonomously use `SendMessage` to chat; manual simulation is invalid evidence.
- closed_loop_path:
  1. Lead creates team test with two members.
  2. DeepSeek provider roster is available to the lead.
  3. Each member configuration records provider id and model id `deepseek-v4-flash`.
  4. Team runtime instantiates members from those configurations.
  5. Runtime selects the configured DeepSeek provider/model for each member.
  6. Members receive collaboration objective and peer/team context.
  7. Agent loop schedules autonomous turns.
  8. Each member has `SendMessage` available and permitted.
  9. Members emit `SendMessage` calls to each other.
  10. Transcript/observer records autonomous inter-member chat.
- break_edges:
  - member configuration -> runtime selection: plausible because the report proves requested config, not actual provider invocation. Falsifier: runtime evidence shows both members invoked DeepSeek provider/model with no fallback.
  - runtime instantiation -> autonomous scheduling: plausible because members went idle without tool use. Falsifier: lifecycle trace shows each member entered active turn processing after creation.
  - member context -> decision to act: plausible if prompts lacked a clear communication objective. Falsifier: prompts explicitly instructed coordination and the model still no-oped.
  - tool availability -> message emission: plausible if `SendMessage` was hidden, denied, lead-scoped, or missing from teammate schema. Falsifier: per-member tool schema and policy expose and permit `SendMessage`.
  - message emission -> observation: plausible if attempts/errors/queued messages were hidden by idle projection. Falsifier: raw transcripts and events confirm no attempts/errors/queued messages.
- family_coverage:
  - Provider/model binding and runtime selection: C1-C3; falsifier is actual request-time DeepSeek Flash invocation evidence.
  - Autonomous team control loop: C4-C6; falsifier is scheduling and completed turn evidence.
  - Tool availability and dispatch: C7-C9; falsifier is visible `SendMessage` schema, permission, dispatch, and transcript persistence evidence.
  - Observation/reporting: C10-C11; falsifier is agreement between raw event stream, transcript, and UI/server state.
  - External provider/runtime failure: C12; falsifier is valid DeepSeek Flash response processed for each member.
- candidate_board:
  - primary_order: C1, C2, C4, C7, C10
  - contrarian_candidates: C5, C8, C12
  - deferred_candidates: C3, C6, C9, C11
- adjacent_risk_targets: provider roster vs runtime binding, model alias normalization, teammate lifecycle state transitions, autonomous scheduler wake/run queue, member prompt construction, `SendMessage` exposure and routing, tool execution errors, server websocket reporting, lead run summaries.
- dimension_scan:
  - control_state: configured runtime fields, runtime request selection, run queue/scheduler state, idle transition, tool permission/routing.
  - observation_state: lead summary, team config, UI idle status, transcript/events, provider roster reminder.
  - boundary_edges: roster -> Agent input, Agent input -> member config, config -> runtime launch, launch -> provider resolver, model output -> tool call, tool call -> mailbox/transcript, event stream -> lead-visible state.

## Transition Memo

- first_candidate_to_test: C1 configured model not passed into runtime.
- why_first: Earliest high-priority break edge after creation and persistence; if runtime binding loses provider/model, downstream idle/chat behavior is ambiguous.
- evidence_unlock:
  - Creation-time provider/model requested for each teammate.
  - Persisted member config provider/model.
  - Runtime instantiation provider/model received by each member.
  - Resolver input/output provider/model used for actual generation.
  - Fallback or alias-normalization events.
- carry_forward_notes:
  - If C1 is disproven, continue to C2 provider/model mismatch/resolver failure, then C4 scheduling.
  - Keep C10 in view when logs show idle.
  - Do not use manual `SendMessage` as success evidence.

## Investigation Contract

- primary_candidate_id: C1
- candidate_queue:
  - C1 configured model not passed into runtime
  - C2 provider/model mismatch or resolver failure
  - C4 created but turns never scheduled
  - C7 `SendMessage` not exposed to team members
  - C10 idle hides failed activity
  - C5 prompt lacks collaboration objective
  - C8 `SendMessage` permission/routing blocks peers
  - C12 DeepSeek Flash API/adapter failure
- related_risk_targets: roster/runtime binding, model alias normalization, lifecycle state, scheduler wake/run queue, member prompt construction, `SendMessage` exposure/routing, tool execution errors, websocket reporting, lead summaries.
- truth_ownership_probe:
  - Which component owns member provider/model at Agent invocation?
  - Which persisted field owns member provider/model after creation?
  - Which runtime object receives provider/model before generation?
  - Which resolver output determines actual provider/model used?
  - Which component owns autonomous turn scheduling?
  - Which component owns teammate tool list construction?
  - Which component owns idle/activity reporting?
- required_evidence:
  - Requested provider/model at Agent call.
  - Persisted member config provider/model.
  - Runtime member initialization provider/model input.
  - Resolver input/output and fallback/error behavior.
  - Scheduler enqueue/wake/start/finish/idle behavior.
  - Per-member `SendMessage` tool availability and routing.

## Log Investigation Plan

- existing_log_targets: team config, member transcript/session metadata, runtime spawn result, provider/model resolver tests/logs, task/lifecycle status, tool schema availability, mailbox/SendMessage dispatch.
- candidate_signal_mapping:
  - C1: Persisted config contains `deepseek-v4-flash` but runtime initialization lacks or changes it.
  - C2: Runtime passes `deepseek-v4-flash`, but resolver normalizes, rejects, mismatches provider/model, errors, or falls back.
  - C4: Members are created/runtime-bound but no scheduler enqueue/wake/run events occur.
  - C7: Member run starts but `SendMessage` is absent from tool list.
  - C10: Observer reports idle while runtime logs show activity/failure/blocked dispatch.
- observability_escalation: add correlation-safe logging for config/runtime/resolver/scheduler/tool exposure if existing tests/logs are insufficient.

## Evidence

- source_type: user_report
  source_ref: chat transcript provided 2026-05-17
  finding: The runtime test showed the lead had a DeepSeek provider roster and attempted to spawn two members with DeepSeek Flash, but the members went idle without visible peer-to-peer SendMessage chat. The assistant in that run also speculated and simulated chat manually, which is not acceptable evidence of successful teammate chat.
- source_type: subagent_lane_provider_runtime
  source_ref: agent 019e33fa-aee1-7f90-a03e-cd16b7c5fd92 notification 2026-05-17
  finding: If an Agent call includes both `provider_id` and exact `model_id`, the values flow through AgentTool -> spawnTeammate -> resolveTeammateSpawnRuntime -> resolveTeammateRuntime. Non-null provider runtime sets provider env and `ANTHROPIC_MODEL`. C1 fails at code-path level; C2 remains unknown only for live provider env/API acceptance. A remaining weak edge is `model_id` without `provider_id`, which creates runtime/model state without provider env.
- source_type: subagent_lane_scheduling_tools
  source_ref: agent 019e33fa-af1b-7ea3-a045-e03ec2b72326 notification 2026-05-17
  finding: In-process teammates have a continuous mailbox wake loop and `SendMessage` is explicitly available/permitted for plain peer messages. C4 and C7 fail at code-path level; C8 fails for ordinary peer DM routing. C10 passes as an observability gap because leader-visible idle state only includes a last peer-DM summary and does not prove omitted/failed tool attempts.
- source_type: local_cross_check
  source_ref: src/tools/shared/spawnMultiAgent.ts and src/utils/messages.ts 2026-05-17
  finding: `handleSpawnInProcess` starts the teammate agent loop before updating `AppState.teamContext` and before writing the member to team config. The first turn's `team_context` attachment tells the teammate to read the config but does not inline teammate names. In parallel social-test spawns, early turns can therefore start with incomplete roster visibility.
- source_type: patch
  source_ref: working tree 2026-05-17
  finding: Added explicit validation that `model_id` cannot be used without `provider_id`, clarified the Agent prompt/schema so cross-provider choices must use `provider_id/model_id`, moved in-process teammate start until after AppState/team-file registration, and added known teammate names plus SendMessage-first guidance to team context.
- source_type: user_report_followup
  source_ref: chat transcript provided 2026-05-17
  finding: The user's pasted Agent creation parameters for 小桃/小松 did not include `provider_id` or `model_id`, so those teammates could not have been launched on DeepSeek Flash through the cross-provider runtime selection path. They used the default teammate model/runtime.
- source_type: local_cross_check
  source_ref: src/tools/AgentTool/built-in/generalPurposeAgent.ts and src/utils/swarm/teammatePromptAddendum.ts 2026-05-17
  finding: The built-in `general-purpose` system prompt tells the agent to complete work and return a concise report. The teammate addendum required SendMessage for communication but did not explicitly force leader instructions like "introduce yourself to X" or "chat with X" to use SendMessage as the first action. Persona-only prompts could therefore be privately satisfied and then the teammate would correctly return to idle.
- source_type: patch
  source_ref: src/utils/swarm/teammatePromptAddendum.ts and src/tools/AgentTool/prompt.ts 2026-05-17
  finding: Strengthened teammate communication instructions so greet/introduce/ask/answer/tell/notify/coordinate requests require SendMessage as the first visible action, peer messages expecting a response require a SendMessage reply, and lead prompts for teammate-to-teammate conversation are warned that persona-only prompts can go idle.
- source_type: user_report_followup
  source_ref: chat transcript 2026-05-17
  finding: User clarified this is not a UI issue. Agent team members fail to process content because model selection does not take effect for both the default teammate model path and explicit provider selection path.
- source_type: subagent_lane_runtime_binding
  source_ref: agent 019e3455-7455-7d72-aa09-bd8f970f5169 notification 2026-05-17
  finding: Explicit `provider_id/model_id` is validated and passed through AgentTool -> spawnTeammate -> resolveTeammateSpawnRuntime -> resolveTeammateRuntime. In-process generation runs inside `runWithRuntimeEnv`, and model/provider helpers read the runtime env overlay. However, the default teammate model path persists only a model string, not a provider pair; when no explicit provider is supplied, runtime selection has no provider override. Also, the hardcoded teammate fallback comment and implementation disagree.
- source_type: subagent_lane_execution_processing
  source_ref: agent 019e3455-948f-7a41-a0aa-e4e43e45318e notification 2026-05-17
  finding: In-process teammates receive the initial prompt directly and surface run failures through failed task/idle notification state. Out-of-process pane teammates are spawned without an inline prompt and depend on mailbox delivery after process startup; evidence did not show a pane-runtime path that updates leader task state to failed when process/runtime generation fails. `teamDiscovery` can collapse observable teammate state to running/idle.
- source_type: failing_test
  source_ref: `bun test src/utils/model/agent.test.ts` 2026-05-17
  finding: With `process.env.CLAUDE_CODE_SUBAGENT_MODEL=haiku` and a teammate runtime overlay masking that variable, `getAgentModel(undefined, 'leader-model', 'sonnet', 'default')` still returned Haiku before the fix. This proved the runtime overlay was not honored at the model-selection boundary.
- source_type: patch
  source_ref: `src/utils/model/agent.ts`, `src/utils/model/agent.test.ts`, `src/utils/swarm/teammateRuntime.test.ts` 2026-05-17
  finding: Changed `getAgentModel()` to read `CLAUDE_CODE_SUBAGENT_MODEL` via `getRuntimeEnvValue()` instead of `process.env`, and added regression coverage for both runtime-env masking and the provider-managed env overlay clearing `CLAUDE_CODE_SUBAGENT_MODEL`.

## Eliminated

- C1 configured model not passed into runtime when both `provider_id` and `model_id` are present.
- C4 teammate has no autonomous wake loop after messages.
- C7 `SendMessage` absent from in-process teammate tools.
- C8 ordinary plain peer DM blocked by local routing/permission.
- The pasted 小桃/小松 run being DeepSeek Flash; the Agent calls omitted `provider_id/model_id`, so runtime selection fell back to the default model.
- C2 provider/model resolver mutates explicit provider/model before in-process generation; static code and narrow tests show the resolver preserves explicit provider/model and generation reads the runtime overlay.

## Truth Ownership Map

- Agent tool input owns requested `provider_id/model_id`.
- `resolveTeammateSpawnRuntime` and `resolveTeammateRuntime` own runtime model/provider binding before launch.
- `runWithRuntimeEnv` owns teammate-local masking of inherited provider/model environment values during in-process generation.
- `getAgentModel` owns final agent model selection before `query()` receives `toolUseContext.options.mainLoopModel`.
- Team file and `AppState.teamContext` own roster/config visibility.
- `runInProcessTeammate` owns first-turn team context injection and mailbox wake scheduling.
- `SendMessageTool` owns peer DM delivery to mailbox.
- Leader idle notification owns the current observer summary, with limited evidence when no peer DM is emitted.

## Control State / Observation State

- control_state: provider pair is correctly bound only when both `provider_id` and `model_id` are present; omitted fields use the default teammate runtime. Before this patch, global `CLAUDE_CODE_SUBAGENT_MODEL` was read directly from `process.env` by `getAgentModel`, so teammate-local runtime masking could not stop an inherited global subagent model from overriding the selected teammate model. In-process teammate first turn now starts after roster/config registration, but social prompts still need action-explicit SendMessage instructions.
- observation_state: leader sees idle and optional peer-DM summary, not a complete trace of whether a teammate tried and failed to call `SendMessage`.

## Closed Loop

- target_loop_after_patch: roster reminder -> Agent uses explicit provider pair -> spawn validates pair -> teammate is registered in team context/config -> teammate loop starts with roster-visible context -> prompt/message can use bare peer names -> `SendMessage` delivers peer DM -> receiver mailbox wake loop processes it -> leader idle summary can show last peer DM.
- model_loop_after_patch: Agent/default teammate model selection -> resolveTeammateSpawnRuntime -> runtime env overlay clears inherited provider/model env -> runInProcessTeammate enters `runWithRuntimeEnv` -> `getAgentModel` reads overlay-aware `CLAUDE_CODE_SUBAGENT_MODEL` -> `query()` receives selected teammate model -> API client/provider helpers read teammate runtime overlay.

## Root Cause

- summary: Teammate runtime selection could be overridden by an inherited global `CLAUDE_CODE_SUBAGENT_MODEL` because `getAgentModel()` read `process.env` directly instead of the teammate runtime env overlay.
- owning_layer: agent-loop model-selection boundary (`src/utils/model/agent.ts`) and teammate runtime env boundary.
- broken_control_state: teammate-local clearing of provider-managed env included `CLAUDE_CODE_SUBAGENT_MODEL`, but the final model selector ignored that overlay.
- failure_mechanism: in-process teammates ran inside `runWithRuntimeEnv`, but `getAgentModel()` bypassed `getRuntimeEnvValue()`. Any global `CLAUDE_CODE_SUBAGENT_MODEL` could still force a different model than the teammate's default or explicit provider/model choice.
- loop_break: runtime env masking -> final agent model selection.
- decisive_signal: the new regression test reproduced `CLAUDE_CODE_SUBAGENT_MODEL=haiku` overriding a teammate call that explicitly requested `sonnet` even when the runtime overlay masked the env var; after the patch it resolves to the requested model.
- alternative_hypotheses_considered: C1 configured model not passed into runtime, C2 provider/model resolver mutates explicit provider/model, C4 teammate turns never scheduled, C10 idle hides failed activity, out-of-process pane startup/failure projection gap.
- alternative_hypotheses_ruled_out: explicit provider/model reaches the in-process generation path; resolver preserves the pair; in-process teammates schedule and report failures. C10 and pane projection remain adjacent risks, not the confirmed model-selection root cause.
- root_cause_confidence: confirmed.

## Fix Scope

- fix_scope: truth-owner
- classification: control-boundary
- changed_files: `src/utils/model/agent.ts`, `src/utils/model/agent.test.ts`, `src/utils/swarm/teammateRuntime.test.ts`
- rejected_surface_fixes: UI/store changes and idle-status smoothing would not repair the model-selection control boundary.

## Dispatch Decision

- execution_model: subagent-mandatory for substantive debug work per sp-debug contract.
- current_stage_dispatch: parallel-subagents for default-runtime/provider-runtime propagation and teammate content-processing execution evidence lanes.
- execution_surface: native-subagents.

## Investigation Join Point 2026-05-17

- stage: Stage 2: Evidence Investigation
- active_hypothesis: Team member runtime selection is still not being applied to the generation path, including the default teammate model path and explicit provider path, so members cannot process content.
- lane_runtime_binding:
  - objective: Trace the control path that decides teammate model/provider for both omitted model fields and explicit provider/model fields, then identify whether actual generation receives that selection.
  - allowed_read_scope: `src/tools/`, `src/utils/`, `src/services/`, `src/server/services/`, `src/server/api/`, tests under same areas, package/test scripts.
  - write_scope: none.
  - forbidden_paths: `.planning/debug/`, `.specify/memory/`, user config or secrets under home directories.
  - required_evidence: functions/files that own default teammate model resolution, explicit provider/model validation, environment/runtime binding, and actual API/model invocation; targeted tests that cover or miss each path.
  - handoff: fact-only payload with files inspected, commands run, observations, candidate status for C1/C2/default-model variant, confidence, blockers.
- lane_execution_processing:
  - objective: Trace whether a spawned teammate that has runtime selection can actually receive a task, enter its query loop, process content, and surface success/error instead of going idle.
  - allowed_read_scope: `src/tools/`, `src/utils/`, `src/tasks*`, `src/query.ts`, `src/server/services/`, tests under same areas, package/test scripts.
  - write_scope: none.
  - forbidden_paths: `.planning/debug/`, `.specify/memory/`, user config or secrets under home directories.
  - required_evidence: scheduler/query-loop entry, message/input construction, error handling, idle/status projection, and tests that prove or miss content processing.
  - handoff: fact-only payload with files inspected, commands run, observations, candidate status for C4/C10/content-processing variant, confidence, blockers.

## Verification

- `bun test src/utils/model/agent.test.ts`: RED before patch, showing inherited `CLAUDE_CODE_SUBAGENT_MODEL=haiku` overrode runtime-masked teammate `sonnet`.
- `bun test src/utils/model/agent.test.ts src/utils/swarm/teammateRuntime.test.ts src/tools/shared/spawnMultiAgent.test.ts`: 13 pass, 0 fail.
- `bun test src/utils/model/agent.test.ts src/utils/swarm/teammateRuntime.test.ts src/tools/shared/spawnMultiAgent.test.ts src/utils/swarm/teammateRuntimeProviders.test.ts src/tools/AgentTool/prompt.test.ts src/utils/messages.test.ts src/utils/attachments.test.ts src/utils/swarm/teammatePromptAddendum.test.ts`: 22 pass, 0 fail.
- `bun test src/utils/model/agent.test.ts src/tools/shared/spawnMultiAgent.test.ts src/utils/swarm/teammateRuntime.test.ts src/utils/swarm/teammateRuntimeProviders.test.ts src/utils/attachments.test.ts src/tools/AgentTool/prompt.test.ts src/utils/api.test.ts src/utils/messages.test.ts src/utils/swarm/teammatePromptAddendum.test.ts src/server/__tests__/teams.test.ts src/server/__tests__/team-watcher.test.ts src/services/api/client.test.ts src/utils/__tests__/thinking.test.ts`: 99 pass, 0 fail.
- `git diff --check`: pass, with CRLF warnings only.
- `bun run check:server`: fail; no direct stdout from the script. Manual split `bun test src/server` reproduced broad pre-existing/environment-sensitive failures: 737 pass, 3 skip, 43 fail, 5 errors. Failures span macOS/Linux icon assumptions, non-git/temp workspace path behavior, active model-count/default-model expectations, session JSONL setup, and real provider config timeout. The targeted team/provider/runtime/model-selection tests above pass.
- `bun test src/utils/swarm/teammatePromptAddendum.test.ts src/tools/AgentTool/prompt.test.ts src/tools/shared/spawnMultiAgent.test.ts src/utils/swarm/teammateRuntime.test.ts src/utils/messages.test.ts src/utils/attachments.test.ts src/utils/swarm/teammateRuntimeProviders.test.ts`: 21 pass, 0 fail.
- `bun test src/tools/shared/spawnMultiAgent.test.ts src/utils/swarm/teammateRuntime.test.ts src/utils/swarm/teammateRuntimeProviders.test.ts src/utils/attachments.test.ts src/tools/AgentTool/prompt.test.ts src/utils/api.test.ts src/utils/messages.test.ts src/utils/swarm/teammatePromptAddendum.test.ts src/server/__tests__/teams.test.ts src/server/__tests__/team-watcher.test.ts src/services/api/client.test.ts src/utils/__tests__/thinking.test.ts`: 98 pass, 0 fail.
- `git diff --check`: pass, with CRLF warnings only.
- `bun test src/tools/shared/spawnMultiAgent.test.ts src/utils/swarm/teammateRuntime.test.ts src/tools/AgentTool/prompt.test.ts src/utils/messages.test.ts src/utils/attachments.test.ts src/utils/swarm/teammateRuntimeProviders.test.ts`: 18 pass, 0 fail.
- `bun test src/utils/swarm/teammateRuntimeProviders.test.ts src/utils/attachments.test.ts src/tools/AgentTool/prompt.test.ts src/utils/api.test.ts src/utils/messages.test.ts src/utils/swarm/teammateRuntime.test.ts src/tools/shared/spawnMultiAgent.test.ts src/server/__tests__/teams.test.ts src/server/__tests__/team-watcher.test.ts`: 82 pass, 0 fail.
- `bun test src/tools/shared/spawnMultiAgent.test.ts src/utils/swarm/teammateRuntime.test.ts src/tools/AgentTool/prompt.test.ts src/utils/messages.test.ts src/utils/attachments.test.ts src/utils/swarm/teammateRuntimeProviders.test.ts src/utils/api.test.ts src/server/__tests__/teams.test.ts src/server/__tests__/team-watcher.test.ts src/services/api/client.test.ts src/utils/__tests__/thinking.test.ts`: 95 pass, 0 fail.
- `git diff --check`: pass, with CRLF warnings only.
- `bun run check:server`: fail in full existing server/tool/utils suite; script did not emit detailed report. Targeted surfaces above pass, and this matches the previously known broad gate instability.

## Residual Risk

- No live DeepSeek run was executed in this debug pass.
- `bun run check:server` remains blocked by broad existing/environment-sensitive failures outside this patch's targeted surface.
- Leader-side observability still cannot prove every out-of-process pane teammate attempted but failed to process content; it mainly shows idle/running state and optional last peer-DM summary.
- Parallel creation can still mean the first teammate initially sees only already-registered members, but it now starts after its own registration and receives inline known names plus instructions to reread config before peer messaging.
- Project cognition runtime was marked dirty/stale after the model-selection boundary fix; run `$sp-map-update` before future brownfield cognition-dependent work.

## Human Verification

- status: confirmed
- confirmed_at: 2026-05-17
- confirmation_source: user chat message "可以了"
- verified_check: User confirmed the real agent teams flow now works after the fix.
