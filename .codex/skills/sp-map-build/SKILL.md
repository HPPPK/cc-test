---
name: "sp-map-build"
description: "Use when `sp-map-scan` has produced a value-weighted evidence baseline and you need to reconstruct the project cognition SQLite runtime."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/map-build.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: A scan baseline exists and the project cognition runtime must be built or rebuilt from that evidence.
- **Primary objective**: Validate value-weighted scan evidence, reconstruct graph nodes, edges, observations, path indexes, and alias indexes from high-value evidence into the schema v2 SQLite cognition database, assign confidence, and publish queryable task-oriented cognition bundles.
- **Primary outputs**: `.specify/project-cognition/status.json`, `.specify/project-cognition/project-cognition.db`, and query/update helper readiness metadata.
- **Default handoff**: Return to the blocked brownfield workflow once the query-backed cognition baseline is ready.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Reconstruct or refresh the query-backed project cognition runtime from a completed evidence baseline.

## Context

- Primary inputs: `.specify/project-cognition/status.json`, `.specify/project-cognition/evidence/`, `.specify/project-cognition/provisional/nodes.json`, `.specify/project-cognition/provisional/edges.json`, `.specify/project-cognition/provisional/observations.json`, and live repository evidence.
- This command owns the query-backed cognition runtime outputs: `.specify/project-cognition/status.json` and `.specify/project-cognition/project-cognition.db`.
- Run `'C:\Users\11034\.specify\bin\project-cognition.exe' build-from-scan --format json` after scan and package validation; it owns DB import, metadata, status publication, and DB/status agreement.
- [AGENT] Treat sparse path-index gates as build preflight; do not publish query-ready status when `validate-build` would fail `path_index_to_included_ratio`, critical path, or important path checks.
- Do not construct `.specify/project-cognition/project-cognition.db` with manual SQL as the normal workflow path.
- If the evidence baseline is incomplete or the accepted evidence cannot support graph reconstruction, produce a scan gap report and return to `sp-map-scan`.
- If scan packet intake exposes contract-invalid, systemic packet-family failures, or `paths_read` values that are not concrete path arrays, preserve the scan gap report and route back to `sp-map-scan`; this is not only a local patch in build.
- Record accepted and rejected reconstruction evidence as DB/runtime update records and queryable task-local bundle readiness metadata. Treat any raw graph or slice files as compatibility/export artifacts, not runtime truth.
- Apply project cognition ignore rules from root `.cognitionignore` and `.specify/project-cognition/.cognitionignore`; rejected paths remain outside graph evidence and DB route indexes even when scan artifacts mention them.
- Validate `repository-universe.json` as the canonical scan boundary before graph reconstruction; excluded paths are boundary facts, not graph evidence.
- If native subagent dispatch is unavailable or a substantive build lane cannot complete, persist `subagent_blocked` in machine-readable state and block baseline activation until recovery. `coverage-ledger.json.open_gaps[]` may use `low_risk_open_gap` only with owner, reason, evidence expectation, and revisit condition.

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

## Objective

Reconstruct or refresh the query-backed project cognition runtime from a completed value-weighted evidence baseline.

## Passive Project Learning Layer

- [AGENT] Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@3f003d2bd26e4b4e73b77950c148ccb010ece90c specify learning start --command map-build --format json` when available so passive learning files exist and repeated graph-build blind spots can be promoted at start.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order before broader graph-build context.
- Open only learning detail docs linked from map-build-relevant index entries.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail markdown document without asking for routine permission.
- [AGENT] When graph reconstruction friction exposes route changes, artifact rewrites, validation gaps, false starts, hidden dependencies, or reusable constraints, make sure `map-state.md` captures that durable context.
- [AGENT] When durable state does not capture the reusable lesson cleanly, update `.specify/memory/learnings/INDEX.md` and a linked detail document with the command, type, summary, and evidence.

## Process

- Start with validation, not writing.
- Update `map-state.md` before long-running reconstruction, join-point acceptance, compaction-risk transitions, or any stop where resume will depend on more than the visible conversation.
- Validate scan inputs before execution and compile/validate `MapBuildPacket` inputs before dispatch.
- Validate both `.specify/project-cognition/workbench/repository-universe.json` and `.specify/project-cognition/workbench/scan-targets.json` before graph import. `repository-universe.json` is full path accounting; `scan-targets.json` is the high-value execution target set.
- Treat `P0`/`P1` `scan_decision=scan` rows as graph-build candidates that must be backed by accepted packet evidence before they can publish queryable runtime truth.
- Treat `P2` rows according to their recorded `scan_decision`: scanned or sampled rows can support graph truth when evidence-backed; inventory-only rows remain boundary accounting.
- Treat `P3`, `inventory_only`, and `excluded` rows as boundary accounting only unless explicit accepted scan evidence and a high-value reason promote them. Do not derive graph, path_index, alias_index, route rows, or `minimal_live_reads` from raw inventory-only rows.
- Dispatch only validated packetized build lanes as `one-subagent` or `parallel-subagents`.
- If overlap, missing packet data, missing required references, or unsafe acceptance criteria prevent safe dispatch, record `subagent-blocked` and stop for escalation or recovery.
- Run `'C:\Users\11034\.specify\bin\project-cognition.exe' validate-scan --format json` before graph import.
- Run `'C:\Users\11034\.specify\bin\project-cognition.exe' build-from-scan --format json` after scan and package validation; this rebuilds the graph store into schema v2 and owns DB import, metadata, status publication, and DB/status agreement.
- If `build-from-scan` returns `status=blocked`, report its `errors`, identity reconciliation details from `identity_reconciliation`, `rejections`, `merge_records`, and `recovery_action` and do not proceed to build validation.
- Run `'C:\Users\11034\.specify\bin\project-cognition.exe' validate-build --format json` after `build-from-scan`.

## Machine-Readable Blocked State

Human workflow prose may say `subagent-blocked`, but persisted machine fields use
`subagent_blocked`.

If a substantive scan/build lane cannot dispatch or complete, write:

- `.specify/project-cognition/status.json` with `baseline_state=blocked` and
  `subagent_blocked` in `stale_reasons` or `dirty_reasons`
- `.specify/project-cognition/workbench/map-state.md` with
  `readiness=blocked`, `blocking_reason=subagent_blocked`, blocked lane ids,
  blocked scope, and recovery condition
- `.specify/project-cognition/workbench/coverage-ledger.json.open_gaps[]` with
  `reason="subagent_blocked"`, `lane_id`, `packet_id`, `blocked_scope`,
  `criticality`, `owner`, `status="blocked"`, and `recovery_condition`

`unknown` blocks, `blocked`, `critical_open_gap`, and `subagent_blocked` block baseline
activation. `low_risk_open_gap` may pass only with owner, reason,
`evidence_expectation`, and `revisit_condition`.

## Hard Boundary

- `sp-map-build` is the command that publishes query-backed cognition truth.
- `sp-map-build` must not fall back to handbook-first runtime output.
- `sp-map-build` owns schema v2 SQLite runtime publication, confidence assignment, route validation, and alias catalog readiness.
- Existing narratives may inform continuity, but final runtime rows must be backed by scan evidence. Map points, code proves: the alias catalog is route vocabulary, not evidence by itself.

## Required Inputs

Before writing query-backed truth, read:

- `.specify/project-cognition/status.json`
- `.specify/project-cognition/evidence/`
- `.specify/project-cognition/provisional/nodes.json`
- `.specify/project-cognition/provisional/edges.json`
- `.specify/project-cognition/provisional/observations.json`
- `.specify/project-cognition/coverage.json`
- `.specify/project-cognition/workbench/repository-universe.json`
- `.specify/project-cognition/workbench/scan-targets.json`
- `.specify/project-cognition/workbench/coverage-ledger.json`
- `.specify/project-cognition/workbench/scan-queue.json`
- `.specify/project-cognition/workbench/handoff-ledger.json`
- `.specify/project-cognition/workbench/scan-packets/`

If those artifacts are missing, stop and route back to `/sp-map-scan`.

## Boundary Acceptance

`sp-map-build` must validate `.specify/project-cognition/workbench/repository-universe.json` and `.specify/project-cognition/workbench/scan-targets.json` before publishing runtime truth.

- Every `included_paths` entry in `repository-universe.json` must have one explicit boundary disposition: `deep_read`, `sampled`, `inventory_only`, `excluded`, or `blocked`.
- For graph-eligible selected paths, every included path is represented in scan coverage or an accepted gap.
- Every `selected_paths` entry in `scan-targets.json` must appear in `coverage.json`, `coverage-ledger.json`, or an accepted non-blocking gap.
- Every `P0` or `P1` row with `scan_decision=scan` must have accepted packet evidence before runtime publication, or the build must return a scan gap report and route back to `sp-map-scan`.
- `P2` rows may be sampled or inventory-only only when `scan-targets.json` records the lower-depth decision and `coverage-ledger.json` preserves the evidence expectation and revisit condition.
- `P3`, `inventory_only`, and `excluded` rows are not missing graph evidence. They are complete only as boundary accounting and must not inflate graph-readiness failure counts.
- Every `excluded_paths` entry must stay only in the boundary artifact or grouped exclusion ledger.
- Excluded paths are represented only by the boundary artifact or grouped accounting ledgers, not by graph-facing coverage rows. Inventory-only paths follow the same boundary-accounting rule unless explicitly promoted.
- Excluded paths must not appear in graph-facing coverage rows, evidence rows, provisional graph rows, DB path indexes, route indexes, alias indexes, or `minimal_live_reads`. Inventory-only paths follow the same rule unless the scan target explicitly promoted them with accepted evidence.
- If repository-universe, scan-targets, coverage, and packet handoffs cannot explain the same selected path universe, return a scan gap report and route back to `sp-map-scan`.
- If scan packet acceptance reports `fail_contract` or `fail_systemic`, route back to `sp-map-scan` with a scan gap report because the repair is not only a local patch.
- `path_index_to_included_ratio` must be computed from graph-eligible paths: selected `P0`/`P1` paths plus evidence-backed selected `P2` paths, minus true exclusions and `accepted_nonblocking_gap_paths`.
- Critical and important graph-eligible paths must remain in the sparse path-index denominator unless they are true repository-universe exclusions or explicitly accepted nonblocking gaps.
- `build-from-scan` must not set `freshness=fresh`, must not set `readiness=query_ready`, and must not set `graph_ready=true` until sparse path-index gates pass.

## Schema V2 Runtime Contract

`project-cognition build-from-scan --format json` archives schema v1 or old broad
schema databases and creates a clean schema v2 database. Schema v2 keeps the
implemented runtime tables: `metadata`, `generations`, `evidence`, `nodes`,
`node_evidence`, `edges`, `edge_evidence`, `observations`,
`observation_evidence`, `path_index`, `alias_index`, and `updates`.

Future semantic tables such as claims, conflicts, symbols, entrypoints, tests, slices, query examples, FTS tables, and compatibility `query_examples` are not current readiness requirements.

For brownfield baselines, `alias_index` is required: every active node must have
at least one active-generation alias row, no alias may point at a missing node,
and no alias may reference a missing non-empty evidence id. The schema v2 alias
catalog helps agents normalize user input before query planning; it does not prove behavior
without live repository evidence.

If validation reports schema v1, an old broad schema, or rebuild-required
readiness, route the user to `sp-map-scan -> sp-map-build`; build-from-scan
archives the v1 DB and creates a clean schema v2 database.
When writing the recommendation in plain text, use: run sp-map-scan -> sp-map-build.

## Path Index Source Contract

build-from-scan creates DB path_index rows from nodes.json `paths`. It does not read `attrs_json.path`, raw node metadata, `repository-universe.json`, `scan-targets.json`, or `coverage.json` as path-index sources.
coverage.json rows without matching node paths are recorded as rejected coverage with reason `no_node_relation`. Inventory-only and excluded rows do not need path_index rows and must not be inserted into nodes solely to satisfy raw path-count coverage. If `validate-build` reports
`active_generation_has_no_path_index_rows`, route back to `sp-map-scan` to repair
node `paths` in the scan package instead of inserting SQL manually.

## Output Contract

The only canonical runtime outputs for this command are:

- `.specify/project-cognition/status.json`
- `.specify/project-cognition/project-cognition.db`
- query/update helper readiness metadata
- join-point `worker-results` evidence for delegated build lanes until the leader accepts the final query-ready baseline
- `.specify/project-cognition/workbench/worker-results/<packet-id>.json`

Do not publish handbook-first runtime truth from this command. Do not publish raw graph JSON artifacts or slices as runtime truth.

## Guardrails

- Do not rebuild the scan from chat memory.
- Do not guess and continue when required scan inputs are incomplete.
- Do not treat raw scan prose or raw Markdown checklist items alone as accepted build evidence.
- Do not accept packet results without inspected paths, evidence, and confidence.
- Do not accept packet results whose `paths_read` is a boolean, summary flag, or anything other than a non-empty array of concrete paths.
- Do not accept read/deep_read packet results whose `evidence_ids` are missing from the scan evidence package or point only to a different `source_path`.
- Do not accept orphan packet results that do not correspond to a `scan-packets/<lane-id>.md` input packet.
- Do not perform a structural-only refresh and call it success.
- Do not accept manual SQL, sqlite shell scripting, hand-picked node subsets, or leader-memory graph reconstruction as normal build paths.
- Do not locally patch around contract-invalid or systemic scan packet failures.
- If the build lane cannot be safely packetized or delegated, record `subagent-blocked` and stop for escalation or recovery.
- If a delegated lane returns unresolved evidence gaps, preserve the scan gap report and stop for escalation or recovery instead of inventing closure.

## Project Cognition Workbench State Protocol

- Project Map State Protocol remains active during build acceptance.
- Validate Scan Inputs Before Execution.
- Compile And Validate MapBuildPacket Inputs.
- Treat `coverage-ledger.json` as the machine-readable row source.
- `MapBuildPacket` is required for delegated build lanes.
- Raw scan prose or raw Markdown checklist items alone are insufficient.
- raw scan prose or raw Markdown checklist items alone
- Packet evidence intake must reject packet results without paths read.
- Packet evidence intake must require `paths_read` to be a non-empty array of concrete paths, not `true` or another summary flag.
- Packet evidence intake must reject packet results that only summarize without evidence.
- Packet evidence intake must reject non-`pass` packet outcomes until the scan lane is repacked, repaired, or recorded as an explicit unresolved gap.
- derived-only evidence is insufficient for final graph acceptance.
- Structural-only refresh is a failed build.
- The build phase is not a scaffold, migration, or file-moving command.
- Treat scan artifacts as inputs, not evidence, until packet evidence is accepted.
- `.specify/**` inputs are workbench/control artifacts, not graph evidence rows.
- DB publication must not write `.specify/**` into `evidence.source_path`, `path_index.path`, or `alias_index` target material.
- Build intake must reject `.cognitionignore`-excluded paths from scan coverage, evidence rows, provisional nodes, provisional edges, observations, packet results, and `repository-universe.json` included paths.
- DB publication must not write `.cognitionignore`-excluded paths into `evidence.source_path`, `path_index.path`, or `alias_index` target material.
- DB publication must not write raw inventory-only paths into `evidence.source_path`, `nodes.paths`, `path_index.path`, `alias_index`, route rows, or `minimal_live_reads` unless the path was promoted by `scan-targets.json` and backed by accepted evidence.

## Build Duties

`sp-map-build` must:

- begins with validation, not writing
- validate scan completeness for graph reconstruction through the value-weighted target set
- validate that `scan-targets.json` selects high-value graph evidence and keeps low-value inventory-only surfaces out of graph publication
- deduplicate provisional nodes into graph nodes
- convert candidate edges into validated graph edges
- build schema v2 `alias_index` rows from alias-ready node titles, types, paths, and bounded attrs
- assign node, edge, observation, path, and alias confidence
- publish queryable task-oriented bundles for downstream agent work
- produce workflow-operational reachability validation
- produce reverse coverage validation
- project graph truth into retrieval outputs by building evidence-backed route rows
- preserve compatibility `query_examples` only as non-readiness route examples when present
- synthesize `concept_candidates` from graph-backed aliases, ownership,
  capabilities, symptoms, generated surfaces, and verification routes
- publish `route_pack` entries that connect selected concepts to owners,
  consumers, affected paths, verification routes, conflicts, and
  `minimal_live_reads`
- do not rebuild the scan from chat memory
- must not guess and continue when required scan inputs are incomplete
- must reject `.cognitionignore`-excluded paths before graph reconstruction; if scan artifacts contain them, return a scan gap report instead of publishing runtime truth
- must reject raw inventory-only paths before graph reconstruction unless they were promoted by `scan-targets.json` and backed by accepted evidence
- maintain a scan gap report when unresolved critical rows remain in the graph-eligible set

The build must keep graph truth projection explicit: every route row that feeds
`concept_candidates`, `query_examples`, or `route_pack` must be evidence-backed,
traceable to accepted scan evidence, and rejectable when confidence, ownership,
or route semantics are weak.

## Consequence Substrate Synthesis

`sp-map-build` must synthesize consequence-analysis substrate from scan evidence so downstream workflows can query dependency impact without rebuilding the map:

- owner edges for files, modules, commands, APIs, templates, generated assets, state files, and verification entry points
- consumer edges for direct callsites, generated-surface propagation, adjacent workflows, user-facing commands, and automation/runtime entry points
- lifecycle/state edges for active actors, running work, queues, sessions, locks, caches, persisted state, cleanup, retry, rollback, and idempotency behavior
- shared-state and destructive-operation edges where close/delete/archive/rename/migrate actions can affect members, consumers, or in-flight work
- verification-route records for the checks that prove owners, consumers, state transitions, and recovery behavior
- known-unknown, stale-route, confidence, and `minimal_live_reads` records that `sp-map-update` can preserve or narrow incrementally

The resulting query-backed runtime must be able to answer which owners, consumers, state surfaces, generated surfaces, and verification routes are implicated by a changed path or requested behavior.

## Required Graph Semantics

Every accepted schema v2 graph build must make room for:

- nodes
- edges
- observations
- path_index
- alias_index
- updates
- queryable task-local bundles

The alias catalog must be route vocabulary backed by `alias_index` rows. It helps
normalize user input into project vocabulary; it is not evidence by itself.

## Dispatch Guidance

- Use `choose_subagent_dispatch(command_name="map-build", snapshot, workload_shape)` before lane execution.
- Dispatch each build lane from a validated `MapBuildPacket`.
- Recommended build lanes include DB normalization, alias readiness review, route validation, and queryable task-local bundle generation.
- The leader owns final graph consistency and readiness state.

## Completion Rule

Before reporting completion:

- run `'C:\Users\11034\.specify\bin\project-cognition.exe' validate-scan --format json` before graph import
- run `'C:\Users\11034\.specify\bin\project-cognition.exe' build-from-scan --format json`; if it returns `status=blocked`, report its `errors`, identity reconciliation details from `identity_reconciliation`, `rejections`, `merge_records`, and `recovery_action`
- run `'C:\Users\11034\.specify\bin\project-cognition.exe' validate-build --format json` after `build-from-scan`
- report completion only after `validate-build` returns `status=ok` and `readiness=query_ready`
- confirm that `.specify/project-cognition/project-cognition.db` was written and can be queried through `'C:\Users\11034\.specify\bin\project-cognition.exe' compass --intent implement '--query=$ARGUMENTS' --format json`. Read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths`, `coverage_diagnostics`, and `before_fix_claim`. Do not infer final edit scope from first-pass reads, and use `project-cognition expand` only when the packet's coverage state or live evidence requires more map detail.
- preserve the advanced `lexicon -> semantic_intake -> query` flow for explicit concept decisions or unresolved coverage. In that escalation, write `semantic_intake` from the alias catalog, select candidates by facet coverage, write `concept_decisions` with `covered_facets`, `missing_facets`, and `match_sources`, carry `lexicon_generation_id`, add `repository_search_terms`, and run `'C:\Users\11034\.specify\bin\project-cognition.exe' query --intent implement --query-plan '<query_plan_json>' --format json`. Agent-owned semantic normalization is mandatory: raw lexicon ranking and `agent_normalization` are only bootstrap signals, not route decisions. If `agent_normalization.required=true`, every raw candidate is `score=0`, or the prompt is localized, mixed-language, CJK, colloquial, symptom-first, or mixed-language or CJK text, extract embedded project terms and write `semantic_intake` from the alias catalog before selecting or rejecting concepts. If `agent_normalization` is omitted, treat it as `required=false`; CJK or mixed CJK/ASCII input still requires agent normalization even when positive raw lexical matches exist because embedded project tokens do not translate the surrounding user language. The agent still owns translation; `agent_normalization` is advisory guidance, not a route decision. (raw lexicon ranking is only a bootstrap; action: write_semantic_intake_from_alias_catalog) Derive project-language search terms from the alias catalog before source search. Do not search only the raw user words; include component names, state names, file names, command names, UI labels, and route names from candidates, aliases, matched_terms, colloquial_matches, returned paths, `normalized_query`, and `expanded_queries`. Use these project-language search terms before broad repository search
- if `validate-build` returns `status=blocked`, report the specific DB, schema, active generation, status, or smoke-query error and do not mark the baseline fresh
- confirm that `status.json` reflects a query-ready baseline
- confirm that the runtime remains query-backed and does not advertise raw graph JSON or handbook-first outputs as runtime truth
- report whether follow-on localized maintenance should continue through `map-update` for future touched-area drift
- every `critical` row is covered by active runtime path and route indexes
- every `important` row is reachable through active runtime path and route indexes when graph-eligible
- every `P0`/`P1` row with `scan_decision=scan` is covered by accepted evidence and active runtime path or route indexes
- every `P3`, `inventory_only`, or `excluded` row remains out of graph-facing runtime outputs unless explicitly promoted with accepted evidence
- every scan packet is consumed
- every accepted packet result has paths read and confidence
- every runtime node, edge, observation, path row, and alias row is backed by accepted packet evidence where the row requires evidence
- query bundle and route reachability are validated through runtime query surfaces
- no final report claims success for a structural-only refresh
- `map_state_file` records accepted packet results
- owner, consumer, change propagation, and verification routes remain explicit
- known unknowns or known-unknowns remain visible
- the excluded bucket has a reason and revisit condition
- every critical shared surface can be discovered through runtime query surfaces
- every key verification entry point can be located through runtime query surfaces
- required_reads contain only reference-only or hard-excluded exceptions when runtime compatibility outputs are mentioned

## Codex Map Subagent Capability Discovery

- Execution model: preserve the workflow's existing `subagent-mandatory`, `subagents-first`, `adaptive`, or `subagent-assisted` policy.
- Dispatch shape: preserve the workflow's existing dispatch shape; use `subagent-blocked` only after the discovery step below fails or is unsafe.
- Execution surface: prefer `native-subagents` when the current runtime supports it; use `none` only after recording the unavailable or unsafe surface.
- Native subagent capability discovery: Before recording `subagent-blocked`, confirm the current runtime exposes `spawn_agent`, `wait_agent`, and `close_agent`; if they are not visible, use the active tool discovery mechanism for multi-agent or subagent tools first.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch bounded subagents through `spawn_agent`.
- Join behavior: Rejoin with `wait_agent`, integrate, then `close_agent`.
- Keep map packet/result schemas from this workflow authoritative; do not substitute implementation `WorkerTaskResult` fields for map scan/build/update packet contracts.

## Codex Subagents-First Dispatch

When running `sp-map-build` in Codex, use the subagents-first dispatch model.
- Use `spawn_agent` for bounded lanes when `dispatch_shape` is `one-subagent` or `parallel-subagents`.
- Launch all independent lanes in the current `parallel-subagents` wave before waiting.
- Use `leader-inline-fallback` only after recording why Codex native subagents are unavailable or unsafe.
- Suggested bounded atlas synthesis lanes include root architecture/structure, conventions/testing, integrations/runtime, and workflow/operations mapping.
- Use the scan package as the subagent input contract; do not let subagents invent unscanned coverage or skip reverse coverage checks.
- Use `wait_agent` only at the documented join points before writing compatibility/export outputs such as `PROJECT-HANDBOOK.md`, before updating project cognition workbench outputs, and before the final packet evidence and consistency pass.
- Use `close_agent` after integrating finished subagent results.
