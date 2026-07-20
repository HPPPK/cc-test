---
name: "sp-debug"
description: "Use when a bug, regression, failed verification, or unexpected runtime behavior needs a resumable investigation and fix workflow."
argument-hint: "Describe the bug to investigate, or leave blank to resume the most recent session"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/debug.md"
user-invocable: true
---
## Invocation Syntax

- In this integration, invoke workflow skills with `/sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: A defect or failed verification needs structured root-cause investigation instead of ad hoc fixes.
- **Primary objective**: Build a resumable debug session that gathers evidence, identifies root cause, applies a fix, and verifies the result.
- **Primary outputs**: Debug-session state, evidence, verified fix artifacts when justified, and an honest blocked/resolved status.
- **Default handoff**: Stay inside the debug session until resolved or blocked; route back to execution only after the defect contract is satisfied.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Drive a resumable debugging workflow that finds the real failure mechanism before any fix is accepted.

## Context

- Primary inputs: the user's report, the active debug-session state, the failing runtime or verification evidence, and the task-local project cognition query bundle with readiness and returned `minimal_live_reads`.
- The debug session file under `.planning/debug/` is the durable state source of truth for this workflow.
- Delegated helpers are evidence collectors, not owners of the overall investigation.
- Debug execution is complexity-based: small focused investigations may stay leader-inline, while broad or independent evidence lanes use one or more subagents.
- Before substantive investigation, present one Debug Understanding Checkpoint covering the reported symptom, expected behavior, reproduction or failing signal, known evidence, investigation boundary, candidate focus, a concrete ordered investigation plan, the fix gate, first evidence action, and progress signal; keep the checkpoint plain text for terminal output with no HTML tags or inline line-break markup; wait for user confirmation and record it in the debug session file.


## Codex Project Cognition Advisory Gate

**Crucial First Step**: You MUST use project cognition compass first: run `'C:\Users\11034\.specify\bin\project-cognition.exe' compass --intent debug '--query=$ARGUMENTS' --format json` before any investigation or fixes. Read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons, `verification_hints`, `followup_surfaces`, and `before_fix_claim`; treat `coverage_diagnostics` as confidence and closeout signals, never as route candidates. Treat `expansion_ref` as a normal continuation path and run `project-cognition expand --id <id> --section <section> --format json` only when coverage state or live evidence requires more map detail. Do not infer final edit scope from `minimal_live_reads` or `first_pass_paths`. Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`. When `compass_state=needs_semantic_intake`, write `semantic_intake` from project vocabulary and rerun compass with `--semantic-intake-file`, or use the advanced `lexicon -> semantic_intake -> query` path when explicit concept decisions are needed. Preserve advanced routing through `'C:\Users\11034\.specify\bin\project-cognition.exe' query --intent debug --query-plan '<query_plan_json>' --format json` for precision cases.
- Interpret returned readiness: `query_ready` reads top-level `minimal_live_reads` first and then lane-level `first_pass_paths`; `review` permits only returned `minimal_live_reads` plus `coverage_diagnostics`; `needs_rebuild` treats map output as advisory, continues with live repository evidence, and recommends `{{invoke:map-scan}}`, then `{{invoke:map-build}}` only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows outside a `greenfield_empty` baseline, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`; `blocked` reports the runtime issue as advisory map state and continues with live repository evidence; `unsupported_runtime` continues with live evidence and records that compass intake was unavailable. If `baseline_kind=greenfield_empty`, continue with workflow artifacts and live requirements instead of treating absent graph paths as `needs_rebuild`. If the user's actual request is to fix cognition runtime state, report the blocked state and follow the same map-update-first routing policy.
- Use `map-update` for ordinary existing-baseline gaps. If `baseline_kind=greenfield_empty`, do not recommend map-scan -> map-build solely because the graph has no paths; continue with workflow artifacts and live requirements. Use `map-scan -> map-build` only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows outside `greenfield_empty`, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`.
- Treat the project cognition compass packet as advisory navigation for brownfield context; do not fall back to chat memory or ad hoc repository instincts when compass-backed runtime coverage should guide the route.
- Treat this as advisory navigation, not a hard gate; continue with live repository evidence when the bundle is weak, stale, or missing, and use map maintenance only when it is actually useful.
- Mutation closeout is separate from entry routing: entry stale may continue, but workflow-owned mutation closeout is not an external map-maintenance handoff. If the workflow changes source/runtime truth-owning surfaces, shared surfaces, command/route/contract boundaries, verification entry points, runtime assumptions, or other project-related behavior surfaces, final state must run inline project cognition update from changed paths, affected surfaces, and verification evidence.
- Inline project cognition update uses `project-cognition delta append` followed by `project-cognition update --delta-session "$DELTA_SESSION_ID" --reason workflow-finalize --format json` when a delta session exists, or `project-cognition update --payload-file ".specify/project-cognition/updates/<update-id>.json" --reason workflow-finalize --format json` when no delta session exists.
- The payload-file path must include changed_paths, behavior_surfaces, generated_surfaces, state_contracts, verification, known_unknowns, and confidence_notes so the update is equivalent to `sp-map-update`, not just a path stamp; `verification_evidence` and `generated_surface_notes` are accepted compatibility aliases.
- Use `known_unknowns` only for blockers that make the cognition update unsafe to trust. If unrelated dirty or untracked working-tree paths were excluded by explicit workflow-owned paths, record that as `confidence_notes` or `boundary.initial_dirty_paths`, not as blocking `known_unknowns`.
- clean closeout keys on `result_state`, not `update_id`, `last_update_id`, or freshness alone. Treat `ready` and `no_op` as clean, `partial_refresh` as recorded but not fully clean, `needs_rebuild` as a map-scan/map-build route, `blocked` as blocked, and `recorded` as legacy recorded-only output that is never clean completion.
- Use `project-cognition mark-dirty --reason "<reason>" --format json` only when inline update cannot complete. Dirty only when inline update cannot complete.
- `sp-map-update` is for manual/external maintenance and follow-up repair after user edits, interrupted workflows, or explicit operator map-maintenance requests. It is not routine cleanup for changes this workflow just made.
- A project-cognition compass intake is not complete when it returns JSON. It is complete only when readiness drives routing, `minimal_live_reads` constrains inspection, lane-level `first_pass_paths` reasons are considered, and relevant facts are carried into the next workflow artifact or execution state.
- Carry forward the selected capability or symptom, evidence routes, minimal reads, competing truths, and unresolved coverage gaps into debug session state before root-cause claims.

## Process

- Recover or initialize the debug session and current hypothesis.
- Gather evidence through the current investigation strategy.
- For consequence-sensitive failures, trace affected objects, dependency loops, control/observation states, adjacent risk targets, and any `CA-###` stop-and-reopen conditions before accepting a fix.
- Apply a fix only after the failure mechanism is understood well enough to justify it.
- Verify the result and update the session state before any resolution claim.

## Output Contract

- Keep the debug session state, current hypothesis, evidence, and verification outcome explicit.
- Produce a verified fix only when the evidence supports it.
- Report blocked or unresolved states honestly when the investigation cannot yet close.

## Guardrails

- No speculative fixes before evidence supports the failure mechanism.
- No final resolution without fresh verification evidence.
- No subagent may take ownership of the debug session state.
- No subagent-assisted work may continue without a safe lane; blocked debug execution records `subagent-blocked`, `execution_surface: none`, and a concrete blocked reason.

## Senior Consequence Analysis Gate

Run this gate whenever the request, artifact set, defect, or planned change can affect lifecycle operations, running objects, concurrent work, destructive behavior, shared state, downstream consumers, compatibility, security-sensitive behavior, or multiple plausible product behaviors.

Project cognition first. Use the project cognition runtime to identify ownership, consumers, state surfaces, change-propagation facts, verification routes, conflicts, known unknowns, and coverage gaps. Senior consequence analysis second. Turn those facts into explicit product and implementation obligations instead of treating the graph as the decision-maker.

Project cognition readiness provides routing advice. If readiness is `query_ready`, read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons. If readiness is `review`, inspect the returned `minimal_live_reads` before continuing and treat `coverage_diagnostics` as confidence and closeout signals. If readiness is `needs_rebuild`, continue with live repository evidence and recommend `/sp-map-scan -> /sp-map-build` only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows outside `greenfield_empty`, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`. If readiness is `blocked`, report the blocked state and continue with live repository evidence unless the user's actual request is to fix cognition runtime state. If readiness is `unsupported_runtime`, continue with live evidence and record that compass intake was unavailable. If `baseline_kind=greenfield_empty`, continue with workflow artifacts and live requirements; do not recommend map-scan -> map-build solely because the graph has no paths. Carry relevant project cognition facts, returned `minimal_live_reads`, inference notes, and coverage gaps into the workflow's artifacts or durable state, but back consequence claims with live code, tests, scripts, configuration, or authoritative docs. Mutation closeout is separate from entry routing: entry stale may continue, but that does not allow source/runtime mutation workflows to defer closeout. Workflow-owned mutation closeout is not an external map-maintenance handoff; after changing project-related files or behavior, the workflow must run inline project cognition update from its changed paths, affected surfaces, and verification evidence, with `project-cognition mark-dirty` only as fallback when inline update cannot complete. `sp-map-update` is for manual/external maintenance and follow-up repair; it is external map maintenance, not routine closeout for this workflow's own changes. In shared routing summaries, sp-map-update is for manual/external maintenance and ordinary existing-baseline gaps.

Required output when the gate triggers:

- **Affected Object Map**: name each object, record, worker, queue, artifact, command, API, file surface, user-visible state, or downstream consumer that can be affected.
- **State-Behavior Matrix**: describe behavior for each important lifecycle state, including created, queued, running, paused, failed, cancelled, completed, resumed, archived, missing, stale, or partially refreshed states when relevant.
- **Dependency Impact Table**: map direct dependencies, indirect consumers, shared state, compatibility surfaces, validation routes, and adjacent workflows that can break if semantics change.
- **Recovery And Validation Contract**: state rollback, retry, idempotency, cleanup, migration, observability, and validation evidence required before handoff or completion.
- **Coverage Gaps**: list what project cognition or live evidence cannot prove, who must resolve each gap, the latest safe resolve phase, the stop-and-reopen condition, and the routing decision: current workflow may continue with an assumption, must ask the user, must route to clarification or deep research, or must request map maintenance.
- **Consequence Obligations**: assign stable `CA-###` IDs to every obligation that must survive downstream handoff, task generation, worker packets, verification, or debug closeout. Each `CA-###` must include claim, affected objects, owner workflow, latest resolve phase, status, and stop-and-reopen condition.

Stand down only for docs-only wording changes, trivial isolated fixes, or local refactors that cannot affect lifecycle operations, running state, destructive operations, shared state, downstream consumers, compatibility, security, or multiple behavior choices. Record the no-trigger reason or stand-down reason in the workflow's durable artifact or closeout before skipping the required outputs.

If the gate triggers and the current workflow cannot preserve the required outputs, stop and route to the workflow that can. Do not mark ready, resolved, handoff-ready, planning-ready, or complete while triggered consequence obligations remain unresolved, unmapped, or unsupported by validation evidence.

<!-- SEMANTIC_WORK_CONTRACT_BEGIN -->
## Semantic Work Contract

[AGENT] Treat every project-cognition-backed request as natural-language intake first, regardless of whether the eventual work looks like planning, research, debugging, implementation, review, or map maintenance.

- **Single unified entrypoint**: the agent is the semantic mediator between the user's words and the project's stored vocabulary. Do not choose debug, implement, plan, or research from the user's raw words. First normalize the request into project terms, surfaces, constraints, exclusions, and evidence needs.
- **WorkContract v1**: before route or write-scope decisions, carry a contract with `raw_request`, `normalized_goal`, `semantic_intake`, `selected_concept_ids`, `rejected_concept_ids`, `evidence_plan`, `permission_decision`, and `learning_contract`.
- **Facet coverage**: keep `semantic_intake` decisions explicit about covered facets, missing facets, match sources, and rejected false friends; do not collapse the candidate universe into one top-similarity route.
- **Runtime path**: use compass-first navigation for ordinary generated workflows. Run or emulate `project-cognition compass --intent <intent> --query "$ARGUMENTS" --format json` as the default brownfield intake, then use semantic-intake escalation when the compass packet is draft-like, localized, symptom-first, mixed-language, missing coverage, or needs explicit concept decisions. When that escalation is available, run or emulate `project-cognition semantic-intake --input <work-contract-input.json> --format json`; if the command is unavailable, manually produce the same fields from the alias catalog and existing compass/query guidance.
- **Semantic-intake evidence boundary**: `semantic-intake` can rank candidates, explain match basis, reject false friends, suggest `minimal_live_reads`, and name missing facets. It is not proof that a bug exists, a design is correct, a fix is safe, or a release is ready.
- **v1.1 audit artifact**: when semantic-intake escalation influences routing, capture a replayable WorkContract artifact with the semantic-intake input/output snapshot, selected/rejected basis, permission upgrade/downgrade reason, action log, and route corrections. If available, run or emulate `project-cognition semantic-audit --input <semantic-audit-input.json> --format json` to build that record. The audit artifact records why the route was chosen; it does not authorize source changes, does not read live source, does not raise permission above P2, and does not replace workflow verification.
- **Audit fallback**: if semantic-audit is unavailable, manually produce the same semantic_audit_input fields from the WorkContract, semantic-intake input/output, route decision, permission decision, action log, and route corrections. Do not block on installing a newer runtime solely for semantic-audit; continue only under the lower available permission and prove any later claims with live evidence.
- **v1.2 evidence-guided inspection**: when semantic-audit returns inspection_plan, treat it as the only P2 live-read plan. inspection_plan maps each missing facet or evidence need to a bounded target. Execute targeted_read only for listed target_path or target_id; do not broaden reads from raw user wording. Capture live_evidence_capture before raising permission. Use rerank_after_inspect before any root-cause, fixed, complete, or release-safe claim. Apply stale_index_downgrade when runtime is unavailable, stale, missing owners, or contradicted by live evidence.
- **v1.2.1 captured evidence gate**: workflow-captured live_evidence_capture may feed rerank_assessment, but live evidence can create a permission_promotion_candidate only. candidate_only is not granted permission, not authorization to edit, and not a final claim. route_contradicted downgrades permission, blocks targeted_inspect/change/final claims, and requires rerunning semantic-intake or choosing another route.
- **v1.2.2 owner confidence**: owner_bundle_confidence summarizes indexed owner roles for selected candidates; it is confidence, not live proof. owner_miss_expansion max_radius is 1. If no bounded target_id exists, stop and request map update or user clarification; do not broaden reads.
- **v1.2.3 live source boundary**: route vocabulary evidence is not live source evidence. A live_evidence_capture item may support rerank_assessment only when `source_kind` is `source`, `read_path` names the bounded source read from inspection_plan or selected owner hints, and `supports_candidate` or `contradicts_candidate` is explicit. Otherwise permission_promotion_candidate stays blocked by live_source_evidence_required and bounded_source_evidence_required.
- **v1.3 verification owner discovery**: verification_owner_discovery identifies indexed or missing verification owners and targeted_test candidates. It does not grant P3/P4, does not mark work fixed, and keeps promotion_blocked true until workflow authorization and verification results exist.
- **v1.3.1 verification result ingestion**: verification_results may be recorded after the workflow runs targeted verification. A result satisfies claim_readiness only when every selected candidate has an indexed verification owner, status is passed, and verification_path matches an indexed verification owner for the selected candidate. Without workflow_authorization, claim_status is claim_candidate, claim_ready remains false, and workflow_authorization is still required.
- **v1.3.2 workflow authorization baseline**: workflow_authorization is the explicit bridge from runtime evidence to workflow-owned claims. The v1.3.2 baseline allowed only `root_cause_claim` after bounded source evidence, matching passed verification for every selected candidate, `status: authorized`, `authorized_claims` containing `root_cause_claim`, and a non-empty `authorization_ref`.
- **v1.3.3 claim-specific final claims**: current generated workflows may mark `fixed_claim`, `completed_claim`, or `release_safe` claim_ready only when every selected candidate has claim-specific passed verification, top-level workflow_authorization has `status: authorized`, `authorized_claims` contains that claim, and workflow_authorization contains a matching `claim_authorizations[]` entry with `status: authorized`, a non-empty `authorization_ref`, and `verification_evidence_refs` covering the matched verification results. Empty verification `claim_type` is legacy-compatible only for `root_cause_claim`. Claim readiness still does not grant P3/P4 permission, unblock source edits, or prove release safety beyond the named claim.
- **v1.3.18 verification outcome policy**: failed verification results block final claims until superseded by a newer matching passed rerun and surface `verification_result_failed`; blocked verification results block final claims until recovery or rerun produces a newer matching passed result and surface `verification_result_blocked`; skipped or otherwise inconclusive verification results block final claims and surface `verification_result_inconclusive`. A newer passed rerun may recover claim candidacy only when it matches the same indexed verification owner path and selected candidate. These blockers explain verification state; they do not prove root cause, authorize source edits, or grant P3/P4 permission.
- **v1.3.19 active claim authorization policy**: workflow_authorization.active_claim_type records the single active final claim when a workflow authorizes more than one claim type. Multiple authorized claims require explicit active_claim_type; otherwise claim readiness stays blocked with `active_claim_type_required`. If active_claim_type is not listed in authorized_claims, claim readiness stays blocked with `active_claim_not_authorized`. Single-claim authorization remains backward-compatible and still does not infer claims from workflow names.
- **v1.3.4 audit state persistence**: persist semantic-audit-input.json and semantic-audit-output.json next to the active workflow state. Use `semantic_audit_input_path` and `semantic_audit_output_path` to record the exact files, with `<WORKFLOW_STATE_DIR>/semantic-audit-input.json` and `<WORKFLOW_STATE_DIR>/semantic-audit-output.json` as the default when a workflow-state directory exists. On resume, re-read `semantic_audit_state`, both persisted audit files, `claim_authorization_refs`, and `claim_verification_refs` before recomputing claim_readiness or making final claims. If any referenced file is missing, stale, or inconsistent with the current route decision, set `semantic_audit_resume_status` to `missing|stale|needs-rerun` and rerun or rebuild the audit instead of trusting chat memory.
- **v1.3.5 resume validation**: before trusting persisted claim_readiness on resume, compare selected_candidate_ids, active_claim_type, claim_authorization_refs, and claim_verification_refs from workflow state against the persisted semantic-audit-output.json. Record the comparison in `semantic_audit_resume_validation` and `semantic_audit_route_fingerprint`. If selected candidates, active claim type, authorization refs, verification refs, or route decision fingerprint differ, set `semantic_audit_resume_status: needs-rerun` and rebuild semantic-audit-input.json before any final claim.
- **v1.3.6 generated resume smoke**: generated workflows must perform a prompt-level generated resume smoke before trusting persisted semantic-audit state. Verify that semantic-audit-input.json and semantic-audit-output.json exist. Compare selected_candidate_ids, active_claim_type, and semantic_audit_route_fingerprint against workflow state plus `semantic-audit-input.json.semantic_audit_input.route_decision`; compare claim_authorization_refs and claim_verification_refs against `semantic-audit-output.json.workflow_authorization and semantic-audit-output.json.claim_readiness`. Record `semantic_audit_generated_resume_smoke` and `semantic_audit_stale_reasons`. Stale-state detection remains prompt-only in v1.3.6. Fingerprint mismatches are route-changed. Use the semantic audit resume examples at `.specify/templates/examples/semantic-audit-resume/scenarios.md` when available. If any smoke check fails, set `semantic_audit_resume_status: needs-rerun`, keep claim_ready false, and rebuild semantic-audit-input.json before any final claim.
- **v1.3.9 optional runtime validator**: when available, generated workflows may run `project-cognition semantic-audit-resume --input <resume-validation.json> --format json` as an optional runtime validator for the same resume smoke. The input should contain extracted workflow state plus concrete paths to persisted semantic-audit-input.json and semantic-audit-output.json; do not require the runtime to parse workflow-state.md. Prompt fallback remains valid when the command is unavailable, blocked, or unnecessary. The validator is a comparison helper only and does not authorize source edits, final claims, or P3/P4 permission. Its output records `validator: semantic-audit-resume`, `can_reuse_persisted_claim_readiness`, `grants_permission: false`, and `boundary: comparison_only_no_source_edit_or_claim_authorization`.
- **v1.3.10 downstream validator examples**: generated projects include concrete runtime-adoption fixtures under `.specify/templates/examples/semantic-audit-resume/`. Use `resume-validation.json` as the fresh example and `resume-validation-route-changed.json` as the stale route example; both reference sibling `semantic-audit-input.json` and `semantic-audit-output.json`. These examples demonstrate the optional validator input shape and expected output without making the validator mandatory.
- **v1.3.11 resume validator workflow preference**: on resume, prefer the optional runtime validator when a compatible `project-cognition semantic-audit-resume` command is available. Build an ephemeral resume-validation.json from the current workflow state's semantic_audit_state plus concrete `semantic_audit_input_path` and `semantic_audit_output_path`, run the validator, and copy its smoke status, validation status, stale reasons, and reuse decision back into workflow state. If the validator returns fresh and `can_reuse_persisted_claim_readiness: true`, the workflow may reuse persisted claim readiness for the same active claim; this still does not grant P3/P4 permission or source edits. If the validator is unavailable, blocked, or returns stale output, prompt fallback remains valid and any failed result keeps final claims blocked until semantic-audit-input.json is rebuilt.
- **v1.3.12 stale case matrix**: generated projects also include executable stale fixtures for `resume-validation-active-claim-changed.json`, `resume-validation-missing-file.json`, `resume-validation-claim-ref-mismatch.json`, and `resume-validation-verification-ref-mismatch.json`. Use them to understand how the optional validator reports each stale reason before trusting resumed claim readiness.
- **v1.3.13 real downstream resume smoke**: generated-project tests verify the validator with workflow-local semantic-audit-input.json and workflow-local semantic-audit-output.json under an actual downstream state directory, plus an ephemeral resume-validation.json built from that local state. Treat this as the adoption proof: examples teach the shape, while workflow-local files prove path resolution and resume behavior.
- **Workflow-written audit input**: when a workflow uses semantic-intake escalation, write or carry `semantic-audit-input.json` in workflow state before broad live reads. The object is named `"semantic_audit_input"` in notes/handoffs and has this minimum shape:
  ```json
  {
    "semantic_audit_input": {
      "version": 1,
      "work_contract": {
        "id": "<stable workflow-local id>",
        "raw_request": "<original user words>",
        "normalized_goal": "<agent-normalized project goal>",
        "workflow_intent": "<intent hint only>",
        "extracted_facets": ["<project-language facet>"],
        "semantic_intake_ref": "semantic_intake_output",
        "selected_concept_ids": ["<primary concept id>"],
        "rejected_concept_ids": ["<false friend concept id>"],
        "evidence_plan": [
          {
            "evidence_need": "<missing facet or verification need>",
            "suggested_action": "<bounded live-read or clarification step>",
            "owner_ref": "<candidate id or path owner>"
          }
        ],
        "permission_decision": {
          "current_level": "P0|P1|P2",
          "maximum_without_live_evidence": "P0|P1|P2",
          "blocked_actions": ["change", "fixed_claim", "completed_claim", "release_safe"]
        },
        "learning_contract": {
          "memory_level": "M0|M1",
          "promotion_requires": ["live_source_evidence", "user_confirmation_or_verified_behavior"]
        }
      },
      "semantic_intake_input": {},
      "semantic_intake_output": {},
      "route_decision": {
        "selected_candidate_ids": [],
        "contrast_candidate_ids": [],
        "rejected_candidate_ids": [],
        "selection_reason": "<facet coverage and false-friend reasoning>"
      },
      "permission_decision": {
        "requested_level": "P0|P1|P2",
        "evidence_level": "semantic_intake_only",
        "requested_actions": [],
        "upgrade_reasons": [],
        "downgrade_reasons": []
      },
      "workflow_authorization": {
        "workflow_intent": "<active workflow name, informational only>",
        "status": "authorized|blocked|missing",
        "authorized_claims": ["root_cause_claim|fixed_claim|completed_claim|release_safe"],
        "active_claim_type": "<single active claim when authorized_claims has more than one value>",
        "authorization_ref": "<stable workflow evidence ref proving the workflow reviewed the evidence>",
        "claim_authorizations": [
          {
            "claim_type": "fixed_claim|completed_claim|release_safe",
            "status": "authorized|blocked|missing",
            "authorization_ref": "<stable workflow evidence ref for this claim>",
            "verification_evidence_refs": ["<matching claim-specific passed verification evidence ref>"],
            "reason": "<why the active workflow permits this claim type>"
          }
        ],
        "reason": "<why the active workflow permits this claim type>"
      },
      "action_log": [],
      "route_corrections": [],
      "semantic_audit_state": {
        "semantic_audit_status": "not-needed|input-draft|audit-recorded|claim-candidate|claim-ready|blocked",
        "semantic_audit_input_path": "<WORKFLOW_STATE_DIR>/semantic-audit-input.json",
        "semantic_audit_output_path": "<WORKFLOW_STATE_DIR>/semantic-audit-output.json",
        "semantic_audit_resume_status": "fresh|missing|stale|needs-rerun",
        "semantic_audit_resume_validation": "not-run|fresh|missing-file|route-changed|active-claim-changed|claim-ref-mismatch|verification-ref-mismatch|needs-rerun",
        "semantic_audit_route_fingerprint": "<stable fingerprint of route_decision.selected_candidate_ids plus active_claim_type>",
        "semantic_audit_generated_resume_smoke": "not-run|passed|failed|not-applicable",
        "semantic_audit_stale_reasons": ["none|missing-file|route-changed|active-claim-changed|claim-ref-mismatch|verification-ref-mismatch"],
        "active_claim_type": "none|root_cause_claim|fixed_claim|completed_claim|release_safe",
        "selected_candidate_ids": ["<selected candidate id>"],
        "claim_readiness_status": "not-evaluated|claim_blocked|claim_candidate|claim_ready",
        "claim_authorization_refs": ["<workflow authorization ref>"],
        "claim_verification_refs": ["<matching claim-specific passed verification evidence ref>"]
      }
    },
    "semantic_audit_output": {
      "live_evidence_capture": [
        {
          "step_id": "<inspection step id>",
          "read_path": "<bounded path actually read>",
          "evidence_need": "<evidence need from inspection_plan>",
          "source_kind": "source|route_vocabulary|runtime|user_confirmation",
          "source_ref": "<source path, runtime artifact, user confirmation id, or semantic snapshot ref>",
          "line_refs": ["<line or range reference when source_kind is source>"],
          "observed_signal": "<specific source/runtime signal>",
          "supports_candidate_id": "<selected candidate id, when supported>",
          "supports_candidate": false,
          "contradicts_candidate_id": "<selected candidate id, when contradicted>",
          "contradicts_candidate": false,
          "supports_facets": [],
          "missing_facets": [],
          "content_hash": "<optional content hash for replay>",
          "captured_at": "<optional timestamp>",
          "evidence_ref": "<stable evidence reference>",
          "verification_owner": "<optional verification owner hint>"
        }
      ],
      "rerank_assessment": {
        "status": "evidence_missing|route_supported|route_contradicted|no_selected_route",
        "selected_candidate_id": "<selected candidate id>",
        "supporting_evidence_refs": [],
        "contradicting_evidence_refs": [],
        "permission_promotion_candidate": {
          "current_allowed_level": "P0|P1|P2",
          "candidate_level": "P1|P2|P3",
          "status": "blocked|candidate_only",
          "granted": false,
          "blocked_by": ["verification_owner_discovery", "workflow_authorization", "verification_result_required"],
          "reason": "<why this is or is not a later promotion candidate>"
        }
      },
      "owner_bundle_confidence": {
        "summary": "owner_bundle_high|owner_bundle_medium|owner_bundle_low|owner_bundle_missing",
        "candidates": [
          {
            "candidate_id": "<selected candidate id>",
            "primary_paths": [],
            "supporting_paths": [],
            "truth_paths": [],
            "verification_paths": [],
            "confidence": "high|medium|low",
            "confidence_reasons": [],
            "covered_owner_roles": [],
            "missing_owner_roles": []
          }
        ]
      },
      "owner_miss_expansion": {
        "max_radius": 1,
        "allowed_target_ids": [],
        "blocked_reason": "<why expansion is blocked, if no bounded target exists>",
        "on_miss": "stop_and_request_map_update_or_user_clarification",
        "blocked_actions": ["inspect_broadly", "change", "root_cause_claim", "fixed_claim", "completed_claim", "release_safe"]
      },
      "verification_owner_discovery": {
        "summary": "verification_owner_indexed|verification_owner_partial|verification_owner_missing",
        "required_owners": [
          {
            "candidate_id": "<selected candidate id>",
            "status": "owner_indexed|owner_missing",
            "verification_paths": [],
            "verification_command_candidates": ["targeted_test:<verification path>"],
            "required_signals": ["positive verification covers selected behavior", "regression verification covers rejected or contrast false friends"],
            "required_action": "identify positive and regression verification owner",
            "blocked_by": ["verification_owner_missing", "verification_result_required"]
          }
        ],
        "blocked_claims": ["root_cause_claim", "fixed_claim", "completed_claim", "release_safe"],
        "promotion_blocked": true,
        "reason": "<why verification owner discovery still blocks claim promotion>"
      },
      "verification_results": [
        {
          "candidate_id": "<selected candidate id>",
          "verification_path": "<indexed verification owner path>",
          "command": "<targeted verification command actually run>",
          "status": "passed|failed|blocked",
          "claim_type": "root_cause_claim|fixed_claim|completed_claim|release_safe",
          "claim_types": ["root_cause_claim|fixed_claim|completed_claim|release_safe"],
          "evidence_ref": "<stable verification evidence reference>",
          "captured_at": "<optional timestamp>",
          "summary": "<short verification result summary>"
        }
      ],
      "workflow_authorization": {
        "workflow_intent": "<active workflow name, informational only>",
        "status": "authorized|blocked|missing",
        "authorized_claims": ["root_cause_claim|fixed_claim|completed_claim|release_safe"],
        "authorization_ref": "<stable workflow evidence ref proving the workflow reviewed the evidence>",
        "claim_authorizations": [
          {
            "claim_type": "fixed_claim|completed_claim|release_safe",
            "status": "authorized|blocked|missing",
            "authorization_ref": "<stable workflow evidence ref for this claim>",
            "verification_evidence_refs": ["<matching claim-specific passed verification evidence ref>"],
            "reason": "<why the active workflow permits this claim type>"
          }
        ],
        "reason": "<why the active workflow permits this claim type>"
      },
      "claim_readiness": {
        "inspect_status": "inspect_ready|inspect_limited|inspect_blocked",
        "inspect_ready": false,
        "change_status": "change_blocked|change_candidate",
        "change_ready": false,
        "claim_status": "claim_blocked|claim_candidate|claim_ready",
        "claim_type": "root_cause_claim|fixed_claim|completed_claim|release_safe",
        "claim_ready": false,
        "verification_satisfied": false,
        "promotion_blocked": true,
        "blocked_by": ["verification_result_required", "verification_owner_match_required", "verification_result_failed", "verification_result_blocked", "verification_result_inconclusive", "workflow_authorization", "workflow_authorization_ref_required", "claim_type_not_supported", "claim_specific_verification_required", "claim_authorization_required", "claim_authorization_ref_required", "claim_authorization_verification_ref_required", "active_claim_type_required", "active_claim_not_authorized"],
        "claim_verification_refs": ["<matching claim-specific passed verification evidence ref>"],
        "evidence_trail": ["<bounded live evidence ref>", "<matching verification result ref>"],
        "reason": "<why claim remains blocked or is only a candidate>"
      },
      "inspection_plan": {
        "readiness": "inspect_ready|inspect_limited|inspect_blocked",
        "max_permission": "P0|P1|P2",
        "steps": [
          {
            "id": "<stable step id>",
            "candidate_id": "<selected candidate id>",
            "evidence_need": "<missing facet or evidence need>",
            "target_path": "<bounded owner path, if known>",
            "target_id": "<expansion target or unresolved owner id, if path is unknown>",
            "suggested_action": "<bounded live-read purpose>",
            "allowed_action": "targeted_read|resolve_owner_before_source_read",
            "permission_level": "P1|P2",
            "expected_signal": "<signal that would support the route>",
            "on_contradiction": "downgrade_route_and_rerun_semantic_intake"
          }
        ],
        "live_evidence_capture": {
          "required_fields": ["source_kind", "read_path", "evidence_need", "observed_signal", "supports_candidate", "contradicts_candidate", "evidence_ref"],
          "boundary": "records evidence after bounded reads; only source_kind=source with a bounded read_path from inspection_plan or selected owner hints can support rerank; route_vocabulary is not live source evidence and does not authorize edits or final claims"
        },
        "rerank_after_inspect": {
          "required_when": ["live_evidence_contradicts_selected_candidate", "required_facet_remains_missing", "selected_owner_path_missing"],
          "inputs": ["inspection_plan.steps", "live_evidence_capture", "semantic_intake_snapshot"],
          "blocked_claims_until_rerank": ["root_cause_claim", "fixed_claim", "completed_claim", "release_safe"],
          "permission_promotion_blocked": true
        },
        "stale_index_downgrade": {
          "conditions": ["runtime_unavailable", "stale_index", "selected_owner_missing", "live_evidence_contradicts_candidate"],
          "downgrade_to": "P0|P1",
          "reason": "live evidence or runtime freshness wins over indexed routing"
        },
        "blocked_actions": ["change", "root_cause_claim", "fixed_claim", "completed_claim", "release_safe"]
      }
    }
  }
  ```
- **PermissionDecision**: carry `maximum_without_live_evidence` explicitly.
  - `P0`: no usable cognition baseline; ask for or gather minimal live evidence before route claims.
  - `P1`: route/read-only candidate selection only; no source edits.
  - `P2`: bounded live reads and artifact planning are allowed; source edits still require workflow authorization plus live evidence.
  - Higher permissions require live repository evidence, active workflow rules, and verification signals outside semantic intake.
- **Permission-gated actions**: do not use semantic intake alone to authorize source changes, destructive operations, dependency changes, broad refactors, root-cause claims, fixed claims, complete claims, or release-safe claims.
- **LearningContract**: carry the memory level separately from action permission.
  - `M0`: no durable learning; runtime unavailable, match ambiguous, or evidence missing.
  - `M1`: candidate lesson only; record in working state if useful, but do not promote as durable project truth.
  - `M2`: durable learning only after live evidence or verified artifacts prove the lesson is reusable.
- **Final claim gate**: do not claim root cause, fixed, complete, or release-safe from `semantic-intake`, alias ranking, or similarity alone. Root-cause claims require bounded live source evidence, matching passed verification for every selected candidate, and explicit workflow_authorization. Fixed, complete, and release-safe claims additionally require claim-specific passed verification and a matching claim_authorizations entry. Multiple authorized claims require explicit active_claim_type. Failed, blocked, skipped, or inconclusive verification blocks final claims until a newer matching passed rerun supersedes it. These gates do not grant source-edit permission or release approval beyond the named claim.
<!-- SEMANTIC_WORK_CONTRACT_END -->

## Complexity-Based Debug Execution

`sp-debug` is leader-owned and evidence-first. Choose the execution path from the shape of the investigation, then record the decision in the debug session file.

Use `leader-inline` when the investigation is small, focused, and has a short evidence chain, such as one failing test, one clear error, one local module, or one reproduction path.

Use `subagent-assisted` when the investigation has multiple independent evidence lanes, broad surface area, multiple plausible causes, multiple modules or logs to inspect, independent repro or verification lanes, or meaningful parallelism.

Use `blocked` when the next safe step is unsafe, unavailable, or unpacketizable. Preserve the blocked state as `dispatch_shape: subagent-blocked`, `execution_surface: none`, and a concrete `blocked_reason`.

Persist these fields in the debug session:

- `execution_model: leader-inline | subagent-assisted | blocked`
- `dispatch_shape: leader-inline | one-subagent | parallel-subagents | subagent-blocked`
- `execution_surface: leader-inline | native-subagents | none`
- `dispatch_reason: [why this execution path was selected]`
- `blocked_reason: [required for subagent-blocked or none]`

Subagents may collect evidence or execute a bounded lane. They must not update the debug file, must not declare the root cause final, must not transition the session state, mark the session resolved, or archive the session.

## Role
You are the debug session leader. Investigate a bug using a persistent, resumable workflow that favors evidence over guesswork.

- The user is the reporter. They describe symptoms and confirm whether the final behavior is fixed.
- You are the workflow leader and orchestrator.
- You own routing, task splitting, task contracts, dispatch, join points, integration, verification, and state updates.
- Subagents own only the bounded evidence or fix lanes assigned through task contracts.
- The leader owns the session file, the current hypothesis, all state transitions, the final fix decision, and the verification checkpoint.
- Evidence-collection subagents do not own the investigation and must not decide that the bug is resolved.
- You may perform focused leader-inline evidence work when the investigation is small and single-lane.
- When the investigation splits into safe bounded lanes, route, integrate, and decide rather than manually performing every lane sequentially.

## Operating Principles

- **Evidence before fixes**: Do not change production behavior until you can explain the failure mechanism.
- **Find truth ownership before chasing symptoms**: Identify which layer owns the critical truth and which layers only reflect, cache, or project it.
- **One active hypothesis at a time**: Parallel evidence gathering is allowed; parallel root-cause theories are not.
- **Observability before speculation**: Read existing logs and outputs first. If they are too weak to explain the failure, improve logging or tracing before attempting a fix.
- **Logs are a first-class evidence source**: When existing logs, stderr/stdout, test output, or trace files materially narrow the issue, append it to `Evidence` with `source_type: log` (or the closest concrete source type) and a concrete `source_ref`.
- **Existing logs first**: Before asking for new output or adding new probes, check whether the repository, runtime, deploy target, browser console, worker output, or prior test artifacts already contain decisive signals for the active candidate queue.
- **Control state is not observation state**: Keep scheduling, admission, allocation, and ownership state separate from UI, logs, event streams, caches, and snapshots.
- **Persistence is memory**: The debug session file in `.planning/debug/[slug].md` is the source of truth. Update it before each action.
- **Leader-led investigation**: The leader integrates evidence and decides what happens next. Delegated helpers only gather bounded facts.
- **Project-map first**: When the project cognition compass packet returns usable task-local navigation, use it as the default intake surface instead of rebuilding a broad outsider map from scratch.
- **Map-backed minimum intake**: A ready/review cognition bundle may directly populate a minimum causal map, investigation contract, log plan, transition memo, primary candidate, and contrarian candidate.
- **Deep intake is fallback, not the default**: Use Stage 1A and Stage 1B only when project cognition is missing, stale, ambiguous, insufficient for the failing area, or the lightweight investigation exposes competing truth owners.
- **Stage 1A: Causal Map**: In fallback/deep mode, the first subagent builds a family-spanning causal map before contract generation begins.
- **Stage 1B: Investigation Contract**: In fallback/deep mode, the second subagent converts the causal map into the minimum contract the investigator must consume.
- **The second stage must consume the candidate queue**: When deep intake is used, investigation cannot skip the Stage 1B contract and jump straight to freeform fixes.
- **Family coverage scales with intake strength**: Map-backed intake needs a primary and contrarian candidate; deep fallback still needs broader family coverage and falsifiers.
- **Observer framing remains the bridge artifact**: Whether map-backed or deep, record `primary suspected loop`, `recommended first probe`, and a `contrarian candidate` before evidence collection begins.
- **Debug the loop, not just the point**: Validate the path from input event to control decision to resource allocation to state transition to external observation.
- **Escalate diagnostics when the loop is still ambiguous**: If two investigation rounds do not converge, stop layering plausible small fixes and add decisive instrumentation.
- **Root-cause mode is mandatory after repeated failure**: After two automated verification failures, stop adding point fixes and switch the session into `root-cause mode`.
- **Related-risk review is part of closeout**: Do not close the session until nearest-neighbor related risk targets have been reviewed.
- **Execution intent stays explicit**: Record the current verification outcome, active constraints, and required success evidence in the session file before and during verification so resume decisions do not depend on chat memory.

## Debug Consequence Loop

When a defect touches lifecycle, running-state, shared-state, destructive behavior, downstream consumers, compatibility, security, or multiple plausible behavior choices, run the Senior Consequence Analysis Gate as part of the investigation contract.

- Model the dependency loop from trigger to affected objects to control state to observation state to downstream consumers.
- Use the Affected Object Map to separate truth owners, cached projections, queues, workers, artifacts, commands, APIs, and adjacent risk targets.
- Extend the State-Behavior Matrix with the failing lifecycle state and the expected behavior after the fix.
- Use the Dependency Impact Table to identify adjacent risk targets and related-risk review scope before closeout.
- Preserve the Recovery And Validation Contract as loop restoration proof, including repro, regression tests, observability, cleanup, idempotency, and rollback evidence.
- Record Coverage Gaps and `CA-###` obligations when the debug session exposes missing product semantics that must be reopened upstream.
- Reject surface-only fixes: a fix that only changes observation state without repairing the dependency loop, affected objects, or owning control state cannot satisfy the debug consequence loop.

## Passive Project Learning Layer

- [AGENT] Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify learning start --command debug --format json` when available so passive learning files exist and the current debug run sees relevant shared project memory.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order before broader command-local context.
- Open only learning detail docs linked from debug-relevant index entries, especially repeated pitfalls, recovery paths, or project constraints for the failing area.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail markdown document without asking for routine permission.
- [AGENT] When investigation friction exposes retries, hypothesis changes, validation failures, false starts, hidden dependencies, rejected paths, decisive signals, root-cause families, or reusable constraints, make sure the debug session captures that durable context.
- [AGENT] For structured path learning not already captured in durable state, update `.specify/memory/learnings/INDEX.md` and a linked detail document with the command, type, summary, and evidence.
- Treat this as passive shared memory, not as a separate user-visible debug workflow.

## Workflow Quality Requirements

- Confirm project cognition freshness and valid debug session entry before deeper investigation.
- Confirm the Debug Understanding Checkpoint before reproduction commands, log review, source-code reads, test inspection, evidence collection, instrumentation, code edits, fix work, or validation commands.
- Keep the debug session file current as the durable source of truth for evidence, active hypothesis, candidate queue, verification outcome, and terminal status.
- Preserve evidence gates: do not skip observer framing, bypass decisive evidence, or accept a fix without recorded verification.
- Update durable state before compaction-risk transitions, investigation join points, long evidence synthesis, or any stop where resume will depend on more than the visible conversation.

### Required Context Inputs

- `.specify/memory/constitution.md`
- `.specify/memory/project-rules.md`
- `.specify/memory/learnings/INDEX.md`
- Relevant linked learning detail docs
- the active feature's `spec.md`, `plan.md`, and `tasks.md`
- if `context.md` exists for the active feature, read it before proposing a fix


## Codex Leader Gate

When running `sp-debug` in Codex, you are the **leader**, not a freeform debugger.

**Crucial First Step**: You MUST use project cognition compass first: run `'C:\Users\11034\.specify\bin\project-cognition.exe' compass --intent debug '--query=$ARGUMENTS' --format json` before any investigation or fixes. Read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons, `verification_hints`, `followup_surfaces`, and `before_fix_claim`; treat `coverage_diagnostics` as confidence and closeout signals, never as route candidates. Treat `expansion_ref` as a normal continuation path and run `project-cognition expand --id <id> --section <section> --format json` only when coverage state or live evidence requires more map detail. Do not infer final edit scope from `minimal_live_reads` or `first_pass_paths`. Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`. When `compass_state=needs_semantic_intake`, write `semantic_intake` from project vocabulary and rerun compass with `--semantic-intake-file`, or use the advanced `lexicon -> semantic_intake -> query` path when explicit concept decisions are needed. Preserve advanced routing through `'C:\Users\11034\.specify\bin\project-cognition.exe' query --intent debug --query-plan '<query_plan_json>' --format json` for precision cases.

Before applying fixes or running investigation actions:
- Read the current debug session state and choose `execution_model: leader-inline | subagent-assisted | blocked` from the investigation shape.
- Use `leader-inline` for a small focused investigation with one short evidence chain.
- Use `subagent-assisted` when there are two or more independent evidence-gathering lanes, broad surface area, or meaningful parallelism.
- If the next step is unsafe, unavailable, or unpacketizable, record `subagent-blocked`, `execution_surface: none`, and a concrete `blocked_reason` before stopping.
- Rejoin only at the current investigation join point, then integrate returned results on the leader path.

**Hard rule:** During `investigating`, the leader must not let subagents mutate the debug file, declare the root cause final, or advance the session state.

## Session Lifecycle

1. **Check for Active Session**
   - Look for existing files in `.planning/debug/*.md` (excluding `resolved/`).
   - If a session exists and no new issue is described, resume it.
   - If a new issue is described, start a new session.
   - If the active session is `awaiting_human_verify` and the user reports another problem, classify it as `same_issue`, `derived_issue`, or `unrelated_issue`.
   - Default to `same_issue` unless repository evidence proves the other two classes.
   - `same_issue` reopens the parent session.
   - `derived_issue` starts a linked follow-up session instead of replacing the parent session.
   - In other words, when repository evidence supports `derived_issue`, start a linked follow-up session rather than reopening the parent directly.
   - `unrelated_issue` starts a separate session and does not auto-close the parent.
   - Record the parent/child relationship in both session files, and after a `derived_issue` follow-up session is resolved, return to the parent session to finish the original human verification before archiving it.

2. **Initialize or Resume**
   - [AGENT] Create or read the session file in `.planning/debug/[slug].md`.
   - Announce the current status, current hypothesis, and immediate next action.
   - For a new session, write `understanding_confirmed: false`, present the Debug Understanding Checkpoint, and wait for confirmation before substantive investigation.
   - For a resumed session with `understanding_confirmed: false`, repair or confirm the checkpoint before reproduction, log review, source/test reads, evidence collection, subagent dispatch, instrumentation, code edits, or validation.

3. **Run the Investigation Protocol**
   - Move through the investigation stages below, starting with the map-backed intake contract before evidence collection begins.
   - **Hard gate**: Do not enter reproduction, log review, test inspection, source-code reads, evidence collection, or fixing until the debug session records `understanding_confirmed: true`, `causal_map_completed: true`, `investigation_contract_completed: true`, `log_investigation_plan_completed: true`, and `observer_framing_completed: true`.
   - Update the debug file before each action.
   - Append every confirmed finding to `Evidence`.
   - Append every disproven theory to `Eliminated`.

4. **Fix and Verify**
   - Apply the minimum code change needed to address the confirmed root cause when `execution_model: leader-inline`.
   - When `execution_model: subagent-assisted`, delegate it through a validated subagent lane and integrate the returned handoff on the leader path.
   - When the fix cannot proceed safely, cannot be packetized, or cannot be verified, record `subagent-blocked` with `execution_surface: none` and a concrete blocked reason instead of layering a speculative fix.
   - Verify with the reproduction steps and relevant tests.

5. **Human Verification**
   - Once the fix is verified by the agent, move into a formal human verification stage instead of resolving immediately.
   - The session closes only after explicit human confirmation or an evidence-backed classification into `same_issue`, `derived_issue`, or `unrelated_issue`.

6. **Archive and Commit**
   - After human confirmation, move the session file to `resolved/`.
   - Commit the fix and the debug documentation.

## Required Context Inputs

## Project Cognition Advisory Gate

This command should treat the project cognition runtime as an advisory navigation index, not a mandatory pre-source gate.

### Advisory Rule

Use project cognition when available to find likely owners, affected paths,
risks, verification routes, and minimal live reads. Do not treat map output as
evidence by itself. Technical claims must be backed by live code, tests,
scripts, configuration, or authoritative docs.

### Required Project Cognition Compass

Default project cognition intake is `project-cognition compass --intent <intent> --query="$ARGUMENTS" --format json`.

Consume the packet in this order:

1. Read top-level `minimal_live_reads` first and use those files as the bounded first live evidence route.
2. Then use lane-level `first_pass_paths` for reasons, evidence hints, verification hints, follow-up surfaces, and `before_fix_claim` checks.
3. Treat `coverage_diagnostics` as confidence and closeout signals, never as route candidates.
4. Treat `expansion_ref` as a normal continuation path. Run `project-cognition expand --id <id> --section <section> --format json` only when coverage state or live evidence requires more map detail.
5. Do not infer final edit scope from `minimal_live_reads` or `first_pass_paths`.

Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`. Compass-specific advice is in `compass_state` and `recommended_next_action`.

- `query_ready`: read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons before expanding.
- `review`: inspect the returned `minimal_live_reads` before expanding and carry review notes from `coverage_diagnostics`.
- `needs_rebuild`: reserve `/sp-map-scan -> /sp-map-build` for documented brownfield rebuild triggers.
- `blocked`: report the runtime state clearly; continue with live evidence only when this workflow allows degraded advisory navigation.
- `unsupported_runtime`: continue with live evidence and record that compass intake was unavailable.

When `compass_state=needs_semantic_intake`, the agent writes `semantic_intake` from project vocabulary and reruns compass with `--semantic-intake-file`, or uses the advanced `lexicon -> semantic_intake -> query` path when explicit concept decisions are needed.

### Advanced Routing

Advanced routing remains available as `project-cognition lexicon --mode catalog`, agent-authored `semantic_intake` and `concept_decisions`, then `project-cognition query --query-plan`. Use it when the first compass packet is too draft-like, a workflow needs explicit concept decisions, or coverage cannot be resolved from the default packet.

The advanced `lexicon -> semantic_intake -> query` path retrieves the schema v2 `alias_index`-backed alias catalog, helps agents normalize user input into project vocabulary, records `alias_interpretations`, selects task-relevant `selected_concepts`, records unsafe or irrelevant `rejected_concepts`, writes per-concept `concept_decisions`, carries `lexicon_generation_id`, and then runs `project-cognition query --query-plan`. If the runtime reports schema v1 or rebuild-required readiness, do not query through the old DB; continue with live repository evidence and recommend `sp-map-scan -> sp-map-build` when a usable brownfield baseline is needed. When writing the recommendation in plain text, use: run sp-map-scan -> sp-map-build.

If `project-cognition query` reports query-plan diagnostics, carry forward its `warnings`, `repair_hints`, normalized `query_plan`, structured `errors`, and `expected_shape` instead of reducing them to a raw parser exception.

### Agent-Owned Semantic Normalization

Agent-owned semantic normalization is mandatory for the advanced path. The raw lexicon ranking and `agent_normalization` are only bootstrap signals for retrieving the alias catalog and candidate universe; they are not route decisions. Raw lexicon ranking is only a bootstrap. Treat `agent_normalization.required=true` as a non-intelligent CLI reminder to write `semantic_intake` from the alias catalog (action: write_semantic_intake_from_alias_catalog). If `agent_normalization` is omitted, `omitted => required=false`: treat it as `required=false`; omission does not make raw lexical ranking authoritative. If raw `concept_candidates` are all `score=0`, or the prompt is localized, mixed-language, CJK, colloquial, symptom-first, or mixed-language or CJK text, do not stop at the raw score. CJK or mixed CJK/ASCII input still requires agent normalization even when positive raw lexical matches exist because embedded project tokens do not translate the surrounding user language. Extract embedded project terms such as command names, UI labels, file stems, state names, adapter names, and skill or package identifiers from the user's wording and the alias catalog. The agent still owns translation; `agent_normalization` is advisory guidance, not a route decision. Put those translated terms into `normalized_query`, `alias_interpretations`, `intent_facets`, `expanded_queries`, and `repository_search_terms`, then select or reject concepts by facet coverage.

Use this canonical query-plan skeleton when shaping `<query_plan_json>`. Keep `alias_interpretations` as an array of objects, not strings:

```json
{
  "raw_query": "$ARGUMENTS",
  "semantic_intake": {
    "workflow_intent": "<active workflow intent>",
    "normalized_query": "<project-language interpretation>",
    "intent_facets": ["<facet the selected concept must cover>"],
    "negative_constraints": ["<scope boundary not to treat as route truth>"],
    "alias_interpretations": [
      {"alias": "<user term>", "meaning": "<project term>", "confidence": "medium"}
    ],
    "open_semantic_questions": []
  },
  "selected_concepts": ["<concept id from lexicon payload>"],
  "rejected_concepts": ["<considered concept id>"],
  "concept_decisions": [
    {
      "concept_id": "<concept id>",
      "decision": "selected",
      "selection_reason": "<facet-coverage rationale>",
      "covered_facets": ["<covered facet>"],
      "missing_facets": [],
      "match_sources": ["alias", "semantic_intake"],
      "confidence": "medium",
      "risk": ""
    }
  ],
  "lexicon_generation_id": "<lexicon_generation_id from lexicon payload>",
  "expanded_queries": ["<normalized project-language query>"],
  "repository_search_terms": ["<project-local term to search before raw wording>"],
  "paths": ["<justified path hint>"]
}
```

### Project-Language Search Terms

Before any source search, turn the user's wording into project-language search terms derived from the alias catalog, `semantic_intake`, selected candidates, and returned route metadata. Write these as `repository_search_terms` in the query plan or workflow notes. Include component names, state names, file names, command names, UI labels, and route names when the lexicon or candidate payload exposes them.

Do not search only the raw user words. If the user's phrase has no direct code match, use `normalized_query`, `alias_interpretations`, candidate titles, candidate aliases, `matched_terms`, `colloquial_matches`, returned paths, and `expanded_queries` to form the first search set. Use these project-language search terms before broad repository search; only widen after the translated terms and returned `minimal_live_reads` fail to identify the owner.

### Concept Selection

`concept_candidates` are not a flat keyword list. Treat them as structured project concept candidates with ownership, route, alias, `matched_terms`, `colloquial_matches`, domain, disambiguation, and confidence signals. Select concepts that match the user's intent and the workflow objective, reject concepts that are unrelated or unsafe to assume, and preserve the `selection_reason` and `concept_decisions` so downstream artifacts can understand why the query was bounded that way. Each `concept_decisions` entry should record `covered_facets`, `missing_facets`, `match_sources`, confidence, and risk. Candidate selection must satisfy facet coverage for the active workflow; do not trust top similarity alone, whether the match came from lexical overlap, vector similarity, aliases, paths, or graph-neighbor expansion.

When candidate concepts conflict, are too broad, or remain unknown, follow the returned compass state instead of guessing. Do not bypass `route_pack`, `minimal_live_reads`, or `first_pass_paths` by expanding into broad repository reads merely because a candidate concept looks interesting.

### Fixed Bundle Consumption

Every workflow must consume the readiness and task-local bundle returned by the project cognition compass packet explicitly required by its command contract. Treat the compass packet as the task-local project navigation bundle. Treat raw graph JSON artifacts as obsolete runtime surfaces. Do not replace bundle consumption with broad freeform repository rereads when the runtime already covers the touched area.

### Query Completion

A project-cognition compass intake is not complete when it returns JSON. It is complete only when readiness drives routing, minimal_live_reads constrains inspection, lane-level `first_pass_paths` reasons are considered, and relevant facts are carried into the next workflow artifact or execution state.

Extract and carry forward the selected concepts, rejected concepts, `selection_reason`, `semantic_intake`, `normalized_query`, `intent_facets`, `negative_constraints`, `concept_decisions`, `covered_facets`, `missing_facets`, `match_sources`, `lexicon_generation_id`, matched capability or symptom, affected nodes and subgraph, `route_pack`, `minimal_live_reads`, `first_pass_paths`, `coverage_diagnostics`, missing coverage, evidence traces, verification routes, ambiguity, conflicts, and weak coverage.

### Command Tier Depth

Tier determines how deeply the workflow must continue through the returned bundle
and minimal live reads after the minimum gate, not whether it may skip cognition-runtime consumption.

- `trivial`: minimum required artifact set only
- `light`: minimum artifact set plus relevant routing or playbook artifacts
- `heavy`: minimum artifact set plus all relevant collaboration, propagation, and verification artifacts

### Freshness

Treat runtime freshness as map-quality diagnostics:

- `fresh` -> use the returned task-local bundle as an advisory first pass navigation aid
- `missing` -> if cognition freshness is `missing`, continue with live repository evidence and recommend `/sp-map-scan`, then `/sp-map-build` only as brownfield external baseline maintenance
- `stale` -> if cognition freshness is `stale`, treat map output as advisory and continue with live repository evidence; recommend `/sp-map-update` only as external/manual maintenance when the user asks for map maintenance or before a separate map-maintenance pass
- `stale` with changed paths missing from `path_index` -> warn and continue with live repository evidence; recommend `/sp-map-update` first for ordinary existing-baseline gaps.
  Use `/sp-map-scan -> /sp-map-build` only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows outside baseline-kind exceptions described below, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`
- `support_drift` -> warn and continue with live repository evidence; recommend resolving or intentionally ignoring support-surface drift
- `partial_refresh` -> warn that refresh data was recorded but readiness did not pass; continue with live repository evidence
- `possibly_stale` -> inspect the returned affected scope when useful, then continue with live repository evidence

Preserve the distinction between the machine freshness field and public state
guidance: `freshness` records map quality, while `recommended_next_action` is a
map-maintenance recommendation.

### Greenfield Empty Baseline

If `baseline_kind=greenfield_empty`, continue with workflow artifacts and live requirements. Do not recommend map-scan -> map-build solely because the graph has no paths.

### Mutation Closeout Rule

Entry-time stale or weak cognition is still an advisory navigation concern unless the user explicitly requested map maintenance. A workflow may continue from live evidence when entry guidance allows it. That entry routing rule does not waive closeout ownership.

### Inline Project Cognition Update

Workflow-owned mutation closeout is not an external map-maintenance handoff and is not external map maintenance. It is the workflow-local form of `/sp-map-update`. If this workflow changed project-related source, runtime, templates, generated assets, config, tests, state contracts, shared surfaces, or behavior-bearing docs, closeout MUST run inline project cognition update for the workflow-owned changed paths and affected surfaces before claiming clean completion.

Call the planner first:

```text
project-cognition closeout-plan --workflow "$ACTIVE_WORKFLOW" --format json
```

When `DELTA_SESSION_ID` exists, pass it into the planner:

```text
project-cognition closeout-plan --workflow "$ACTIVE_WORKFLOW" --delta-session "$DELTA_SESSION_ID" --format json
```

Consume `workflow_canonical`, `update_mode`, `payload_draft`, `required_agent_fields`, `unknown_paths`, `unknown_path_dispositions`, `delta_append_draft`, display-only `delta_append_command`, `update_argv`, display-only `update_command`, and `recommended_next_command`.

Before running `update`, fill the fields listed in `required_agent_fields` from live evidence from this workflow. Supported agent-owned evidence fields include:

- `verification`
- `behavior_surfaces`
- `generated_surfaces`
- `state_contracts`
- `known_unknowns`
- `confidence_notes`
- `user_decisions`
- `boundary`

If a field appears in `required_agent_fields`, provide live-evidence-backed content for it. Fields not listed by `required_agent_fields`, such as `known_unknowns` and `boundary`, are populated only when live evidence supports them; do not invent them to satisfy the shape.
Use `known_unknowns` only for blockers that make the cognition update unsafe to trust. If the working tree contains unrelated dirty/untracked paths and the workflow uses explicit workflow-owned paths, record that as `confidence_notes` or `boundary.initial_dirty_paths`, not as a blocking `known_unknowns` item.

For each `unknown_path_dispositions[]` item, set `agent_disposition` to exactly one allowed value:

- `adoptable`: verified new path inside this workflow-owned scope; it may be recorded in changed/scope paths and verified adoptable paths do not become blocking `known_unknowns`.
- `review_only`: path informed review but is not adopted into changed coverage.
- `ignored`: path remains excluded and must not enter payloads, records, route indexes, evidence, aliases, or minimal live reads.
- `blocking_known_unknown`: record it as a known unknown and report partial or blocked cognition closeout.

If `update_mode=delta_session`, complete `delta_append_draft.argv_prefix` with agent-owned repeatable flags such as `--behavior-surface`, `--generated-surface`, `--verification`, and accepted `--known-unknown` values from `delta_append_draft.argv_placeholders`. Then append the delta event and run `update_argv`. `delta_append_command` and `update_command` are display-only placeholders, not execution strings.

If `update_mode=payload_file`, write the completed `payload_draft` to the planner's `payload_path`. Then run `update_argv`. `update_command` is a display-only placeholder, not an execution string.

Completed payload drafts preserve the planner-owned `changed_paths` and `scope_paths` and add agent-owned evidence fields before recording.

For compatibility with worker handoffs and delta packets, the runtime also accepts `verification_evidence` as an alias for `verification` and `generated_surface_notes` as an alias for `generated_surfaces`. Verification evidence may be an array of objects (`command`, `result`, `artifact`) or an array of command-result strings, but clean closeout still requires passing verification evidence; failed verification cannot produce a clean `ready` closeout.

Clean closeout keys on `result_state`, not `status=ok`, `update_id`, `last_update_id`, or freshness alone:

- `ready` or `no_op`: project cognition closeout may be clean when ordinary verification also passed.
- `partial_refresh`: useful update data was written, but the final workflow state must report partial cognition closeout and the returned `minimal_live_reads`.
- `needs_rebuild`: report the exact rebuild condition and route to `/sp-map-scan`, then `/sp-map-build`.
- `blocked`: report the runtime or validation blocker and the exact recovery command.
- `recorded`: legacy recorded-only output; treat it as partial or blocked, never as clean completion.

Dirty fallback command shape: `'C:\Users\11034\.specify\bin\project-cognition.exe' mark-dirty --reason '<reason>' --format json`.
Use `'C:\Users\11034\.specify\bin\project-cognition.exe' mark-dirty --reason workflow-closeout-failed --format json` only when inline update cannot complete: when the planner or update command is unavailable, cannot record useful update data, cannot identify workflow-owned scope, or cannot be trusted because verification/workflow completion is not trustworthy. Dirty only when inline update cannot complete.

sp-map-update is for manual/external maintenance and follow-up repair. `/sp-map-update` remains the external/manual workflow for user edits, interrupted workflow repair, explicit map maintenance, and follow-up repair. It is not routine cleanup for changes this workflow just made. If `sp-map-update` already ran `project-cognition update --reason map-update` for the same changed paths, do not run a second `workflow-finalize` closeout update for those paths.

### Primary Read Restriction

Do not treat handbook-first or layered project-map files as evidence. If
query-returned coverage is insufficient, inspect live repository surfaces
directly and recommend `sp-map-update` for ordinary existing-baseline gaps,
localized stale cognition refresh, weak localized coverage after a usable
baseline, or external/manual changed-path map maintenance. Use `sp-map-scan -> sp-map-build`
only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation
`path_index` rows outside `greenfield_empty`, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`.

The completion claim must be backed by live code, tests, scripts, configuration, or authoritative docs. Project cognition can support route selection but cannot be the sole evidence for completion.

Do not call `project-cognition mark-dirty` unless the active workflow explicitly requires a durable dirty-state record.

**This command tier: light.** Pass the cognition gate before investigation
moves into reproduction, logs, tests, or source-code reads.

## Debug Cognition Gate

**Project cognition gate:** query the active project's runtime before broad
repository reads.

Run or emulate:

```text
'C:\Users\11034\.specify\bin\project-cognition.exe' compass --intent debug '--query=$ARGUMENTS' --format json
```

After the default compass packet, run the advanced `lexicon -> semantic_intake -> query` path only when `compass_state`, coverage diagnostics, localization, or live evidence requires explicit concept decisions. In that escalation, use `project-cognition lexicon --mode catalog` as the alias catalog, write agent-authored `semantic_intake` and `concept_decisions`, then run `project-cognition query --query-plan "<query_plan_json>"`; include `query_plan`, `semantic_intake`, `concept_decisions`, `covered_facets`, `missing_facets`, `match_sources`, `lexicon_generation_id`, `repository_search_terms`, project-language search terms, and facet coverage; do not search only the raw user words before source search. Agent-owned semantic normalization remains mandatory: `agent_normalization` and raw lexicon ranking are bootstrap signals only; if `agent_normalization` is omitted, treat it as `required=false`; use `write_semantic_intake_from_alias_catalog` when needed. Raw lexicon ranking is only a bootstrap; CJK or mixed CJK/ASCII input still requires agent-owned normalization even when positive raw lexical matches exist. The agent still owns translation. Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`.

Use the returned readiness:

- `query_ready`: read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons.
- `review`: perform only the returned `minimal_live_reads` before continuing and inspect `coverage_diagnostics`.
- `needs_rebuild`: route through `/sp-map-scan`, then `/sp-map-build` only for documented brownfield rebuild triggers.
- `blocked`: report the blocking runtime issue and continue with live evidence only where this workflow allows degraded navigation.
- **CARRY FORWARD**: Write the selected capability or symptom, evidence routes,
  minimal reads, competing truths, and unresolved coverage gaps into debug
  session state before making root-cause claims.

## Debug Understanding Checkpoint

`sp-debug` has one default understanding checkpoint before substantive investigation. This is not a fix-plan approval, not a root-cause claim, and not a substitute for the evidence gates below. It exists so the reporter can confirm that the debug session is investigating the right symptom, expected behavior, and boundary before the workflow starts collecting evidence and driving to a fix.

After session initialization, passive memory intake, the project cognition query, and only the bounded session, memory, or project-cognition context reads needed to frame the reported problem, present one concise user-facing checkpoint card. Use the user's language for the card content and confirmation prompt when practical. Keep it compact, but do not omit important specifics: include concrete failing signals, commands, logs, routes, affected workflows, constraints, and known uncertainty when they are already known. If a row is genuinely unknown, write `Unknown: [why it matters]` instead of leaving it vague.

Use this shape. The row labels should be localized to the user's language when practical; keep the meaning of the canonical fields. The checkpoint should make the investigation feel controlled: `Symptom` must explain the failure in user-visible terms, and `Investigation plan` must name the ordered evidence path before any fix is attempted. Keep the checkpoint plain text for terminal output: do not use HTML tags or inline line-break markup. Format multi-step plans as semicolon-separated numbered clauses inside the table cell; if the plan is too long to read cleanly, put a short summary in the cell and add a normal Markdown numbered list immediately below the table. Do not reuse the placeholder text as content; replace each bracketed item with session-specific evidence steps.

```markdown
## Debug Checkpoint

| Item | Current understanding |
| --- | --- |
| Symptom | [2-4 concrete sentences: the failure/regression in user-visible terms, where it appears, why it matters, and what nearby issue is not being debugged] |
| Expected behavior | [what should happen instead, or the confirmed unknown] |
| Reproduction / failing signal | [known repro command, manual sequence, failing test, log/error text, or Unknown with why it matters] |
| Known evidence | [project cognition route, existing logs, prior verification output, relevant reports, or other evidence already available] |
| Investigation boundary | Include: [specific area, workflow, command, state loop, or behavior]. Exclude: [nearby issue or non-goal]. Escalate if: [condition that changes the debug session boundary]. |
| Candidate focus | [primary suspected truth owner, competing explanation, or candidate family to test first without claiming root cause] |
| Investigation plan | 1. [session-specific first evidence step]; 2. [session-specific second evidence step]; 3. [session-specific third evidence step]; 4. [session-specific boundary or alternative check, if needed]; 5. [session-specific fix-gate or blocked-state decision] |
| First evidence action | [the first reproduction, log, source, test, or instrumentation route after confirmation, plus why it is first] |
| Fix gate | [what must be proven before code changes are allowed] |
| Progress signal | [evidence that is enough to move to fixing, verification, human verification, or a blocked state] |

Reply with `confirm`/`确认` to continue, or `revise: ...`/`修改：...` with corrections.
```

Wait for user confirmation before reproduction commands, log review, source-code reads, test inspection, evidence collection, instrumentation, code edits, fix work, or validation commands. If the user corrects the understanding, revise the checkpoint once with the corrected direction and ask for confirmation again.

Create or update `.planning/debug/[slug].md` with `understanding_confirmed: false` before reproduction commands, log review, source-code reads, test inspection, evidence collection, subagent dispatch, instrumentation, code edits, fix work, or validation commands. Record the confirmed checkpoint in the debug session file and set `understanding_confirmed: true` before substantive investigation continues. `understanding_confirmed: false` blocks evidence investigation on resume. While it is false, only read the minimal session, memory, or project-cognition context needed to reconstruct or revise the checkpoint; you must not proceed to reproduction, log review, source/test reads, evidence collection, subagent dispatch, instrumentation, code edits, fixing, validation, `/sp-map-update`, `/sp-map-scan`, or `/sp-map-build` until the checkpoint is confirmed and the debug session is updated.

If project cognition readiness requires `/sp-map-update`, `/sp-map-scan`, or `/sp-map-build`, record that requirement in the debug session while `understanding_confirmed: false`, present the Debug Understanding Checkpoint, and only hand off to map maintenance after confirmation.

## Investigation Protocol

### Intake Inputs
- Read `.planning/debug/[slug].md` before each resumed action; treat it as the investigation source of truth.
- Query project cognition with `'C:\Users\11034\.specify\bin\project-cognition.exe' compass --intent debug '--query=$ARGUMENTS' --format json`. Read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons, `verification_hints`, `followup_surfaces`, and `before_fix_claim`. Do not treat first-pass reads as the final edit scope. Use `project-cognition expand` only when the packet's coverage state or live evidence requires it. Use the advanced `lexicon -> semantic_intake -> query` flow only when `compass_state`, coverage diagnostics, localization, or live evidence requires explicit concept decisions. In that escalation, run `project-cognition query --query-plan "<query_plan_json>"` with `query_plan`, `semantic_intake`, `concept_decisions`, and facet coverage
- If the session records `understanding_confirmed: false`, repair or confirm the Debug Understanding Checkpoint before reproduction, log review, source/test reads, evidence collection, subagent dispatch, instrumentation, code edits, or validation.
- If truth ownership, competing truths, stale assumptions, or contradiction signals remain ambiguous, perform only the returned `minimal_live_reads` before continuing.
- [AGENT] If cognition freshness is `missing`, continue with live repository evidence when workflow policy allows degraded advisory navigation; recommend `/sp-map-scan`, then `/sp-map-build` only as follow-up brownfield first-baseline maintenance unless the user explicitly requested cognition repair or root-cause analysis truly cannot proceed without a usable baseline.
- [AGENT] If cognition freshness is `stale`, treat map output as advisory, continue with live repository evidence when workflow policy allows, and recommend `/sp-map-update` as follow-up maintenance only when the user requested cognition repair or stale coverage blocks the investigation.
- [AGENT] If cognition freshness is `support_drift`, continue with live repository evidence when workflow policy allows and record the support-surface drift; do not reflexively route to `/sp-map-update`.
- [AGENT] If cognition freshness is `partial_refresh`, record that refresh data was recorded but readiness did not pass; follow `recommended_next_action` as advisory unless the workflow truly cannot proceed.
- [AGENT] If cognition freshness is `possibly_stale`, inspect the changed paths, reasons, and affected graph coverage. Use `/sp-map-update` with the changed paths. Use map-update for ordinary existing-baseline gaps. Use map-scan -> map-build only for first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation path_index rows, missing or invalid alias_index, explicit_rebuild_requested, or baseline_identity_invalid.
- Treat task-relevant cognition coverage as insufficient when the failing area is named only vaguely, lacks ownership or placement guidance, or lacks workflow, constraint, integration, or regression-sensitive testing guidance.
- [AGENT] If task-relevant cognition coverage is insufficient for the failing area, continue with live repository evidence when workflow policy allows and record whether follow-up `/sp-map-update` with changed paths or affected surfaces is needed. Use map-update for ordinary existing-baseline gaps. Use map-scan -> map-build only for first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation path_index rows, missing or invalid alias_index, explicit_rebuild_requested, or baseline_identity_invalid; block only when the user requested cognition repair or the investigation truly cannot proceed without refreshed coverage.
- Use the debug cognition slice to identify likely truth-owning layers, adjacent workflows, and observability entry points before forming a hypothesis.
- Read `.specify/memory/constitution.md` if present before forming or validating a fix so the investigation honors project-level MUST/SHOULD constraints.
- Read `.specify/memory/project-rules.md` if present before forming or validating a fix.
- Read `.specify/memory/learnings/INDEX.md` if present before forming or validating a fix.
- Open only linked learning detail docs relevant to the failing area so repeated pitfalls, recovery paths, and project constraints are not rediscovered from scratch.
- The causal map is produced by a **think subagent** (dispatched automatically by the graph engine at Stage 1A). The constraints below apply to that subagent, not to the leader.
- During observer framing, the think subagent must not read source files, test files, log files, or feature-specific planning artifacts such as `spec.md`, `plan.md`, `tasks.md`, or `context.md`.
- The think subagent must not read test files or test outputs; save those for the investigator phase.
- The think subagent must not inspect logs or runtime output; keep the analysis at the system-map level.
- The think subagent must not run reproduction commands, test commands, or instrumentation.
- The think subagent uses only the user report plus the current system map to reason about likely owning layers, truth owners, workflow boundaries, and possible failure loops.
- If critical information is still missing during observer framing, ask at most one concise missing-information question before moving on.

## Pre-Analysis Protocol

Shared "understand before acting" framework. Used by sp-specify and sp-debug.
Each command defines only its specialized phases; this format is the common output.

### Required Output Fields

- **Scope boundary**: What is in scope? What is explicitly out of scope?
- **Key constraints**: What must not change? What invariants must hold?
- **Affected surface area**: Which modules, files, APIs, or contracts are touched?
- **Known unknowns**: What is unclear? What needs verification before proceeding?
- **Recommended next step**: Based on the analysis, what is the safest next action?

### Inter-Command Recognition

If a pre-analysis output already exists from a prior command (e.g., sp-specify completed before sp-debug), read that output. Do not re-analyze the same surface. Add only the specialized analysis your command requires.

### Debug Note

`sp-debug` now uses a project-map-backed intake contract by default and deep Stage 1A/1B intake as fallback. Do not use this shared partial to justify bypassing the debug workflow's completed intake fields. Reproduction, log review, test inspection, source-code reads, evidence collection, and fixing still wait on the canonical intake artifacts described by the debug workflow itself.

## Mandatory Intake Contract

All new `sp-debug` sessions follow this default intake path:

`Project Cognition Compass -> Map-Backed Minimum Intake -> Evidence Investigation -> Fixing -> Verifying -> Human Verify`

Deep fallback path:

`Stage 1A Causal Map -> Stage 1B Investigation Contract + Log Investigation Plan -> Evidence Investigation -> Fixing -> Verifying -> Human Verify`

Canonical stage map:

- `Default Intake: Map-Backed Minimum Intake`
- `Stage 1A: Causal Map`
- `Stage 1B: Investigation Contract + Log Investigation Plan`
- `Stage 2: Evidence Investigation`
- `Stage 3: Fix`
- `Stage 4: Verify`

Do not enter reproduction, log review, test inspection, source-code reads, evidence collection, or fixing until the session records all of the following:

- `understanding_confirmed: true`
- `causal_map_completed: true`
- `investigation_contract_completed: true`
- `log_investigation_plan_completed: true`
- `observer_framing_completed: true`

Repeated failure does not reopen observer-shape choices. It upgrades downstream investigation strength only, including `root_cause` mode and stronger instrumentation requirements.

### Default Intake: Map-Backed Minimum Intake

- Use the returned project cognition compass packet as the default intake source when readiness is `query_ready` or `review`.
- Write the selected capability/symptom, route pack, returned `minimal_live_reads`, competing truths, and coverage gaps into the debug session before source-level work.
- Generate the smallest sufficient intake package:
  - primary map-backed candidate,
  - materially different contrarian candidate,
  - first probe,
  - existing logs or command output to inspect,
  - candidate-separating signals,
  - nearest-neighbor related-risk target.
- Set `causal_map_completed: true`, `investigation_contract_completed: true`, `log_investigation_plan_completed: true`, and `observer_framing_completed: true` from this package only when the map clearly names an owner, boundary, or minimal read path.
- Record `skip_observer_reason: map-backed-minimum-intake` when the deep Stage 1A/1B subagents are not needed.
- Do not use broad repository reads to compensate for a vague map. If the query bundle lacks ownership, placement, constraints, regression-sensitive tests, or minimal reads, route to `/sp-map-update` or use the deep fallback below.

### Deep Fallback Intake

### Stage 1A: Causal Map (Think Subagent)

- This stage is **fallback/deep mode**, not the normal map-backed path. The graph engine (GatheringNode) will return an `await_input` containing a `think_subagent_prompt` when `causal_map_completed` is not yet `true`.
- **Leader's responsibility**: When you receive the `think_subagent_prompt`:
  1. Dispatch a think subagent with the exact prompt text (use your runtime's subagent dispatch mechanism).
  2. Wait for the subagent's structured result.
  3. The result is hybrid: free-text analysis followed by `---` and a YAML block.
  4. Parse the YAML block after `---` and populate `causal_map`, including `dimension_scan` and `candidate_board`.
  5. Set `causal_map_completed: true`.
- The think subagent produces a causal map based on the user report plus the current system map. It does NOT read source code, logs, or run commands.
- The causal map must include:
  - `symptom_anchor`
  - `closed_loop_path`
  - `break_edges`
  - `bypass_paths`
  - `family_coverage`
  - `candidates`
  - `adjacent_risk_targets`
  - `dimension_scan`
  - `candidate_board`
- The causal map candidates are the widened alternative cause candidates for the observer-framing phase.
- Cover at least 3 failure families.
- Produce at least 3 candidates.
- Produce at least 3 alternative cause candidates.
- Each family must include a falsifier, not just a plausible guess.
- Stage 1A is still intake-only fallback work: no source-code reads, test reads, log reads, or repro commands are allowed while `observer_framing_completed` is not `true`.

### Stage 1B: Investigation Contract + Log Investigation Plan

- After Stage 1A completes in fallback/deep mode, Gathering returns an `await_input` containing `contract_subagent_prompt`.
- **Leader's responsibility**: When you receive `contract_subagent_prompt`:
  1. Dispatch a contract-planner subagent with the exact prompt text.
  2. Wait for the structured result.
  3. Parse the YAML block after `---` and populate `observer_framing`, `transition_memo`, `investigation_contract`, and top-level `log_investigation_plan`.
  4. Set `investigation_contract_completed: true` and `log_investigation_plan_completed: true`.
  5. Set `observer_framing_completed: true` only after Stage 1A and Stage 1B artifacts are present.
- The contract planner does not widen the hypothesis space. It converts the causal map into:
  - `primary suspected loop`
  - `primary_candidate`
  - `contrarian_candidate`
  - `candidate_queue`
  - `related_risk_targets`
  - `transition_memo`
  - `top_candidates`
  - `log_investigation_plan`
- The contract planner must preserve candidate-board ordering and runtime-log intent instead of collapsing them into a generic probe note.
- Stage 1B must still leave the session with a clear `contrarian candidate`, a `recommended first probe`, and a transition memo that can automatically continue into evidence investigation.

### Stage 2: Evidence Investigation

- The transition memo is produced by the contract-planner subagent as part of its YAML output (included in the `---` block).
- **Leader's responsibility**: After parsing the contract-planner result, populate `transition_memo` fields: `first_candidate_to_test`, `why_first`, `evidence_unlock`, and `carry_forward_notes`.
- After writing the Stage 1B package, automatically continue into evidence investigation. Do not stop for confirmation unless human action is required.
- Treat the transition memo as the bridge between the outsider view and the investigator view. The later evidence phase must carry the observer framing forward instead of discarding it.

### Observer Gate
- Before evidence investigation begins, verify all of the following in the debug session:
  - `causal_map_completed: true`
  - `investigation_contract_completed: true`
  - `log_investigation_plan_completed: true`
  - `observer_framing_completed: true`
  - `Causal Map` contains `dimension_scan`, `candidate_board`, family coverage, and falsifiers
  - `Observer Framing` contains the required outsider-analysis fields
  - `Transition Memo` contains `first_candidate_to_test`, `why_first`, and at least one `evidence_unlock` entry
  - `Investigation Contract` contains `primary_candidate_id`, `candidate_queue`, and related-risk targets
  - `Log Investigation Plan` contains existing log targets, candidate signal mapping, and observability escalation guidance
- If any observer-gate item is missing, return to Stage 1 or Stage 2 instead of reading code, logs, tests, or running reproduction.
- No source-code reads, test reads, log reads, or repro commands are allowed while `observer_framing_completed` is not `true`.

### Stage 3: Reproduction Gate
- Capture expected behavior, actual behavior, reproduction steps, and observed errors in the session file before running the first repro.
- Confirm that the bug is reproducible through a command, script, or explicit manual sequence.
- If reproduction is not yet verified, stop and gather what is missing before theorizing.

### Stage 4: Log Review
- Inspect existing logs, error output, and test output before changing code.
- Logs are a first-class evidence source and existing logs come first.
- Treat logs as evidence, not background noise: if a log line materially changes the hypothesis space, record it in the session `Evidence` section with its source path/command.
- Identify whether the current observability already shows:
  - where the failure occurs,
  - which inputs or branches matter,
  - what external dependencies returned,
  - and what state changed immediately before failure.
- Read the active feature's `spec.md`, `plan.md`, and `tasks.md` when available to recover intended behavior, locked planning decisions, and implementation boundaries relevant to the bug.
- If `context.md` exists for the active feature, read it before proposing a fix so locked decisions, canonical references, and user-signaled constraints are not bypassed during debugging.
- For runtime bugs, use the investigation contract's `log_investigation_plan` log investigation plan to decide:
  - which existing log targets to inspect first,
  - which candidate-specific signals should appear there,
  - whether logs are sufficient,
  - and whether instrumentation or a user log request must happen before fixing.

### Required Framing Before Hypothesis
- Before committing to a root-cause theory, write a **Truth Ownership Map** in the debug session:
  - which layer owns the decision truth,
  - which layers only reflect or cache it,
  - and what evidence supports that ownership claim.
- Split state into **Control State** and **Observation State**:
  - `Control State` covers counters, queues, admission sets, scheduler slots, ownership sets, and other values used to make decisions.
  - `Observation State` covers UI status, logs, task tables, snapshots, event streams, and other externally visible projections.
- Write the expected **Closed Loop** in the session file:
  - input event -> control decision -> resource allocation -> state transition -> external observation
- Prefer hypotheses that explain the control-plane truth, not just the visible symptom layer.

### Stage 5: Observability Assessment
- If the current logs cannot answer those questions, treat observability as insufficient.
- During `investigating`, you may add or refine diagnostic logging, tracing, or instrumentation, then rerun the reproduction or tests to collect stronger evidence.
- If logs are insufficient during a runtime bug investigation, you cannot directly enter fixing until the work either extracts decisive signals from existing logs or records an instrumentation / user log request escalation.
- Prefer diagnostic logging that clarifies boundaries, inputs, branches, outputs, and state transitions.
- Prefer **decisive signals** over broad debug noise:
  - queue contents,
  - ownership sets,
  - running/admitted collections,
  - resource counters,
  - and the exact handoff points between decision layers.
- Bias your instrumentation to the active problem profile when one is apparent:
  - **scheduler/admission**: queues, running/admitted sets, slot counters, promotion handoffs
  - **cache/snapshot drift**: authoritative state versus cached state, invalidation timing, refresh paths
  - **UI projection**: source-of-truth state, publish boundary, transformed view-model state, render/polling output
- For runtime bug investigations where the leader cannot access the needed logs directly, produce a concrete user log request packet before fixing. Include the time window, target system, identifiers or correlation keys, exact log sources, and the expected candidate-separating signals.
- If two hypothesis/experiment cycles fail to converge, escalate observability explicitly. Add instrumentation that can directly falsify the remaining competing explanations instead of applying another surface-level fix.

### Stage 6: Hypothesis Formation
- Form one specific, falsifiable hypothesis from the evidence.
- Record the hypothesis, the test to run, and the expected result in `Current Focus`.
- State how the hypothesis relates back to the observer framing board: does it confirm, refine, or eliminate one of the observer candidates?
- State why the hypothesis targets the owning layer or control state rather than a downstream projection.

### Stage 7: Experiment Loop
- Run one experiment for the active hypothesis.
- Append the observed result to `Evidence`.
- If the result disproves the hypothesis, append it to `Eliminated` and return to Stage 5.
- If the result confirms the failure mechanism, record the root cause and continue to fixing.
- Before leaving this stage, record which plausible causes were considered and which were ruled out so the session shows real causal spread instead of a single-path guess.
- Record any **rejected surface fixes** that improved symptoms without restoring the control loop, so future resumes do not mistake symptom relief for root-cause resolution.

### Stage 8: Root Cause Confirmation
- Before entering fixing, be able to explain:
  - what failed,
  - why it failed,
  - why the active hypothesis is stronger than the eliminated alternatives,
  - which layer owned the broken truth,
  - which decisive signals ruled out the competing explanations,
  - whether the issue was in control state, observation state, or the boundary between them,
  - and what behavior change should resolve the full loop instead of only a local inconsistency.
- Record explicit causal coverage before fixing:
  - `alternative_hypotheses_considered`
  - `alternative_hypotheses_ruled_out`
  - `root_cause_confidence`
- Use `root_cause_confidence: confirmed` only when the current explanation is stronger than the ruled-out alternatives and the decisive signals directly support it.
- Record the root cause in structured form:
  - `summary`
  - `owning_layer`
  - `broken_control_state`
  - `failure_mechanism`
  - `loop_break`
  - `decisive_signal`

## Capability-Aware Investigation

- During `investigating`, the current candidate queue is the execution contract for the stage. The leader should not drift into unrelated freeform probing while the active primary candidate is still unresolved.
- Candidate queue entries must be consumed explicitly: confirm them, rule them out, or deprioritize them with evidence. Do not let high-priority candidates silently disappear from the session.

- During `investigating`, determine whether the current investigation has one or more safe evidence-collection lanes before running multiple independent evidence-gathering actions sequentially.
- [AGENT] Use the shared policy function with the current capability snapshot when the investigation has safe delegated lanes: `choose_subagent_dispatch(command_name="debug", snapshot, workload_shape)`.
- Persist the decision fields exactly: `execution_model: leader-inline | subagent-assisted | blocked`, `dispatch_shape: leader-inline | one-subagent | parallel-subagents | subagent-blocked`, `execution_surface: leader-inline | native-subagents | none`, `dispatch_reason`, and `blocked_reason` when blocked.
- Treat runtime safety as a dispatch-blocking decision. If the next step is unsafe, unavailable, or unpacketizable, use `subagent-blocked`, record `execution_surface: none`, and stop instead of widening brittle native fan-out.
- Debug routing decision order:
  - Small focused investigation with one short evidence chain -> `leader-inline`.
  - One safe validated evidence lane where isolation improves quality -> `one-subagent` on `native-subagents` when available.
  - Two or more independent evidence lanes -> `parallel-subagents` on `native-subagents` when available.
  - No safe lane, shared mutable state, missing contract, incomplete packet, unavailable delegation, or unsafe next step -> `subagent-blocked` with `execution_surface: none` and a recorded reason.
- Dispatch a subagent only when the evidence-lane contract is complete: probe intent, required evidence, authoritative inputs, and validation targets must all be recorded before dispatch.
- If that subagent-readiness bar is not met, compile the missing evidence-lane contract before dispatch; if the lane cannot be made safe, record `subagent-blocked` and stop for escalation or recovery.
- `parallel-subagents` means the leader dispatches bounded evidence-gathering subagents and rejoins at an explicit join point.
- `native-subagents` means the leader uses the current runtime native subagent surface for dispatched evidence lanes.
- The durable team workflow remains separate from ordinary debug dispatch and is not the execution surface for this command.
- Suitable subagent tasks include:
  - running targeted tests or repro commands,
  - collecting logs and exit codes,
  - searching for error text,
  - tracing isolated code paths,
  - comparing independent modules or configurations,
  - assessing whether existing logs are sufficient,
  - and gathering output after temporary or durable diagnostic logging has been added.
- Keep the debug session leader-led: subagents return facts, command results, and observations for the current hypothesis.
- Subagents must not redo observer framing from scratch; they inherit the observer framing and transition memo as the current outsider model.
- Subagents must not mutate the debug session state, declare the root cause final, or archive the session.
- Before dispatching subagent investigation work, update the debug file to reflect the exact current focus and what evidence is being gathered next.
- Use `.specify/templates/worker-prompts/debug-investigator.md` as the default evidence-collector contract whenever the current integration can dispatch a debug subagent.
- If the current runtime supports structured subagent results, prefer a stable evidence payload over freeform summaries so the leader can merge findings without reinterpretation.
- If the current integration exposes a runtime-managed result channel, use that channel. For Codex runtime-managed handoffs, the canonical path requires the runtime dispatch request id and is computed with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify result path --command debug --request-id '<request-id>'`; final completion must be reported through the active runtime-managed result channel for that request id.
- Without a runtime-managed result channel, write the normalized evidence/result envelope to `.planning/debug/results/<session-slug>/<lane-id>.json`
- When the local CLI is available and no runtime-managed result channel exists, prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify result path --command debug --session-slug '<session-slug>' --lane-id '<lane-id>'` to compute the canonical handoff target and `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify result submit --command debug --session-slug '<session-slug>' --lane-id '<lane-id>' --result-file '<path>'` to normalize and write the evidence/result envelope. `result path` emits JSON and does not accept `--format`; do not append `--format`.
- Preserve `reported_status` when normalizing subagent language such as `DONE_WITH_CONCERNS` or `NEEDS_CONTEXT` into canonical orchestration state.
- Idle subagent is not an accepted result.
- [AGENT] The leader must wait for and consume the structured handoff before closing the join point, declaring completion, requesting shutdown, or interrupting subagent execution.

## Debug File Protocol

- **Location**: `.planning/debug/[slug].md`
- **causal_map_completed**: `false` until the Stage 1A causal map, dimension scan, and candidate board are written.
- **investigation_contract_completed**: `false` until the Stage 1B investigation contract is written.
- **log_investigation_plan_completed**: `false` until the Stage 1B log investigation plan is written as its own section.
- **observer_framing_completed**: `false` until the canonical intake package is complete.
- **legacy_session_needs_reintake**: `true` only when a resumed legacy session cannot safely satisfy the canonical intake gate.
- **Current Focus**: OVERWRITE on every update. Reflects exactly what the leader is doing now.
- **Evidence**: APPEND confirmed findings only.
- **Eliminated**: APPEND disproven theories only.
- **Update Rule**: Update the file before taking an action.
- No source-code reads, test reads, log reads, or repro commands are allowed while `observer_framing_completed` is not `true`.

The session file must always make it clear:
- what the observer framing concluded,
- what the active hypothesis is,
- what experiment is being run,
- why the current logs are sufficient or insufficient,
- which layer owns the relevant truth,
- which state is control state versus observation state,
- where the closed loop is currently believed to break,
- and what the next action is if the session resumes later.

## Fix and Verify Protocol

- Enter `fixing` only after the root cause is confirmed.
- Write a failing automated repro test before changing production code.
- Do not modify production behavior until the RED state is proven.
- If no reliable automated test surface exists for the failing behavior, add the missing harness first or route through `/sp-quick` or `/sp-specify` before code changes.
- Apply the minimum code change needed to address the confirmed root cause when `execution_model: leader-inline`; when `execution_model: subagent-assisted`, delegate it through a validated subagent lane and integrate the returned evidence on the leader path.
- If the fix cannot proceed safely, cannot be packetized for the selected execution path, or cannot be verified, record `subagent-blocked` with `execution_surface: none` and a concrete `blocked_reason`.
- Fix the owning control-plane failure first. Do not treat a UI/status smoothing change as sufficient unless the closed loop is proven healthy end-to-end.
- Classify the fix before verification:
  - write the classification to `fix_scope`
  - `truth-owner`
  - `control-boundary`
  - `observation-boundary`
  - `surface-only`
- `surface-only` means the change smooths or hides the symptom without repairing the owning truth or the broken handoff. A `surface-only` fix cannot satisfy the debug contract.
- After changing code, rerun:
  - the reproduction path,
  - the most relevant tests,
  - and any logging-enhanced repro flow needed to prove the mechanism changed.
- Verify the full control loop, not only one function or field:
  - triggering input,
  - control decision,
  - resource allocation,
  - resulting state transition,
  - and external observation.
- Record `loop_restoration_proof` before moving to `resolved`. This loop restoration proof should show why the full loop is healthy now, not merely why one surface looks better.
- If verification fails, return to `investigating` with updated evidence. Do not keep layering fixes without updating the hypothesis.
- If automated verification or human verification fails repeatedly without producing a stronger causal explanation, stop the local fix loop and create or refresh `.planning/debug/[slug].research.md` before another code change.
- Use that debug-local research checkpoint to record the missing contract facts, environment assumptions, external references, or repository evidence needed to break the loop.
- Treat the returned project cognition compass packet and readiness as the default intake source for brownfield debug runtime coverage; use only returned `minimal_live_reads` when needed.
- Before moving to `awaiting_human_verify` or `resolved`, record `changed_code_paths` with modified, added, deleted, and renamed paths; `changed_behavior_surfaces` for affected commands, APIs, templates, generated assets, state files, tests, docs, validators, packets, or runtime assumptions; `verification_evidence`; and `project_cognition_refresh` when project cognition might be affected.
### Inline Project Cognition Update

Workflow-owned mutation closeout is not an external map-maintenance handoff and is not external map maintenance. It is the workflow-local form of `/sp-map-update`. If this workflow changed project-related source, runtime, templates, generated assets, config, tests, state contracts, shared surfaces, or behavior-bearing docs, closeout MUST run inline project cognition update for the workflow-owned changed paths and affected surfaces before claiming clean completion.

Call the planner first:

```text
project-cognition closeout-plan --workflow "$ACTIVE_WORKFLOW" --format json
```

When `DELTA_SESSION_ID` exists, pass it into the planner:

```text
project-cognition closeout-plan --workflow "$ACTIVE_WORKFLOW" --delta-session "$DELTA_SESSION_ID" --format json
```

Consume `workflow_canonical`, `update_mode`, `payload_draft`, `required_agent_fields`, `unknown_paths`, `unknown_path_dispositions`, `delta_append_draft`, display-only `delta_append_command`, `update_argv`, display-only `update_command`, and `recommended_next_command`.

Before running `update`, fill the fields listed in `required_agent_fields` from live evidence from this workflow. Supported agent-owned evidence fields include:

- `verification`
- `behavior_surfaces`
- `generated_surfaces`
- `state_contracts`
- `known_unknowns`
- `confidence_notes`
- `user_decisions`
- `boundary`

If a field appears in `required_agent_fields`, provide live-evidence-backed content for it. Fields not listed by `required_agent_fields`, such as `known_unknowns` and `boundary`, are populated only when live evidence supports them; do not invent them to satisfy the shape.
Use `known_unknowns` only for blockers that make the cognition update unsafe to trust. If the working tree contains unrelated dirty/untracked paths and the workflow uses explicit workflow-owned paths, record that as `confidence_notes` or `boundary.initial_dirty_paths`, not as a blocking `known_unknowns` item.

For each `unknown_path_dispositions[]` item, set `agent_disposition` to exactly one allowed value:

- `adoptable`: verified new path inside this workflow-owned scope; it may be recorded in changed/scope paths and verified adoptable paths do not become blocking `known_unknowns`.
- `review_only`: path informed review but is not adopted into changed coverage.
- `ignored`: path remains excluded and must not enter payloads, records, route indexes, evidence, aliases, or minimal live reads.
- `blocking_known_unknown`: record it as a known unknown and report partial or blocked cognition closeout.

If `update_mode=delta_session`, complete `delta_append_draft.argv_prefix` with agent-owned repeatable flags such as `--behavior-surface`, `--generated-surface`, `--verification`, and accepted `--known-unknown` values from `delta_append_draft.argv_placeholders`. Then append the delta event and run `update_argv`. `delta_append_command` and `update_command` are display-only placeholders, not execution strings.

If `update_mode=payload_file`, write the completed `payload_draft` to the planner's `payload_path`. Then run `update_argv`. `update_command` is a display-only placeholder, not an execution string.

Completed payload drafts preserve the planner-owned `changed_paths` and `scope_paths` and add agent-owned evidence fields before recording.

For compatibility with worker handoffs and delta packets, the runtime also accepts `verification_evidence` as an alias for `verification` and `generated_surface_notes` as an alias for `generated_surfaces`. Verification evidence may be an array of objects (`command`, `result`, `artifact`) or an array of command-result strings, but clean closeout still requires passing verification evidence; failed verification cannot produce a clean `ready` closeout.

Clean closeout keys on `result_state`, not `status=ok`, `update_id`, `last_update_id`, or freshness alone:

- `ready` or `no_op`: project cognition closeout may be clean when ordinary verification also passed.
- `partial_refresh`: useful update data was written, but the final workflow state must report partial cognition closeout and the returned `minimal_live_reads`.
- `needs_rebuild`: report the exact rebuild condition and route to `/sp-map-scan`, then `/sp-map-build`.
- `blocked`: report the runtime or validation blocker and the exact recovery command.
- `recorded`: legacy recorded-only output; treat it as partial or blocked, never as clean completion.

Dirty fallback command shape: `'C:\Users\11034\.specify\bin\project-cognition.exe' mark-dirty --reason '<reason>' --format json`.
Use `'C:\Users\11034\.specify\bin\project-cognition.exe' mark-dirty --reason workflow-closeout-failed --format json` only when inline update cannot complete: when the planner or update command is unavailable, cannot record useful update data, cannot identify workflow-owned scope, or cannot be trusted because verification/workflow completion is not trustworthy. Dirty only when inline update cannot complete.

sp-map-update is for manual/external maintenance and follow-up repair. `/sp-map-update` remains the external/manual workflow for user edits, interrupted workflow repair, explicit map maintenance, and follow-up repair. It is not routine cleanup for changes this workflow just made. If `sp-map-update` already ran `project-cognition update --reason map-update` for the same changed paths, do not run a second `workflow-finalize` closeout update for those paths.
- Manual map maintenance may record ordinary uncertain closure, partial/low-confidence facts, known unknowns, and `minimal_live_reads` for external repair cases. After a successful existing-baseline maintenance refresh, use `'C:\Users\11034\.specify\bin\project-cognition.exe' complete-refresh --format json` only for incremental freshness finalization; `sp-map-build` owns `build-from-scan` and `'C:\Users\11034\.specify\bin\project-cognition.exe' validate-build --format json`, so do not run `complete-refresh` as a rebuild finalizer.
- The completion claim must be backed by live code, tests, scripts, configuration, or authoritative docs; project cognition can support route selection but cannot be the sole evidence for completion. Continue only when verification is truthfully green and no explicit blocker prevents completion.
- [AGENT] Resolved debug sessions should auto-capture reusable lessons from the persisted debug session state into index/detail entries.
- [AGENT] If you are finalizing outside the normal debug CLI closeout path, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify learning capture-auto --command debug --session-file '.planning/debug/[slug].md' --format json`.
- [AGENT] If the auto-capture pass produced no captured lesson but you still discovered a reusable `pitfall`, `recovery_path`, or `project_constraint`, use the manual `learning capture` helper surface to create or merge an index/detail entry.
  Required options: `--command`, `--type`, `--summary`, `--evidence`
- [AGENT] Before leaving the debug session in a terminal state, apply the Learning Reflex and record any reusable `pitfall`, `recovery_path`, `tooling_trap`, `false_lead_pattern`, or `project_constraint` in `.specify/memory/learnings/INDEX.md` plus a linked detail document when durable state did not already preserve it.
- Treat one-off findings as no reusable lesson; store reusable lessons as index/detail entries, and use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify learning promote --target learning ...` only after explicit confirmation or proven recurrence.
- Only ask for confirmation when a new learning is highest-signal, such as an explicit user default, clear cross-stage reuse, or repeated recurrence that should become shared project memory.

## Checkpoint Protocol

Return a `## CHECKPOINT REACHED` block when user action or confirmation is required.

- **Type**: `human-verify`, `human-action`, or `decision`
- **Progress**: concise summary of the root cause, key evidence, and eliminated hypotheses
- **Awaiting**: exactly what the user must do next

Use `human-verify` after the agent has verified the fix and needs the user to confirm the bug is resolved in their environment.

To begin the debug session:
`EXECUTE_COMMAND: debug`

## Codex Investigation Routing Contract

When running `sp-debug` in Codex, treat `investigating` as a complexity-based leader decision.
- Execution model: `leader-inline | subagent-assisted | blocked`.
- Dispatch shape: `leader-inline`, `one-subagent`, `parallel-subagents`, or `subagent-blocked`.
- Execution surface: `leader-inline`, `native-subagents`, or `none`.
- Subagent dispatch: Dispatch subagents through the integration's native subagent support using the shared prompt contract.
- Integration-native join point: Use the integration-native join point, then integrate results back on the leader path.
- Fallback path: No managed-team or leader-inline fallback for `sp-debug`; choose `leader-inline` up front for a small focused investigation, or record `subagent-blocked` with `execution_surface: none` when the next safe step cannot proceed.
- Small focused investigation -> `leader-inline`.
- One safe isolated evidence lane -> `one-subagent` when the current runtime supports it safely.
- Two or more independent evidence lanes -> `parallel-subagents` when the current runtime supports it safely.
- Unsafe, unavailable, or unpacketizable next step -> `subagent-blocked` with `execution_surface: none` and `blocked_reason`.
- Suitable subagent tasks include running targeted tests or repro commands, collecting logs and exit codes, searching for error text, tracing isolated code paths, and gathering evidence after diagnostic logging has been added.
- Read `diagnostic_profile` from the debug session before choosing subagent lanes.
- Subagents must return facts, command results, and observations; they must not update the debug file, declare the root cause final, or transition the session state.
- Keep fixing, verification, `awaiting_human_verify`, and final session resolution on the leader path.

## Codex Subagent Dispatch Contract

- Execution model: `subagents-first`
- Dispatch shape: `one-subagent`, `parallel-subagents`, or `subagent-blocked`
- Execution surface: `native-subagents`, `managed-team`, or `leader-inline`
- Delegation surface contract: preserve the native dispatch, fallback, worker result contract, and handoff path below.
- Native subagent capability discovery: Before recording `subagent-blocked`, check the active tool surface for the integration-native subagent or task-dispatch entrypoint and record the exact missing surface if unavailable.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch subagents through the integration's native subagent support using the shared prompt contract.
- Join behavior: Use the integration-native join point, then integrate results back on the leader path.
- Managed-team fallback: No managed-team or leader-inline fallback for `sp-debug`; choose `leader-inline` up front for a small focused investigation, or record `subagent-blocked` with `execution_surface: none` when the next safe step cannot proceed.
- Leader-inline fallback: record the reason before local execution.
- Worker result contract: Fact-only evidence payload: hypothesis tested, commands run, files inspected, observations, confidence, blocker.
- Result contract: Fact-only evidence payload: hypothesis tested, commands run, files inspected, observations, confidence, blocker.
- Result handoff path: .planning/debug/results/<session-slug>/<lane-id>.json

## Codex Subagent Result Contract

- Worker result contract: preserve the shared `WorkerTaskResult` semantics even when the runtime calls lanes subagents.
- Preferred result contract: Fact-only evidence payload: hypothesis tested, commands run, files inspected, observations, confidence, blocker.
- Result file handoff path: .planning/debug/results/<session-slug>/<lane-id>.json
- For filesystem handoffs, use `specify result path` with the concrete workflow identifiers such as `--feature-dir`/`--task-id`, `--workspace`/`--lane-id`, or `--session-slug`/`--lane-id`.
- `specify result path` emits JSON and does not accept `--format`; do not append `--format`.
- Normalize subagent-reported statuses like `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, and `NEEDS_CONTEXT` into the shared `WorkerTaskResult` contract before the leader accepts the handoff.
- Keep `reported_status` when normalization occurs so runtime-specific subagent language can be reconciled with canonical orchestration state.
- Wait for every subagent's structured handoff before accepting the join point, closing the batch, or declaring completion.
- Do not treat an idle subagent as done work; idle without a consumed handoff means the result channel is still unresolved.
- Do not interrupt or shut down subagent work before the handoff has been written or explicitly reported as `BLOCKED` or `NEEDS_CONTEXT`.
- Treat `DONE_WITH_CONCERNS` as completed work plus follow-up concerns, not as silent success.
- Treat `NEEDS_CONTEXT` as a blocked handoff that must carry the missing context or failed assumption explicitly.

## Codex Structured Question Preference

- If this command was routed by `sp-auto` with `auto_default_recommendation: true`, evaluate the automatic recommended/default continuation gate before any question path.
- When that gate has one safe recommended/default answer, you must auto-resolve the question or confirmation, record the accepted recommendation in the workflow state or summary, continue the workflow, and do not invoke the native structured question tool only to ask for that approval.
- If the automatic gate is not safe, write the blocker and self-unblock recommendation before using the normal question path.
- If the runtime's native structured question tool is available for the current turn and the `sp-auto` automatic gate did not resolve the question, you must use it.
- Do not render the textual fallback block when the native tool is available.
- Do not self-authorize textual fallback because the question seems simple, short, or easy to phrase manually.
- Treat the template's textual question format as fallback-only guidance; use it to shape the question content, but do not render the textual block unless the native tool is unavailable in the current runtime or the tool call fails.
- Keep native-tool availability, runtime mode, and fallback mechanics backstage. Do not tell the user that a structured question tool is unavailable, that the current runtime/mode lacks a tool, or that a fallback is being used; ask the user-facing question directly when a question is genuinely required.
- Ask only the minimum number of questions required by this workflow's existing contract.
- Keep the user-visible question text in the user's current language and keep option labels short.
- Do not emit both a native tool question and the textual fallback block in the same turn. The user should see the active question exactly once.
- If the native tool is unavailable in the current runtime or the tool call fails, ask one concise missing-information question in plain text during observer framing before entering reproduction work.
- In `debug`, use this preference for:
  - missing-information questions during map-backed intake
  - deep Stage 1A/1B fallback when project cognition is insufficient
- Native tool target: `AskUserQuestion`
- When this native tool target is listed for the integration and the runtime does not signal otherwise, assume it is available by default in normal interactive sessions.
- Question count: 1-4 questions per call
- Option count: 2-4 options per question
- Required question fields: `question`, `header`, `options`, `multiSelect`
- Option fields: `label`, `description`, `preview (optional)`
- Use `multiSelect: false` unless the workflow explicitly needs multiple selections.
- Use `metadata` only when tracking or analytics context adds value; otherwise keep the call minimal.
