# Workflow pre-start failures must terminate pending tasks

- Type: pitfall / state_surface_gap
- Applies to: AgentTool background dispatch, workflow batch scheduling, Reviewer contracts, TaskOutput, desktop Agent status.
- Trigger: parent received failed notification but TaskOutput repeatedly times out; queued Agent has no child transcript; repeated accepted Reviewer dispatch.

## Evidence and root cause

The student-management live run (template v27, session 7683376f-d9c0-41a8-91c9-4e7d0a0f0f05) passed intake/scope/planning but stalled during implementation. A duplicate B1 Reviewer registered a pending background task. When permit acquisition rejected, AgentTool emitted failure, but LocalAgentTask.failAgentTask only accepted running tasks. The local task remained pending after its failure notification, causing repeated 600-second TaskOutput waits. This is not evidence of missing user materials or a slow Reviewer model.

The regression in src/tools/AgentTool/workflowLaunchFailure.test.ts invokes actual AgentTool dispatch with a rejected scheduling permit. Before the repair it observed a failed parent notification alongside a pending local task; afterward the same task is failed. Preserve terminal-state guards when accepting pending/running -> failed.

## Related contract boundaries

- Current phase instructions are delivered by the assembled Desktop control turn; the hidden SDK runtime binding is generic and contains no fallback phase contract. A previous turn's terminal recovery must not run against a newly confirmed phase before its control turn is delivered. Bind handoff/finalization to session, run, phase and turn generation, including finalizers that resume after an await. Failed authoritative state writes must not dispatch a new-phase prompt.
- Routing must distinguish an affirmative terminal classification from a negative constraint such as “不要重复授权”. Incidental tests/logs must not override the requested main action. An explicit complete-flow request for the canonical development template must retain all its phases instead of silently trimming them by inferred labels.

- An ordinary AskUserQuestion answer records a decision; it must not be presented as a write-scope update. Scope approval needs a server-bound operation that updates the accepted plan and worker authority together. Keep the precise active-run delivery-plan path distinct from its numbered archive path, and test both file bytes and state through version conflicts and failed saves.
- Reviewers need the current successful Coder report and actual command receipts automatically, on initial dispatch and resume. Reuse task records and a bounded transcript excerpt instead of adding a mandatory evidence file. Production database selection does not establish prerequisites for database-free tests.
- TaskOutput consumption must acknowledge the exact task attempt's queued notification. Coalesce unread notifications and hold them while a user confirmation is pending; a resumed agent can reuse its task ID, so task ID alone is insufficient for deduplication.
- Preserve a synthetic runtime/API error before applying Coder report-format checks. A valid readyForReview=false means business work remains blocked, while the agent transport may have completed; neither status permits dependent work.

- Persist managed execution receipts before local terminal status and parent notifications. Persistence failure must never emit success; use a bounded HTTP deadline and explicit failure. HTTP cancellation cannot retract an already-started server commit, so reread authoritative state after ambiguous transport failures.
- Do not silently reset accepted Reviewer tasks. Reuse their receipt; rerun accepted Coder work only through the supported repair path after Reviewer failure. Validate every affected running dependent before any reset mutation.
- Inject the same Reviewer result contract directly into leader and child prompts. Canonical format is workflowReview {reviewStatus, requiredFixes, readyForNextBatch}. Legacy allowNextBatch can normalize only under the same status/fixes checks; conflicting fields must fail.
- Declared phase outputs are creation obligations, not proof that files already exist. Do not Read-before-create merely because the output path is known. Genuine missing inputs and missing completion outputs must retain their diagnostics and verification gates.
- Desktop terminal background task state must override stale Agent launch/running presentation. Reviewer read-only status must derive from its role, not the Coder batch's write scope.

## Verification references

Focused regression suites: workflowLaunchFailure, workflowAgentLifecycle, LocalAgentTask, workflowTaskScheduling, workflowParallelScheduler, workflowRuntimeStateBridge, developmentToolExecutionPolicy, workflowDevelopmentBatchAgentProgress, workflowRuntimeEnforcement, workflowToolPolicy, ToolCallGroup and MessageList. Canonical pack v28 synchronizes template, skill, permissions and runtime expectations.

The live run also had upstream ECONNRESET retries that later recovered. Treat provider connectivity separately; mock/fixture success does not prove a complete live-model workflow run.

## Follow-up live evidence: v28 repair/resume deadlock

Session `2aa8cf92-5775-44a7-8e90-47107a4643bb` passed phases 1–3, then B1/B2 review. An optional Leader question after dispatching B3 repair suspended the worker. Its real `WORKFLOW_EXECUTION_SUSPENDED` tool error ended in ordinary prose and was incorrectly recorded as Coder success. Whole-phase rework then discarded accepted B1/B2 receipts. The Leader resumed B3 while B1 was pending without any worker; TaskOutput repeatedly waited 600 seconds. A later report still claimed B1/B2 passed, contradicting current runtime snapshots.

- Derive managed worker failure from actual error tool results, not final prose or quoted Read contents. Do not turn an execution refusal into success merely because the model stream ended normally.
- Same-batch repair should preserve accepted prerequisites and invalidate only the failed batch plus dependent work. Real whole-phase replanning and cross-phase rollback retain their broader invalidation semantics.
- Resume same-phase route confirmations explicitly; testing only phase-id changes misses rework. Successful retry of an already-active phase must also dispatch continuation. Runtime status changes alone do not prove a model turn was sent.
- Continuation prompts need a compact current task-state summary from authoritative snapshots; stale chat/run-report claims cannot override it. Avoid another handoff file for this summary.
- Internal recovery prompts must use the internal message envelope. Content sent explicitly as user_input cannot be safely hidden later by guessing text markers.
- Public-web Playwright intentionally blocks localhost. Match evidence to available tools: HTTP/resource checks can establish skeleton serving; final browser interaction requires an authorized local channel. Do not repeatedly retry the same unsupported local URL or claim HTTP proves UI behavior.
- Incidental regenerable check caches may be retained and recorded as non-blocking. Same-scope repair is not a new optional approval step; do not launch a worker and then interrupt it with a nonessential question.

Follow-up regressions cover actual AgentTool dispatch, suspended/stale tool results, task prerequisites, partial rework, same-phase WebSocket continuation, internal envelopes and bilingual desktop controls. Canonical v29 packages the matching prompt contracts. A fresh live run after deployment remains separate evidence.

## v29 follow-up: review parsing, role-aware rework and orphan recovery

- Treat concrete Reviewer finding objects as findings, not missing fields. The v29 run returned complete workflowReview objects whose requiredFixes were objects; filtering strings silently discarded every defect and caused a misleading protocol error. Normalize compatible findings into the existing string[] storage shape; reject bad elements with their exact index and preserve bounded original findings in feedback.
- A protocol-only Reviewer failure must not invalidate successful Coder work. Real needs-fix must require Coder repair before review. Use batchId + workflowRole to normalize ledger IDs and dependency IDs before computing reset closure and readiness; persist shape need not change.
- A ledger heartbeat ages during a legitimate long model request. Check actual owning CLI liveness before treating a quiet running ledger as orphaned. Recovered interrupted work must expose a blocked/retry state without pretending completion, starting a process from GET, or discarding accepted results. A process handle proves owner existence, not independent worker health.
- In the workflow/2 follow-up, the client disconnected at 16:15:09 local time and B4 Reviewer later became interrupted while the top-level state remained active. This proves the missing recovery projection; it does not uniquely establish why the original window/process disconnected.
- Compress future prompt assembly by deduplicating repeated rules and exact facts, and place current receipts first. Preserve unique edited criteria and inline-only artifact evidence; a missing filename cannot be replaced by an unreadable opaque ID. Do not erase transcript history or delete handoff artifacts as a substitute for prompt composition fixes.

## v30 follow-up: exercise continuation rather than mocking it away

- The workflow/3 run proved the Reviewer-object repair worked, then exposed a separate SendMessage→resume path that omitted worker authority, scheduler, validation and terminal persistence. Integration tests must call real AgentTool and real SendMessage/resume/lifecycle; mocking the whole resume function cannot certify continuation. Fake provider/query and temporary transcript storage are sufficient external boundaries.
- Ending a Coder reply is not completion. Reuse the existing explicit readyForReview flag; reject missing/false/conflicting readiness and non-empty blockers without reading intent from natural-language phrases. Retain work and evidence so a receipt correction does not rerun implementation or demand another handoff file.
- Restore only a uniquely owned current Batch/role from authoritative receipts, never from transcript prose. Resume uses the same role tool filtering and current-scope scheduling as initial launch. Managed fork cannot inherit the parent's broad tool array through useExactTools.
- Observable input backfills are not new user permissions. For SendMessage replay, tolerate only derived aliases whose values exactly match recomputation from schema-validated canonical input; conflicting and unknown fields remain errors at both initial and post-permission guards.
- Control tools can succeed while paused and cannot prove business execution resumed. Match successful results to real tool_use IDs and exclude control operations; an old STALE/CONTRACT refusal must not be cleared by a later temporary pause. Successful task receipts also require current active authority at the server, while historical accepted duplicates remain idempotent.
- Delegated investigation must not automatically enter another user-confirmation/persistent-session workflow. Keep default Stage4 worker execution bounded to the supplied assignment and method references; unrelated workflows and the Leader retain their existing Skill behavior.

## v32 isolated live follow-up: distinguish missing facts from missing materials

- A successful final report may end with an explicit standalone JSON object after ordinary prose. The real B3 report contained `readyForReview:true` in that form, but the whole-message/fenced-only parser called it missing. Reproduce using the exact final report; accept narrowly bounded terminal receipts without accepting quoted examples, invalid booleans, contradictory receipts or non-empty blockers. Receipt repair must retain completed work and checks.
- Dispatch eligibility and worker knowledge are different boundaries. B4 was correctly scheduled after B2/B3 passed, but its initial context did not include their typed receipts. It consulted a draft run report and incorrectly returned blocked. Supply bounded same-session/run/phase prerequisite facts through the actual initial and resumed worker path; do not introduce another ledger file or treat the informational snapshot as execution permission.
- Measure prompt sections before blaming artifact count. The isolated Stage4 input had 42,725 text characters, including 12,223 characters of a complete discovery/brainstorming skill despite implementation having no brainstorming binding. The run-level new-product/on predicate ignored phase boundaries. Scope canonical discovery injection to its discovery phases and retain accepted scope in downstream stages; keep specialized/custom behavior separate.
- Distinguish actual runtime faults from redundant model actions: in the same run, two duplicate Reviewer launches followed real PASS notifications that the Leader had already acknowledged. The existing accepted-task guard correctly prevented rerunning them. Do not erase accepted-task protection merely to hide those refusals.

These are live observations and regression targets, not a claim that the final seven-stage acceptance or release gate has passed.


## Protocol recovery and unfinished Coder work (2026-11-17)

Session d764d026-1449-4662-9c4a-1ba9d6989f4b showed a distinct fault: a rejected missing-prompt Agent call was followed by a successful corrected launch, but session-wide recovery retained the old error. JSON-scanning every CLI message classified replayed internal recovery instructions as fresh failures; managed retries had no effective same-error bound. Thirteen already-running refusals all overlapped actual running workers: those scheduler guards were correct, not evidence of a permit leak. Preserve structured failed tool-result provenance and correlate successful retries by tool ID/order/target; never classify ordinary text or recovery echoes as new input failures. Bound identical normalized field errors and keep a real in-flight worker as legitimate waiting, excluding failed, dependency-blocked and stale ownership. Regression proof is in websocket-handler.test.ts; no persisted schema change.

The same session later made Coder wait for Reviewer approval before authorized installation/checks, while Reviewer required a ready Coder. Distinguish unfinished Coder work (readyForReview=false or blocked) from actual Reviewer needs-fix. Leader and current canonical implementation workers share the concise completion-order rule; only already-authorized remaining Coder work proceeds before review. Pending user decisions, cancelled/stale ownership and permissions remain authoritative. See workflowBatchRecoveryPrompt.test.ts and runAgent.runtime-contract.test.ts; canonical pack v33. Deterministic tests and Stage4 fixture smoke must not be described as a complete seven-stage live acceptance.


## Late terminal notification delivery and Desktop worker prompt identity (2026-11-17)

Session fbcbe6d3-3db8-4d18-a044-f932ec57e9c9 had a separate missing wake: the final background task became terminal before asynchronous authority resolution enqueued its notification. The SDK loop could exit between those steps; its previous queue subscription only handled interrupts, so a late internal task notice remained enqueued without a new Leader turn. Reproduce with actual runHeadlessStreaming, real task terminalization/notification producer and delayed boundary response while stdin remains open. The idle wake subscriber only wakes dispatchable main-thread task notifications; original queue drain/dedup and permission/confirmation/stop checks remain authoritative. Do not fix this by relaunching a Coder or treating every running workflow as busy work.

A standalone - **readyForReview=true** line in the same actual Coder report was misclassified missing because only unformatted keys were parsed. Canonical Leader/Coder now request one final JSON receipt (packv34); parser conservatively handles standalone paired emphasis/list variants without accepting prose/examples/conflicting/nonboolean/blocker claims. Recognizing a ready field grants review eligibility, not proof failed commands passed. Also, Desktop child AppState may omit workflow: resolve prompt identity through the existing Desktop runtime bridge and verify worker session/run/phase/role, instead of silently skipping canonical guidance or guessing from phase names. Use real runAgent.query-message fixtures with absent local workflow; keep execution authorization separate and unchanged.
