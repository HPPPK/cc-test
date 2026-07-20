---
name: "sp-analyze"
description: "Use when tasks.md exists and you need a non-destructive cross-artifact consistency and boundary-guardrail analysis before or during execution."
argument-hint: "Optional focus areas for analysis, such as boundary guardrail drift (BG1/BG2/BG3)"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/analyze.md"
user-invocable: true
---
## Invocation Syntax

- In this integration, invoke workflow skills with `/sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: `tasks.md` is available and you need a read-only analysis pass before, during, or after implementation revalidation.
- **Primary objective**: Identify inconsistencies, ambiguities, drift, and boundary-guardrail gaps across `spec.md`, `context.md`, `plan.md`, and `tasks.md`.
- **Primary outputs**: A structured analysis report plus workflow-state gate updates. This command does not edit `spec.md`, `context.md`, `plan.md`, or `tasks.md`.
- **Default handoff**: Route into /sp.clarify, /sp.deep-research, /sp.plan, /sp.tasks, /sp.debug, or /sp.implement based on the findings; if analysis runs after implementation has started or finished, reopen the highest invalid stage and regenerate downstream artifacts before continuing.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Perform a read-only analysis pass that checks whether the current spec, context, plan, and task artifacts still agree strongly enough to support execution.

## Context

- Primary inputs: `spec.md`, `context.md`, `plan.md`, `tasks.md`, passive learning files, the task-local project cognition query bundle with readiness and returned `minimal_live_reads`, and the smallest workflow-local state files needed for the touched area.
- When present, consume the upstream evidence ledgers too: `planning/evidence-index.json`, accepted `planning/handoffs/*.json`, `task-generation/evidence-index.json`, accepted `task-generation/handoffs/*.json`, and `clarification/evidence-index.json` when analyze routes back to clarification.
- The constitution remains the highest local authority for this analysis surface.
- This command produces findings only; it does not rewrite the artifact set.

## Process

- Load the minimum artifact context needed to evaluate the current request.
- Compare the planning artifacts for drift, ambiguity, missing constraints, and boundary-guardrail gaps.
- Verify accepted planning and task-generation handoffs were consumed by downstream artifacts rather than only preserved on disk.
- Classify findings by severity and report how they should feed back into the workflow.

## Output Contract

- Emit a structured analysis report with concrete findings, severity, and recommended remediation lanes.
- Keep the result non-destructive and explicit about what command should handle each class of issue.
- Do not silently fix artifacts from inside `/sp-analyze`.

## Guardrails

- Stay read-only.
- Treat constitution conflicts as critical rather than negotiable.
- Do not rely on stale or insufficient project cognition query coverage when the runtime should inform the analysis.

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

## Mandatory Subagent Execution

All substantive tasks in ordinary `sp-*` workflows default to and must use subagents.

The leader orchestrates: route, split tasks, prepare task contracts, dispatch subagents, wait for structured handoffs, integrate results, verify, and update state.

Before dispatch, every subagent lane needs a task contract with objective, authoritative inputs, allowed read/write scope, forbidden paths, acceptance checks, verification evidence, and structured handoff format.

Use `execution_model: subagent-mandatory`.
Use `dispatch_shape: one-subagent | parallel-subagents`.
Use `execution_surface: native-subagents`.


## Goal

Identify inconsistencies, duplications, ambiguities, and underspecified items across the core planning artifacts (`spec.md`, `context.md`, `plan.md`, `tasks.md`) before implementation, during execution, or after implementation when revalidation is needed. This command MUST run only after the canonical `/sp.tasks` workflow has successfully produced a complete `tasks.md`.

## Operating Constraints

**READ-ONLY FOR PLANNING ARTIFACTS**: Do **not** modify `spec.md`, `context.md`, `plan.md`, or `tasks.md`. Output a structured analysis report. This command may update `workflow-state.md` to record the cleared or blocked gate result. Offer an optional remediation plan (user must explicitly approve before any follow-up editing commands would be invoked manually).

Analyze must not switch branches, implicitly check out a "correct" feature branch, or mutate git state in order to determine scope. If the active feature cannot be identified safely through explicit `FEATURE_DIR` binding or lane resolution, fail closed and tell the user how to repair routing.

**Closed-loop requirement**: Do not present findings as a dead-end audit. The report MUST tell the user which workflow stage to reopen, which downstream artifacts must be regenerated, and whether implementation may continue immediately or must pause until upstream remediation is complete.
Preserve canonical `/sp.implement` only in workflow-state fields.
When recommending manual implementation resumption to the user, tell them to run `/sp-implement`.

**Convergence requirement**: Complete the full detection matrix before selecting the single `Recommended Next Command`. Do not stop analysis after finding enough evidence to route backward. The report must include the complete blocker bundle for the current artifact set, grouped by invalid stage, so downstream remediation does not discover same-artifact blockers one cycle at a time.

**Constitution Authority**: The project constitution (`.specify/memory/constitution.md`) is **non-negotiable** within this analysis scope. Constitution conflicts are automatically CRITICAL and require adjustment of the spec, plan, or tasks—not dilution, reinterpretation, or silent ignoring of the principle. If a principle itself needs to change, that must occur in a separate, explicit constitution update outside `/sp.analyze`.

## Workflow Phase Lock

- [AGENT] Create or resume `WORKFLOW_STATE_FILE` before substantial analysis work begins.
- Read `.specify/templates/workflow-state-template.md`.
- If `WORKFLOW_STATE_FILE` is missing, recreate it from the template and the current artifact package instead of relying on chat memory alone.
- Treat `WORKFLOW_STATE_FILE` as the gate-state source of truth for whether implementation may proceed.
- Set or update the state for this run with at least:
  - `active_command: sp-analyze`
  - `phase_mode: analysis-only`
  - `forbidden_actions: edit source code, edit tests, edit planning artifacts, start implementation before the gate is cleared`
- When resuming after compaction, re-read `WORKFLOW_STATE_FILE` before continuing.

## Analyze Gate Convergence Contract

### Stable Finding Identity

- Use stable finding IDs that survive revalidation. Category-only IDs such as `BG2` are too coarse, and run-local sequence numbers are not stable by themselves.
- Use a fingerprint-first ID contract:
  - Build a canonical finding fingerprint from category, invalid stage, artifact, requirement or section key when available, normalized summary, and remediation requirement.
  - Before assigning IDs, load the previous `Analyze Gate` ledger from `workflow-state.md` when it exists.
  - Match current findings to previous open or recently cleared findings by fingerprint first, and reuse the prior ID when the fingerprint matches.
  - Allocate a new ID only for a genuinely new fingerprint.
  - For new fingerprints, allocate the next unused category sequence after sorting by category, artifact, section key, and normalized summary.

### Revalidation Attribution

- When revalidating after a blocked analyze gate, any new blocker must include one attribution:
  - `missed_by_previous_analyze`: detectable in the prior artifact set and should have been included in the earlier blocker bundle.
  - `introduced_by_remediation`: remediation changed `tasks.md` or downstream state in a way that introduced the issue.
  - `upstream_artifact_changed`: an authoritative input changed since the prior analyze pass.
  - `detector_scope_changed`: the workflow template or analysis instructions changed the detector scope between runs.
- If there is no evidence for `introduced_by_remediation`, `upstream_artifact_changed`, or `detector_scope_changed`, use `missed_by_previous_analyze`.
- Persist attribution per new blocking finding in the `Analyze Gate` `blocker_bundle`; report-body attribution without durable blocker-row attribution is not sufficient for revalidation.
- No more than one task-layer remediation cycle is expected. If revalidation finds new task-layer blockers that were detectable before remediation, classify them as a previous analyze miss or a tasks self-audit failure. Do not treat repeated task/analyze loops as normal workflow.

## Workflow Quality Requirements

- Confirm project cognition freshness and valid workflow entry before deeper analysis begins.
- Keep `workflow-state.md` current as the durable gate-state source of truth for whether implementation may proceed, which stage must reopen, and what evidence supports the decision.
- Verify the analysis report, cleared or blocked gate result, and any durable artifact outcomes before final reporting instead of relying on chat narration.
- Update durable analysis state before compaction-risk transitions, large findings synthesis, remediation handoffs, or any stop where resume will depend on more than the visible conversation.
- Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify learning start --command analyze --format json` when available so passive learning files exist and the current analysis sees relevant shared project memory.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order before broader analysis context.
- Open only learning detail docs linked from analysis-relevant index entries.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail markdown document without asking for routine permission.
- When analysis friction exposes repeated artifact rewrites, route changes, false starts, hidden dependencies, validation gaps, or reusable constraints, make sure `workflow-state.md` captures that durable context.
- Prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify learning capture-auto --command analyze --feature-dir '$FEATURE_DIR' --format json` when `workflow-state.md` already preserves route reasons, false starts, hidden dependencies, or reusable constraints.
- When durable state does not capture the reusable lesson cleanly, update `.specify/memory/learnings/INDEX.md` and a linked detail document with the command, type, summary, and evidence.

## Execution Steps

### 1. Initialize Analysis Context

Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` once from repo root and parse JSON for FEATURE_DIR and AVAILABLE_DOCS. Derive absolute paths:

- If `FEATURE_DIR` is not already explicit, prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify lane resolve --command analyze --ensure-worktree` before guessing from branch-only context.
- When lane resolution returns a materialized lane worktree, continue analysis from that isolated worktree context so downstream gate decisions stay attached to the same lane boundary.

- SPEC = FEATURE_DIR/spec.md
- CONTEXT = FEATURE_DIR/context.md
- PLAN = FEATURE_DIR/plan.md
- TASKS = FEATURE_DIR/tasks.md
- PLANNING_EVIDENCE_INDEX = FEATURE_DIR/planning/evidence-index.json when present
- TASK_GENERATION_EVIDENCE_INDEX = FEATURE_DIR/task-generation/evidence-index.json when present

Abort with an error message if any required file is missing (instruct the user to run missing prerequisite command).
For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

- Set `WORKFLOW_STATE_FILE` to `FEATURE_DIR/workflow-state.md`.
- [AGENT] Create or resume `WORKFLOW_STATE_FILE` before substantial analysis work begins.
- Read `.specify/templates/workflow-state-template.md`.
- If `WORKFLOW_STATE_FILE` already exists, read it first and preserve still-valid authoritative file references and gate notes instead of relying on chat memory alone.

### 2. Ensure project cognition runtime exists

- Choose the cognition intent before querying: use `plan` when analyzing planning-only artifacts or upstream spec/plan drift, use `implement` when analyzing task execution, remediation, or code-change blockers, and preserve the originating workflow intent when this command is reviewing another `sp-*` workflow's output.
- Query project cognition with `'C:\Users\11034\.specify\bin\project-cognition.exe' compass --intent plan '--query=$ARGUMENTS' --format json` or `'C:\Users\11034\.specify\bin\project-cognition.exe' compass --intent implement '--query=$ARGUMENTS' --format json` according to that chosen intent. Read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons, `verification_hints`, `followup_surfaces`, and `before_fix_claim`. Treat `coverage_diagnostics` as confidence and closeout signals, do not infer final edit scope from first-pass reads, and use `project-cognition expand` only when the packet's coverage state or live evidence requires it.
- Preserve the advanced `lexicon -> semantic_intake -> query` flow for explicit concept decisions or unresolved coverage. In that escalation, write `semantic_intake` from the alias catalog, select candidates by facet coverage, write `concept_decisions` with `covered_facets`, `missing_facets`, and `match_sources`, carry `lexicon_generation_id`, then generate a `query_plan` containing `semantic_intake`, `selected_concepts`, `rejected_concepts`, `concept_decisions`, `lexicon_generation_id`, `expanded_queries`, `repository_search_terms`, and justified `paths`, then run `'C:\Users\11034\.specify\bin\project-cognition.exe' query --intent '<chosen-intent>' --query-plan '<query_plan_json>' --format json`. Agent-owned semantic normalization is mandatory: raw lexicon ranking and `agent_normalization` are only bootstrap signals, not route decisions. If `agent_normalization.required=true`, every raw candidate is `score=0`, or the prompt is localized, mixed-language, CJK, colloquial, or symptom-first, extract embedded project terms and write `semantic_intake` from the alias catalog before selecting or rejecting concepts. If `agent_normalization` is omitted, treat it as `required=false`; CJK or mixed CJK/ASCII input still requires agent normalization even when positive raw lexical matches exist because embedded project tokens do not translate the surrounding user language. The agent still owns translation; `agent_normalization` is advisory guidance, not a route decision. This includes mixed-language or CJK text. (raw lexicon ranking is only a bootstrap; action: write_semantic_intake_from_alias_catalog) Derive project-language search terms from the alias catalog before source search. Do not search only the raw user words; include component names, state names, file names, command names, UI labels, and route names from candidates, aliases, matched_terms, colloquial_matches, returned paths, `normalized_query`, and `expanded_queries`. Use these project-language search terms before broad repository search. For implementation or remediation analysis, the concrete advanced query command is `'C:\Users\11034\.specify\bin\project-cognition.exe' query --intent implement --query-plan '<query_plan_json>' --format json`.
- If readiness is `needs_rebuild`, continue with live repository evidence where workflow policy allows and recommend `/sp-map-scan`, then `/sp-map-build` only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation path_index rows, missing or invalid alias_index, explicit_rebuild_requested, or baseline_identity_invalid. Block only when the user explicitly requested cognition repair or analysis truly cannot proceed without a usable baseline.
- If compass coverage is too weak for the touched area, use live evidence and record whether a follow-up `/sp-map-update` is useful for external map maintenance.
- Use map-update for ordinary existing-baseline gaps. Use map-scan -> map-build only for first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation path_index rows, missing or invalid alias_index, explicit_rebuild_requested, or baseline_identity_invalid.
- If readiness is `review`, inspect only the returned `minimal_live_reads` before trusting the runtime for analysis.
- Carry selected/rejected concepts, `selection_reason`, `route_pack`, and
  `minimal_live_reads` into the analysis report and `workflow-state.md`
  blocker bundle whenever cognition evidence affects routing or blocker
  severity.
- Treat task-relevant coverage as insufficient when the touched area is named only vaguely, lacks ownership or placement guidance, or lacks workflow, constraint, integration, or regression-sensitive testing guidance.
- If task-relevant coverage is insufficient for the current analysis request, inspect the returned targeted live evidence; refresh through `/sp-map-update` with changed paths or affected surfaces, and rebuild through `/sp-map-scan`, then `/sp-map-build` only for the explicit rebuild conditions above.

### 3. Load Artifacts (Progressive Disclosure)

Load only the minimal necessary context from each artifact:

**From project cognition runtime:**

- Consume the `project-cognition query` bundle.
- Preserve `selected_concepts`, `rejected_concepts`, `selection_reason`,
  `route_pack`, and `minimal_live_reads` as blocker evidence inputs.
- Preserve cognition-backed blocker evidence when classifying whether issues
  belong to `plan`, `clarify`, `deep-research`, or task-layer remediation. The
  analysis report and `workflow-state.md` blocker bundle must keep the selected
  capability, boundary fact, ambiguity, or verification evidence that justified
  the route.
- Inspect only returned `minimal_live_reads` when the bundle does not fully cover ownership, propagation, or verification routes.
- If topical coverage is missing, stale, too broad, or task-relevant coverage is insufficient, use `/sp-map-update` with changed paths or affected surfaces; rebuild through `/sp-map-scan` followed by `/sp-map-build` only for the explicit rebuild conditions above, then inspect the minimum live files still needed to replace guesswork with evidence

**From spec.md:**

- Overview/Context
- Functional Requirements
- Success Criteria (measurable outcomes — e.g., performance, security, availability, user success, business impact)
- User Stories
- Edge Cases (if present)

**From context.md:**

- Locked Decisions
- Codex Discretion
- Canonical References
- Existing Code Insights
- Specific User Signals
- Outstanding Questions

**From plan.md:**

- Architecture/stack choices
- Locked Planning Decisions
- Implementation Constitution
- Alignment Inputs
- Data Model references
- Phases
- Technical constraints

**From tasks.md:**

- Task IDs
- Descriptions
- Phase grouping
- Parallel markers [P]
- Referenced file paths

**From planning evidence when present:**

- Read `planning/evidence-index.json` and accepted `planning/handoffs/*.json`.
- Verify each accepted planning handoff is consumed by `plan.md`, `research.md`, `quickstart.md`, `data-model.md`, `contracts/`, `plan-contract.json`, or is explicitly deferred or blocked.
- Treat an accepted planning handoff with no downstream consumer as a plan-layer blocker, not harmless leftover evidence.

**From task-generation evidence when present:**

- Read `task-generation/evidence-index.json` and accepted `task-generation/handoffs/*.json`.
- Verify each accepted task-generation handoff is consumed by `tasks.md`, `handoff-to-tasks.json`, `task-index.json`, `task-packets/*.json`, or is explicitly deferred, escalated, or blocked.
- Treat an accepted task-generation handoff with no downstream consumer as a task-layer blocker before implementation can proceed.

**From constitution:**

- Load `.specify/memory/constitution.md` for principle validation

### 4. Build Semantic Models

Create internal representations (do not include raw artifacts in output):

- **Requirements inventory**: For each Functional Requirement (FR-###) and Success Criterion (SC-###), record a stable key. Use the explicit FR-/SC- identifier as the primary key when present, and optionally also derive an imperative-phrase slug for readability (e.g., "User can upload file" → `user-can-upload-file`). Include only Success Criteria items that require buildable work (e.g., load-testing infrastructure, security audit tooling), and exclude post-launch outcome metrics and business KPIs (e.g., "Reduce support tickets by 50%").
- **Locked decision inventory**: Collect locked decisions from `spec.md`, `context.md`, and `plan.md`, then track whether each one survives into the task layer
- **Reference behavior inventory**: When `Fidelity Requirements` exist, collect each reference behavior item and track whether it survives into the plan and task layers
- **Boundary-sensitivity inventory**: Record established boundary patterns, framework-owned surfaces, required implementation references, and any signal that this feature should carry explicit implementation guardrails
- **User story/action inventory**: Discrete user actions with acceptance criteria
- **Task coverage mapping**: Map each task to one or more requirements or stories (inference by keyword / explicit reference patterns like IDs or key phrases)
- **Constitution rule set**: Extract principle names and MUST/SHOULD normative statements

### 5. Detection Passes (Token-Efficient Analysis)

Focus on high-signal findings in the report body. Limit the visible findings table to 50 rows for readability, but do not omit blockers from the durable gate result: `Blocker Bundle` and `workflow-state.md` MUST enumerate every blocking finding. Overflow summaries may cover only non-blocking findings.

#### A. Duplication Detection

- Identify near-duplicate requirements
- Mark lower-quality phrasing for consolidation

#### B. Ambiguity Detection

- Flag vague adjectives (fast, scalable, secure, intuitive, robust) lacking measurable criteria
- Flag unresolved placeholders (TODO, TKTK, ???, `<placeholder>`, etc.)

#### C. Underspecification

- Requirements with verbs but missing object or measurable outcome
- User stories missing acceptance criteria alignment
- Tasks referencing files or components not defined in spec/plan

#### D. Constitution Alignment

- Any requirement or plan element conflicting with a MUST principle
- Missing mandated sections or quality gates from constitution

#### E. Coverage Gaps

- Requirements with zero associated tasks
- Tasks with no mapped requirement/story
- Success Criteria requiring buildable work (performance, security, availability) not reflected in tasks
- Preserved or redesigned reference behavior items with zero associated plan handling or task coverage

#### F. Locked Decision Drift

- Locked decisions present in `spec.md` but absent from `context.md`
- Locked decisions present in `context.md` but missing from `plan.md`
- Locked decisions present in `plan.md` but not preserved by `tasks.md`
- Cases where a decision appears to have been silently weakened, deferred, or renamed without acknowledgment

#### G. Inconsistency

- Terminology drift (same concept named differently across files)
- Data entities referenced in plan but absent in spec (or vice versa)
- Task ordering contradictions (e.g., integration tasks before foundational setup tasks without dependency note)
- Conflicting requirements (e.g., one requires Next.js while other specifies Vue)

#### H. Boundary Guardrail Gaps

- Detect cases where `spec.md`, `context.md`, or `tasks.md` clearly imply a boundary-sensitive implementation area, but later workflow artifacts fail to preserve the needed guardrails
- Use this stable issue family so downstream tooling and reviewers can key off one consistent signal set:
  - `BG1`: missing `Implementation Constitution` for a boundary-sensitive feature area
  - `BG2`: `tasks.md` lacks explicit implementation guardrails even though `plan.md` declares a boundary-sensitive constitution rule
  - `BG3`: implementation guidance does not require confirming the owning framework, defining reference files, or forbidden drift before code-writing work begins
  - `DP1`: subagent execution path lacks compiled hard rules, validation gates, or done criteria in its task packet
  - `DP2`: subagent execution path lacks required references or forbidden drift in its task packet
  - `DP3`: subagent completion lacks required validation evidence or rule acknowledgement
- Treat these signals as triggers:
  - established framework-owned boundary or adapter pattern
  - native bridge, plugin surface, protocol seam, generated API surface, or other contract-heavy boundary
  - explicit required implementation references or boundary-defining files
  - implementation guardrail tasks in `tasks.md` with no matching constitution rule in `plan.md`
- Map findings to codes as follows:
  - `BG1` when the plan is missing the constitution layer
  - `BG2` when the task layer fails to preserve that constitution as implementation guardrails
  - `BG3` when execution guidance fails to force pre-dispatch boundary confirmation
- Report when a generic implementation instinct would likely drift away from the repository's established pattern because the plan left the constraint as background context only

#### I. Consequence Preservation Analysis

- Detect every `CA-###` consequence obligation in `spec.md`, `context.md`, `references.md`, `alignment.md`, `plan.md`, `tasks.md`, `plan-contract.json`, `task-index.json`, and task packets when present.
- Verify each consequence obligation keeps its claim, affected objects, lifecycle state behavior, dependency impact, recovery and validation contract, owner workflow, latest resolve phase, status, and stop-and-reopen condition across downstream artifacts.
- Flag any obligation that disappears, is renamed without traceability, loses validation evidence, lacks task or packet coverage, or is treated as resolved without proof.
- Must not drop consequence obligations from the analysis report or blocker bundle. If an upstream artifact omitted one, report the omission and route to the highest invalid workflow stage that can restore it.
- Treat unresolved or unmapped `CA-###` obligations as blockers when implementation would otherwise continue through lifecycle, running-state, destructive-operation, shared-state, or downstream-consumer ambiguity.
- If the consequence model is complete and every stop-and-reopen condition is mapped or resolved, record the gate as cleared for implementation; otherwise keep implementation paused.

### 6. Severity Assignment

Use this heuristic to prioritize findings:

- **CRITICAL**: Violates constitution MUST, missing core spec artifact, or requirement with zero coverage that blocks baseline functionality
- **HIGH**: Duplicate or conflicting requirement, ambiguous security/performance attribute, untestable acceptance criterion, a locked decision silently dropped between artifacts, or a missing `Implementation Constitution` for a clearly boundary-sensitive feature area
- **MEDIUM**: Terminology drift, missing non-functional task coverage, underspecified edge case
- **LOW**: Style/wording improvements, minor redundancy not affecting execution order

### 7. Produce Compact Analysis Report

Output a Markdown report (no file writes) with the following structure:

## Specification Analysis Report

| ID | Signal Code | Category | Severity | Location(s) | Summary | Recommendation |
|----|-------------|----------|----------|-------------|---------|----------------|
| A1-001 | A1 | Duplication | HIGH | spec.md:L120-134 | Two similar requirements ... | Merge phrasing; keep clearer version |
| BG1-001 | BG1 | Boundary Guardrail Gap | HIGH | plan.md, tasks.md | Boundary-sensitive area lacks `Implementation Constitution` in the plan | Re-run `/sp-plan` to add the constitution, then `/sp-tasks` if guardrail tasks need regeneration |
| BG2-001 | BG2 | Boundary Guardrail Gap | HIGH | tasks.md | Plan declares a boundary-sensitive constitution rule, but tasks do not preserve it as implementation guardrails | Re-run `/sp-tasks` or edit `tasks.md` so guardrail tasks exist before setup or feature work |
| BG3-001 | BG3 | Boundary Guardrail Gap | HIGH | implement guidance | Execution guidance does not force boundary confirmation before code-writing work starts | Update implementation guidance so the owning framework, required references, and forbidden drift are confirmed before dispatch |
| DP1-001 | DP1 | Dispatch Packet Gap | HIGH | implement guidance, runtime payload | Delegated execution path is missing compiled hard rules, validation gates, or done criteria | Compile and validate a `WorkerTaskPacket` before dispatch |
| DP2-001 | DP2 | Dispatch Packet Gap | HIGH | plan.md, tasks.md, runtime payload | Delegated execution path is missing required references or forbidden drift | Add packet references/forbidden drift to planning artifacts, then recompile |
| DP3-001 | DP3 | Dispatch Result Gap | HIGH | subagent result, join point | Subagent completion lacks validation evidence or rule acknowledgement | Reject the subagent result and require a packet-compliant rerun |

(Add one row per finding. Each row uses a stable fingerprint-first finding ID, and keeps BG/DP values as signal codes where applicable.)

**Blocker Bundle:**

The `Blocker Bundle` MUST enumerate every blocking finding even when the visible findings table is capped at 50 rows. Do not place blocking findings only in overflow summaries.

| Invalid Stage | Blocking Finding IDs | Required Re-entry | Notes |
|---------------|----------------------|-------------------|-------|
| clarify | [IDs or none] | `/sp-clarify` | Reopen spec/context truth, then regenerate downstream artifacts |
| deep-research | [IDs or none] | `/sp-deep-research` | Prove unresolved implementation chain before planning |
| plan | [IDs or none] | `/sp-plan` | Repair planning truth, then regenerate tasks |
| tasks | [IDs or none] | `/sp-tasks` | Repair task decomposition and rerun analyze |
| execution-only | [IDs or none] | `/sp-implement` or `/sp-debug` | No upstream artifact regeneration required |

**Coverage Summary Table:**

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|

**Locked Decision Preservation Table:**

| Locked Decision | In Context? | In Plan? | In Tasks? | Notes |
|-----------------|-------------|----------|-----------|-------|

**Reference Behavior Preservation Table:** (if any)

| Behavior ID | In Spec Fidelity? | In Plan? | In Tasks? | Notes |
|-------------|-------------------|----------|-----------|-------|

**Boundary Guardrail Table:** (if any)

| Boundary Signal | Seen In Spec/Context? | Seen In Plan Constitution? | Seen In Tasks Guardrails? | Notes |
|-----------------|-----------------------|----------------------------|---------------------------|-------|

**Constitution Alignment Issues:** (if any)

**Unmapped Tasks:** (if any)

**Metrics:**

- Total Requirements
- Total Tasks
- Coverage % (requirements with >=1 task)
- Ambiguity Count
- Duplication Count
- Critical Issues Count
- Boundary Guardrail Gap Count

### 8. Provide Next Actions

At the end of the report, output exactly one `Recommended Next Command` based on the highest invalid workflow stage.

- If the highest-impact unresolved issue lives in `spec.md` or `context.md`, `Recommended Next Command` MUST be `/sp-clarify`.
- If the highest-impact unresolved issue is a clear requirement whose implementation chain is still unproven, `Recommended Next Command` MUST be `/sp-deep-research`.
- If the highest-impact unresolved issue lives in `plan.md`, `Recommended Next Command` MUST be `/sp-plan`.
- If the highest-impact unresolved issue lives only in `tasks.md`, `Recommended Next Command` MUST be `/sp-tasks`.
- If no upstream artifact is invalid and the remaining issue is execution-only, `Recommended Next Command` MUST be `/sp-implement` or `/sp-debug`, whichever matches the recorded execution problem.
- Do not output multiple alternative next commands for the same analysis result.

### 9. Define Workflow Re-entry

After `Next Actions`, output a short `Recommended Re-entry` block that names:
- the single highest workflow stage that must be reopened
- the minimum downstream regeneration path from that stage

Rules:
- If the highest invalid stage is `clarify`, the re-entry chain MUST be `/sp-clarify -> /sp-plan -> /sp-tasks -> /sp-analyze -> /sp-implement`.
- If the highest invalid stage is `deep-research`, the re-entry chain MUST be `/sp-deep-research -> /sp-plan -> /sp-tasks -> /sp-analyze -> /sp-implement`.
- If the highest invalid stage is `plan`, the re-entry chain MUST be `/sp-plan -> /sp-tasks -> /sp-analyze -> /sp-implement`.
- If the highest invalid stage is `tasks`, the re-entry chain MUST be `/sp-tasks -> /sp-analyze -> /sp-implement`.
- If the remaining issue is execution-only, the re-entry chain MUST begin at `/sp-implement` or `/sp-debug`.
- Do not output multiple alternative re-entry chains for the same result.

### 9.5 Persist Workflow Gate Result

Before the final completion text, write or update `WORKFLOW_STATE_FILE` so it records the gate outcome:

Always update or preserve the `Analyze Gate` section in `WORKFLOW_STATE_FILE` with:
- `gate_status: cleared | blocked`
- `gate_cycle: [integer]`
- `highest_invalid_stage: clarify | deep-research | plan | tasks | execution-only | none`
- `blocker_bundle: [finding ID | invalid stage | status | attribution | compact summary | remediation requirement]`
- `artifact_fingerprint_basis: [spec.md/context.md/plan.md/tasks.md summaries or hashes when available]`

When revalidation finds a new blocker, record its attribution on that `blocker_bundle` row using `missed_by_previous_analyze`, `introduced_by_remediation`, `upstream_artifact_changed`, or `detector_scope_changed`.

- When no upstream remediation is required, record the analyze gate as cleared and hand off to implementation.
- If no upstream remediation is required:
  - `active_command: sp-analyze`
  - `phase_mode: analysis-only`
  - `status: completed`
  - `next_action: begin implementation from the cleared execution batch`
  - `next_command: /sp.implement`
- If the highest invalid stage is `spec.md` or `context.md`:
  - `next_action: reopen specification alignment and regenerate downstream artifacts`
  - `next_command: /sp.clarify`
- If the constitution itself must change:
  - `next_action: amend project principles first, then reopen the highest affected downstream stage and regenerate downstream artifacts`
  - `next_command: /sp.constitution`
- If the highest invalid stage is `plan.md`:
  - `next_action: reopen planning and regenerate downstream artifacts`
  - `next_command: /sp.plan`
- If the highest invalid stage is only `tasks.md`:
  - `next_action: regenerate task decomposition before implementation resumes`
  - `next_command: /sp.tasks`
- If execution evidence must be repaired without upstream artifact drift:
  - `next_action: resume execution-side recovery with the recorded blocker context`
  - `next_command: /sp.implement` or `/sp.debug` as justified by the report

### 10. Offer Remediation

Ask the user: "Would you like me to draft concrete remediation edits and the exact workflow re-entry path for the top N issues?" (Do NOT apply them automatically.)

## Operating Principles

### Context Efficiency

- **Minimal high-signal tokens**: Focus on actionable findings, not exhaustive documentation
- **Progressive disclosure**: Load artifacts incrementally; don't dump all content into analysis
- **Token-efficient output**: Limit findings table to 50 rows; summarize overflow
- **Deterministic results**: Rerunning without changes should produce consistent IDs and counts

### Analysis Guidelines

- **NEVER modify files** (this is read-only analysis)
- **NEVER hallucinate missing sections** (if absent, report them accurately)
- **Prioritize constitution violations** (these are always CRITICAL)
- **Use examples over exhaustive rules** (cite specific instances, not generic patterns)
- **Report zero issues gracefully** (emit success report with coverage statistics)

If this workflow makes actual source/runtime/template/config/test/generated-asset changes in the current run, follow the shared inline closeout contract:

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

## Invocation Context

$ARGUMENTS

## Codex Subagent Capability Discovery

- Execution model: preserve the workflow's existing `subagent-mandatory`, `subagents-first`, `adaptive`, or `subagent-assisted` policy.
- Dispatch shape: preserve the workflow's existing dispatch shape; use `subagent-blocked` only after the discovery step below fails or is unsafe.
- Execution surface: prefer `native-subagents` when the current runtime supports it; use `none` only after recording the unavailable or unsafe surface.
- Native subagent capability discovery: Before recording `subagent-blocked`, check the active tool surface for the integration-native subagent or task-dispatch entrypoint and record the exact missing surface if unavailable.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch subagents through the integration's native subagent support using the shared prompt contract.
- Join behavior: Use the integration-native join point, then integrate results back on the leader path.
- Preserve this workflow's existing packet, handoff, artifact, and result schema; this section only governs capability discovery before dispatch or blocked-state recording.
