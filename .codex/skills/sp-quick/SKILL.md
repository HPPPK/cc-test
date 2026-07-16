---
name: "sp-quick"
description: "Use when a task is small but non-trivial and needs lightweight tracked planning, validation, or resumable execution outside the full workflow."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/quick.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: The task is too large or risky for `sp-fast` but does not justify the full `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@3f003d2bd26e4b4e73b77950c148ccb010ece90c specify '->' plan '->' tasks '->' implement` flow.
- **Primary objective**: Keep the task resumable and tracked while applying only the minimum planning, research, and validation depth it needs.
- **Primary outputs**: `.planning/quick/<id>-<slug>/STATUS.md`, quick-task summary artifacts, and the scoped implementation changes for the task.
- **Default handoff**: Resume the quick task until resolved, or escalate to /sp.specify if the scope grows into multi-capability or acceptance-criteria-heavy work.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Execute a small, ad-hoc task through a lightweight planning and validation path without entering the full `specify -> plan -> tasks` workflow.

This command will skip the full feature-spec workflow while preserving lightweight planning and verification.

Use this for work that is too large for `sp-fast` but still too small or too well understood to justify a full spec flow: small bug fixes, small features, focused UX adjustments, template tweaks, or narrow CLI behavior changes.

Before the lightweight path starts substantive execution, make the agent's understanding visible once so the user can confirm or correct the direction.

## Context

- Primary inputs: the user's request, quick-task workspace state, passive learning files, the task-local project cognition query bundle with readiness and returned `minimal_live_reads`, and the smallest workflow-local state files needed for the touched area.
- The leader owns `STATUS.md`, lane selection, join points, validation, and final summary state.
- Quick mode is the resumable middle lane between `sp-fast` and the full specification workflow.
- Continue in quick only when any `CA-###` consequence obligations are bounded in `STATUS.md` with affected objects, lifecycle states, dependency impact, recovery/validation proof, coverage gaps, and stop-and-reopen conditions.
- Before substantive execution, present one Understanding Checkpoint covering the understood problem, planned outcome, scope boundary, known facts and assumptions, affected surfaces, a concrete ordered implementation plan, validation evidence, and the stop condition that would require escalation; keep the checkpoint plain text for terminal output with no HTML tags or inline line-break markup; wait for user confirmation and record it in quick `STATUS.md`.

## Senior Consequence Analysis Gate

Run this gate whenever the request, artifact set, defect, or planned change can affect lifecycle operations, running objects, concurrent work, destructive behavior, shared state, downstream consumers, compatibility, security-sensitive behavior, or multiple plausible product behaviors.

Project cognition first. Use the project cognition runtime to identify ownership, consumers, state surfaces, change-propagation facts, verification routes, conflicts, known unknowns, and coverage gaps. Senior consequence analysis second. Turn those facts into explicit product and implementation obligations instead of treating the graph as the decision-maker.

Project cognition readiness provides routing advice. If readiness is `query_ready`, read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons. If readiness is `review`, inspect the returned `minimal_live_reads` before continuing and treat `coverage_diagnostics` as confidence and closeout signals. If readiness is `needs_rebuild`, continue with live repository evidence and recommend `$sp-map-scan -> $sp-map-build` only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows outside `greenfield_empty`, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`. If readiness is `blocked`, report the blocked state and continue with live repository evidence unless the user's actual request is to fix cognition runtime state. If readiness is `unsupported_runtime`, continue with live evidence and record that compass intake was unavailable. If `baseline_kind=greenfield_empty`, continue with workflow artifacts and live requirements; do not recommend map-scan -> map-build solely because the graph has no paths. Carry relevant project cognition facts, returned `minimal_live_reads`, inference notes, and coverage gaps into the workflow's artifacts or durable state, but back consequence claims with live code, tests, scripts, configuration, or authoritative docs. Mutation closeout is separate from entry routing: entry stale may continue, but that does not allow source/runtime mutation workflows to defer closeout. Workflow-owned mutation closeout is not an external map-maintenance handoff; after changing project-related files or behavior, the workflow must run inline project cognition update from its changed paths, affected surfaces, and verification evidence, with `project-cognition mark-dirty` only as fallback when inline update cannot complete. `sp-map-update` is for manual/external maintenance and follow-up repair; it is external map maintenance, not routine closeout for this workflow's own changes. In shared routing summaries, sp-map-update is for manual/external maintenance and ordinary existing-baseline gaps.

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

## Dispatch Mode

Dispatch mode follows command tier, not a uniform rule.

| Tier | Dispatch Mode | Rule |
|------|---------------|------|
| trivial | leader-direct | No subagent dispatch. Leader performs and verifies the change directly. |
| light | subagent-preferred | Dispatch to one subagent; leader-inline fallback allowed if dispatch unavailable. |
| heavy | subagent-mandatory | Must dispatch. If dispatch unavailable, record reason and escalate. |

### Fallback (light tier only)

When subagent dispatch is unavailable for a light-tier command:
1. Record the reason in workflow state
2. Switch to `execution_surface: leader-inline`
3. Proceed with the same scope and verification gates

This is a designed fallback path, not an exception.

**This command tier: light. Dispatch mode: subagent-preferred.**

Dispatch one safe validated lane as `one-subagent` or multiple safe isolated lanes as `parallel-subagents`; otherwise record `subagent-blocked` with the concrete reason and stop for escalation or recovery.


## Leader Role

- You are the workflow leader and orchestrator.
- You own routing, task splitting, task contracts, dispatch, join points, integration, verification, and state updates.
- Subagents own the substantive task lanes assigned through task contracts.
- You are the quick-task leader. You own scope control, `STATUS.md`, lane selection, validation, and the final summary artifact.
- You are not the default implementer for the quick task; substantive task work belongs on subagent lanes once scope and contracts are locked.
- Use `execution_model: subagent-mandatory` once the quick task has a bounded execution lane.
- Dispatch `one-subagent` for one safe delegated lane and `parallel-subagents` for isolated lanes that can run concurrently.
- Compile a validated `WorkerTaskPacket` or equivalent execution contract before dispatch.

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
- `needs_rebuild`: reserve `$sp-map-scan -> $sp-map-build` for documented brownfield rebuild triggers.
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
- `missing` -> if cognition freshness is `missing`, continue with live repository evidence and recommend `$sp-map-scan`, then `$sp-map-build` only as brownfield external baseline maintenance
- `stale` -> if cognition freshness is `stale`, treat map output as advisory and continue with live repository evidence; recommend `$sp-map-update` only as external/manual maintenance when the user asks for map maintenance or before a separate map-maintenance pass
- `stale` with changed paths missing from `path_index` -> warn and continue with live repository evidence; recommend `$sp-map-update` first for ordinary existing-baseline gaps.
  Use `$sp-map-scan -> $sp-map-build` only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows outside baseline-kind exceptions described below, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`
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

Workflow-owned mutation closeout is not an external map-maintenance handoff and is not external map maintenance. It is the workflow-local form of `$sp-map-update`. If this workflow changed project-related source, runtime, templates, generated assets, config, tests, state contracts, shared surfaces, or behavior-bearing docs, closeout MUST run inline project cognition update for the workflow-owned changed paths and affected surfaces before claiming clean completion.

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
- `needs_rebuild`: report the exact rebuild condition and route to `$sp-map-scan`, then `$sp-map-build`.
- `blocked`: report the runtime or validation blocker and the exact recovery command.
- `recorded`: legacy recorded-only output; treat it as partial or blocked, never as clean completion.

Dirty fallback command shape: `'C:\Users\11034\.specify\bin\project-cognition.exe' mark-dirty --reason '<reason>' --format json`.
Use `'C:\Users\11034\.specify\bin\project-cognition.exe' mark-dirty --reason workflow-closeout-failed --format json` only when inline update cannot complete: when the planner or update command is unavailable, cannot record useful update data, cannot identify workflow-owned scope, or cannot be trusted because verification/workflow completion is not trustworthy. Dirty only when inline update cannot complete.

sp-map-update is for manual/external maintenance and follow-up repair. `$sp-map-update` remains the external/manual workflow for user edits, interrupted workflow repair, explicit map maintenance, and follow-up repair. It is not routine cleanup for changes this workflow just made. If `sp-map-update` already ran `project-cognition update --reason map-update` for the same changed paths, do not run a second `workflow-finalize` closeout update for those paths.

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

Use the returned readiness only to prepare the Understanding Checkpoint and
write early quick-task state:

- `query_ready`: read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons.
- `review`: perform only the returned `minimal_live_reads` before continuing and inspect `coverage_diagnostics`.
- `needs_rebuild`: route through `$sp-map-scan`, then `$sp-map-build` only for documented brownfield rebuild triggers: first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation path_index rows, missing or invalid alias_index, explicit_rebuild_requested, or baseline_identity_invalid.
- `blocked`: report the blocking runtime issue and continue with live evidence only where this workflow allows degraded navigation.
- **CARRY FORWARD**: Write the selected capability, minimal reads, validation route,
  and known risk into quick-task `STATUS.md` before implementation
  proceeds.

Treat task-relevant coverage as insufficient when the touched area still lacks
ownership, placement, workflow, integration, or verification guidance before
choosing the quick-task lane shape.

## Discussion Handoff Intake

Resolve discussion handoff intake before quick-task execution.

Classify the supplied arguments before creating or resuming substantive quick-task execution:

- normal quick-task request
- `.specify/discussions/<slug>/handoff-to-specify.md`
- `.specify/discussions/<slug>/handoff-to-specify.json`
- `.specify/discussions/<slug>/handoff.md` or `.specify/discussions/<slug>/handoff.json` when a generated project has adopted neutral filenames
- a discussion `<slug>` whose workspace contains the unified handoff pair
- no arguments with exactly one unconsumed `status: handoff-ready` discussion whose `recommended_consumer` is `sp-quick` or whose JSON `consumer_eligibility.sp-quick.status` is `ready`

The `handoff-to-specify.*` filenames are compatibility names for a single unified `discussion_requirement_contract`. Do not look for or require `handoff-to-quick.*`, and do not create a second quick-specific handoff.

When a discussion handoff is selected, treat it as authoritative upstream input for the quick task and set:

- `SOURCE_HANDOFF_MD`
- `SOURCE_HANDOFF_JSON`
- `SOURCE_DISCUSSION_SLUG`

Require both Markdown and JSON companions. Missing Markdown or JSON is `blocked_by_handoff_integrity`; route back to `sp-discussion` to refresh the unified handoff instead of reconstructing it here.

Parse the JSON before quick-task execution and require:

- `entry_source: sp-discussion`
- `handoff_kind: discussion_requirement_contract` when present; legacy discussion handoffs without this field may continue only if all other gates pass
- `handoff_status: handoff-ready` or source `discussion-state.md` `status: handoff-ready`
- `quality_gate.status: user_confirmed` or `quality_gate.status: user-confirmed`
- `hard_unknown_count: 0`
- `open_conflict_count: 0`
- `consumer_eligibility.sp-quick.status: ready`
- `quick_task_candidate.requires_spec_first: false`
- `quick_task_candidate.consequence_model: bounded` or a recorded bounded stand-down reason

If `consumer_eligibility.sp-quick.status` is blocked, `requires_spec_first` is true, the consequence model is unbounded, or the scope no longer fits one bounded quick-task workspace, stop and route to `$sp-specify` or back to `$sp-discussion` according to the handoff's `recommended_consumer` and blocker reason.

When a discussion handoff is accepted for quick, read only the agent-facing requirement contract first:

- `agent_requirement_contract.target_need`
- `agent_requirement_contract.constraints`
- `agent_requirement_contract.success_criteria`
- `agent_requirement_contract.design_direction`
- `agent_requirement_contract.optimal_solution_approach`
- `agent_requirement_contract.scope`
- `quick_task_candidate`
- `must_preserve`
- `discussion_decision_digest`
- `reopen_conditions` or `stop_and_reopen_conditions`

Read `discussion-log.md`, `requirements.md`, `technical-options.md`, `project-context.md`, and `open-questions.md` only when the unified handoff is stale, incomplete, contradictory, or explicitly references those files for evidence. Record inspected files in `source_files_read`.

Seed `STATUS.md` from the handoff before substantive work:

- `source_discussion_slug`
- `source_handoff_md`
- `source_handoff_json`
- `source_files_read`
- `locked_direction`
- `must_preserve`
- `reopen_conditions`
- `quick_task_candidate`
- `handoff_consumer: sp-quick`

Do not skip the Understanding Checkpoint. The accepted discussion handoff prepares the checkpoint; it does not replace user confirmation. Initialize or update `STATUS.md` with `understanding_confirmed: false`, then present the Quick Checkpoint from `quick_task_candidate.quick_checkpoint_seed`, `agent_requirement_contract`, and `must_preserve`.

## Understanding Checkpoint

`sp-quick` has one default understanding checkpoint before substantive execution. This is not a full spec, not a `sp-plan` substitute, and not a detailed task-plan approval. It exists so the user can confirm that the quick-task direction is correct before the workflow runs to completion.

After the constitution gate, quick workspace initialization, project cognition query, and any bounded `minimal_live_reads`, present one concise user-facing checkpoint card. Use the user's language for the card content and confirmation prompt when practical. Keep it compact, but do not omit important specifics: include concrete files, commands, workflows, constraints, validation evidence, and known uncertainty when they are already known. If a row is genuinely unknown, write `Unknown: [why it matters]` instead of leaving it vague.

Use this shape. The row labels should be localized to the user's language when practical; keep the meaning of the canonical fields. The checkpoint should give the user confidence to approve or correct the work: `Issue` must explain the bad behavior, where it appears, why it matters, and what the user is not asking for; `Implementation plan` must be a concrete ordered sequence, not a vague promise to investigate. Keep the checkpoint plain text for terminal output: do not use HTML tags or inline line-break markup. Format multi-step plans as semicolon-separated numbered clauses inside the table cell; if the plan is too long to read cleanly, put a short summary in the cell and add a normal Markdown numbered list immediately below the table. Do not reuse the placeholder text as content; replace each bracketed item with task-specific steps.

```markdown
## Quick Checkpoint

| Item | Current understanding |
| --- | --- |
| Issue | [2-4 concrete sentences: the specific problem/request in the user's terms, where it appears, why it matters, and the nearest thing that is not being requested] |
| Target outcome | [the concrete result this quick task should deliver] |
| Boundaries | Will change: [specific areas, files, commands, workflows, or behavior]. Will not change: [specific non-goals]. Escalate if: [condition that no longer fits quick]. |
| Known facts / assumptions | [repository evidence, handoff facts, minimal reads, explicit user constraints, and any safe assumption being made while unknowns remain] |
| Affected surfaces | [implementation, docs, tests, generated assets, state files, CLI/API surfaces, or consumers expected to be touched or checked] |
| Implementation plan | 1. [task-specific first step]; 2. [task-specific second step]; 3. [task-specific third step]; 4. [task-specific fourth step, if needed]; 5. [task-specific verification or closeout step] |
| Next action | [the first implementation, delegation, or preparation action after confirmation] |
| Validation evidence | [tests, commands, manual checks, changed-surface sweep, or other evidence required before closeout] |
| Stop condition | [the exact discovery or risk that will stop quick execution and require a user decision or escalation] |

Reply with `confirm`/`确认` to continue, or `revise: ...`/`修改：...` with corrections.
```

Wait for user confirmation before code edits, broad repository analysis, delegation, implementation commands, or validation commands. If the user corrects the understanding, revise the checkpoint once with the corrected direction and ask for confirmation again.

Create or update `STATUS.md` with `understanding_confirmed: false` before any map maintenance handoff, broad repository analysis, delegation, implementation command, or validation command. Record the confirmed checkpoint in `STATUS.md`. `understanding_confirmed: false` blocks substantive execution on resume. While it is false, only read the minimal context needed to reconstruct or revise the checkpoint; you must not proceed to code edits, broad repository analysis, delegation, validation commands, `$sp-map-update`, `$sp-map-scan`, or `$sp-map-build` until the checkpoint is confirmed and `STATUS.md` is updated.

## Workflow Quality Requirements

- Confirm project cognition freshness and valid quick-task entry before deeper execution.
- Keep `STATUS.md` current as the durable quick-task source of truth for scope, lane state, blockers, verification, and terminal status.
- Validate each `WorkerTaskPacket` or equivalent execution contract before dispatch and require a structured handoff before accepting delegated work.
- Update durable state before compaction-risk transitions, join points, delegated fan-out, or any stop where resume will depend on more than the visible conversation.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order before broader quick-task context.
- Open only learning detail docs linked from quick-task-relevant index entries.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail markdown document without asking for routine permission.

## Scope Gate

Use `sp-quick` when all of these are true:
- The task is bounded and clearly described.
- The work is small but non-trivial.
- A lightweight plan is useful, but a full spec package would be overhead.
- Use this path when you want to skip the full `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@3f003d2bd26e4b4e73b77950c148ccb010ece90c specify '->' plan '->' tasks '->' implement` workflow for a bounded task.
- The task does not require a new long-lived feature spec under `.specify/features/<feature>/`.

If the task is trivial and local:
- Use `$sp-fast`.

If the task changes architecture, introduces broad product decisions, or needs a durable feature specification:
- Use `$sp-specify`.

If the task is a bug fix or regression but the root cause is still unknown:
- Use `$sp-debug` instead of treating `sp-quick` as a symptom-fix lane.

## Escalation Triggers

Upgrade to `$sp-specify` immediately if:
- The Senior Consequence Analysis Gate triggers and the work needs user-level lifecycle decisions, broad compatibility handling, multi-capability scope, destructive policy, shared-state semantics, downstream consumer negotiation, or acceptance criteria that cannot fit one bounded quick task.
- The task changes architecture or introduces cross-cutting behavior across multiple modules, workflows, or shared surfaces.
- The task touches a change-propagation hotspot, a truth-owning shared surface, or an area whose known unknowns make lightweight planning unsafe.
- The request now spans multiple independent capabilities, release tracks, or user journeys that no longer fit one bounded quick-task workspace.
- The work needs a new durable spec package, a long-lived feature boundary, or planning artifacts intended to survive beyond the quick task.
- The change has rollout, migration, compatibility, or neighboring-workflow impact that must be locked before implementation.
- The expected behavior cannot be stated with concrete acceptance criteria without first doing feature-level requirement alignment.
- The work started as a bug fix, but root-cause analysis is still unresolved, competing causes are still plausible, or the next safe step is diagnostic investigation rather than a bounded repair. In that case, route to `$sp-debug`.

## Quick Consequence Boundary

Continue in quick only when the consequence model is bounded: affected objects are few, lifecycle choices are local, dependency impact is limited, recovery is obvious, validation can run inside the quick-task loop, and every `CA-###` obligation can be recorded in `STATUS.md`.

- If the gate stands down, record the stand-down reason in `STATUS.md`.
- If the gate triggers but remains bounded, record affected objects, state behavior, dependency impact, recovery and validation, project cognition evidence, coverage gaps, and escalation decision before dispatch.
- If consequence analysis reveals user-level lifecycle decisions, broad compatibility handling, multi-capability scope, destructive policy, shared-state semantics, or downstream consumer negotiation, upgrade to `$sp-specify` immediately.
- If the task is a defect and the dependency loop is unknown, use `$sp-debug` rather than resolving consequence semantics inside `sp-quick`.

## Execution Modes

The following flags are available and composable:
- `--discuss`: Do a lightweight clarification pass before planning.
- `--research`: Investigate implementation approaches before planning.
- `--validate`: Add plan checking and post-execution verification.
- `--full`: Equivalent to `--discuss --research --validate`.

## Coordinator Model

- The invoking runtime is the leader for the quick task. It owns scope decisions, the lightweight plan, execution strategy selection, join-point handling, validation, and the final summary artifact.
- The leader should not blur planning, execution, and validation into a long conversational loop when the task can be dispatched through a bounded subagent.
- Constitution first: read `.specify/memory/constitution.md` before workspace setup, clarification, lane selection, subagent dispatch, or local analysis.
- If project cognition readiness requires `$sp-map-update`, `$sp-map-scan`, or `$sp-map-build`, record that requirement in `STATUS.md` while `understanding_confirmed: false`, present the Understanding Checkpoint, and only hand off to map maintenance after confirmation.
- Before the first subagent is dispatched, the leader may gather only the minimum context needed to choose scope, lane shape, and execution strategy. Do not perform broad repository analysis or implementation design locally before creating `STATUS.md` and selecting the first subagent path.
- Before implementation work starts, confirm the Understanding Checkpoint and persist `understanding_confirmed: true` in `STATUS.md`; only then identify whether the quick task is best handled by one bounded subagent or by two or more independent subagents that can safely proceed in parallel.
- [AGENT] Use the shared policy function before execution begins and again at each join point: `choose_subagent_dispatch(command_name="quick", snapshot, workload_shape)`.
- Persist the decision fields exactly: `execution_model: subagent-mandatory`, `dispatch_shape: one-subagent | parallel-subagents`, `execution_surface: native-subagents`.
- Treat `snapshot.delegation_confidence` as a runtime/model reliability signal for the current subagent path. If confidence is `low`, prefer the native subagent workflow or record `subagent-blocked` over fragile dispatch.
- Decision order:
  - One safe validated lane -> `one-subagent` on `native-subagents` when available.
  - Two or more safe isolated lanes -> `parallel-subagents` on `native-subagents` when available.  - No safe lane, overlapping writes, missing contract, low confidence, or unavailable delegation -> `subagent-blocked` with a recorded reason.
- Substantive quick-task lanes must use subagent execution once a validated `WorkerTaskPacket` or equivalent execution contract preserves quality. If that readiness bar is not met, compile the missing contract before dispatch; if the contract cannot be made safe, record `subagent-blocked` and stop for escalation or recovery.
- If two or more independent subagent lanes can safely run in parallel and that fan-out materially improves throughput, dispatch multiple subagents instead of serial execution.
- `subagent-blocked` is an exception path, not a strategy choice. Use it only when the current quick-task batch cannot proceed through subagents or the native subagent workflow.
- If subagent-blocked status is used, record the concrete reason in `STATUS.md`, including which subagent path was unavailable or blocked for the current batch.
- The first actionable execution step after scope lock and understanding confirmation is to dispatch the first subagent batch, not to continue local deep-dive analysis.
- Use `.specify/templates/worker-prompts/quick-worker.md` as the default contract for quick-task subagents so the subagent returns enough state for the leader to keep `STATUS.md` accurate.
- Prefer structured subagent results compatible with the shared `WorkerTaskResult` contract when the current runtime supports them.
- If the current integration exposes a runtime-managed result channel, use that channel. For Codex runtime-managed handoffs, the canonical path requires the runtime dispatch request id and is computed with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@3f003d2bd26e4b4e73b77950c148ccb010ece90c specify result path --command quick --request-id '<request-id>'`; final completion must be reported through the active runtime-managed result channel for that request id.
- Without a runtime-managed result channel, write the normalized subagent result envelope to `.planning/quick/<id>-<slug>/worker-results/<lane-id>.json`
- When the local CLI is available and no runtime-managed result channel exists, prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@3f003d2bd26e4b4e73b77950c148ccb010ece90c specify result path --command quick --workspace '.planning/quick/<id>-<slug>' --lane-id '<lane-id>'` to compute the canonical handoff target and `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@3f003d2bd26e4b4e73b77950c148ccb010ece90c specify result submit --command quick --workspace '.planning/quick/<id>-<slug>' --lane-id '<lane-id>' --result-file '<path>'` to normalize and write the subagent result envelope. `result path` emits JSON and does not accept `--format`; do not append `--format`.
- Preserve `reported_status` when normalizing subagent language such as `DONE_WITH_CONCERNS` or `NEEDS_CONTEXT` into canonical orchestration state.
- Idle subagent is not an accepted result.
- The leader must wait for and consume the structured handoff before closing the join point, declaring completion, requesting shutdown, or interrupting subagent execution.

## Quick-Task Workspace Protocol

- Every quick task must have a dedicated id-based workspace under `.planning/quick/<id>-<slug>/`.
- If a matching active workspace already exists, resume it instead of creating a second parallel quick-task directory for the same goal.
- The minimum artifact set is:
  - `STATUS.md`: the source of truth for the current quick-task state.
  - `SUMMARY.md`: the final outcome, `changed_code_paths`, `changed_behavior_surfaces`, verification evidence, residual risk, and `project_cognition_refresh` outcome.
  - Optional lightweight support artifacts only when needed for the task shape, such as `PLAN.md`, `RESEARCH.md`, or `DISCUSSION.md`.
- `STATUS.md` is the lifecycle source of truth for the quick task. `.planning/quick/index.json` is a derived projection for management and recovery commands.
- The quick-task directory format is `<id>-<slug>`. Do not use slug-only workspace names for the enhanced quick flow.
- Constitution read is the first hard gate. `STATUS.md` initialization comes immediately after it.
- `STATUS.md` must stay compact and overwrite the active state rather than growing into a long log. It must always make these fields obvious:
  - current focus
  - execution strategy
  - active lane or batch
  - join point, if any
  - blocked dispatch or escalation state, if any
  - next action
  - recovery action
  - retry attempts
  - blocker reason
  - blockers, if any
- Update `STATUS.md` before each material phase transition: after scope lock, after planning, before delegation, after each join point, before validation, and before final summary.
- After the constitution gate, `STATUS.md` initialization is the next hard gate. Do not perform substantial repository analysis, implementation design, or code reading beyond scope-lock context until the workspace exists and the first lane is recorded.
- When the quick task completes, preserve `SUMMARY.md` and move resolved state under `.planning/quick/resolved/` if the local project convention prefers archiving over keeping active quick-task folders in place.

## STATUS.md Template

Use this as the default structure for `.planning/quick/<id>-<slug>/STATUS.md`:

```markdown
---
id: [quick-task id]
slug: [quick-task slug]
title: [short quick-task title]
status: gathering | planned | executing | validating | blocked | resolved
trigger: "[verbatim user input]"
understanding_confirmed: false | true
execution_model: subagent-mandatory
dispatch_shape: one-subagent | parallel-subagents
execution_surface: native-subagents
created: [ISO timestamp]
updated: [ISO timestamp]
---

## Discussion Handoff Source
<!-- OVERWRITE after accepting a unified discussion handoff; keep empty for normal quick requests -->

handoff_consumer: none | sp-quick
source_discussion_slug: [discussion slug or none]
source_handoff_md: [handoff Markdown path or none]
source_handoff_json: [handoff JSON path or none]
source_files_read:
  - [discussion source file inspected after handoff intake]
locked_direction:
  - [selected direction from the discussion handoff]
must_preserve:
  - [MP item, decision, constraint, or must-not-dilute item carried into quick]
reopen_conditions:
  - [condition requiring return to sp-discussion or sp-specify]
quick_task_candidate:
  bounded_scope:
    - [bounded scope from handoff]
  excluded_scope:
    - [excluded scope from handoff]
  validation_route:
    - [validation route from handoff]

## Current Focus
<!-- OVERWRITE on each update -->

goal: [bounded quick-task objective]
current_focus: [what the leader is doing now]
next_action: [immediate next step]

## Execution Intent
<!-- OVERWRITE/REFINE when the lane shape or validation target changes -->

intent_outcome: [the bounded behavior change or recovery target for this quick task]
intent_constraints:
  - [constraints, forbidden drift, or scope boundaries that must stay active]
success_evidence:
  - [the checks or observations required before the quick task can be treated as resolved]
cognition_facts:
  selected_capability: [capability, route, symptom, or unknown]
  minimal_reads:
    - [project-cognition minimal_live_reads entry used before wider inspection]
  validation_route: [test, command, manual check, or unknown]
  known_risk: [ambiguity, weak coverage, forbidden drift, or none]

## Understanding Checkpoint
<!-- OVERWRITE/REFINE before substantive execution starts -->

checkpoint:
  issue: [the specific problem or request the user confirmed]
  issue_detail: [where it appears, why it matters, and the nearest thing the user is not asking for]
  expected_or_target: [the concrete result the user confirmed]
  known_facts:
    - [repository evidence, handoff fact, project cognition route, or explicit user constraint]
  unknowns_or_risks:
    - [uncertainty, why it matters, and the current safe assumption]
  will_change:
    - [specific area, file family, command, workflow, behavior, or surface included in this quick task]
  will_not_change:
    - [explicit non-goal, excluded file family, excluded workflow, lifecycle behavior, or escalation boundary]
  in_scope:
    - [specific area, workflow, file family, behavior, or command included in this quick task]
  out_of_scope:
    - [explicit non-goal, excluded file family, excluded workflow, or escalation boundary]
  affected_surfaces:
    - [implementation, docs, tests, generated assets, state files, CLI/API surface, or consumer to touch or check]
  execution_approach: [leader-inline preparation, one-subagent, or parallel-subagents with first lane shape and rationale]
  implementation_plan:
    - [task-specific ordered step]
  next_action: [the confirmed implementation, delegation, or preparation action after confirmation]
  validation_evidence:
    - [test, command, manual check, or evidence required before closeout]
  stop_condition: [discovery or risk that stops quick execution and requires user decision or escalation]
  done_or_progress_signal:
    - [test, command, manual check, or evidence required before closeout]
  user_corrections:
    - [user correction, ambiguity, or confirmation timestamp]

## Execution
<!-- OVERWRITE/REFINE as the lane or batch changes -->

active_lane: [single lane name or current batch]
join_point: [empty if none]
files_or_surfaces: [primary files, modules, or shared surfaces in play]
blocked_dispatch: [none by default; if subagent-blocked, record why native subagent dispatch was unavailable or unsafe]
blockers: [empty if none]
recovery_action: [next self-recovery step before asking for help]
retry_attempts: [0 if none]
blocker_reason: [empty if none]

## Validation
<!-- OVERWRITE/REFINE as checks complete -->

planned_checks:
  - [smallest meaningful verification command or manual check]
completed_checks:
  - [verification already run]

## Senior Consequence Analysis
<!-- OVERWRITE/REFINE when the gate stands down, triggers, or escalates -->

gate_status: not_evaluated | stand_down | triggered_bounded | escalated
stand_down_reason: [why lifecycle, running-state, destructive, shared-state, downstream-consumer, compatibility, security, or multiple-behavior semantics do not apply]
affected_objects:
  - [object, state surface, consumer, command, API, artifact, or workflow]
state_behavior_matrix:
  - [state -> expected behavior]
dependency_impact:
  - [dependency or consumer -> impact]
recovery_and_validation:
  - [rollback, retry, cleanup, idempotency, observability, or validation requirement]
project_cognition_evidence:
  - [project cognition fact, live read, or coverage source]
coverage_gaps:
  - [gap, owner, latest safe resolve phase, stop-and-reopen condition]
consequence_obligations:
  - [CA-### claim, owner, mapped lane/task/check]
escalation_decision: [stay quick | upgrade to specify | route to debug | blocked]

## Summary Pointer
<!-- OVERWRITE when terminal state is reached -->

summary_path: [.planning/quick/<id>-<slug>/SUMMARY.md]
resume_decision: [resume here | blocked waiting | resolved]
```

## Recovery Routing

- `sp-quick <description>` creates a new quick task.
- Empty `sp-quick` should look for unfinished quick tasks before asking for a new description.
- If exactly one unfinished quick task exists, resume it automatically.
- If multiple unfinished quick tasks exist, ask the user which quick task to continue.
- The selection list should show `id`, title, current status, and `next_action`.
- Treat `gathering`, `planned`, `executing`, `validating`, and `blocked` as unfinished quick-task states for recovery routing.
- If resuming a `blocked` quick task, prioritize `blocker_reason`, `recovery_action`, and `next_action` before widening scope.

## Lifecycle Commands

- `close` controls lifecycle semantics. Use it to place a quick task into `resolved` or `blocked`.
- `archive` controls storage semantics. Use it only after the quick task has already been closed.
- Do not treat archive as an implied synonym for resolved. Closure says what happened; archive says where the closed task now lives.

## Autonomous Execution Contract

- The leader must continue automatically until the quick task is complete or a concrete blocker prevents further safe progress.
- Do not stop after a single edit, single command, or single failed attempt when the next recovery step is obvious and low-risk.
- Do not start execution routing while `understanding_confirmed: false`; repair or confirm the Understanding Checkpoint first.
- Dispatch subagents when `snapshot.native_subagents` is true and the workload has one or more safe validated lanes.
- Substantive quick-task lanes must use subagent execution once a validated `WorkerTaskPacket` or equivalent execution contract preserves quality. If that readiness bar is not met, finish compiling the missing contract first; if the contract cannot be made safe, record `subagent-blocked` and stop for escalation or recovery.
- After `STATUS.md` is initialized, `understanding_confirmed: true` is recorded, and the first lane is defined, dispatch that subagent path before doing any further local repository deep dive.
- If multiple safe subagent lanes exist and they can improve throughput without creating write conflicts, dispatch them in parallel instead of artificially serializing the work.
- Use `subagent-blocked` only after subagent execution is concretely unavailable for the current batch and the native subagent workflow is also unavailable or unsuitable.
- Re-evaluate after every join point, recovery step, and validation result instead of assuming the first plan still holds.
- A quick task reaches a terminal state only when `STATUS.md` shows either `resolved` or `blocked`.

## Recovery Before Blocking

- When execution hits friction, attempt the smallest safe recovery step before declaring the task blocked.
- Default recovery order:
  - read additional local context that directly touches the failing area
  - run the smallest meaningful verification or repro command
  - inspect the immediate error output, logs, or failing test result
  - make one focused repair attempt that matches the evidence
  - if uncertainty remains high, use `--research`-style focused investigation for the narrow blocker rather than abandoning the task immediately
- Record each recovery step in `STATUS.md` under `recovery_action` and increment `retry_attempts`.
- If subagent execution is failing, attempt the next safe path before switching to subagent-blocked status:
  - retry the bounded subagent lane when the failure looks transient
  - retry or recompile the same native-subagent path when contract or context was insufficient
  - only then consider subagent-blocked status if no safe subagent path is currently available
- Escalate to `blocked` only when:
  - required credentials, services, permissions, or external systems are unavailable
  - the requirement remains high-impact ambiguous after the minimum safe clarification pass
  - repeated focused recovery attempts still leave no safe next step
  - the next action would be high-risk or destructive without user confirmation
- When blocked, write the concrete blocker reason to `blocker_reason`, preserve the best known next action, and stop only after the blocker is explicit.

## Surface Sweep Rule

- Treat every quick task as a small-scope complete sweep, not as an opportunistic one-file patch.
- Before editing, name the affected surfaces for this pass. Start from the smallest relevant set and expand until the task has a defendable boundary.
- Include propagation hotspots, consumer surfaces, verification entry points, and known unknowns from project cognition slices whenever they materially affect the quick task.
- For interface or contract changes, default sweep surfaces are:
  - implementation
  - export or declaration layer
  - docs
  - examples
  - tests
  - key callsites or consuming paths
- For other quick tasks, still name the concrete surfaces in play rather than implying coverage from a partial read.
- The leader must be able to say which surfaces were intentionally checked before claiming completion.
- For each named surface, record one explicit status conclusion:
  - `confirmed correct`
  - `fixed in this quick task`
  - `not checked in this pass (with reason)`
- Do not collapse `not checked` into silence. If a surface was not verified, say so explicitly and explain why it stayed outside the current pass.

## Completion Standard

- Quick completion means a small, transparent closed loop: sweep the affected surfaces, make the required change, run at least one meaningful verification step, and record the resulting coverage truthfully.
- Completion requires all three:
  - the change itself is implemented in code, docs, config, or templates as needed
  - at least one smallest meaningful executable verification step has run
  - any unverified surface or remaining gap is called out explicitly instead of being implied away
- The final `SUMMARY.md` must include `changed_code_paths` with modified, added, deleted, and renamed paths; `changed_behavior_surfaces` for affected commands, APIs, templates, generated assets, state files, tests, docs, validators, packets, or runtime assumptions; `verification_evidence`; and `project_cognition_refresh` with the inline update result or fallback `project-cognition mark-dirty` outcome whenever project cognition might be affected.
- `should be fine`, `likely unaffected`, or `not expected to break` are not completion evidence.
- If the change is implemented but verification or coverage is incomplete, do not claim the task is complete. Mark the remaining gap explicitly and continue the sweep or leave the task blocked with the concrete reason.
### Inline Project Cognition Update

Workflow-owned mutation closeout is not an external map-maintenance handoff and is not external map maintenance. It is the workflow-local form of `$sp-map-update`. If this workflow changed project-related source, runtime, templates, generated assets, config, tests, state contracts, shared surfaces, or behavior-bearing docs, closeout MUST run inline project cognition update for the workflow-owned changed paths and affected surfaces before claiming clean completion.

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
- `needs_rebuild`: report the exact rebuild condition and route to `$sp-map-scan`, then `$sp-map-build`.
- `blocked`: report the runtime or validation blocker and the exact recovery command.
- `recorded`: legacy recorded-only output; treat it as partial or blocked, never as clean completion.

Dirty fallback command shape: `'C:\Users\11034\.specify\bin\project-cognition.exe' mark-dirty --reason '<reason>' --format json`.
Use `'C:\Users\11034\.specify\bin\project-cognition.exe' mark-dirty --reason workflow-closeout-failed --format json` only when inline update cannot complete: when the planner or update command is unavailable, cannot record useful update data, cannot identify workflow-owned scope, or cannot be trusted because verification/workflow completion is not trustworthy. Dirty only when inline update cannot complete.

sp-map-update is for manual/external maintenance and follow-up repair. `$sp-map-update` remains the external/manual workflow for user edits, interrupted workflow repair, explicit map maintenance, and follow-up repair. It is not routine cleanup for changes this workflow just made. If `sp-map-update` already ran `project-cognition update --reason map-update` for the same changed paths, do not run a second `workflow-finalize` closeout update for those paths.
- Manual map maintenance may record ordinary uncertain closure, partial/low-confidence facts, known unknowns, and `minimal_live_reads` for external repair cases. After a successful existing-baseline maintenance refresh, use `'C:\Users\11034\.specify\bin\project-cognition.exe' complete-refresh --format json` only for incremental freshness finalization; `sp-map-build` owns `build-from-scan` and `'C:\Users\11034\.specify\bin\project-cognition.exe' validate-build --format json`, so do not run `complete-refresh` as a rebuild finalizer.

## Propagating Change Rule

- Treat interface signature changes, return-type changes, sync-to-async conversions, renamed commands, renamed config keys, path changes, and similar high-spread edits as a propagating change.
- For any propagating change, the leader must write a minimal plan before editing.
- That plan must name the affected surfaces to sweep, at minimum:
  - implementation
  - wrappers or bindings
  - examples
  - tests
  - docs
  - callsites
- Do not collapse a propagating change into ad-hoc search-and-edit work. The leader must be able to state what will be checked and how completion will be proven.

## Coverage Before Completion

- For propagating changes, sampling is not sufficient.
- Completion requires either:
  - a full-coverage check of every affected callsite or surface
  - or a scripted or pattern-based verification that covers the entire affected set
- If the current pass only covers representative examples, do not claim completion.
- If coverage is still incomplete, continue the sweep, add stronger search or verification, or mark the task blocked with the exact remaining gap.
- `All affected surfaces` means the declared sweep set, not just the files already inspected.

## Output Contract

- Keep `STATUS.md` accurate enough that another session can resume without chat memory.
- Produce scoped implementation changes, verification evidence, and a truthful resolved/blocked state for the quick task.
- `SUMMARY.md` reports changed code paths, changed behavior surfaces, verification evidence, residual risk, and the `project_cognition_refresh` outcome when project cognition might be affected.
- Preserve escalation history so it is clear why the task stayed quick or needed to grow.

## Passive Project Learning Layer

- Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@3f003d2bd26e4b4e73b77950c148ccb010ece90c specify learning start --command quick --format json` when available so passive learning files exist and the current quick task sees relevant shared project memory.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order before broader quick-task context.
- Open only learning detail docs linked from quick-task-relevant index entries.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail document without asking for routine permission.
- Prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@3f003d2bd26e4b4e73b77950c148ccb010ece90c specify learning capture-auto --command quick --format json` when `STATUS.md` already preserves route reasons, false starts, hidden dependencies, validation gaps, or reusable constraints.
- When durable state does not capture the reusable lesson cleanly, update `.specify/memory/learnings/INDEX.md` and a linked detail document with the command, type, summary, and evidence.
- Treat this as passive shared memory, not as a separate user-visible quick-task command.

**This command tier: light.** Auto-capture learnings on resolution only. No review, no signal.


## Codex Project Cognition Advisory Gate

**Crucial First Step**: You MUST use project cognition compass first: run `'C:\Users\11034\.specify\bin\project-cognition.exe' compass --intent implement '--query=$ARGUMENTS' --format json` before repository analysis or implementation. Read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons, `verification_hints`, `followup_surfaces`, and `before_fix_claim`; treat `coverage_diagnostics` as confidence and closeout signals, never as route candidates. Treat `expansion_ref` as a normal continuation path and run `project-cognition expand --id <id> --section <section> --format json` only when coverage state or live evidence requires more map detail. Do not infer final edit scope from `minimal_live_reads` or `first_pass_paths`. Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`. When `compass_state=needs_semantic_intake`, write `semantic_intake` from project vocabulary and rerun compass with `--semantic-intake-file`, or use the advanced `lexicon -> semantic_intake -> query` path when explicit concept decisions are needed. Preserve advanced routing through `'C:\Users\11034\.specify\bin\project-cognition.exe' query --intent implement --query-plan '<query_plan_json>' --format json` for precision cases.
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
- Carry forward the selected capability, minimal reads, validation route, and known risk into quick-task `STATUS.md` before implementation proceeds.


## Codex Leader Gate

When running `sp-quick` in Codex, you are the **leader**, not the concrete implementer.

**Crucial First Step**: You MUST use project cognition compass first: run `'C:\Users\11034\.specify\bin\project-cognition.exe' compass --intent implement '--query=$ARGUMENTS' --format json` before repository analysis or implementation. Read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons, `verification_hints`, `followup_surfaces`, and `before_fix_claim`; treat `coverage_diagnostics` as confidence and closeout signals, never as route candidates. Treat `expansion_ref` as a normal continuation path and run `project-cognition expand --id <id> --section <section> --format json` only when coverage state or live evidence requires more map detail. Do not infer final edit scope from `minimal_live_reads` or `first_pass_paths`. Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`. When `compass_state=needs_semantic_intake`, write `semantic_intake` from project vocabulary and rerun compass with `--semantic-intake-file`, or use the advanced `lexicon -> semantic_intake -> query` path when explicit concept decisions are needed. Preserve advanced routing through `'C:\Users\11034\.specify\bin\project-cognition.exe' query --intent implement --query-plan '<query_plan_json>' --format json` for precision cases.

Before code edits, test edits, or implementation commands:
- Read `.specify/memory/constitution.md` first if it exists.
- Read `STATUS.md` for the active quick-task workspace, or create it if this quick task is new.
- If `understanding_confirmed` is not `true`, present the Understanding Checkpoint and wait for user confirmation before implementation work.
- The user-facing checkpoint must use the Quick Checkpoint card and cover `Issue`, `Target outcome`, `Boundaries`, `Known facts / assumptions`, `Affected surfaces`, `Implementation plan`, `Next action`, `Validation evidence`, and `Stop condition` with concrete details.
- Do not proceed to code edits, broad repository analysis, delegation, or validation commands until `understanding_confirmed: true` is recorded in `STATUS.md`.
- Before choosing the next lane, read `STATUS.md` and any quick-task summary artifacts so resume truth comes from durable state instead of chat narration.
- After understanding is confirmed, define the smallest safe delegated lane or ready batch, and choose the dispatch shape for that batch.
- Dispatch `one-subagent` when one validated `WorkerTaskPacket` or equivalent execution contract preserves quality.
- Dispatch `parallel-subagents` when two or more safe subagent lanes would materially improve throughput.
- Use the current runtime's `native-subagents` path before considering any fallback path.
- If that bar is not met, keep the lane on the leader path until the missing context, constraints, validation target, or handoff expectations are explicit.
- Use the current integration's join point to integrate returned results before choosing the next action.
- Wait for every subagent's structured handoff before accepting the join point, closing the batch, or declaring completion.
- Do not treat an idle subagent as done work; idle without a consumed handoff means the result channel is still unresolved.
- Do not interrupt or shut down subagent work before the handoff has been written or explicitly reported as `BLOCKED` or `NEEDS_CONTEXT`.
- Use `managed-team` only when durable team state is needed beyond one in-session subagent burst.
- Use `subagent-blocked` only when subagent dispatch and the managed team workflow are both unavailable or unsafe.
- When `subagent-blocked` is used, you **MUST** write the concrete blocker reason into `STATUS.md` before escalating or stopping locally.

**Hard rule:** The leader must keep scope control, strategy selection, join-point handling, validation, summary ownership, and `STATUS.md` accuracy while subagent execution is active.

## Process

1. **Scope gate**
   - Read `.specify/memory/constitution.md` first if present. Do not continue until this gate is satisfied.
   - Confirm the task is small but non-trivial.
   - Redirect to `$sp-fast` or `$sp-specify` if the task is outside the quick-task band.

2. **Create lightweight quick-task context**
   - Create or resume an id-based workspace under `.planning/quick/<id>-<slug>/`.
   - Keep quick-task artifacts separate from the main phase/spec workflow.
   - Initialize `STATUS.md` as the recoverable source of truth for the quick task.
   - Rebuild or refresh `.planning/quick/index.json` as a derived management projection when needed.
   - Do not continue into broad repository analysis or implementation planning until this workspace exists and the initial lane or batch is recorded.

3. **Optional pre-execution phases**
   - If `--discuss` is present, clarify assumptions and lock the minimum decisions needed.
   - If `--research` is present, gather focused implementation guidance.

4. **Lightweight planning**
   - Produce only the plan needed to execute this ad-hoc task safely.
   - Keep the work atomic and self-contained.
   - Keep local planning shallow until the Understanding Checkpoint is confirmed and the first subagent batch has been launched.
   - Identify the smallest safe execution lanes and choose the current execution strategy before implementation starts, but do not dispatch until `understanding_confirmed: true` is recorded.
   - For behavior-changing work, bug fixes, and refactors, the first executable lane must produce a failing automated test or failing repro check before production edits begin.
   - Do not write production code until the RED state is captured and recorded in `STATUS.md`.
   - If no reliable automated test surface exists for the touched behavior, bootstrap the smallest viable test surface first. If that bootstrap is no longer a bounded quick-task step, stop and escalate to `$sp-specify`.
   - For bug fixes and regressions, record the current root-cause explanation before implementation starts. If the root cause is not yet known, or if multiple plausible causes are still in play, stop and route to `$sp-debug` instead of applying a quick symptom patch.
   - A `surface-only` or symptom-only change cannot satisfy the quick-task contract for a bug fix unless the user explicitly scoped the work to temporary mitigation.
   - Name the affected surfaces for this quick-task pass and decide how each one will be checked.
   - If multiple safe lanes would materially improve throughput, plan the first fan-out as parallel subagents instead of defaulting to serial execution.
   - If the task includes a propagating change, write the minimal sweep plan first and list the affected surfaces that must be checked before completion.

5. **Execution**
   - Start execution only after `understanding_confirmed: true` is recorded in `STATUS.md`.
   - Execute the current quick-task lane or ready batch through the selected dispatch shape and execution surface.
   - For `one-subagent`, dispatch one subagent once the subagent-readiness bar is satisfied; otherwise finish compiling the missing contract before dispatch. If the contract cannot be made safe, record `subagent-blocked` and stop for escalation or recovery.
   - The first concrete execution action after understanding confirmation should normally be dispatching that subagent batch, not continuing local repository analysis.
   - If multiple subagent lanes are safe and useful, dispatch them in parallel as the current ready batch instead of holding back fan-out without a concrete coordination reason.
   - Keep changes tightly scoped to the quick-task goal.
   - Re-evaluate dispatch at each join point instead of assuming the first choice remains correct.
   - Only use `subagent-blocked` after subagent execution and the native subagent workflow are unavailable or blocked for the current batch, and record the blocked dispatch reason explicitly in `STATUS.md`.
   - Continue automatically until the quick task is complete or a concrete blocker prevents further safe progress.
   - If execution hits friction, attempt the smallest safe recovery step before declaring the task blocked.

6. **Validation**
   - If `--validate` or `--full` is present, perform plan checking and post-execution verification.
   - Otherwise still verify the change with the smallest meaningful executable check.
   - Do not skip verification just because the quick-task scope is small.

7. **Summary**
   - Write a concise summary artifact for what changed, how it was verified, and which surfaces were left unverified.
   - Prefer `SUMMARY.md` in `.planning/quick/<id>-<slug>/`.
   - Separate `verified` coverage from `not checked` coverage so readers can tell what was actually proven versus what is only expected to be safe.
   - For each declared surface, give the terminal status conclusion: `confirmed correct`, `fixed in this quick task`, or `not checked in this pass (with reason)`.
   - Make sure the final `STATUS.md` points to the summary, records the terminal state, and makes a future resume decision obvious.

## Guardrails

- Do not create a new full feature spec for quick tasks.
- Keep quick-task tracking under `.planning/quick/`.
- Preserve a lightweight planning and validation path rather than skipping discipline entirely.
- Keep quick tasks atomic and self-contained.
- Keep leader responsibilities explicit: the leader owns scope, strategy selection, join points, validation, and summary while substantive task work remains packetized for subagent lanes.
- Keep concrete execution on subagent lanes whenever possible. `subagent-blocked` is the final blocked status after recovery options are exhausted, not the default path.
- Quick-task state must be resumable from `STATUS.md` without depending on chat history.

## Codex Quick Execution Routing

When running `sp-quick` in Codex, do not start execution routing until `STATUS.md` exists and `understanding_confirmed: true` is recorded.
- Dispatch shape: `one-subagent`, `parallel-subagents`, or `subagent-blocked`.
- Execution surface: `native-subagents`, `managed-team`, or `leader-inline`.
- Understanding checkpoint: confirm the problem, planned outcome, boundaries, known facts and assumptions, affected surfaces, concrete implementation plan, validation evidence, and stop condition before dispatch.
- Subagent dispatch: Dispatch bounded subagents through `spawn_agent`.
- Integration-native join point: Rejoin with `wait_agent`, integrate, then `close_agent`.
- Fallback path: Use the managed team workflow when subagents are unavailable, low-confidence, or unsuitable.
- Once the first lane is chosen, dispatch it before continuing any leader-inline deep-dive analysis of the repository.
- If multiple safe subagent lanes exist and they materially improve throughput, dispatch them in parallel.
- Keep `.planning/quick/<id>-<slug>/STATUS.md` as the leader-owned source of truth.
- Before compaction-risk transitions or join points, update `STATUS.md` and any summary artifacts needed for clean resume.
- Subagents may return evidence, patches, and verification output, but they must not become the authority for resume state; the leader updates `STATUS.md` before and after each join point.
- Decision order for Codex `sp-quick`: safe packetized subagents -> `managed-team` when durable state is needed -> `subagent-blocked` with reason.
- Prefer subagent execution only when a validated `WorkerTaskPacket` or equivalent execution contract preserves quality.
- Re-check strategy after every join point and continue automatically until the quick task is complete or blocked.

## Codex Subagent Dispatch Contract

- Execution model: `subagents-first`
- Dispatch shape: `one-subagent`, `parallel-subagents`, or `subagent-blocked`
- Execution surface: `native-subagents`, `managed-team`, or `leader-inline`
- Delegation surface contract: preserve the native dispatch, fallback, worker result contract, and handoff path below.
- Native subagent capability discovery: Before recording `subagent-blocked`, confirm the current runtime exposes `spawn_agent`, `wait_agent`, and `close_agent`; if they are not visible, use the active tool discovery mechanism for multi-agent or subagent tools first.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch bounded subagents through `spawn_agent`.
- Join behavior: Rejoin with `wait_agent`, integrate, then `close_agent`.
- Managed-team fallback: Use the managed team workflow when subagents are unavailable, low-confidence, or unsuitable.
- Leader-inline fallback: record the reason before local execution.
- Worker result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result handoff path: .specify/teams/state/results/<request-id>.json

## Codex Subagent Result Contract

- Worker result contract: preserve the shared `WorkerTaskResult` semantics even when the runtime calls lanes subagents.
- Preferred result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result file handoff path: .specify/teams/state/results/<request-id>.json
- Runtime-managed result paths require a dispatch request id; compute the path with `specify result path --command quick --request-id <request-id>` and report final completion through the active runtime-managed result channel for that request id.
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
- If the native tool is unavailable in the current runtime or the tool call fails, use the template's existing concise plain-text clarification or quick-task selection wording.
- In `quick`, use this preference for:
  - lightweight clarification when `--discuss` is active
  - resume selection when multiple unfinished quick tasks exist
- Native tool target: `request_user_input` if the current Codex runtime exposes it
- Question count: 1-3 short questions per call
- Option count: 2-3 options per question
- Required question fields: `header`, `id`, `question`, `options`
- Option fields: `label`, `description`
- Put the recommended option first and suffix its label with `(Recommended)` when that distinction matters.
- Use this native surface for one bounded clarification or selection step; if it is unavailable or too narrow for the needed interaction, fall back immediately to the template's textual question format.

## Codex Quick-Task Subagent Execution

When running `sp-quick` in Codex, start execution routing only after `STATUS.md` exists and `understanding_confirmed: true` is recorded.
- Understanding checkpoint: confirm the problem, planned outcome, boundaries, known facts and assumptions, affected surfaces, concrete implementation plan, validation evidence, and stop condition before dispatch.
- Dispatch `one-subagent` or `parallel-subagents` only after the Understanding Checkpoint is confirmed.
- Use `subagent-blocked` only after native subagents and the managed-team path are unavailable or unsafe, and record the blocker reason in `STATUS.md`.
- Use `spawn_agent` for bounded lanes such as focused repository analysis, targeted implementation, regression test updates, or validation command runs.
- Once the first lane is chosen, dispatch it before continuing any leader-inline deep-dive analysis of the repository.
- If multiple safe subagent lanes exist and they materially improve throughput, dispatch them in parallel.
- Use `wait_agent` only at the documented join point for the current quick-task batch.
- Use `close_agent` after integrating finished subagent results.
- Keep `.planning/quick/<id>-<slug>/STATUS.md` as the leader-owned source of truth.
- Subagents may return evidence, patches, and verification output, but they must not become the authority for resume state; the leader updates `STATUS.md` before and after each join point.
- Decision order for Codex `sp-quick`: safe packetized subagents -> `managed-team` when durable state is needed -> `subagent-blocked` with reason.
- Prefer subagent execution only when a validated `WorkerTaskPacket` or equivalent execution contract preserves quality.
- Re-check strategy after every join point and continue automatically until the quick task is complete or blocked.
