---
name: "sp-map-scan"
description: "Use when a brownfield workflow needs a fresh graph-native cognition baseline and you must collect full project-internal evidence before graph reconstruction."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/map-scan.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: A workflow needs reliable brownfield cognition and no graph-native baseline exists yet, or a full baseline rebuild is explicitly required.
- **Primary objective**: Enumerate the full project file universe cheaply, classify file value, deep-scan the highest-value project evidence, build provisional nodes and candidate edges, and publish the scan artifacts required for graph reconstruction.
- **Primary outputs**: `.specify/project-cognition/status.json`, `.specify/project-cognition/evidence/`, `.specify/project-cognition/provisional/nodes.json`, `.specify/project-cognition/provisional/edges.json`, `.specify/project-cognition/provisional/observations.json`, `.specify/project-cognition/coverage.json`, `.specify/project-cognition/workbench/repository-universe.json`, `.specify/project-cognition/workbench/scan-targets.json`, `.specify/project-cognition/workbench/coverage-ledger.*`, `.specify/project-cognition/workbench/scan-queue.json`, `.specify/project-cognition/workbench/handoff-ledger.json`, and `.specify/project-cognition/workbench/map-state.md`.
- **Default handoff**: $sp-map-build after the evidence baseline is complete and the scan outputs are ready for graph reconstruction.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Generate a complete graph-native evidence baseline for the current codebase.

## Context

- Primary inputs: git-baseline diff data when available, live repository surfaces, existing reference artifacts, passive learning files as read-only workflow guidance, not scan evidence, and optional focus hints from `$ARGUMENTS`.
- This command owns graph-native evidence-baseline outputs only; it must not write final cognition truth.
- Legacy atlas artifacts such as `PROJECT-HANDBOOK.md` may be read only when explicitly relevant to migration or export parity; they must not become scan targets.
- `.specify/**` is workflow/runtime state, not project graph evidence; `.specify/**` paths may be read only for command operation or validation and must not become scan targets or graph paths.
- Resolve the candidate scan set through `project-cognition scan-set` before repository inventory, evidence, coverage, or packet scope. The runtime applies project cognition ignore rules from root `.cognitionignore` and `.specify/project-cognition/.cognitionignore`, built-in low-signal exclusions, binary-file suppression, and obvious secret-path suppression. These rules are for project cognition only.
- Before subagent dispatch, write the canonical boundary in `.specify/project-cognition/workbench/repository-universe.json` from the resolved scan-set file; do not substitute raw `rg --files`, broad directory globs, or free-form agent judgment about what to omit.
- [AGENT] Treat `scan-queue.json` and `handoff-ledger.json` as required scan workbench artifacts before `validate-scan`.
- Stage the canonical boundary artifact before dispatch, then accept scan packets only after the leader verifies packet-local ledger accounting for every assigned path and a `worker-results/<packet-id>.json` handoff whose `paths_read` is a non-empty concrete path array.
- Machine contract: each `worker-results/<packet-id>.json` handoff must put the packet-local ledger in top-level `ledger` with `todo`, `doing`, `done`, `blocked`, and `overflow`; do not write `packet_local_ledger`, `packet-local-ledger`, or Markdown-only ledger sections.
- Treat `.cognitionignore` and `scan-set` runtime exclusions as boundary sources recorded in `decision_source`; excluded paths stay in boundary accounting and out of graph-facing coverage.
- The resulting evidence baseline must let `sp-map-build` reconstruct the project cognition graph from live-surface evidence without inventing scan scope.
- Maintain `.specify/project-cognition/status.json` as the baseline state surface for graph-native cognition readiness.
- If native subagent dispatch is unavailable or a substantive scan lane cannot complete, persist `subagent_blocked` in machine-readable state and block baseline activation until recovery. `coverage-ledger.json.open_gaps[]` may use `low_risk_open_gap` only with owner, reason, evidence expectation, and revisit condition.

## Ignore Configuration Gate

- Before repository inventory, run:

```text
'C:\Users\11034\.specify\bin\project-cognition.exe' generate-ignore --format json
```

- If the command returns `status=created`, review `.specify/project-cognition/.cognitionignore` with the user and wait for confirmation before continuing to inventory, packet dispatch, or writing `repository-universe.json`.
- Treat commented starter suggestions as inactive. They are review prompts, not exclusions, until the user removes the comment marker.
- Preserve root `.cognitionignore` and existing `.specify/project-cognition/.cognitionignore` content; `generate-ignore` must not overwrite an existing ignore file.

After the ignore gate is clear, resolve the agent-facing candidate file list:

```text
'C:\Users\11034\.specify\bin\project-cognition.exe' scan-set --out .specify/project-cognition/tmp/scan-files.json --format json
```

- Default stdout is compact JSON containing only the scan-set file path and count.
- The handoff file is a temporary agent-facing scan-set containing only `files`.
- If focus hints from `$ARGUMENTS` intentionally narrow the scan, pass them as concrete repeated `--scope` values and rerun `scan-set`; do not narrow by deleting paths from the resolved file manually.

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

## Process

- Before repository inventory, run `project-cognition generate-ignore --format json`. If it creates `.specify/project-cognition/.cognitionignore`, ask the user to review the starter suggestions and wait for confirmation before continuing.
- After the ignore gate is clear, run `project-cognition scan-set --out .specify/project-cognition/tmp/scan-files.json --format json` and use the returned file list as the candidate scan set. The agent may choose scan intent and concrete `--scope` values, but `project-cognition scan-set` decides the initial included file list through deterministic runtime rules; do not let the agent freely decide which files to omit.
- Build a value-weighted evidence baseline before any graph reconstruction work begins.
- First spread out the resolved scan set as a cheap inventory pass: enumerate paths, metadata, runtime exclusion status, Git tracking status, size, extension, directory family, and likely generated/vendor/test/doc/config/source classification without deep-reading file contents.
- Classify every non-excluded candidate path by value tier before dispatch: `P0` core behavior and entry surfaces, `P1` supporting contracts and runtime/config surfaces, `P2` selective tests/docs/examples, and `P3` low-signal generated/vendor/assets/cache/static output.
- Deep-scan `P0` and `P1` first. Use `P2` selectively when it proves behavior, verification, or public contracts. Keep `P3` as inventory-only or excluded unless the user explicitly asks for that surface or it is the only evidence for a critical behavior.
- Write `.specify/project-cognition/workbench/scan-targets.json` after classification and before dispatch. It is the leader-owned execution target list derived from `repository-universe.json`.
- Dispatch each bounded scan lane only from a validated `MapScanPacket`.
- Wait for every dispatched lane's structured handoff before accepting scan coverage.
- If a safe scan lane cannot be packetized or delegated, record `subagent-blocked` and stop for escalation or recovery.

## Value-Weighted Repository Inventory

`sp-map-scan` must inventory all candidate paths from the runtime-resolved scan
set, but it must not deep-read all files by default. The first pass is a
path-level accounting pass, not a content scan.

Write `.specify/project-cognition/workbench/repository-universe.json` with one
row per candidate path from `.specify/project-cognition/tmp/scan-files.json`.
Runtime-excluded paths may be recorded only in boundary accounting when the
runtime exposes them through a debug/explain path; the default agent-facing
scan-set handoff intentionally contains only included files. Each included or
ambiguous row should record:

- `path`: repository-relative path
- `path_kind`: `source`, `test`, `config`, `script`, `doc`, `template`, `asset`, `generated`, `vendor`, `build_output`, `lockfile`, `unknown`
- `extension`
- `size_bytes`
- `directory_family`
- `git_tracked`
- `ignored_by_cognition`
- `matched_ignore_rule` when applicable
- `value_tier`: `P0`, `P1`, `P2`, or `P3`
- `scan_decision`: `scan`, `sample`, `inventory_only`, `exclude`, or `blocked`
- `disposition`: existing boundary disposition: `deep_read`, `sampled`, `inventory_only`, `excluded`, or `blocked`
- `criticality`: `critical`, `important`, or `low_risk`
- `classification_reasons`
- `decision_source`

Value tier rules:

- `P0`: application/runtime entrypoints, CLI commands, routes/controllers,
  public APIs, core services, state machines, data flow owners, protocol
  boundaries, security/auth/payment/destructive-operation surfaces, generated
  source templates that affect downstream behavior, and primary user workflows.
- `P1`: package/build/config manifests, CI/release scripts, migrations/schemas,
  adapter boundaries, feature gates, runtime wiring, verification entrypoints,
  and docs that define behavior or operator contracts.
- `P2`: tests, examples, secondary docs, story/demo files, and usage samples.
  Scan them when they prove behavior, expected contracts, or verification
  reachability; otherwise sample or inventory them.
- `P3`: vendored dependencies, generated bundles, cache/build/dist output,
  binary/static assets, lockfiles that do not define behavior beyond dependency
  identity, archived material, and large low-signal files. Keep these as
  `inventory_only` or `excluded` unless explicitly needed.

Write `.specify/project-cognition/workbench/scan-targets.json` with the subset
selected for packet dispatch. It must include:

- `schema_version`
- `selection_policy: "value_weighted"`
- `selected_paths`
- `sampled_paths`
- `inventory_only_paths`
- `excluded_paths`
- `blocked_paths`
- per-path `value_tier`, `scan_decision`, `disposition`, `criticality`, and
  `classification_reasons`

High-value coverage is more important than raw path-count coverage. A scan can
validly leave many `P3` paths inventory-only, but it must not leave unexplained
`P0` or `P1` gaps.

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

## Passive Project Learning Layer

- [AGENT] Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@3f003d2bd26e4b4e73b77950c148ccb010ece90c specify learning start --command map-scan --format json` when available so passive learning files exist and repeated cognition-runtime scan blind spots can be promoted at start.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order before broader scan context.
- Passive learning files are workflow guidance, not scan evidence.
- `.specify/**` must never enter the project cognition graph.
- `.specify/memory/**` must not appear in repository-universe, coverage-ledger, evidence rows, provisional nodes, provisional edges, observations, path_index, or alias_index.
- Open only learning detail docs linked from map-scan-relevant index entries.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail markdown document without asking for routine permission.
- [AGENT] When scan friction exposes route changes, artifact rewrites, false starts, hidden dependencies, validation gaps, or reusable constraints, make sure `map-state.md` captures that durable context.
- [AGENT] When durable state does not capture the reusable lesson cleanly, update `.specify/memory/learnings/INDEX.md` and a linked detail document with the command, type, summary, and evidence.

## Hard Boundary

- `sp-map-scan` must not publish final cognition truth.
- `sp-map-scan` must not claim the baseline is graph-ready.
- `sp-map-scan` must produce evidence, provisional nodes, provisional edges, observations, and coverage diagnostics only.
- `sp-map-scan` may classify evidence and derive provisional structure, but `sp-map-build` owns schema v2 graph-store publication, confidence assignment, route validation, and alias catalog readiness.

## Output Contract

The only canonical outputs for this command are:

- `.specify/project-cognition/status.json`
- `.specify/project-cognition/evidence/`
- `.specify/project-cognition/provisional/nodes.json`
- `.specify/project-cognition/provisional/edges.json`
- `.specify/project-cognition/provisional/observations.json`
- `.specify/project-cognition/coverage.json`
- `.specify/project-cognition/workbench/map-scan.md`
- `.specify/project-cognition/workbench/coverage-ledger.md`
- `.specify/project-cognition/workbench/coverage-ledger.json`
- `.specify/project-cognition/workbench/scan-queue.json`
- `.specify/project-cognition/workbench/handoff-ledger.json`
- `.specify/project-cognition/workbench/scan-packets/<lane-id>.md`
- `.specify/project-cognition/workbench/worker-results/<packet-id>.json`
- `.specify/project-cognition/workbench/map-state.md`
- `.specify/project-cognition/workbench/repository-universe.json`
- `.specify/project-cognition/workbench/scan-targets.json`
- `.specify/project-cognition/workbench/capability-ledger.json`
- `.specify/project-cognition/workbench/control-ledger.json`
- refresh-workbench `coverage-ledger` artifacts that summarize scan coverage for follow-on build validation
- `map-state.md` as the scan-stage workbench state surface

Do not create handbook-first brownfield truth, alternate mapping trees, or canonical runtime documents during `sp-map-scan`.

## Machine-Readable Scan Artifact Schema

Write canonical JSON fields, not agent-local aliases. The runtime accepts a few
legacy aliases for compatibility, but new scan packets must emit the canonical
shape below so `sp-map-build` can reconstruct the graph without manual repair.

`provisional/nodes.json` must contain a top-level `nodes` array. Each node row
uses:

- `id`: stable node identity. Do not write placeholder values such as `NO_ID`.
- `type`: node class such as `capability`, `module`, `file`, `page`, `command`, `test`, or `state`.
- `title`: human-readable node title.
- `paths`: concrete repository file paths owned or represented by this node. build-from-scan creates path_index rows only from nodes[].paths.
- `confidence`: `verified`, `high`, `medium`, `low`, or `provisional`.
- `evidence_ids`: evidence row IDs that justify the node.
- `attrs`: optional object for secondary metadata.

Emit alias-ready node material for schema v2. `nodes[].title`, `nodes[].type`,
`nodes[].paths`, and `nodes[].attrs.aliases`, `domain`, `owner`, `workflow`,
`route`, `route_hints`, and `verification_hints` feed the `alias_index` during
`sp-map-build`. This creates the alias catalog used to normalize user input
before query planning. Do not write raw observation summaries as aliases.
Observations may support bounded observation tags only when tied to graph
evidence. If validation reports schema v1 or rebuild-required readiness, run
sp-map-scan -> sp-map-build so build-from-scan can publish schema v2 alias
catalog rows.
When writing the recommendation in plain text, use: run sp-map-scan -> sp-map-build.

Compatibility aliases accepted by the runtime are `node_id` for `id`, `kind` for
`type`, `label` or `name` for `title`, and `attrs_json` for `attrs`. These are
fallbacks only; do not use them in newly generated scan artifacts.

`provisional/edges.json` must contain a top-level `edges` array. Each edge row
uses `id`, `type`, `source_id`, `target_id`, `confidence`, `evidence_ids`, and
optional `attrs`. `source_id` and `target_id` should reference node IDs. The
runtime can resolve a file path endpoint to a node only when exactly one node
lists that path in `nodes[].paths`. Compatibility aliases accepted by the
runtime are `source`, `target`, `source_node_id`, `target_node_id`, `kind`, and
`attrs_json`.

`provisional/observations.json` must contain a top-level `observations` array.
Each row uses `id`, `observation_type`, `summary`, `evidence_ids`, and optional
`attrs`. string observations are accepted only as compatibility input and are normalized as `observation_type: note`; new scan artifacts must write objects.

`coverage.json` must contain a top-level `rows` array with `path` values for
coverage accounting. Compatibility input may use a top-level `coverage` array,
but new scan artifacts must write `rows`; do not maintain separate `rows` and
`coverage` lists that can drift. coverage.json does not create path_index rows by itself; every queryable path must also appear in at least one node's `paths` array.

## Guardrails

- Do not publish final cognition truth from this command.
- Do not treat raw inventory notes or raw chat summaries as accepted scan results.
- Do not silently downgrade unknown or unclassified project-relevant surfaces.
- `.specify/**` workflow/runtime state is excluded from default source/runtime scan targets; do not put `.specify/**` paths into project graph evidence, nodes, observations, path_index, or alias_index.
- Only read `.specify/**` for workflow operation, validation, migration, or when the requested scan is explicitly about generated workflow surfaces or spec-kit-plus itself; even then, classify it as workflow/reference support rather than source/runtime graph truth.
- Respect project cognition ignore rules from root `.cognitionignore` and `.specify/project-cognition/.cognitionignore`. These files use gitignore-compatible syntax, including comments, directory patterns, globs, `**`, and `!` re-includes.
- `.cognitionignore` excludes project cognition scan/build/update targets only; it does not replace `.gitignore` or prove that ignored code is irrelevant to other tooling.
- If the required scan lane cannot be safely packetized or delegated, record `subagent-blocked` and stop for escalation or recovery.

## Project Cognition Workbench State Protocol

- `MAP_STATE_FILE=.specify/project-cognition/workbench/map-state.md`
- Treat `.specify/project-cognition/workbench/map-state.md` as the refresh-workbench state surface for scan progress, accepted packets, and unresolved gaps.
- `scan-queue.json` is the leader-owned scheduler queue. Every `scan-packets/<packet-id>.md` file must have exactly one queue row.
- `scan-targets.json` is the leader-owned value-weighted target set. Every scan packet must draw concrete `assigned_paths` from `scan-targets.json`, not from broad directory globs or unclassified path lists.
- `handoff-ledger.json` records every dispatch and return event. Every `worker-results/<packet-id>.json` file must have a matching queue row and return event.
- The leader loop is: leader receives worker result, leader reads durable scan state, leader validates handoff quality, leader updates queue, coverage, and handoff ledgers, leader plans next packets, and leader dispatches the next bounded wave.
- Worker packet acceptance is separate from path coverage outcome. If a packet exceeds budget, the worker returns `acceptance=fail_gap`, marks affected paths as `coverage[].outcome="overflow"`, and includes split recommendations.
- Do not create huge mixed-value packets. Target packet size should be small enough for the worker to read and account for every path concretely. Prefer 25-75 paths for `P0`/`P1` code lanes, use a hard cap of 150 paths for any one packet, and split large directories by behavior owner, entrypoint family, or dependency boundary.
- A timed-out or overflowed `P0`/`P1` packet must be split and retried before it can become an accepted gap. Only low-risk `P3` or justified `P2` paths may become accepted nonblocking inventory gaps.
- New worker results must write top-level `acceptance`. Top-level `outcome` is a legacy alias only and must not appear in generated worker prompt examples.
- `worker-results/<packet-id>.json` must write the packet-local ledger as top-level `ledger`, not `packet_local_ledger`, `packet-local-ledger`, scan-packet Markdown sections, or inline JSON inside `scan-packets/*.md`.
- `accepted_nonblocking_gap_paths` contains only low-risk paths with owner, reason, evidence expectation, revisit condition, and `low_risk_open_gap` status.
- Scan packets are executable read instructions, not final truth documents.
- `MapScanPacket` is the required packet contract for each delegated scan lane.
- Each packet must declare `mode: read_only` and a `result_handoff_path`.
- Each `result_handoff_path` must point to `.specify/project-cognition/workbench/worker-results/<packet-id>.json`.
- Every `scan-packets/<lane-id>.md` file must have exactly one matching `worker-results/<lane-id>.json` handoff, and worker results without a matching scan packet are invalid.
- Worker result handoffs are the machine-checkable evidence surface for packet acceptance.
- Use `project-cognition scan-set` for inventory discovery before escalating to deeper reads. `rg --files` may support diagnostics, but it must not replace the runtime-resolved scan set.
- Treat Git-tracked file lists and user-provided scan hints as metadata or `scan-set --scope` inputs; they must not become scan targets until `project-cognition scan-set` returns them in `.specify/project-cognition/tmp/scan-files.json`.
- Raw inventory notes or raw chat summaries are not sufficient.
- Idle subagent output is not an accepted scan result.
- The leader must wait for every dispatched scan lane to return a structured handoff before closing the scan stage.
- Even when freshness is `fresh`, `sp-map-scan` still reasons from the git baseline diff before deciding whether the refresh workbench needs new coverage.
- Reference-only material is a live surface only for refresh-workbench validation; it must not become a scan target by default.

## Canonical Boundary Contract

- `.specify/project-cognition/workbench/repository-universe.json` is the canonical boundary artifact derived from the runtime-resolved scan set.
- It must include `schema_version`, `candidate_universe`, `included_paths`, `excluded_paths`, `ambiguous_paths`, `dispositions`, `criticality`, `value_tier`, `scan_decision`, `path_kind`, `classification_reasons`, and `decision_source`.
- Every candidate path must receive exactly one disposition: `deep_read`, `sampled`, `inventory_only`, `excluded`, or `blocked`.
- Disposition is separate from criticality; value tier adds another classification axis. Value tier remains `P0`, `P1`, `P2`, or `P3`; criticality remains `critical`, `important`, or `low_risk`.
- `scan_decision` is the execution intent derived from value tier and disposition. Use `scan` for deep-read packets, `sample` for sampled proof, `inventory_only` for accounted low-value surfaces, `exclude` for boundary exclusions, and `blocked` when no safe decision can be made.
- sampled and inventory_only are not free-form convenience labels; they must align with the recorded disposition and criticality in `repository-universe.json`.
- Critical entrypoints, shared state, configuration, tests, verification surfaces, generated-surface propagation chains, and any `P0`/`P1` path should not pass as `sampled` or `inventory_only` unless the boundary artifact already records an explicit accepted gap or an equally explicit lower-depth decision.
- `sampled` and `inventory_only` are acceptable only when the disposition and criticality together justify them, with value tier confirming the lower-depth decision.
- Excluded paths must not appear in graph-facing `coverage.json` rows, evidence rows, provisional nodes, provisional edges, observations, path indexes, route indexes, alias indexes, or `minimal_live_reads`.
- `MapScanPacket` must include bounded `assigned_paths`.
- `assigned_paths`, queue rows, worker `paths_read`, and worker coverage paths must be concrete repository file paths enumerated from `repository-universe.json`; globs such as `JZWinReNew/*.cpp`, directory patterns, absolute paths, and summary labels are invalid.
- Each packet carries a packet-local task ledger in the worker result JSON top-level `ledger` object with `todo`, `doing`, `done`, `blocked`, and `overflow`.
- Each accepted worker result must repeat `assigned_paths`, include `paths_read` as a non-empty array of concrete repository paths, include packet-local `coverage` rows for the final outcome of each assigned path, and include confidence.
- Minimal accepted worker result JSON shape:
  `{"packet_id":"lane-1","family_id":"app","assigned_paths":["src/app.go"],"paths_read":["src/app.go"],"ledger":{"todo":[],"doing":[],"done":["src/app.go"],"blocked":[],"overflow":[]},"coverage":[{"path":"src/app.go","outcome":"read","evidence_ids":["E-001"]}],"confidence":"high","acceptance":"pass"}`
- `paths_read: true`, summary-only read claims, and boolean read flags are invalid.
- `read` and `deep_read` outcomes must reference existing `evidence_ids`, and at least one referenced evidence row must have `source_path` equal to the covered path.
- Subagents must account for every assigned path with evidence, `sampled`, `inventory_only`, `excluded`, `blocked`, or `overflow`.
- A top-level `coverage.json` or `coverage-ledger.json` row is not proof that a path was scanned. Before accepting a packet or closing the scan, compute `included_paths - assigned_paths - accepted_nonblocking_gap_paths`; any non-empty set blocks completion. For accepted packets, every assigned path must also have a packet-local worker `coverage[]` outcome.
- If assigned paths do not fit in context, the subagent must return `acceptance=fail_gap`, mark path-level `coverage[].outcome="overflow"` or `coverage[].outcome="blocked"`, and include split or recovery recommendations; the leader records queue state `overflow` or `blocked`.
- For `P0`/`P1` overflow, the leader must split and redispatch a smaller packet before closing the scan. Do not mark a high-value overflow as accepted nonblocking coverage.
- Leader acceptance has two gates: a coverage gate that requires every assigned path to have a declared outcome, and a quality gate that rejects summary-only or inconsistent evidence.
- The leader may classify packet failure as `fail_gap`, `fail_quality`, `fail_contract`, or `fail_systemic`.
- `fail_quality` must return a machine-checkable repack subset naming at least one of `paths[]`, `claim_ids[]`, `coverage_row_ids[]`, or `evidence_ids[]`; otherwise treat it as `fail_contract`.
- Any acceptance value other than `pass` blocks scan acceptance until the leader repacks, repairs, or explicitly records the unresolved gap.
- `fail_contract` and `fail_systemic` do not use local patch-only redispatch; repair the packet schema/boundary or repack the affected packet family.

## Scan Duties

`sp-map-scan` must:

- enumerate project-internal evidence comprehensively as value-weighted repository inventory, then scan evidence selectively by value
- generate a full project-relevant inventory from the runtime-resolved scan set across nested directories, then add Git tracking status and directory metadata during classification
- write `.specify/project-cognition/workbench/repository-universe.json` with `included_paths` and any available `excluded_paths`; default `scan-set` output is intentionally minimal and does not require per-path exclusion details unless an explicit explain/debug mode was used
- write `.specify/project-cognition/workbench/scan-targets.json` with the value-weighted execution target set
- classify project-relevant repository surfaces
- gather evidence first from high-value committed source, runtime entrypoints, tests that prove behavior, scripts, configs, docs that define behavior, templates, generated-surface sources, and `.git` history
- construct provisional nodes and candidate edges
- record uncertainty, blockers, and missing evidence explicitly
- stay graph-native from the start rather than staging a handbook-first atlas
- current-runtime native subagents are the default execution surface for scan lanes
- scan packets are executable read instructions and must still execute the packet reads before the leader accepts atlas evidence
- every project-relevant row is categorized with value tiers and coverage classes such as `P0`, `P1`, `P2`, `P3`, `inventory`, `sampled`, `deep-read`, `critical`, `important`, and `low-risk`
- `unknown` is a scan failure
- maintain `excluded_from_deep_read` reasoning for `vendor-cache-build-output` and similar excluded roots
- The runtime-resolved scan set is the primary inventory boundary; Git-tracked files and Git tracking status are classification metadata unless the scan explicitly records why untracked evidence matters.
- `.cognitionignore`-excluded paths must not appear in coverage rows, evidence rows, provisional nodes, provisional edges, observations, or scan packets unless a later `!` rule re-includes the path.

## Coverage Classification

- Coverage classification must explain why each surface is `inventory`, `sampled`, `deep-read`, `critical`, `important`, or `low-risk`.
- Every project-relevant row is categorized before the scan can report completion.

## Criticality Scoring

- Criticality scoring must explain why a surface escalates toward `critical` or can stay `low-risk`.
- Atlas evidence should prioritize owner, consumer, change propagation, and verification reachability for higher-criticality rows.

## Required Evidence Coverage

The scan must cover:

- project shape and stack
- architecture overview
- directory ownership
- module dependency graph
- core code elements
- entry and api surfaces
- data and state flows
- user and maintainer workflows
- integrations and protocol boundaries
- build, release, and runtime
- testing and verification
- risk, security, observability, and evolution
- template and generated-surface propagation
- coverage reverse index
- layer 1 retrieval inputs
- source and symbol surfaces
- module and ownership surfaces
- capability and workflow surfaces
- state and handoff surfaces
- verification surfaces
- risk and fragility surfaces
- high-value `.git` evolution surfaces

## Consequence Substrate Evidence

During the first baseline scan and rare full rebuilds, scan packets must collect the evidence that lets later workflows reason like a long-term project maintainer:

- ownership evidence for files, modules, commands, APIs, generated assets, and workflow state
- upstream and downstream consumers, including generated-surface propagation and adjacent workflow dependencies
- lifecycle and state surfaces, including active/running actors, queues, sessions, locks, caches, persisted state, and cleanup paths
- shared mutable state and destructive-operation surfaces where close/delete/archive/rename/migrate behavior can affect other work
- compatibility, migration, rollback, retry, idempotency, and observability evidence
- verification routes that prove affected owners, consumers, state transitions, and recovery paths
- confidence notes, conflicts, known unknowns, and minimal live reads needed when later `sp-map-update` cannot fully prove an edge from existing evidence

If project-relevant evidence cannot be classified, the scan must remain blocked instead of silently downgrading the gap.

## Dispatch Guidance

- Use `choose_subagent_dispatch(command_name="map-scan", snapshot, workload_shape)` before broad work begins.
- Dispatch each scan lane from a validated `MapScanPacket`.
- Recommended scan lanes include source/symbol discovery, module boundaries, capability flows, state surfaces, build/test/runtime surfaces, and git evolution surfaces.
- Every lane must return inspected paths, evidence harvested, confidence notes, and provisional structure updates.
- Must wait for every dispatched scan lane and consume its structured handoff before the scan closes.

## Layer 1 Route Material

- Generate layer 1 retrieval source material before the build phase begins.
- Produce task route candidates.
- Produce symptom route candidates.
- Produce shared-surface hotspot candidates.
- Produce verification route candidates.
- Produce propagation-risk route candidates.

## Concept Retrieval Signal Evidence

- Collect concept retrieval signals that let `project-cognition lexicon` surface
  useful `concept_candidates` instead of only path or symbol matches.
- Record colloquial user phrases, aliases, shorthand, command names, workflow
  names, symptoms, and domain vocabulary that maintainers naturally use when
  asking for work.
- Record these signals so downstream agent-owned semantic normalization can
  extract embedded project terms when raw lexicon ranking and
  `agent_normalization` are only bootstrap signals, all candidates are
  `score=0`, or user prompts are localized, mixed-language, CJK, colloquial,
  symptom-first, or mixed-language or CJK text. If
  `agent_normalization.required=true`, treat it as a non-intelligent CLI
  reminder to write `semantic_intake` from the alias catalog (action:
  write_semantic_intake_from_alias_catalog). If `agent_normalization` is
  omitted, treat it as `required=false`; omission does not make raw lexical
  ranking authoritative. CJK or mixed CJK/ASCII input still requires agent
  normalization even when positive raw lexical matches exist because embedded
  project tokens do not translate the surrounding user language. The agent still
  owns translation; `agent_normalization` is advisory guidance, not a route
  decision.
- Attach domain ownership evidence to each retrieval signal, including owning
  paths, modules, generated surfaces, workflow artifacts, tests, and supporting
  evidence rows.
- Preserve conflicts, weak ownership, and unknown mappings as scan evidence for
  `sp-map-build` rather than flattening them into accepted keywords.

## Truth Layer Ledgers

- Maintain file, entrypoint, branch, and control-node coverage.
- Summarize ledger coverage by capability.
- Summarize ledger coverage by symptom.

## Completion Rule

Before reporting completion:

- confirm that the evidence baseline exists under `.specify/project-cognition/`
- confirm that provisional nodes and candidate edges were written
- run `'C:\Users\11034\.specify\bin\project-cognition.exe' validate-scan --format json` before handoff to `sp-map-build`
- `sp-map-scan` may report complete only after `validate-scan` returns `status=ok` and `readiness=scan_ready`
- if `validate-scan` returns `status=blocked`, report the blocking errors and do not claim the scan package is build-ready
- confirm that the scan still has not published final cognition truth
- report any open uncertainty that `sp-map-build` must reconcile

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

When running `sp-map-scan` in Codex, use the subagents-first dispatch model.
- Use `spawn_agent` for bounded lanes when `dispatch_shape` is `one-subagent` or `parallel-subagents`.
- Launch all independent lanes in the current `parallel-subagents` wave before waiting.
- Use `leader-inline-fallback` only after recording why Codex native subagents are unavailable or unsafe.
- Suggested bounded scan lanes include repository tree inventory, source/runtime surfaces, testing/operations surfaces, and generated/cache exclusion review.
- Keep each subagent responsible for scan evidence only; the leader owns the coverage ledger, reverse coverage closure, and final completeness decision.
- Use `wait_agent` only at the documented join points before finalizing `coverage-ledger.md`, `coverage-ledger.json`, `scan-packets/<lane-id>.md`, and `map-state.md`.
- Use `close_agent` after integrating finished subagent results.
