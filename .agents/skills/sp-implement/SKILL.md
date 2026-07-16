---
name: "sp-implement"
description: "Execute the implementation plan by dispatching subagents and integrating their results"
argument-hint: "Optional implementation guidance or task filter"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/implement.md"
user-invocable: true
---
## Invocation Syntax

- In this integration, invoke workflow skills with `/sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: `tasks.md` is ready and the feature should move from planning into tracked execution batches.
- **Primary objective**: Execute the ready batches while preserving tracker state, subagent contracts, verification discipline, and resumability.
- **Primary outputs**: Verified code, test, and documentation changes plus implementation-tracker, subagent-result artifacts, and `implementation-summary.md` for the active feature.
- **Default handoff**: Continue with the next ready batch, route blockers into /sp-debug, or report completion only when the implementation contract is actually satisfied.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Advance the current feature through tracked implementation batches while keeping execution state, subagent work, verification evidence, and recovery paths explicit.

## Context

- Primary inputs: `tasks.md`, the plan package, `implement-tracker.md`, worker-result handoff files, passive learning files, the task-local project cognition query bundle with readiness and returned `minimal_live_reads`, and the smallest workflow-local state files needed for the touched area.
- The leader owns tracker truth, execution strategy, join points, blocker handling, and final validation.
- Delegated workers own bounded implementation lanes only; they do not own the overall implementation state.

## Process

- Recover tracker state and identify the current ready batch.
- On resume, audit terminal-looking tracker/task state before trusting completion; checked tasks are claims until validation, handoff, join point, and consumer evidence prove them. When `real_entrypoint_evidence` is required, synthetic-only consumer proof is not sufficient.
- Carry every `CA-###` consequence obligation from packets into dispatch, implementation evidence, result acceptance, tracker open gaps, and stop-and-reopen routing.
- Choose the execution strategy and dispatch subagents or a documented fallback path.
- Integrate structured handoffs, update tracker truth, and keep verification evidence current.
- Continue automatically until the feature is complete or blocked by a real blocker.

## Output Contract

- Produce verified implementation changes plus updated execution-state artifacts for the active feature.
- Keep `implement-tracker.md` and worker-result handoffs aligned with what actually happened.
- Report blockers, retries, and completion honestly rather than inferring success from partial progress.
- For any blocked, approval-gated, timeout-gated, or nonzero-verification exit, include an **Actionable Blocker Resolution** section instead of a bare blocked summary. It must name each blocker, `owner: agent | user | maintainer | external-system`, `exact_next_action`, `approval_question` when human approval is the next step, artifact or log evidence, `unblock_criteria`, and whether the rest of implementation can continue.
- Do not leave the user to infer whether to handle the blocker. Say whether the blocker is mandatory for completion, optional cleanup, external baseline maintenance, or a follow-up risk, and name the next command or approval decision when one is known.
- Preserve any `MP-*` obligations carried in task packets, implementation state, or result handoff expectations.
- Worker result handoffs must include must-preserve evidence when packet obligations require it.
- If implementation discovers a conflict with an `MP-*` obligation, return a blocked result instead of silently changing the protected discussion decision.

## Guardrails

- Do not dispatch from raw task text alone; compile and validate the packet first.
- Do not bypass tracker truth, result handoffs, or verification gates.
- Do not declare completion because tasks look checked off if the implementation contract is not actually satisfied.

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

## Embedded Implement Review Loop

This section is **mandatory**. `sp-implement` includes an internal review-and-repair loop. Do not expose, recommend, or route to a separate public review workflow.

### Pre-Implement Review

Before the first implementation task, run a pre-implement review over `tasks.md`, `task-index.json`, `task-packets/*.json`, `handoff-to-implement.json`, `workflow-state.md`, and the upstream read-only truth artifacts needed to verify coverage.

The review must check:

- every buildable requirement, locked planning decision, `MP-*` obligation, `CA-###` obligation, user-observable path, required evidence term, write set, dependency, join point, and packet-readiness condition still has executable coverage
- the first executable batch is still valid from current repository evidence
- downstream tasks do not depend on unverified assumptions from earlier unfinished work

If only task-layer defects exist, repair task-layer artifacts automatically and continue. If the defect changes goal, scope, architecture, required evidence, `MP-*`, `CA-###`, feasibility, or user decision state, stop and route to `/sp.clarify`, `/sp.deep-research`, `/sp.plan`, `/sp.tasks`, or `/sp.debug` as justified.

### Join-Point Drift Review

After every phase, parallel batch, pipeline stage, join point, and sequential review window, run a drift review before downstream work continues.

The drift review reads actual changed paths, worker handoffs, validation evidence, `implement-tracker.md`, open gaps, blockers, remaining tasks, task packets, and review records. It decides whether the remaining task package still matches implementation reality.

### Sequential Review Window

Do not execute a long sequential task list as one unreviewed queue. Run drift review whenever any limit is reached:

```text
max_completed_tasks_before_review = 5
max_unreviewed_changed_paths = 8
max_unreviewed_validation_failures = 0
```

Validation failure, stale handoff, worker concern, open gap, or missing real-entrypoint evidence triggers immediate drift review.

### Review Decisions

Each review must record one decision:

- `cleared`
- `repair-and-continue`
- `repair-and-rerun-current-window`
- `blocked-reopen-tasks`
- `blocked-reopen-plan`
- `blocked-reopen-clarify`
- `blocked-deep-research`
- `debug-required`

### Safe Repair Boundary

Review may repair `tasks.md`, `task-index.json`, `task-packets/*.json`, `handoff-to-implement.json`, `implement-tracker.md`, selected execution-review fields in `workflow-state.md`, and `implementation-review/*`.

Review must not rewrite upstream truth artifacts or upstream-derived workflow-state fields.

### Workflow-State Write Allowlist

The workflow-state write allowlist for embedded review permits only:

- `review_gate`
- `review_window_policy`
- `implementation_review`
- current-run review blocker rows
- `next_action`
- `blocker_reason`
- `blocked_reason`
- `next_command` when stopping the current `sp-implement` run with a review decision

Embedded review must not rewrite:

- `active_profile`
- `required_sections`
- `activated_gates`
- `task_shaping_rules`
- `required_evidence`
- `transition_policy`
- `final_handoff_decision`
- `authoritative_files`
- `allowed_artifact_writes`
- `forbidden_actions`
- existing Analyze Gate truth
- existing Reopen Contract truth
- source discussion or must-preserve disposition fields

If any protected field is wrong, stale, or insufficient, record a blocker and route to the owning upstream workflow.

### Task Identity Stability

- Completed task IDs are immutable and must not be renumbered.
- Incomplete task IDs stay stable when their objective remains the same.
- New repair and refinement tasks use append-only IDs after the highest existing numeric ID.
- Completed-work gaps become follow-up repair tasks with `repair_for: T###` or `refines: T###`.
- Superseded incomplete tasks remain traceable through `task-index.json`, task packets, dependencies, repair records, tracker state, and worker-result references.
- After repair, dependency graph and `next_batch` metadata are authoritative for execution order.

### Audit Artifacts

Before automatic repair, snapshot changed task-layer artifacts under `FEATURE_DIR/implementation-review/snapshots/`.

Record every review in `FEATURE_DIR/implementation-review/reviews.ndjson`.

Record every automatic repair in `FEATURE_DIR/implementation-review/repairs.ndjson`.

After repair, revalidate task-index consistency, packet readiness, dependencies, tracker state, and worker-result references before continuing.


## Codex Project Cognition Advisory Gate

**Crucial First Step**: You MUST use project cognition compass first: run `'C:\Users\11034\.specify\bin\project-cognition.exe' compass --intent implement '--query=$ARGUMENTS' --format json` before any implementation actions. Read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons, `verification_hints`, `followup_surfaces`, and `before_fix_claim`; treat `coverage_diagnostics` as confidence and closeout signals, never as route candidates. Treat `expansion_ref` as a normal continuation path and run `project-cognition expand --id <id> --section <section> --format json` only when coverage state or live evidence requires more map detail. Do not infer final edit scope from `minimal_live_reads` or `first_pass_paths`. Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`. When `compass_state=needs_semantic_intake`, write `semantic_intake` from project vocabulary and rerun compass with `--semantic-intake-file`, or use the advanced `lexicon -> semantic_intake -> query` path when explicit concept decisions are needed. Preserve advanced routing through `'C:\Users\11034\.specify\bin\project-cognition.exe' query --intent implement --query-plan '<query_plan_json>' --format json` for precision cases.
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
- Carry forward the selected capability, minimal live reads, boundary constraints, required references, validation route, and evidence gaps into `implement-tracker.md` or the current `WorkerTaskPacket` before dispatch or code edits.

## Orchestration Model

This section is **mandatory**. Every `sp-implement` run MUST follow this model — deviation is not permitted.

### Leader Responsibilities

You are the workflow **leader and orchestrator** for this run, not the concrete implementer.

- Own routing, task splitting, task contracts, dispatch, join points, integration, verification, and state updates
- Subagents own the substantive task lanes assigned through task contracts
- Recover context, choose the current ready batch, integrate structured handoffs, keep `implement-tracker.md` accurate, and own final validation
- The leader owns sequencing, review, and acceptance.
- Use `execution_model: subagent-mandatory` for ready implementation batches
- Dispatch `one-subagent` when one validated `WorkerTaskPacket` is ready; dispatch `parallel-subagents` when multiple validated packets have isolated write sets
- Use `execution_surface: native-subagents`
- If the subagent-readiness bar is not met, compile the missing context, hard rules, validation gates, or handoff requirements before dispatch
- Treat non-empty `$ARGUMENTS` as first-class implementation context, not disposable chat-only guidance

### Subagent Mandate

All substantive implementation work defaults to and MUST use subagents. Substantive implementation lanes must be delegated. The leader orchestrates: route, split tasks, prepare task contracts, dispatch subagents, wait for structured handoffs, integrate results, verify, and update state.

- Before dispatch, every subagent lane needs a task contract with objective, authoritative inputs, allowed read/write scope, forbidden paths, acceptance checks, verification evidence, and structured handoff format
- Use `dispatch_shape: one-subagent | parallel-subagents`
- **HARD RULE**: dispatch only from validated `WorkerTaskPacket` — never from raw task text alone
- If a task packet contains `must_preserve_obligations`, the worker must preserve those `MP-*` items or return a blocked result with the exact stop-and-reopen condition.
- Do not dispatch a packet that drops a discussion-derived `MP-*` obligation from `tasks.md`, `plan.md`, or `brainstorming/handoff-to-specify.json`.
- A successful worker result must include `must_preserve_evidence` for every packet obligation that affects acceptance, references, forbidden drift, or conflict/reopen conditions.
- If implementation discovers a conflict with an `MP-*` obligation, stop and return a blocked result; do not silently rewrite the product goal, non-goal, selected decision, or reference obligation.
- [AGENT] The leader must wait for and consume the structured handoff before closing the join point, declaring completion, requesting shutdown, or interrupting subagent execution
- Idle subagent is not an accepted result
- Treat `DONE_WITH_CONCERNS` as completed work plus follow-up concerns, not as silent success
- Treat `NEEDS_CONTEXT` as a blocked handoff that must carry the missing context or failed assumption explicitly

### Autonomous Blocker Recovery (Hard Rule)

If technical blockers arise (build errors, missing toolchain components, environment mismatches), you **MUST** attempt autonomous escalation to a specialist subagent **BEFORE** asking the user for intervention.

- Only stop and ask the user if the specialist lane confirms that manual human action is the ONLY remaining path

### Integrity Rules

- **Hard rule:** The leader must not edit implementation files directly while subagent execution is active
- Do **not** fall through from subagent dispatch into local self-execution just because the implementation looks feasible
- Do not dispatch a subagent when required packet fields or required references are missing — repair the packet first or stop as `subagent-blocked`
- Do not bypass tracker truth, result handoffs, or verification gates
- Do not declare completion because tasks look checked off if the implementation contract is not actually satisfied

## Pre-Dispatch Validation

Before dispatching any subagent, the leader MUST validate each task contract:

### Required Checks (BLOCK on failure)

1. **agent_exists**: Confirm the task's `agent` role exists in the agent-teams role pool: security-reviewer, test-engineer, style-reviewer, performance-reviewer, quality-reviewer, api-reviewer, debugger, code-simplifier, build-fixer, executor. If missing, auto-correct to the closest matching role or `executor`.

2. **deps_acyclic**: Confirm `depends_on` does not form a cycle. Walk the dependency chain; if a cycle is detected, stop and require tasks.md correction before dispatch.

### Advisory Checks (WARN but continue)

3. **scope_paths_exist**: Confirm each path in `write_scope` and `read_scope` exists in the repository or will be created by this task. Missing paths that are not created by earlier tasks should be flagged.

4. **context_nav_valid**: Spot-check context navigation pointers — verify the pointed-to files exist and the referenced sections are present. Missing pointers should be noted but do not block dispatch.

5. **forbidden_safe**: Verify that `forbidden` includes `.env`, credential files, secrets directories, and other sensitive paths. If missing, auto-append the default forbidden patterns before dispatch.

### Parallel Safety Check

6. **write_set_isolation**: For any two tasks in the same parallel batch, confirm their `write_scope` sets have zero overlap. Tasks with overlapping write sets MUST be serialized even if both are marked `[P]`.

### Validation Output

After checks complete, record results in `implement-tracker.md`:
- `pre_dispatch_validation`: pass | warnings | blocked
- `validation_warnings`: [list of advisory warnings]
- `auto_corrections`: [list of fields auto-corrected]

## Pre-Execution Checks

**Check for extension hooks (before implementation)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_implement` key
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally.
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable.
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation.
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Outline.
    ```
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently.

**Maintain workflow quality without hook choreography**:
- Confirm project cognition freshness, analyze-gate status, and valid execution entry before choosing a batch.
- Keep `workflow-state.md` and `implement-tracker.md` aligned so execution state, next batch, open blockers, and resume instructions stay durable.
- Validate each `WorkerTaskPacket` before dispatch and require a `WorkerTaskResult` plus structured handoff before accepting a join point.
- Update durable state before compaction-risk transitions, long validation phases, join points, subagent fan-out, or any stop where resume will depend on more than the visible conversation.
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

## Passive Project Learning Layer

- [AGENT] Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify learning start --command implement --format json` when available so passive learning files exist and the current implementation run sees relevant shared project memory.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order before broader execution context.
- Open only learning detail docs linked from implementation-relevant index entries, especially repeated pitfalls, recovery paths, or project constraints for the touched area.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail markdown document without asking for routine permission.
- [AGENT] When implementation friction exposes retries, validation failures, route changes, false starts, hidden dependencies, rejected paths, decisive signals, root-cause families, or reusable constraints, make sure `workflow-state.md` or `implement-tracker.md` captures that durable context.
- [AGENT] For structured path learning not already captured in durable state, update `.specify/memory/learnings/INDEX.md` and a linked detail document with the command, type, summary, and evidence.
- Treat this as passive shared memory, not as a separate user-visible execution command.

## Implement Tracker Protocol

- `FEATURE_DIR/implement-tracker.md` is the execution-state source of truth for `sp-implement`.
- [AGENT] Create it if missing after `FEATURE_DIR` is known. If it already exists and is not terminal, resume from it instead of restarting from chat memory.
- If native hook policy redirects a prompt-entry phase jump, return to `workflow-state.md` or `implement-tracker.md`; repeated or explicit phase jumps are blocked by shared workflow policy.
- Treat terminal states as `resolved` or `blocked`. Treat `gathering`, `executing`, `recovering`, `replanning`, and `validating` as resumable states.
- Update the tracker before each material phase transition: after scope recovery, before dispatching a ready batch, after each join point, before validation, when entering replanning, and before final completion reporting.
- The tracker must keep these fields obvious:
  - `status`
  - `current_batch`
  - `next_action`
  - `completed_tasks`
  - `failed_tasks`
  - `retry_attempts`
  - `blockers`
  - `recovery_action`
  - `open_gaps`
  - `user_execution_notes`
  - `resume_decision`
- If the user supplied important execution details in `$ARGUMENTS`, extract and persist them in the tracker before dispatching work. Typical examples include:
  - build or compile order
  - startup commands
  - required environment setup
  - known failing commands to avoid
  - recovery hints the runtime must remember on future resumes
- Treat these notes as binding for the current implementation run unless direct evidence shows they are wrong. Do not drop them silently on resume.
- Use this default structure:

```markdown
---
status: gathering | executing | recovering | replanning | validating | blocked | resolved
feature: [feature slug]
created: [ISO timestamp]
updated: [ISO timestamp]
resume_decision: resume-here | blocked-waiting | resolved
---

## Current Focus
current_batch: [ready batch or validation pass]
goal: [current implementation objective]
next_action: [immediate next step]

## Execution Intent
intent_outcome: [the concrete outcome this batch is trying to deliver]
intent_constraints:
  - [forbidden drift, boundary rules, or execution constraints that stay active for this batch]
success_evidence:
  - [checks or observations required before the leader can accept this batch]

## Execution State
completed_tasks:
  - [task ids already completed]
in_progress_tasks:
  - [task ids currently running]
failed_tasks:
  - [task ids that failed in the current pass]
retry_attempts: [0 if none]

## Blockers
- task: [task id]
  type: technical | external | human-action
  evidence: [short command output or observed failure]
  recovery_action: [smallest safe next recovery step]

## Actionable Blocker Resolution
- blocker: [task id or validation gate]
  classification: technical | external | human-action | verification_policy | project_cognition_readiness | baseline_timeout
  owner: agent | user | maintainer | external-system
  evidence: [artifact path, command output summary, or missing artifact]
  exact_next_action: [specific command, focused investigation, rerun, approval request, or upstream workflow]
  approval_question: [exact yes/no approval question when owner is user or maintainer, otherwise none]
  unblock_criteria: [observable condition that changes this from blocked to complete]
  implementation_can_continue: yes | no
  completion_impact: mandatory_for_completion | optional_cleanup | external_baseline_maintenance | follow_up_risk

## Validation
planned_checks:
  - [independent tests, acceptance checks, or validation commands]
completed_checks:
  - [checks already run]
human_needed_checks:
  - [manual verification still required]

## Open Gaps
- type: execution_gap | research_gap | plan_gap | spec_gap
  summary: [what is still not true]
  source: [task id, validation check, or user-visible outcome]
  next_action: [specific next step]

## User Execution Notes
- note: [important user-supplied execution detail from `$ARGUMENTS`]
  source: sp-implement arguments
  priority: high | normal
  applies_to: current feature execution
```

### Resume Audit Gate

- On every resume, treat checked tasks as claims that need evidence, not evidence themselves.
- If `implement-tracker.md` is `resolved`, all tasks appear checked, or the previous session exit is unknown, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify implement resume-audit --feature-dir '$FEATURE_DIR' --format json` before final reporting or new closeout.
- Treat `terminal-audit-required` as validation/recovery work, not completion.
- Require consumer evidence for tasks that create UI components, routes, providers, registries, factories, configs, tests, API handlers, or other reusable surfaces.
- When a task packet or workflow state requires `real_entrypoint_evidence`, the worker result's `consumer_evidence` must include an item with `kind: real_entrypoint` plus `entrypoint`, `producer`, `transformer`, `consumer`, `boundary_or_executor`, and `validation`; synthetic-only component, reducer, helper, or hand-built state evidence is not enough.
- Do not preserve `resolved` when the audit finds missing wiring, missing validation evidence, stale subagent handoff, unresolved `open_gaps`, or unexecuted planned validation tasks.
- If resume audit fails, update `implement-tracker.md` to `validating` or `recovering` with the audit gaps and continue from the smallest executable repair batch.

## Outline

1. Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` from repo root and parse FEATURE_DIR and AVAILABLE_DOCS list. All paths must be absolute. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").
   - If `FEATURE_DIR` is not already explicit, prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify lane resolve --command implement --ensure-worktree` before guessing from branch-only context.
   - When lane resolution returns a materialized lane worktree, treat that worktree as the execution context for this implementation lane instead of dispatching from the leader workspace by default.

2. **Check checklists status** (if FEATURE_DIR/checklists/ exists):
   - Scan all checklist files in the checklists/ directory
   - For each checklist, count:
     - Total items: All lines matching `- [ ]` or `- [X]` or `- [x]`
     - Completed items: Lines matching `- [X]` or `- [x]`
     - Incomplete items: Lines matching `- [ ]`
   - Create a status table:

     ```text
     | Checklist | Total | Completed | Incomplete | Status |
     |-----------|-------|-----------|------------|--------|
     | ux.md     | 12    | 12        | 0          | ✓ PASS |
     | test.md   | 8     | 5         | 3          | ✗ FAIL |
     | security.md | 6   | 6         | 0          | ✓ PASS |
     ```

   - Calculate overall status:
     - **PASS**: All checklists have 0 incomplete items
     - **FAIL**: One or more checklists have incomplete items

   - **If any checklist is incomplete**:
     - Display the table with incomplete item counts
     - **STOP** and ask: "Some checklists are incomplete. Do you want to proceed with implementation anyway? (yes/no)"
     - Wait for user response before continuing
     - If user says "no" or "wait" or "stop", halt execution
     - If user says "yes" or "proceed" or "continue", proceed to step 3

   - **If all checklists are complete**:
     - Display the table showing all checklists passed
     - Automatically proceed to step 3

3. Load and analyze the implementation context:
   - **REQUIRED**: [AGENT] Create or resume `FEATURE_DIR/implement-tracker.md` immediately after `FEATURE_DIR` is known.
   - **REQUIRED WHEN PRESENT**: Read `handoff-to-implement.json` and treat it as the authoritative execution contract from tasks.
   - **STRUCTURED EXECUTION CONTRACT**: Do not reinterpret product intent from chat memory when `handoff-to-implement.json` disagrees or is more specific.
   - **STRUCTURED EXECUTION CONTRACT**: Treat `must-preserve invariants`, `allowed optimization scope`, `required validation`, and `stop-and-reopen conditions` as binding execution fields.
   - **STRUCTURED EXECUTION CONTRACT**: You must not redefine the product goal, widen locked intent, or implement outside the allowed optimization scope.
   - **STRUCTURED EXECUTION CONTRACT**: If a needed change would violate the current execution contract or require redefining the user's locked goal, stop and reopen the upstream truth layer instead of implementing through ambiguity.
   - **REQUIRED WHEN PRESENT**: Read `FEATURE_DIR/workflow-state.md` if present before choosing the next batch.
   - **REQUIRED WHEN PRESENT**: Read `handoff-to-implement.json` when present and treat it as the authoritative execution contract.
   - **REQUIRED WHEN PRESENT**: Treat `must-preserve invariants`, `allowed optimization scope`, `required validation`, and `stop-and-reopen conditions` from that contract as binding execution fields.
   - **REQUIRED WHEN PRESENT**: If `FEATURE_DIR/workflow-state.md` records `active_profile` or `required_evidence`, treat those fields as execution constraints for batch acceptance and final completion, not as descriptive metadata.
   - **PROFILE EVIDENCE DEFAULT**: For `Standard Delivery`, behavior validation and regression proof remain the lighter default unless `required_evidence` explicitly activates stronger exit evidence.
   - **PROFILE EVIDENCE UPGRADE**: For `Reference-Implementation`, completion requires profile-matched evidence for the persisted `required_evidence` terms activated upstream: reference source evidence, fidelity criteria, difference inventory, accepted deviations, and verification entry points.
   - **PROFILE ARTIFACT FORMS**: Comparison evidence, a deviation log, or fidelity audit notes are acceptable artifact forms only when they satisfy the persisted `Reference-Implementation` evidence terms; do not treat those artifact labels as replacement `required_evidence` names.
   - **IF `WORKFLOW_STATE_FILE` STILL POINTS TO `/sp.analyze` OR SHOWS TASK-GENERATION STATE WAITING FOR ANALYSIS**: stop and run `/sp-analyze` first. Do not self-authorize an `/sp-implement` start from chat memory alone.
   - **IF `WORKFLOW_STATE_FILE` POINTS TO ANOTHER UPSTREAM COMMAND SUCH AS `/sp.plan`, `/sp.tasks`, `/sp.clarify`, OR `/sp.deep-research`**: follow that recorded upstream command first and treat the current implementation attempt as blocked by analysis until the workflow state is cleared back to `/sp.implement`.
   - **IF TRACKER EXISTS WITH STATUS `blocked` OR `replanning`**: Read `blockers`, `open_gaps`, `recovery_action`, and `next_action` first, then continue from that state instead of restarting the workflow from scratch.
   - **IF TRACKER EXISTS WITH STATUS `validating`**: Resume the unfinished validation checks before considering any new implementation work.
   - **IF TRACKER EXISTS WITH STATUS `executing` OR `recovering`**: Resume from the recorded `current_batch`, `failed_tasks`, and `retry_attempts` rather than recomputing progress from chat narration.
   - **IF LANE RESOLUTION OR SESSION-STATE RECONCILE RETURNS `uncertain`**: stop and surface the conflict instead of guessing which lane to continue.
   - **IF `$ARGUMENTS` IS NON-EMPTY**: Extract any high-signal execution constraints, environment facts, build instructions, startup instructions, or recovery hints and record them under `## User Execution Notes` in `implement-tracker.md` before choosing the next batch.
   - **REQUIRED**: Query project cognition with `'C:\Users\11034\.specify\bin\project-cognition.exe' compass --intent implement '--query=$ARGUMENTS' --format json`. Read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons, `verification_hints`, `followup_surfaces`, and `before_fix_claim`. Do not treat first-pass reads as the final edit scope. Use `project-cognition expand` only when the packet's coverage state or live evidence requires it. Use the advanced `lexicon -> semantic_intake -> query` flow only when `compass_state`, coverage diagnostics, localization, or live evidence requires explicit concept decisions. In that escalation, run `project-cognition query --query-plan "<query_plan_json>"` with `query_plan`, `semantic_intake`, `concept_decisions`, and facet coverage
   - **IF READINESS IS `needs_rebuild`**: Run `/sp-map-scan` followed by `/sp-map-build` before continuing.
   - **IF COMPASS COVERAGE IS TOO WEAK FOR THE TOUCHED AREA**: Use live evidence and record whether a follow-up `/sp-map-update` is useful for external map maintenance. Use map-scan -> map-build only for documented brownfield rebuild triggers.
   - **IF READINESS IS `review`**: Inspect only the returned `minimal_live_reads` before trusting the runtime for implementation decisions.
   - **TREAT TASK-RELEVANT COVERAGE AS INSUFFICIENT** when the touched area is named only vaguely, lacks ownership or placement guidance, or lacks workflow, constraint, integration, or regression-sensitive testing guidance.
   - **IF TASK-RELEVANT COVERAGE IS INSUFFICIENT**: use returned testing artifacts and refresh through `/sp-map-update` with changed paths or affected surfaces. Use map-update for ordinary existing-baseline gaps. Use map-scan -> map-build only for first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation path_index rows, missing or invalid alias_index, explicit_rebuild_requested, or baseline_identity_invalid; then inspect the returned minimum live files needed to replace guesswork with evidence.
   - **REQUIRED**: Read `.specify/memory/constitution.md` if present.
   - **REQUIRED**: Read `.specify/memory/project-rules.md` if present.
   - **REQUIRED**: Read `.specify/memory/learnings/INDEX.md` if present.
   - **COMMAND-TIER MODEL**: Preserve command-tier expectations for `fast smoke`, `focused`, and `full`; run the focused tier as the lane acceptance check, use fast smoke for early signal when useful, and reserve full for broader regression or final verification.
   - **IF RELEVANT LEARNING DETAIL DOCS EXIST**: Open only the linked docs relevant to implementation so repeated pitfalls, recovery paths, and project constraints are not rediscovered from scratch.
   - **REQUIRED**: Read tasks.md for the complete task list and execution plan
   - **REQUIRED**: Read plan.md for tech stack, architecture, and file structure
   - **REQUIRED WHEN PRESENT**: Read `FEATURE_DIR/brainstorming/handoff-to-implement.json` and preserve its route, intent, complexity, must-preserve invariants, allowed optimization scope, and stop-and-reopen conditions as binding execution inputs.
   - **REQUIRED**: Extract `Implementation Constitution` from `plan.md` when present and treat it as binding execution guidance rather than advisory background
   - **IF EXISTS**: Read data-model.md for entities and relationships
   - **IF EXISTS**: Read contracts/ for API specifications and test requirements
   - **IF EXISTS**: Read research.md for technical decisions and constraints
   - **IF EXISTS**: Read quickstart.md for integration scenarios
   - **IF `Implementation Constitution` NAMES REQUIRED REFERENCES**: Read those boundary-defining files before choosing the next implementation batch
   - **REQUIRED**: Preserve must-preserve invariants, allowed optimization scope, and stop-and-reopen conditions from the locked handoff and planning package. The execution lane must not redefine the product goal during implementation.
   - **IF THE NEXT READY BATCH TOUCHES AN ESTABLISHED BOUNDARY OR FRAMEWORK**: Record the active boundary framework, preserved pattern, forbidden drift, and required references in `implement-tracker.md` before dispatching work
    - **REQUIRED FOR SUBAGENT EXECUTION**: compile a `WorkerTaskPacket` for each subagent task using `.specify/memory/constitution.md`, `plan.md`, and `tasks.md`
    - **REQUIRED FOR SUBAGENT EXECUTION**: [AGENT] compile and validate the packet before any subagent work begins
    - **REQUIRED FOR SUBAGENT EXECUTION**: Validate each `WorkerTaskPacket` before dispatching work
    - **REQUIRED FOR SUBAGENT EXECUTION**: Use `.specify/templates/worker-prompts/implementer.md` as the default implementer subagent contract and pair post-implementation reviews with `.specify/templates/worker-prompts/spec-reviewer.md` and `.specify/templates/worker-prompts/code-quality-reviewer.md`
    - **REQUIRED FOR SUBAGENT EXECUTION**: Prefer structured handoffs compatible with the shared `WorkerTaskResult` contract whenever the current runtime exposes structured subagent results
    - **REQUIRED FOR SUBAGENT EXECUTION**: If the current integration exposes a runtime-managed result channel, use that channel. For Codex runtime-managed handoffs, the canonical path requires the runtime dispatch request id and is computed with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify result path --command implement --request-id '<request-id>'`; final completion must be reported through the active runtime-managed result channel for that request id.
    - **REQUIRED FOR SUBAGENT EXECUTION**: Without a runtime-managed result channel, write the normalized subagent result envelope to `FEATURE_DIR/worker-results/<task-id>.json`
    - **REQUIRED FOR SUBAGENT EXECUTION**: When the local CLI is available and no runtime-managed result channel exists, prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify result path --command implement --feature-dir '$FEATURE_DIR' --task-id '<task-id>'` to compute the canonical handoff target and `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify result submit --command implement --feature-dir '$FEATURE_DIR' --task-id '<task-id>' --result-file '<path>'` to normalize and write the result envelope. `result path` emits JSON and does not accept `--format`; do not append `--format`.
    - **REQUIRED FOR SUBAGENT EXECUTION**: Preserve `reported_status` when normalizing subagent language such as `DONE_WITH_CONCERNS` or `NEEDS_CONTEXT` into canonical orchestration state
    - **REQUIRED FOR REAL ENTRYPOINT TASKS**: If the compiled `WorkerTaskPacket.required_evidence` includes `real_entrypoint_evidence`, require `consumer_evidence` with `kind: real_entrypoint` and the real path from entrypoint through producer, transformer, consumer, and boundary/executor. Do not accept synthetic-only evidence for that packet.
    - **REQUIRED FOR SUBAGENT EXECUTION**: Idle subagent is not an accepted result.
    - **REQUIRED FOR SUBAGENT EXECUTION**: [AGENT] The leader must wait for and consume the structured handoff before closing the join point, declaring completion, requesting shutdown, or interrupting subagent execution.
    - **HARD RULE**: dispatch only from validated `WorkerTaskPacket` — never from raw task text alone
   - If a needed change would violate the current execution contract or require redefining the user's locked goal, stop and reopen the upstream truth layer instead of implementing through ambiguity.

### Consequence Obligation Execution

- Before choosing a batch, collect every `CA-###` consequence obligation from `tasks.md`, `task-index.json`, task packets, `handoff-to-implement.json`, `workflow-state.md`, and the plan package.
- Each validated `WorkerTaskPacket` that touches an affected object must carry the relevant consequence obligation claim, affected objects, lifecycle states, dependency refs, recovery/validation refs, status, and stop-and-reopen condition.
- Must not drop `CA-###` consequence obligations during packet repair, subagent dispatch, tracker updates, result acceptance, or final validation.
- If implementation evidence proves a consequence obligation wrong, impossible, unmapped, or broader than the current packet, stop and reopen the highest valid upstream workflow instead of silently changing behavior.
- Do not accept a successful worker result for a packet with consequence obligations unless it includes validation evidence for each obligation ID or records a blocked stop-and-reopen condition.
- Keep unresolved consequence obligations visible in `implement-tracker.md` open gaps and final reporting until they are resolved, deferred by an upstream artifact, or routed to `/sp.debug`, `/sp.tasks`, `/sp.plan`, `/sp.deep-research`, or `/sp.clarify`.

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

**Project cognition gate:** query the active project's runtime before broad
repository reads.

Run or emulate:

```text
'C:\Users\11034\.specify\bin\project-cognition.exe' compass --intent implement '--query=$ARGUMENTS' --format json
```

After the default compass packet, run the advanced `lexicon -> semantic_intake -> query` path only when `compass_state`, coverage diagnostics, localization, or live evidence requires explicit concept decisions. In that escalation, use `project-cognition lexicon --mode catalog` as the alias catalog, write agent-authored `semantic_intake` and `concept_decisions`, then run `project-cognition query --query-plan "<query_plan_json>"`; include `query_plan`, `semantic_intake`, `concept_decisions`, `covered_facets`, `missing_facets`, `match_sources`, `lexicon_generation_id`, `repository_search_terms`, project-language search terms, and facet coverage; do not search only the raw user words before source search. Agent-owned semantic normalization remains mandatory: `agent_normalization` and raw lexicon ranking are bootstrap signals only; if `agent_normalization` is omitted, treat it as `required=false`; use `write_semantic_intake_from_alias_catalog` when needed. Raw lexicon ranking is only a bootstrap; CJK or mixed CJK/ASCII input still requires agent-owned normalization even when positive raw lexical matches exist. The agent still owns translation. Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`.

Use the returned readiness:

- `query_ready`: read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons.
- `review`: perform only the returned `minimal_live_reads` before continuing and inspect `coverage_diagnostics`.
- `needs_rebuild`: route through `/sp-map-scan`, then `/sp-map-build` only for documented brownfield rebuild triggers.
- `blocked`: report the blocking runtime issue and continue with live evidence only where this workflow allows degraded navigation.
- **CARRY FORWARD**: Before dispatch or code edits, write the selected
  capability, minimal live reads, boundary constraints, required references,
  validation route, and evidence gaps into `implement-tracker.md` or the current
  `WorkerTaskPacket`. Do not dispatch from a packet that omits the relevant
  project-cognition facts.

Do not compile packets, dispatch subagents, or inspect implementation files
until the cognition gate has passed.

4. **Project Setup Verification**:
   - **REQUIRED**: Create/verify ignore files based on actual project setup:

   **Detection & Creation Logic**:
   - Check if the following command succeeds to determine if the repository is a git repo (create/verify .gitignore if so):

     ```sh
     git rev-parse --git-dir 2>/dev/null
     ```

   - Check if Dockerfile* exists or Docker in plan.md → create/verify .dockerignore
   - Check if .eslintrc* exists → create/verify .eslintignore
   - Check if eslint.config.* exists → ensure the config's `ignores` entries cover required patterns
   - Check if .prettierrc* exists → create/verify .prettierignore
   - Check if .npmrc or package.json exists → create/verify .npmignore (if publishing)
   - Check if terraform files (*.tf) exist → create/verify .terraformignore
   - Check if .helmignore needed (helm charts present) → create/verify .helmignore

   **If ignore file already exists**: Verify it contains essential patterns, append missing critical patterns only
   **If ignore file missing**: Create with full pattern set for detected technology

   **Common Patterns by Technology** (from plan.md tech stack):
   - **Node.js/JavaScript/TypeScript**: `node_modules/`, `dist/`, `build/`, `*.log`, `.env*`
   - **Python**: `__pycache__/`, `*.pyc`, `.venv/`, `venv/`, `dist/`, `*.egg-info/`
   - **Java**: `target/`, `*.class`, `*.jar`, `.gradle/`, `build/`
   - **C#/.NET**: `bin/`, `obj/`, `*.user`, `*.suo`, `packages/`
   - **Go**: `*.exe`, `*.test`, `vendor/`, `*.out`
   - **Ruby**: `.bundle/`, `log/`, `tmp/`, `*.gem`, `vendor/bundle/`
   - **PHP**: `vendor/`, `*.log`, `*.cache`, `*.env`
   - **Rust**: `target/`, `debug/`, `release/`, `*.rs.bk`, `*.rlib`, `*.prof*`, `.idea/`, `*.log`, `.env*`
   - **Kotlin**: `build/`, `out/`, `.gradle/`, `.idea/`, `*.class`, `*.jar`, `*.iml`, `*.log`, `.env*`
   - **C++**: `build/`, `bin/`, `obj/`, `out/`, `*.o`, `*.so`, `*.a`, `*.exe`, `*.dll`, `.idea/`, `*.log`, `.env*`
   - **C**: `build/`, `bin/`, `obj/`, `out/`, `*.o`, `*.a`, `*.so`, `*.exe`, `*.dll`, `autom4te.cache/`, `config.status`, `config.log`, `.idea/`, `*.log`, `.env*`
   - **Swift**: `.build/`, `DerivedData/`, `*.swiftpm/`, `Packages/`
   - **R**: `.Rproj.user/`, `.Rhistory`, `.RData`, `.Ruserdata`, `*.Rproj`, `packrat/`, `renv/`
   - **Universal**: `.DS_Store`, `Thumbs.db`, `*.tmp`, `*.swp`, `.vscode/`, `.idea/`

   **Tool-Specific Patterns**:
   - **Docker**: `node_modules/`, `.git/`, `Dockerfile*`, `.dockerignore`, `*.log*`, `.env*`, `coverage/`
   - **ESLint**: `node_modules/`, `dist/`, `build/`, `coverage/`, `*.min.js`
   - **Prettier**: `node_modules/`, `dist/`, `build/`, `coverage/`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
   - **Terraform**: `.terraform/`, `*.tfstate*`, `*.tfvars`, `.terraform.lock.hcl`
   - **Kubernetes/k8s**: `*.secret.yaml`, `secrets/`, `.kube/`, `kubeconfig*`, `*.key`, `*.crt`

5. Parse tasks.md structure and extract:
   - **Task phases**: Setup, Tests, Core, Integration, Polish
   - **Task dependencies**: Sequential vs parallel execution rules
   - **Task details**: ID, description, file paths, parallel markers [P]
   - **Lane identity**: Treat each task as a lane-level execution unit unless an explicit wrapper task defines a serial coordination step
   - **Ready tasks**: Tasks whose prerequisites are complete within the current phase
   - **Parallel batches**: Ready tasks that can execute together without write-set conflicts
   - **Batch summaries**: Treat batch range labels such as `T012-T021` as summaries, not as one executable lane identity or one batch-owner `WorkerTaskPacket`
   - **Join points**: Synchronization steps that must complete before downstream work starts
   - **Execution flow**: Order and dependency requirements
   - **REQUIRED**: Run pre-dispatch validation (see Pre-Dispatch Validation section) on every task in the current ready batch before compiling WorkerTaskPacket.
   - **IF VALIDATION BLOCKS**: Record the blocking issue in `implement-tracker.md` under `blockers`, set `next_action` to the required fix, and stop the batch.
   - **IF VALIDATION WARNS**: Record warnings in `implement-tracker.md` and continue dispatch.

6. Select subagent dispatch for each ready batch before writing code:
   - **Agent routing**: When a task specifies an `agent` role, dispatch to that role's subagent type. When no agent is specified, default to a general executor lane. Do not route security-sensitive tasks to general-purpose agents when a matching specialist exists.
   - Before selecting the first batch, the pre-implement review gate must be cleared or repaired.
   - The invoking runtime acts as the leader: it reads the current planning artifacts, selects the next executable phase and ready batch, and dispatches work instead of performing concrete implementation directly.
   - The shared implement template is the primary source of truth for this leader-owned milestone scheduler contract, and integration-specific addenda must preserve the same semantics.
   - Fixed runtime budget:
     ```text
     max_parallel_subagents = 4
     ```
   - Fixed execution slots for current-wave bookkeeping:
     - `implement-slot-1`
     - `implement-slot-2`
     - `implement-slot-3`
     - `implement-slot-4`
   - Use the shared policy function before each batch with the current agent capability snapshot: `choose_subagent_dispatch(command_name="implement", snapshot, workload_shape)`
   - Also classify whether the current batch needs a review gate before the join point: `classify_review_gate_policy(workload_shape)`
   - Persist the decision fields exactly: `execution_model: subagent-mandatory`, `dispatch_shape: one-subagent | parallel-subagents`, `execution_surface: native-subagents`.
   - Mark `subagent-blocked` and stop if any dispatch-blocking runtime condition is present:
      - overlapping write sets
      - missing required packet fields
      - unavailable native subagent runtime
      - invalid or unvalidated packet
      - missing required references or validation gates
   - Do not use leader-inline execution as a fallback for any dispatch-blocking condition.
   - Decision order (must match policy):
       - If overlapping write sets, no safe delegated lane, missing packet, unavailable runtime, or low confidence makes dispatch unsafe, mark `subagent-blocked` and stop.
       - If exactly one safe validated packet is ready and native subagents are available, dispatch `one-subagent`.
       - If two or more safe validated packets with isolated write sets are ready and native subagents are available, dispatch `parallel-subagents`.
       - No other dispatch outcome is valid.
   - A `parallel batch` is the current ready set of isolated lane-level tasks bounded by a join point.
   - A lane is dispatch-ready only if its validated `WorkerTaskPacket` includes: objective, authoritative inputs, read scope, write scope, forbidden drift, validation checks, and done condition.
   - If any required packet field is missing, do not dispatch and do not execute inline.
   - The only legal action is to repair the packet or stop as `subagent-blocked`.
   - Do not classify lane readiness by judgment alone. A lane is incomplete only when one or more required packet fields or required references are missing.
   - If subagent dispatch is unavailable for the current batch, the only legal action is `subagent-blocked`.
   - Dispatch failure is not permission to continue locally.
   - Do not persist native subagent dispatch failures, durable inline fallback labels, or runtime-surface failure metadata in `implement-tracker.md`; report that current runtime event in the response, stop the batch, and re-evaluate dispatch capability on the next run.
   - Resume only after the blocking runtime or packet condition is explicitly repaired.
   - Re-evaluate subagent dispatch at every new parallel batch or join point instead of choosing once for the whole feature
   - When `parallel-subagents` is selected, choose the current selected wave from the ready batch and dispatch at most four validated isolated lanes.
   - Launch all selected lanes in the current `parallel-subagents` wave before waiting.
   - Wait only at the current wave join point after the full wave has been launched.
   - If the ready batch contains more than four dispatch-ready isolated lanes, execute multiple waves and re-evaluate after each wave.
   - A single implementation subagent may own one validated lane packet, but it must not own the whole ready parallel batch.
   - Do not dispatch a batch-wide objective such as `Implement T012-T021 migrations` as one implementation lane.
   - Do not treat a batch range label as one `WorkerTaskPacket`.
   - Refine only the current executable window after each join point. Do not pre-expand later batches when their exact shape depends on current batch evidence.
   - Grouped parallelism is the default when multiple ready tasks have isolated write sets and stable upstream inputs.
   - Pipeline execution is preferred when outputs flow stage-by-stage from one bounded task to the next and each stage becomes the next stage's input.
   - Every pipeline stage still needs an explicit checkpoint before downstream work continues.
   - If `classify_review_gate_policy(workload_shape)` requires review, do not cross the join point until the batch has passed worker self-check and leader acceptance.
   - Before crossing any join point, the join-point drift review gate must be cleared or repaired.
   - If the policy recommends a peer-review lane and a read-only verification lane is available, run one peer-review lane for the high-risk batch before the leader accepts it.
   - Reserve peer-review lanes for high-risk batches such as shared registration surfaces, schema changes, protocol seams, native/plugin bridges, or generated API surfaces.
   - **Join Point Validation**: Every join point must name a validation target, a validation command or concrete check, and a pass condition before downstream work continues.
   - **Join Point Validation**: If the validation command is missing, define the smallest trustworthy command or explicit manual check before accepting the join point; do not wave the batch through on narration alone.
    - Before dispatching a concrete implementation batch, answer from repository evidence:
      - What framework or boundary pattern owns the touched surface?
      - Which files define the existing pattern that must be preserved?
      - What implementation drift is forbidden for this batch?
      - Which task or plan item proves that this constraint is intentional rather than inferred?
      - Which compiled `WorkerTaskPacket` captures the hard rules, required references, validation gates, and done criteria for this subagent task?
    - If those answers are not grounded in the current repository files, stop guesswork, read the missing references, and update `implement-tracker.md` before continuing.

7. Execute implementation following the task plan:
    - **Phase-by-phase execution**: Complete each phase before moving to the next
    - **Autonomous Loop**: You **MUST** continue processing the next ready sequential tasks automatically without stopping after a single task. Stop only when you reach a **Join Point** (awaiting parallel task results), or when all tasks in the current phase are complete.
   - For sequential work, do not exceed the review window limits before running drift review.
   - **Respect dependencies**: Run sequential tasks in order, and only run [P] tasks inside their declared or inferred parallel batches
   - **Capability-aware execution**: After selecting dispatch, execute the current ready batch through `one-subagent`, `parallel-subagents`, or `parallel-subagents` when selected by policy; otherwise record `subagent-blocked` while preserving join-point semantics.
   - **Wave discipline**: For `parallel-subagents`, the current wave is not complete until every selected lane has returned a structured handoff or has been explicitly classified as blocked, stale, or deferred.
   - **Wave progression**: After each wave, consume and validate every structured handoff, update execution state, then decide whether the next wave may launch.
   - Once a batch clears the subagent-readiness bar, do not stop to ask the user whether it should switch to subagent execution; dispatch by default, and if native dispatch concretely fails, report the runtime failure in the response and stop without writing a durable fallback decision to `implement-tracker.md`.
    - Runtime-visible state should reflect join points, retry-pending work, and blockers rather than hiding those transitions behind chat-only narration.
    - After each completed batch, the leader re-evaluates milestone state, selects the next executable phase and ready batch in roadmap order, and continues automatically until the milestone is complete or blocked.
    - Do not stop after a single completed batch just because one subagent, assignee, or lane has gone idle; if ready work still exists for the milestone, keep selecting the next batch and continue.
   - **Follow TDD approach**: Execute test tasks before their corresponding implementation tasks
   - **Hard TDD gate**: Write the failing test first for every behavior-changing task, bug fix, or refactor.
   - **Hard TDD gate**: Do not write production code for the batch until the RED state is verified.
   - **Testing surface gate**: If no reliable automated test surface exists for the touched behavior, add the smallest viable test-surface bootstrap step first or stop and route through `/sp-quick` or `/sp-specify` before continuing.
   - **File-based coordination**: Tasks affecting the same files must run sequentially
   - **Shared-surface coordination**: Treat shared registration files, router tables, export barrels, dependency injection containers, and similar coordination points as write conflicts even if the main feature files differ
   - **Boundary-pattern preservation**: When a task touches an established framework-owned surface, extend the existing pattern instead of introducing a parallel adapter, raw rewrite, or compatibility shim unless `plan.md` explicitly authorizes that change
   - **Validation checkpoints**: Verify each phase completion before proceeding

8. Implementation execution rules:
   - **Setup first**: Initialize project structure, dependencies, configuration
   - **Tests before code**: If you need to write tests for contracts, entities, and integration scenarios
   - **Core development**: Implement models, services, CLI commands, endpoints
   - **Integration work**: Database connections, middleware, logging, external services
   - **Polish and validation**: Unit tests, performance optimization, documentation

9. Progress tracking and error handling:
   - Report progress after each completed task
   - Halt execution if any non-parallel task fails
   - For tasks in parallel batches, continue with successful tasks, report failed ones, and do not cross the batch's join point until the failed work is resolved or explicitly deferred
   - A completed wave does not automatically complete the whole ready batch; do not cross the batch join point until every lane in the batch is accepted or explicitly blocked/deferred under the workflow contract
   - Planned validation tasks are still ready work. If the remaining tasks are executable tests, E2E checks, security verification, quickstart validation, or other scripted validation work already present in `tasks.md`, continue automatically instead of asking whether validation should start.
   - Planned validation tasks remain executable work, but failed or missing validation triggers drift review before downstream implementation continues.
   - Do not stop to ask whether validation should start unless a manual-only check or approval step is explicitly recorded in the tracker or task plan.
   - If a manual-only check, approval gate, or verification-policy gate is reached, stop only after recording an **Actionable Blocker Resolution** entry with `owner: user | maintainer`, the exact approval question, the exact rerun command or discovery command when known, and the criteria that will make the gate complete.
   - If a verification command reports passing checks but exits nonzero due to a policy gate, classify it as `verification_policy`; do not describe tests as failing, and do not leave the next step as "approval required" without naming the approver, approval token or policy label when known, rerun command, and artifact path that proves the gate.
   - If project cognition, baseline comparison, or external live-baseline validation times out after implementation validation is otherwise green, classify it separately as `baseline_timeout` or `project_cognition_readiness`. Say whether it blocks feature completion under the active profile, provide the next bounded retry or waiver decision, and preserve the timeout evidence path.
   - If a subagent lane flips to `completed` or drifts into `idle` before the promised handoff, result file, or completion evidence arrives, treat it as a stale lane rather than accepted work: probe once for the missing handoff, then re-dispatch, block, or defer explicitly instead of silently continuing
   - Before accepting a completed batch, verify the structured handoff includes profile-matched evidence for the current `active_profile` and the exact `required_evidence` constraints from `workflow-state.md`.
   - If `required_evidence` includes `real_entrypoint_evidence`, require real-entrypoint consumer evidence and reject synthetic-only evidence even when component-level or helper-level tests pass.
   - For `Reference-Implementation`, require the persisted evidence terms activated upstream: reference source evidence, fidelity criteria, difference inventory, accepted deviations, and verification entry points.
   - Comparison evidence, a deviation log, or fidelity audit notes may satisfy those persisted terms when they map directly to them, but they do not replace the upstream `required_evidence` vocabulary.
   - Generic `tests passed` output is not sufficient when the active profile requires stronger exit evidence; require the profile-matched evidence named by `required_evidence` before crossing the join point.
   - For high-risk batches, treat acceptance as a three-layer check:
     - subagent self-check
     - optional read-only peer-review lane when `classify_review_gate_policy(workload_shape)` recommends it
     - leader/orchestrator review before crossing the join point
   - Blocked subagent results must include a concrete blocker summary, the failed assumption or dependency, and the smallest safe recovery step before the leader accepts the result.
   - Persist completed work, failed work, blocker evidence, `retry_attempts`, `recovery_action`, and `next_action` in `implement-tracker.md` as soon as they change
   - Before declaring the feature blocked, attempt the smallest safe recovery step that matches the evidence:
     - read the nearest implementation context for the failing area
     - run the smallest meaningful repro, failing test, or validation command
     - inspect immediate logs or error output
     - make one focused repair attempt when the evidence is clear
     - if uncertainty remains high, do focused implementation research for the narrow blocker before widening scope
   - If recovery attempts still fail, set tracker status to `blocked`, keep the blocker explicit, and preserve the best known `next_action` for the next `sp-implement` run
   - Provide clear error messages with context for debugging
   - Suggest next steps if implementation cannot proceed
   - Final blocked reports must include the **Actionable Blocker Resolution** entries from the tracker. Do not leave the user to infer whether to handle the blocker; state the recommended handling path, who owns it, and what exact evidence will allow `sp-implement` to resume or close.
   - **IMPORTANT** For completed tasks, make sure to mark the task off as [X] in the tasks file.

## Gate Self-Check

At each phase boundary, output an explicit confirmation. This replaces pure declaration with verifiable checkpoints.

### Format

```
[GATE CHECK] Phase: <phase_name>
- Forbidden actions in this phase: <list>
- I confirm I have NOT performed any forbidden action since the last gate.
- Files modified in this phase: <list or "none">
```

### When to emit

- On phase transition (e.g., analysis → specification, specification → handoff)
- Before final reporting
- After any recovery from a false start or route change

### Enforcement

This is a Level 2 enforcement (gate self-check). It does not prevent tool use, but it creates an auditable record. If a gate check cannot be honestly emitted, the phase is not complete.

After each task completion, emit a gate self-check. After all tasks, emit a final gate self-check confirming no forbidden actions were taken.

### Blocker Classification

| Type | Examples | Route |
|------|----------|-------|
| environment | Missing toolchain, wrong Node version, pip/uv failure | Fix inline or ask user |
| test-failure | Test fails after implementation change | Analyze locally first |
| runtime-bug | Crash, unexpected behavior in implemented code | Route to `/sp-debug` |
| external | Upstream API change, network dependency | Record and escalate to user |
| scope-creep | Task expands beyond original contract | Upgrade to `/sp-plan` or `/sp-specify` |

10. Completion validation:
   - Enter tracker status `validating` after the last ready implementation task is complete. `tasks.md` being fully checked off is not sufficient for completion by itself.
   - Verify all required tasks are completed
   - Check that implemented features match the original specification, accepted behavior, and any independent test criteria captured in `tasks.md`
   - Validate that tests pass and coverage meets requirements
   - Confirm the implementation follows the technical plan
   - Confirm final exit evidence matches `active_profile` and `required_evidence` from `workflow-state.md` when present.
   - For `Standard Delivery`, behavior validation and regression proof are the lighter default unless stronger required evidence was explicitly activated.
   - For `Reference-Implementation`, do not mark completion unless profile-matched evidence is present for the exact persisted `required_evidence` terms activated upstream: reference source evidence, fidelity criteria, difference inventory, accepted deviations, and verification entry points.
   - For UI/TUI/CLI/API/runtime-visible work that requires `real_entrypoint_evidence`, do not mark completion unless the result evidence covers the real entrypoint path instead of only a synthesized object or hand-built state.
   - Comparison evidence, a deviation log, or fidelity audit notes are acceptable artifact forms only when they satisfy those persisted `Reference-Implementation` terms; do not treat them as replacement `required_evidence` names.
   - Do not accept generic `tests passed` output as sufficient when the active profile requires stronger exit evidence.
   - If validation finds missing user-visible behavior or unmet acceptance criteria, record an `open_gaps` entry instead of silently claiming completion
   - Do not use final-completion language such as `core implementation complete`, `implementation complete`, or `ready for integration testing` as shorthand for overall feature completion while required E2E, Polish, documentation, quickstart, or other planned validation tasks remain incomplete; report that partial state explicitly instead
   - Classify each unresolved gap:
     - `execution_gap`: implementation exists but still behaves incorrectly; continue fixing within the current implementation loop
     - `research_gap`: the blocker is a missing technical decision or evidence gap; update `research.md`, record the new finding in the tracker, then continue
     - `plan_gap`: the current plan/tasks do not cover the work needed to satisfy the feature goal; update `plan.md` and `tasks.md`, set tracker status to `replanning`, then continue from the next ready batch after the replan
     - `spec_gap`: the requirement itself is ambiguous, contradictory, or newly changed; stop autonomous replanning, keep the gap explicit in the tracker, and recommend `/sp.clarify`
     - `feasibility_gap`: the requirement is clear but the implementation chain is unproven; stop autonomous replanning, keep the gap explicit in the tracker, and recommend `/sp.deep-research`
   - Before final completion reporting, record `changed_code_paths` with modified, added, deleted, and renamed paths; `changed_behavior_surfaces` for affected commands, APIs, templates, generated assets, state files, tests, docs, validators, packets, or runtime assumptions; `verification_evidence`; and `project_cognition_refresh` when project cognition might be affected.
   - {{spec-kit-include: ../command-partials/common/inline-project-cognition-update.md}}
   - The completion claim must be backed by live code, tests, scripts, configuration, or authoritative docs; project cognition can support route selection but cannot be the sole evidence for completion. Continue only when verification is truthfully green and no explicit blocker prevents completion, including unresolved `open_gaps`.
   - Only mark the tracker `resolved` after required tasks are complete, blockers are cleared, and the validation pass is truthfully green or explicitly waiting on recorded human verification
   - [AGENT] Before the final completion report, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify implement closeout --feature-dir '$FEATURE_DIR' --format json` so implementation session state is validated, retry-heavy patterns are auto-captured from `implement-tracker.md`, and `FEATURE_DIR/implementation-summary.md` is written.
   - [AGENT] Treat the closeout JSON `implementation_summary` object and `FEATURE_DIR/implementation-summary.md` as the canonical user-facing answer to "what changed, how do I verify it, and what differs from the previous version." The final response must surface the summary report path and reflect its completed work, changed paths, behavior surfaces, verification evidence, baseline comparison commands, remaining human-needed checks, and unresolved gaps.
- [AGENT] If the closeout auto-capture pass produced no captured lesson but you still discovered a reusable `pitfall`, `recovery_path`, or `project_constraint`, use the manual `learning capture` helper surface to create or merge an index/detail entry.
  Required options: `--command`, `--type`, `--summary`, `--evidence`
- [AGENT] Before the final completion report, apply the Learning Reflex and record any reusable `pitfall`, `recovery_path`, `verification_gap`, `state_surface_gap`, or `project_constraint` in `.specify/memory/learnings/INDEX.md` plus a linked detail document when durable state did not already preserve it.
   - Treat one-off findings as no reusable lesson; store reusable lessons as index/detail entries, and use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify learning promote --target learning ...` only after explicit confirmation or proven recurrence.
   - Only ask for confirmation when a new learning is highest-signal, such as an explicit user default, clear cross-stage reuse, or repeated recurrence that should become shared project memory.
   - Report final status with the `implementation-summary.md` path, summary of completed work, changed code paths, changed behavior surfaces, verification evidence, baseline comparison commands such as `git status --short`, `git diff --stat HEAD`, and `git diff --name-status HEAD`, `project_cognition_refresh` outcome when applicable, remaining human-needed checks, and any unresolved gaps

Note: This command assumes a complete task breakdown exists in tasks.md. If tasks are incomplete or missing, suggest running `/sp.tasks` first to regenerate the task list.

11. **Check for extension hooks**: After completion validation, check if `.specify/extensions.yml` exists in the project root.
    - If it exists, read it and look for entries under the `hooks.after_implement` key
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally.
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable.
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation.
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    ```
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently.

## Codex Subagent Dispatch Contract

- Execution model: `subagents-first`
- Dispatch shape: `one-subagent`, `parallel-subagents`, or `subagent-blocked`
- Execution surface: `native-subagents`, `managed-team`, or `leader-inline`
- Delegation surface contract: preserve the native dispatch, fallback, worker result contract, and handoff path below.
- Native subagent capability discovery: Before recording `subagent-blocked`, check the active tool surface for the integration-native subagent or task-dispatch entrypoint and record the exact missing surface if unavailable.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch subagents through the integration's native subagent support using the shared prompt contract.
- Join behavior: Use the integration-native join point, then integrate results back on the leader path.
- Managed-team fallback: No in-command team fallback for `sp-implement`; if subagents cannot proceed safely, stay on the leader path and record why.
- Leader-inline fallback: record the reason before local execution.
- Worker result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result handoff path: FEATURE_DIR/worker-results/<task-id>.json

## Codex Subagent Result Contract

- Worker result contract: preserve the shared `WorkerTaskResult` semantics even when the runtime calls lanes subagents.
- Preferred result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result file handoff path: FEATURE_DIR/worker-results/<task-id>.json
- For filesystem handoffs, use `specify result path` with the concrete workflow identifiers such as `--feature-dir`/`--task-id`, `--workspace`/`--lane-id`, or `--session-slug`/`--lane-id`.
- `specify result path` emits JSON and does not accept `--format`; do not append `--format`.
- Normalize subagent-reported statuses like `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, and `NEEDS_CONTEXT` into the shared `WorkerTaskResult` contract before the leader accepts the handoff.
- Keep `reported_status` when normalization occurs so runtime-specific subagent language can be reconciled with canonical orchestration state.
- Wait for every subagent's structured handoff before accepting the join point, closing the batch, or declaring completion.
- Do not treat an idle subagent as done work; idle without a consumed handoff means the result channel is still unresolved.
- Do not interrupt or shut down subagent work before the handoff has been written or explicitly reported as `BLOCKED` or `NEEDS_CONTEXT`.
- Treat `DONE_WITH_CONCERNS` as completed work plus follow-up concerns, not as silent success.
- Treat `NEEDS_CONTEXT` as a blocked handoff that must carry the missing context or failed assumption explicitly.
