# Debug Session: workflow linked source completed session

## Metadata

- status: awaiting_human_verify
- created: 2026-06-04T03:20:23.7747927Z
- updated: 2026-06-04T03:38:30.0000000Z
- trigger: `$sp-debug 创建workflow失败，选择继承可见上下文后提示 Workflow sessions cannot be used as linked workflow sources`
- execution_model: leader-inline
- dispatch_shape: leader-inline
- execution_surface: leader-inline
- dispatch_reason: small focused investigation with one visible server error and one likely API validation owner
- blocked_reason: none

## Intake State

- causal_map_completed: true
- investigation_contract_completed: true
- log_investigation_plan_completed: true
- observer_framing_completed: true
- skip_observer_reason: map-backed-minimum-intake

## Current Focus

Investigate why a completed workflow session can show the workflow continuation UI but linked workflow creation fails when the user chooses inherit visible context.

Next action: query project cognition, then inspect only the selected server sessions workflow API, desktop sessions API client, and relevant ChatInput regression path to confirm the validation rule and produce a RED test.

## Scope Boundary

In scope:
- linked workflow source validation
- completed workflow sessions as linked workflow sources
- desktop linked workflow request path and server sessions workflow API

Out of scope:
- changing workflow state-machine semantics for active/running workflow sessions
- mutating existing persisted transcripts
- redesigning the plus menu or workflow launcher
- broad workflow template authoring behavior

## Key Constraints

- Active/running workflow sessions must not become valid linked workflow sources unless the server already treats them as safe.
- Completed workflow sessions should be evaluated separately from active workflow sessions.
- Fix must restore the control loop, not only hide the toast.
- Add a failing automated repro before production changes.

## Map-Backed Intake

selected_concepts:
- server.api.sessions.workflow
- desktop.workflow.api-client

minimal_live_reads:
- src/server/api/sessions.ts
- src/server/__tests__/sessions.test.ts
- desktop/src/api/sessions.ts
- desktop/src/api/sessions.test.ts
- desktop/src/components/chat/ChatInput.tsx
- desktop/src/components/chat/ChatInput.test.tsx

coverage_gaps:
- project cognition freshness is partial/review; live code must prove the control rule.

## Observer Framing

primary_suspected_loop: Desktop now exposes workflow continuation for completed workflow sessions, but server source-session validation still rejects any source session with workflow metadata, including completed workflows.
contrarian_candidate: Desktop may be sending the wrong source session id or request shape, causing the server to validate the source as an active workflow session incorrectly.
recommended_first_probe: Locate the exact error text and source validation branch, then write a server regression proving completed workflow source sessions should be allowed while running workflow source sessions remain blocked.
related_risk_targets:
- running workflow source sessions
- pending-confirmation workflow source sessions
- non-workflow linked sessions
- desktop context strategy request payloads

## Truth Ownership Map

Control State:
- server source-session validation decides whether a session may be used as a linked workflow source.

Observation State:
- desktop toast displays the server error.
- ChatInput workflow dialogs expose available choices.

Closed Loop:
- user selects Workflows from completed workflow session -> desktop calls startLinkedWorkflowSession(sourceSessionId, contextStrategy=inherit) -> server validates source session -> server creates linked workflow session or rejects -> desktop opens new session or displays error toast.

## Investigation Contract

primary_candidate_id: server-source-workflow-status-gate
candidate_queue:
- server-source-workflow-status-gate: source validation blocks all workflow sessions instead of only non-completed workflow sessions.
- desktop-wrong-source-id: desktop passes an active workflow child session id instead of intended completed source session id.
- request-shape-mismatch: context strategy or workflow payload triggers the wrong server validation branch.

first_probe: search exact error text and inspect the owning validation branch.

## Log Investigation Plan

existing_log_targets:
- user screenshot toast error text
- targeted test output from server/client regression
candidate_signal_mapping:
- exact error text found in server validation -> confirms server owner
- server test fails for completed workflow source -> confirms root cause
- desktop API payload mismatch -> confirms request boundary issue
observability_escalation:
- If exact error text is not in repo, inspect API error mapping and browser/server logs before fixing.

## Evidence

- user_report: In completed workflow session, choosing “继承可见上下文” opens context dialog but fails with toast: `无法启动工作流： Workflow sessions cannot be used as linked workflow sources`.

## Eliminated

None yet.

## Hypothesis

Active hypothesis: server source-session validation rejects any session with workflow metadata instead of allowing completed workflow sessions.
Expected experiment result: a focused server test using a completed workflow source session reproduces the same rejection before the fix.

## Senior Consequence Analysis

Affected Object Map:
- source session record
- linked workflow creation API
- workflow session lifecycle states: running, pending-confirmation, completed, failed/cancelled
- desktop linked workflow context strategy dialog
- downstream new workflow session record

State-Behavior Matrix:
- non-workflow source: existing linked workflow behavior remains allowed
- running workflow source: should remain blocked
- pending-confirmation workflow source: should remain blocked
- completed workflow source: should be allowed as a historical source context
- failed/cancelled workflow source: unknown until code evidence; do not change unless existing semantics require it

Dependency Impact Table:
- desktop ChatInput -> observes API success/failure
- desktop sessions API client -> sends request contract
- server sessions workflow API -> owns source validation
- session persistence -> stores source and new linked target

Recovery And Validation Contract:
- Add RED server regression for completed workflow source.
- Keep negative regression for running workflow source.
- Run focused server test, and if needed focused desktop test already added by prior quick task.

Coverage Gaps:
- Need live code to confirm which statuses exist and current source validation branch.

Consequence Obligations:
- CA-001: Allow completed workflow source sessions only if server state shows completion is terminal and historical; owner debug; latest resolve before fix closeout; stop if completion can still mutate.
- CA-002: Preserve rejection for active workflow source sessions; owner debug; latest resolve before verification.

## Verification Plan

- RED server regression for completed workflow source linked start.
- GREEN focused server test after fix.
- Re-run prior ChatInput regression only if server/client contract changes.

## Changed Code Paths

pending

## Verification Evidence

pending

## Project Cognition Refresh

pending

## Agent verification - 2026-06-04

Status: awaiting_human_verify

Evidence:
- Root cause: WorkflowSessionLinkService rejected every source session with workflow.mode == "workflow" before checking terminal workflow status.
- Fix: Reject only workflow source sessions whose workflow status is not "completed".
- RED: `bun test src/server/__tests__/sessions.test.ts -t "completed workflow source sessions"` failed with expected 201 / received 400 before production fix.
- GREEN: `bun test src/server/__tests__/sessions.test.ts -t "completed workflow source sessions|non-completed workflow source"` passed 2 tests.
- Guard: `bun test src/server/__tests__/sessions.test.ts -t "WorkflowSessionLinkService should reject non-completed workflow"` passed 1 test.

Human verification needed:
- In the desktop completed workflow session, open plus menu -> Workflows -> choose a workflow -> Inherit visible context. It should create the new workflow instead of showing WORKFLOW_SOURCE_INVALID.

## Linked Follow-Up Sessions

- `.planning/debug/workflow-inherit-context-too-large-summary-fallback.md` - derived_issue reported during human verification: completed/existing workflow start now reaches a context-size guard that asks for summarized context instead of the previous source-session validation error.
