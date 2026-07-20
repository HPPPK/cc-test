---
name: "sp-deep-research"
description: "Use when a planning-ready spec still has feasibility risk and needs coordinated research, evidence packets, or disposable demo spikes before implementation planning."
argument-hint: "Describe the feasibility question, research tracks, or demo proof needed before planning handoff"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/deep-research.md"
user-invocable: true
---
## Invocation Syntax

- In this integration, invoke workflow skills with `/sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: The current spec package exists, but one or more capabilities do not yet have a credible implementation chain.
- **Primary objective**: Coordinate focused research and isolated prototype evidence, synthesize implementation-chain decisions, and produce a planning handoff before /sp-plan.
- **Primary outputs**: `FEATURE_DIR/deep-research.md` with `Planning Handoff`, optional `FEATURE_DIR/research-spikes/`, updated `alignment.md`, `context.md`, `references.md`, and `workflow-state.md`.
- **Default handoff**: /sp-plan when feasibility is proven or explicitly accepted; otherwise /sp-clarify for requirement gaps or stop with blocked research risks.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Produce a planning-ready research packet before implementation planning starts:
prove or retire planning-critical feasibility questions, synthesize external and
repository evidence, validate uncertain links with disposable demo spikes when
needed, and hand `/sp.plan` the constraints and recommended implementation
direction it must preserve.

## Context

- Primary inputs: the current spec package, unresolved feasibility risks,
  external references, repository evidence, research-agent findings, and any
  disposable prototype evidence created in this command.
- The active working set is `spec.md`, `alignment.md`, `context.md`,
  `references.md`, `deep-research.md`, `research-spikes/`, and
  `workflow-state.md` inside the current `FEATURE_DIR`.
- This command is research-only. It is not permission to implement production
  behavior.

## Process

- Decide whether a feasibility and research handoff gate is actually needed.
- Decompose unknown implementation chains by capability and independent
  research track.
- Dispatch subagents when independent research tracks can run in parallel and
  produce evidence packets without conflicting writes.
- Research external APIs, libraries, algorithms, platform constraints, and
  repository patterns only where those facts change planning.
- Build the smallest disposable demo or spike when research alone cannot prove
  the chain.
- Synthesize research-agent findings and spike results into planning decisions,
  rejected options, risks, and a concrete `/sp.plan` handoff.
- Run reverse coverage validation before handoff: every CAP → PH → Evidence chain must close.
- Run readiness refusal checks; refuse handoff with a gap report when checks fail.
- Run the Planning Handoff Readiness Checklist; do not recommend `/sp.plan` until all items pass.

## Output Contract

- Write or update `deep-research.md`.
- Optionally write isolated scratch assets under `research-spikes/`.
- Update `alignment.md`, `context.md`, `references.md`, and `workflow-state.md`
  when feasibility evidence changes planning readiness.
- If this gate is not needed, still write a lightweight `deep-research.md`
  with `**Status**: Not needed`, `Feasibility Decision`, `Planning Handoff`,
  and `Next Command`; do not invent `CAP/TRK/EVD/PH` IDs for already-proven
  work.
- Include a `Planning Handoff` section that `/sp.plan` can consume directly for
  recommended approach, module boundaries, API/library choices, demo artifacts,
  constraints, rejected options, and residual risks.
- Use stable traceability IDs (`CAP-###`, `TRK-###`, `EVD-###`, `SPK-###`,
  `PH-###`) plus an evidence quality rubric so `/sp.plan` can cite exactly which
  research finding or spike supports each design decision.
- Use `.specify/templates/examples/deep-research/` as the output-shape
  reference when available: `not-needed.md`, `docs-only-evidence.md`, and
  `spike-required.md`.
- Report which capabilities are proven, constrained, blocked, or no longer worth
  planning.
- Persist accepted evidence packets as `FEATURE_DIR/research-evidence/<EVD-###>.json`.

## Guardrails

- Do not edit production source files, tests, migrations, release config, or
  implementation artifacts from `sp-deep-research`.
- Keep demos disposable and isolated under `FEATURE_DIR/research-spikes/` unless
  the user explicitly asks to preserve a prototype elsewhere in a later
  implementation workflow.
- Skip this command when the change is a minor adjustment to an existing,
  already-proven capability.
- Do not let research subagents edit production files; they must either
  return evidence packets or write only to their assigned disposable spike
  directory.
- A research pass without runnable evidence (spike result or repo path trace) is a failed pass.
- Coordinator-only execution without subagent dispatch justification and recorded `subagent-blocked` reason is a failed pass.
- Feasibility claims based only on documentation citations without live repository path reads are not sufficient for planning.
- Subagent evidence packets without `paths_read` must be rejected; do not accept or synthesize them.
- A structural-only refresh (reformatting findings without new evidence) is a failed pass.
- Treat `context.md` Locked Decisions as immutable constraints during research.
  Do not research alternatives that contradict a locked decision unless the
  research explicitly proves the locked decision is infeasible, in which case
  mark the affected CAP as `blocked` and escalate; do not silently replace the
  locked decision.

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


## Pre-Execution Checks

**Check for extension hooks (before deep research)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_deep_research` key.
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
- Confirm project cognition freshness and valid workflow entry before deeper research begins.
- Keep `workflow-state.md` current as the durable source of truth for phase, allowed artifact writes, next action, and exit criteria.
- Verify the final `deep-research.md` and `workflow-state.md` outputs before handoff instead of relying on chat narration.
- Update durable state before compaction-risk transitions, prototype-evidence synthesis handoffs, or any stop where resume will depend on more than the visible conversation.

## Passive Project Learning Layer

- [AGENT] Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify learning start --command deep-research --format json` when available so the research pass sees relevant shared project memory.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order before broader command-local context.
- Open only learning detail docs linked from research-relevant index entries, especially feasibility, hidden dependency, prototype failure, or repeated research-gap lessons.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail markdown document without asking for routine permission.
- [AGENT] When feasibility friction exposes route changes, false starts, hidden dependencies, command failures, validation gaps, or reusable constraints, make sure `workflow-state.md` captures that durable context.
- [AGENT] Prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify learning capture-auto --command deep-research --feature-dir '$FEATURE_DIR' --format json` when `workflow-state.md` already preserves route reasons, false starts, hidden dependencies, or reusable constraints.
- [AGENT] When the durable state does not capture the reusable lesson cleanly, update `.specify/memory/learnings/INDEX.md` and a linked detail document with the command, type, summary, and evidence.

## Workflow Phase Lock

- [AGENT] Create or resume `WORKFLOW_STATE_FILE` before substantial research.
- Read `.specify/templates/workflow-state-template.md`.
- If `WORKFLOW_STATE_FILE` already exists, read it first and preserve still-valid `next_action`, `exit_criteria`, and `next_command` details instead of relying on chat memory alone.
- Treat `WORKFLOW_STATE_FILE` as the stage-state source of truth on resume after compaction for the current command, allowed artifact writes, forbidden actions, authoritative files, next action, and exit criteria.
- Set or update the state for this run with at least:
  - `active_command: sp-deep-research`
  - `phase_mode: research-only`
  - `allowed_artifact_writes: deep-research.md, research-spikes/, alignment.md, context.md, references.md, workflow-state.md`
  - `forbidden_actions: edit production source code, edit tests, fix build/tooling, implement behavior, commit prototype code as production`
  - `authoritative_files: spec.md, alignment.md, context.md, references.md, deep-research.md`
  - `track_exit_states`: per TRK-### exit state
  - `evidence_packet_acceptance`: accepted and rejected packet lists with reasons
  - `failed_readiness_checks`: list of check IDs that failed
  - `open_gaps`: gap ID, description, severity, and linked CAP/TRK IDs
  - `entry_source`: `sp-specify` | `sp-clarify` (which command routed here)
  - `research_mode`: `full-research` | `supplement-research`
- Do not edit production code, production tests, migrations, release config, or implementation artifacts from `sp-deep-research`.
- When resuming after compaction, re-read `WORKFLOW_STATE_FILE` before proceeding.

## Multi-Agent Research Orchestration

- [AGENT] Treat the current session as the research coordinator. The coordinator owns scope control, join points, conflict resolution, and the final `deep-research.md` synthesis.
- [AGENT] Before delegating, split the feasibility problem into independent research tracks only when the tracks can run in parallel without sharing write targets. Good tracks include:
  - repository implementation-pattern evidence
  - external API/library/platform feasibility
  - data shape, migration, permission, performance, or integration constraints
  - alternative approach comparison
  - disposable demo/spike validation
- [AGENT] Dispatch subagents when independent tracks can run in parallel and that materially improves evidence quality or speed. When the next coordinator decision is blocked on a single tightly coupled fact, either create one safe packetized evidence lane for that fact or stop for escalation/recovery with the blocker recorded.
- [AGENT] Give each subagent one bounded track, one expected output shape, and one write scope. Research-only subagents should return evidence packets in their final response. Demo/spike subagents may write only under `FEATURE_DIR/research-spikes/<track-slug>/`.
- [AGENT] Do not duplicate work across subagents. If two tracks overlap, assign one owner and ask the other to focus on a distinct risk or alternative.
- [AGENT] Require every subagent to return an evidence packet with:
  - `track`
  - `question`
  - `sources_or_repo_evidence`
  - `finding`
  - `confidence: high | medium | low`
  - `planning_implications`
  - `constraints_for_sp_plan`
  - `rejected_options`
  - `residual_risks`
  - `spike_artifacts` when applicable
- [AGENT] After each subagent returns, apply the evidence packet acceptance protocol:
  - **ACCEPT** when: `paths_read` is non-empty, `finding` is specific and evidence-backed, core question is answered, and no production files were edited.
  - **REJECT** when: `paths_read` is empty or missing, `finding` is empty or only speculative, core question is unanswered, or the subagent edited production source files.
  - Record every acceptance and rejection in `workflow-state.md`.
  - For rejected packets: retry once with clarified instructions. If the retry also fails, mark the track as `blocked`, record `subagent-blocked` with the rejection reason, and escalate.
  - Do not silently ignore or synthesize rejected evidence packets.

  ```markdown
  ## Evidence Packet Acceptance

  | Track | Subagent | Status | Reason if Rejected | Action |
  |-------|----------|--------|--------------------|--------|
  | TRK-001 | agent-1 | ACCEPTED | — | — |
  | TRK-002 | agent-2 | REJECTED | No paths_read | Retry once |
  | TRK-003 | agent-3 | REJECTED | Edited source file | BLOCKED, escalate |
  ```
- [AGENT] Join all subagent results before writing final conclusions. Resolve contradictions by preferring runnable spike evidence, current repository evidence, primary documentation, then secondary sources in that order. Mark conflicts that remain unresolved instead of hiding them.
- [AGENT] The coordinator must convert subagent packets into `Research Agent Findings`, `Synthesis Decisions`, and `Planning Handoff`; do not paste raw subagent output as the final artifact.
- [AGENT] After accepting a subagent evidence packet, persist it as
  `FEATURE_DIR/research-evidence/<EVD-###>.json` with the full evidence packet
  fields plus the evidence quality rubric. This enables:
  - independent audit without re-parsing `deep-research.md`
  - direct citation by `/sp.plan` via evidence ID
  - safe context-compaction recovery
- [AGENT] If subagent dispatch is unavailable or unsafe, record the decision as `subagent-blocked` with the concrete reason, preserve the decomposed tracks as blocked work, and stop for escalation or recovery instead of continuing as coordinator-only execution.

## Traceability and Evidence Quality Contract

- Assign stable IDs before running research so later planning can cite specific evidence instead of paraphrasing it:
  - capability IDs: `CAP-001`, `CAP-002`, ...
  - research track IDs: `TRK-001`, `TRK-002`, ...
  - evidence IDs: `EVD-001`, `EVD-002`, ...
  - spike IDs: `SPK-001`, `SPK-002`, ...
  - Planning Handoff item IDs: `PH-001`, `PH-002`, ...
- Use the IDs consistently across `Capability Feasibility Matrix`, `Research Agent Findings`, `Implementation Chain Evidence`, `Demo / Spike Evidence`, `Synthesis Decisions`, and `Planning Handoff`.
- Every handoff item must trace back to at least one evidence ID, spike ID, repository path, or source reference.
- Grade each evidence item using this rubric:
  - **Source tier**: `repo-evidence | runnable-spike | primary-docs | official-example | standard | secondary-source | inference`
  - **Reproduced locally**: `yes | no | not applicable`
  - **Recency**: [date, version, or `not time-sensitive`]
  - **Confidence**: `high | medium | low`
  - **Plan impact**: `blocking | constraining | informative`
  - **Limitations**: [what the evidence does not prove]
- Stop each research track when it reaches one of these exit states:
  - `enough-to-plan`
  - `constrained-but-plannable`
  - `blocked`
  - `not-viable`
  - `user-decision-required`
  - `stale-needs-revalidation` — prior evidence may no longer be valid due to dependency or platform changes
- Do not continue researching a track once it has enough evidence to support a planning decision. Convert the result into a handoff item and move on.
- For every spike, record the reproducibility contract:
  - hypothesis
  - setup/env
  - command
  - expected result
  - actual result
  - cleanup note
  - what this does not prove

## Outline

1. **Setup**: Run `.specify/scripts/bash/check-prerequisites.sh --json --paths-only` from repo root once (`--json --paths-only` / `-Json -PathsOnly`). Parse:
   - If `FEATURE_DIR` is not already explicit, prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@149c47759c6a313547bff17406291b8482879eab specify lane resolve --command deep-research --ensure-worktree` before guessing from branch-only context.
   - When lane resolution returns a materialized lane worktree, continue research from that isolated worktree context instead of assuming the leader workspace already matches the active feature lane.
   - `FEATURE_DIR`
   - `FEATURE_SPEC`
   - optional downstream paths if returned
   - If JSON parsing fails, abort and instruct the user to verify the feature branch environment.
   - Set `ALIGNMENT_FILE` to `FEATURE_DIR/alignment.md`.
   - Set `CONTEXT_FILE` to `FEATURE_DIR/context.md`.
   - Set `REFERENCES_FILE` to `FEATURE_DIR/references.md`.
   - Set `DEEP_RESEARCH_FILE` to `FEATURE_DIR/deep-research.md`.
   - Set `SPIKES_DIR` to `FEATURE_DIR/research-spikes`.
   - Set `WORKFLOW_STATE_FILE` to `FEATURE_DIR/workflow-state.md`.

2. **Create or resume the workflow state**:
   - Read `.specify/templates/workflow-state-template.md`.
   - If `WORKFLOW_STATE_FILE` already exists, read it first and preserve still-valid `next_action`, `exit_criteria`, and `next_command` details instead of relying on chat memory alone.
   - Determine entry source:
     - If the prior `active_command` in `workflow-state.md` was `sp-specify` →
       `entry_source: sp-specify`, `research_mode: full-research`
     - If the prior `active_command` was `sp-clarify` →
       `entry_source: sp-clarify`, `research_mode: supplement-research`
     - If undetermined → default to `full-research`
   - In `supplement-research` mode, preserve existing evidence and only research
     newly added or changed capabilities.
   - Record entry source and research mode in `deep-research.md` Research
     Orchestration section.
   - Persist at least:
     - `active_command: sp-deep-research`
     - `phase_mode: research-only`
     - `allowed_artifact_writes: deep-research.md, research-spikes/, alignment.md, context.md, references.md, workflow-state.md`
     - `forbidden_actions: edit production source code, edit tests, fix build/tooling, implement behavior, commit prototype code as production`
     - `authoritative_files: spec.md, alignment.md, context.md, references.md, deep-research.md`

3. **Load current spec package and repository context**:
   - `FEATURE_SPEC`
   - `FEATURE_DIR/alignment.md`
   - `FEATURE_DIR/context.md`
   - `FEATURE_DIR/references.md` if present
   - `FEATURE_DIR/deep-research.md` if present
   - `.specify/memory/constitution.md` if present
   - `.specify/memory/project-rules.md` if present
   - `.specify/memory/learnings/INDEX.md` if present
   - relevant linked learning detail docs from the learning index
   - **Project cognition gate:** query the active project's runtime before broad
     repository reads.

     Run or emulate:

     ```text
     'C:\Users\11034\.specify\bin\project-cognition.exe' compass --intent research '--query=$ARGUMENTS' --format json
     ```

     After the default compass packet, run the advanced `lexicon -> semantic_intake -> query` path only when `compass_state`, coverage diagnostics, localization, or live evidence requires explicit concept decisions. In that escalation, use `project-cognition lexicon --mode catalog` as the alias catalog, write agent-authored `semantic_intake` and `concept_decisions`, then run `project-cognition query --query-plan "<query_plan_json>"`; include `query_plan`, `semantic_intake`, `concept_decisions`, `covered_facets`, `missing_facets`, `match_sources`, `lexicon_generation_id`, `repository_search_terms`, project-language search terms, and facet coverage; do not search only the raw user words before source search. Agent-owned semantic normalization remains mandatory: `agent_normalization` and raw lexicon ranking are bootstrap signals only; if `agent_normalization` is omitted, treat it as `required=false`; use `write_semantic_intake_from_alias_catalog` when needed. Raw lexicon ranking is only a bootstrap; CJK or mixed CJK/ASCII input still requires agent-owned normalization even when positive raw lexical matches exist. The agent still owns translation. Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`.

     Use the returned readiness:

     - `query_ready`: read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons.
     - `review`: perform only the returned `minimal_live_reads` before continuing and inspect `coverage_diagnostics`.
     - `blocked`: report the blocking runtime issue and continue with live evidence only where this workflow allows degraded navigation.
     - **CARRY FORWARD**: Treat project-cognition results as repository-grounded
       starting context. Preserve cited capabilities, constraints, affected
       surfaces, and verification routes in `deep-research.md`, and distinguish
       repository facts from external research findings.
   - From `FEATURE_DIR/alignment.md`, extract:
     - `Feasibility / Deep Research Gate` status per capability
     - `Planning Gate Recommendation`
     - Capabilities marked `Needed before plan` → these are the research targets
     - Capabilities marked `Not needed` or `Completed` → skip, do not research
     - Capabilities marked `Blocked` → preserve blocker, record reason, do not research unless unblocked
   - targeted live files only when the project cognition runtime cannot prove the current implementation pattern
   - external docs, API references, release notes, examples, or research material when they materially affect feasibility

3b. **Detect staleness and prior evidence**:
    - If `FEATURE_DIR/deep-research.md` already exists from a prior run, compare
      new findings against prior conclusions.
    - For each CAP with prior evidence, check whether dependencies (library
      versions, API endpoints, platform behavior) have changed since the last
      research pass.
    - Mark CAPs with potentially stale evidence as `stale-needs-revalidation`
      and prioritize their research tracks.
    - Record staleness triggers (version bumps, deprecation notices, etc.) in
      the track description.

    ```markdown
    ## Differential Evidence Analysis

    | CAP ID | Previous Conclusion | Previous Evidence | New Evidence | Status Change |
    |--------|--------------------|--------------------|--------------|---------------|
    | CAP-001 | proven | EVD-001 | EVD-005 confirms | Unchanged |
    | CAP-002 | constrained | EVD-002 | SPK-003 disproves | **OVERTURNED** → blocked |
    | CAP-003 | proven (2026-03) | EVD-004 | lib X v3→v4 | **STALE** → revalidate |
    ```

4. **Decide whether this gate is needed**:
   - Skip deep research and recommend `/sp.plan` when all target capabilities already have a known implementation path in the repository or the work is only a minor adjustment to existing behavior.
   - When skipping, still write a lightweight `deep-research.md` using `**Status**: Not needed`, `Feasibility Decision`, `Planning Handoff`, and `Next Command`; do not invent `CAP/TRK/EVD/PH` IDs for work that is already proven.
   - Continue when any capability depends on an unproven API, library, algorithm, platform behavior, data volume, permission boundary, external integration, performance envelope, generated-code workflow, native/plugin bridge, or other path where planning would otherwise guess.
   - If the uncertainty is a requirement gap rather than feasibility risk, recommend `/sp.clarify` and update `workflow-state.md` with that route reason.

5. **Build a capability feasibility matrix from the spec's capability decomposition**:
   - Start from the capability list in `spec.md`. Each spec capability maps to one CAP-###.
   - Do not invent new capability names; use the spec's decomposition as the source of truth.
   - If a spec capability is too broad for focused research, split it into sub-capabilities (CAP-001a, CAP-001b) and note the split in `alignment.md`.
   - For each capability, read its feasibility status from `alignment.md` and take action:

   | Alignment Status | Action |
   |-----------------|--------|
   | `Needed before plan` | Create research track, assign TRK-### |
   | `Not needed` | Mark `proven` or `not needed`, skip |
   | `Completed` | Preserve existing evidence, skip |
   | `Blocked` | Record blocker, do not research |

5b. **Consequence-Sensitive Research Tracks**:
   - If the Senior Consequence Analysis Gate is triggered or upstream artifacts carry `CA-###` consequence obligations, create research tracks for any unproven affected object, state-behavior matrix entry, dependency impact, recovery behavior, validation route, or coverage gap that planning would otherwise guess.
   - Each consequence-sensitive `TRK-###` must name the linked `CA-###` obligation, the stop-and-reopen condition it can clear or confirm, the evidence needed, and the downstream workflow that must consume the result.
   - Research outputs must not drop `CA-###` consequence obligations; carry them into `Planning Handoff`, `Synthesis Decisions`, `Validation implications`, and residual risks until they are resolved or explicitly deferred.
   - If evidence disproves an upstream consequence assumption, preserve the obligation as blocked, record the stop-and-reopen condition, and route back to `/sp.clarify` instead of handing ambiguous semantics to `/sp.plan`.
   - When a consequence obligation is proven enough for planning, record the evidence ID, affected objects, lifecycle states covered, dependency impact, recovery and validation contract, remaining coverage gaps, and whether the obligation is still open.

   For each capability or module slice, record:
   - stable capability ID (`CAP-###`) — mapped from spec capability name
   - capability name (from spec.md)
   - desired outcome (from spec.md)
   - current evidence from the repository
   - unknown implementation-chain link
   - research questions
   - independent research track owner when delegation is useful
   - whether a disposable demo is required
   - proof target: what evidence would be enough to plan safely
   - result status: `proven`, `constrained`, `not viable`, `blocked`, or `not needed`

   Before finalizing the matrix, check each CAP against the preset research dimensions.
   At minimum, confirm or mark "not applicable" for:
   - permissions / auth boundary
   - data volume / performance envelope
   - error / exception / rollback flow
   - concurrency / consistency
   - logging / observability
   - migration / compatibility
   - external dependency SLO / failure mode
   - template / generated-code propagation
   - minimum verifiable test path

6. **Select the research dispatch shape**:
   - [AGENT] Before research fan-out begins, assess workload shape and the current agent capability snapshot, then apply the shared policy contract: `choose_subagent_dispatch(command_name="deep-research", snapshot, workload_shape)`.
   - Persist the decision fields exactly: `execution_model: subagent-mandatory`, `dispatch_shape: one-subagent | parallel-subagents`, `execution_surface: native-subagents`.
   - Decision order is fixed:
     - One safe validated track -> `one-subagent` on `native-subagents` when available.
     - Two or more safe isolated tracks -> `parallel-subagents` on `native-subagents` when available.
     - No safe lane, overlapping write scopes, missing contract, or unavailable delegation -> `subagent-blocked` with a recorded reason.
   - For `deep-research`, safe fan-out means at least two independent research tracks with disjoint write scopes. Research-only tracks return evidence packets; demo tracks write only under their assigned `FEATURE_DIR/research-spikes/<track-slug>/`.
   - Required join points:
     - before final conflict resolution
     - before writing `Synthesis Decisions`
     - before writing `Planning Handoff`
   - Record the chosen strategy, reason, any `subagent-blocked` condition, selected research tracks, write scopes, and join points in `deep-research.md`.
   - Keep the shared workflow language integration-neutral. Do not present Codex-only runtime surface wording in this shared template.

7. **Plan and run coordinated research**:
   - Create research tracks from the capability matrix before searching broadly.
   - For each track, assign a stable track ID (`TRK-###`) and define the exact question, evidence target, likely sources, whether a spike is needed, and how the result will affect `/sp.plan`.
   - If two or more tracks are independent and subagent dispatch is available, dispatch bounded subagents according to the Multi-Agent Research Orchestration contract.
   - If subagent dispatch is unavailable or low-confidence, record `subagent-blocked`, capture which tracks could not be dispatched, and stop before substantive research until the block is resolved or explicitly escalated.
   - Search and read only sources that answer a named feasibility question.
   - Prefer primary docs, official examples, standards, changelogs, release notes, library docs, code examples from the dependency itself, and current repository evidence.
   - Cite external sources in `references.md` and summarize how each source affects the implementation chain.
   - Separate facts from inference. If one source is weak or unverified, say so.
   - Preserve rejected alternatives with explicit reasons when they matter to planning.
   - Convert every completed track into an evidence packet with stable evidence IDs (`EVD-###`), evidence quality ratings, limitations, and a track exit state.

8. **Run isolated demo validation when needed**:
   - Assign a stable spike ID (`SPK-###`) and create the smallest runnable spike under `SPIKES_DIR` when docs and repository evidence cannot prove feasibility.
   - Keep the spike intentionally disposable: no production imports unless read-only, no edits outside `FEATURE_DIR/research-spikes/`, no migration or test-suite changes.
   - Define the spike before writing it:
     - hypothesis
     - inputs / fixture data
     - setup/env
     - expected pass condition
     - commands to run
     - actual result capture format
     - cleanup or non-persistence note
     - what this does not prove
   - Run the spike command if the local environment supports it.
   - Capture command, exit status, relevant output summary, and evidence path in `deep-research.md`.
   - If the environment cannot run the spike, record exactly what is missing and whether planning can still proceed with a manual-risk note.

9. **Synthesize research into planning decisions**:
   - Compare evidence packets across tracks.
   - Resolve conflicts and record why one source or demo result won over another.
   - Record every conflict and its resolution in the `Contradiction Resolution Log`.
   - Unresolved conflicts must be marked `BLOCKED` and escalated; do not hide them.
   - Identify the recommended approach, rejected approaches, and constraints `/sp.plan` must preserve.
   - Translate demo observations into planning implications rather than leaving them as raw logs.
   - Identify module boundaries, API/library choices, data flow notes, operational constraints, and validation implications that planning must account for.
   - Assign stable Planning Handoff IDs (`PH-###`) to each decision or constraint that `/sp.plan` must consume.

10. **Write `deep-research.md`**:
   Use `.specify/templates/examples/deep-research/` as the output-shape reference when available:
   - `not-needed.md` for `**Status**: Not needed`
   - `docs-only-evidence.md` when repository evidence and primary documentation are enough
   - `spike-required.md` when a disposable demo proves the implementation chain

   Use the lightweight structure below only when the gate is not needed:

   ```markdown
   # Deep Research: [FEATURE NAME]

   **Feature Branch**: `[###-feature-name]`
   **Created**: [DATE]
   **Status**: Not needed

   ## Feasibility Decision

   - **Recommendation**: Proceed to `/sp.plan`
   - **Reason**: [Why repository evidence already proves the implementation chain]
   - **Planning handoff readiness**: Not needed

   ## Planning Handoff

   - **Handoff IDs**: Not needed
   - **Status**: All capabilities have proven implementation chains in repository
   - **Recommended approach**: [Existing implementation path `/sp.plan` should use]
   - **Constraints `/sp.plan` must preserve**: [Existing boundary, behavior, or constraint]
   - **PH items**: None (all capabilities proven — no research-generated handoff items)

   ## Planning Handoff Readiness Checklist

   - [ ] All capabilities have proven implementation chains in repository
   - [ ] `alignment.md` updated with `Not needed` feasibility status
   - [ ] `context.md` updated
   - [ ] `workflow-state.md` updated with `next_command: /sp.plan`

   ## Next Command

   - `/sp.plan`
   ```

   Use the full structure below when any capability needed research, evidence, or a disposable spike:

   ```markdown
   # Deep Research: [FEATURE NAME]

   **Feature Branch**: `[###-feature-name]`
   **Created**: [DATE]
   **Status**: [Ready for plan | Ready for plan with constraints | Blocked | Not needed]

   ## Feasibility Decision

   - **Recommendation**: [Proceed to `/sp.plan` | Proceed with constraints | Run `/sp.clarify` | Stop / redesign]
   - **Reason**: [Short evidence-based rationale]
   - **Planning handoff readiness**: [Complete | Complete with constraints | Incomplete]

   ## Capability Feasibility Matrix

   | Capability ID | Capability | Unknown Link | Evidence Needed | Proof Method | Result |
   | --- | --- | --- | --- | --- | --- |
   | CAP-001 | [Name] | [What was uncertain] | [Proof target] | [docs / repo evidence / demo] | [proven / constrained / blocked / not needed] |

   ## Research Orchestration

   - **Execution model**: subagent-mandatory
   - **Dispatch shape**: [one-subagent | parallel-subagents | subagent-blocked]
   - **Execution surface**: native-subagents
   - **Reason**: [safe-one-subagent | safe-parallel-subagents | native-subagents-supported | no-safe-delegated-lane | unsafe-write-sets | packet-not-ready | runtime-no-subagents | low-delegation-confidence]
   - **Selected tracks**:
     - [track] -> [research-only evidence packet | demo spike write scope]
   - **Join points**:
     - before final conflict resolution
     - before writing `Synthesis Decisions`
     - before writing `Planning Handoff`

   ## Research Agent Findings

   | Track ID | Agent / Mode | Question | Evidence IDs | Confidence | Exit State | Planning Implication |
   | --- | --- | --- | --- | --- | --- | --- |
   | TRK-001 | [child agent name or subagent-blocked status] | [Question] | EVD-001, SPK-001 | [high / medium / low] | [enough-to-plan / constrained-but-plannable / blocked / not-viable / user-decision-required] | [What `/sp.plan` must use] |

   ## Evidence Quality Rubric

   | Evidence ID | Supports | Source Tier | Source / Path | Reproduced Locally | Recency / Version | Confidence | Plan Impact | Limitations | Persisted |
   | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
   | EVD-001 | CAP-001 / PH-001 | [repo-evidence / runnable-spike / primary-docs / official-example / standard / secondary-source / inference] | [URL, file path, or spike path] | [yes / no / not applicable] | [date/version/not time-sensitive] | [high / medium / low] | [blocking / constraining / informative] | [what this does not prove] | research-evidence/EVD-001.json |

   ## Implementation Chain Evidence

   ### [Capability Name]

   - **Capability ID**: CAP-001
   - **Chain**: [trigger/input -> module/API/library -> state/output -> validation]
   - **Repository evidence**: [EVD IDs, files, patterns, existing behavior]
   - **External evidence**: [EVD IDs, source links or references.md entries]
   - **Demo evidence**: [SPK IDs, spike path and command result, or not needed]
   - **Planning constraints**: [rules `/sp.plan` must preserve]
   - **Residual risk**: [remaining uncertainty]

   ## Demo / Spike Evidence

   - **Spike ID**: SPK-001
   - **Spike**: [name]
   - **Hypothesis**: [what it proves]
   - **Path**: `research-spikes/[name]`
   - **Setup / env**: [runtime, dependency, fixture, credentials placeholder, or not required]
   - **Command**: `[command]`
   - **Expected result**: [observable pass condition]
   - **Actual result**: [passed / failed / not run, with summary]
   - **Evidence summary**: [short result]
   - **Cleanup note**: [what remains disposable or how to remove it]
   - **What this does not prove**: [limits of the spike]
   - **Planning implication**: [what design or validation decision follows]

   ## Spike Log

   - **Spike**: [name]
   - **Hypothesis**: [what it proves]
   - **Path**: `research-spikes/[name]`
   - **Command**: `[command]`
   - **Result**: [passed / failed / not run]
   - **Evidence summary**: [short result]

   ## Synthesis Decisions

   - **Recommended approach**: [PH-001 -> approach and why]
   - **Rejected options**:
     - [option] -> [evidence-based reason and evidence IDs]
   - **Conflict resolution**:
     - [conflict] -> [resolution and evidence priority]
   - **Plan constraints**:
     - PH-### -> [constraint `/sp.plan` must preserve]

   ## Contradiction Resolution Log

   When two or more evidence items produce conflicting findings, record the
   resolution. Unresolved contradictions must be marked `BLOCKED` and escalated.

   | Conflict | Evidence A | Evidence B | Resolution | Priority Basis | Suppressed Reason |
   |----------|-----------|-----------|------------|----------------|-------------------|
   | [e.g. API version] | EVD-002: v3 | EVD-005: v2 | v3 accepted | spike > docs | EVD-005 was outdated |
   | [unresolved] | EVD-007: pattern A | SPK-003: pattern B | **BLOCKED** | — | Contradictory runnable evidence |

   ## Planning Handoff

   - **Handoff IDs**: PH-001, PH-002, ...
   - **Recommended approach**: PH-001 -> [implementation direction `/sp.plan` should start from; trace to CAP/TRK/EVD/SPK IDs]
   - **Architecture implications**: PH-002 -> [components, layering, boundaries, sequencing; trace to CAP/TRK/EVD/SPK IDs]
   - **Module boundaries**: PH-003 -> [owners and interfaces to preserve; trace to CAP/TRK/EVD/SPK IDs]
   - **API / library choices**: PH-004 -> [selected APIs/libraries and why; trace to CAP/TRK/EVD/SPK IDs]
   - **Data flow notes**: PH-005 -> [inputs, state, outputs, side effects; trace to CAP/TRK/EVD/SPK IDs]
   - **Demo artifacts to reference**: PH-006 -> [`research-spikes/...` and command result; trace to SPK IDs]
   - **Constraints `/sp.plan` must preserve**:
     - PH-### -> [constraint; trace to CAP/TRK/EVD/SPK IDs]
   - **Validation implications**: PH-### -> [tests/checks the plan should include later; trace to CAP/TRK/EVD/SPK IDs]
   - **Residual risks requiring design mitigation**:
     - PH-### -> [risk; trace to CAP/TRK/EVD/SPK IDs]
   - **Decisions already proven by research**:
     - PH-### -> [decision; trace to CAP/TRK/EVD/SPK IDs]

   - **PH consumption contract**:
     - `mandatory` — `/sp.plan` must consume this PH; omitting it is a plan error.
     - `optional` — `/sp.plan` may defer if the plan does not need it.
     - `user-decision` — `/sp.plan` must ask the user before consuming or deferring.

     Each PH item in the Traceability Index must carry its consumption contract in
     the `Mandatory?` column.

   ## Capability Cards

   For each high-value or planning-critical capability, emit a capability card:

   ### CAP-001: [Capability Name]

   | Field | Detail |
   |-------|--------|
   | **Purpose** | [What this capability achieves] |
   | **Owner** | [Owning module / service / surface] |
   | **Truth lives** | [Code path, data table, config, or external service] |
   | **Entry points** | [CLI command, API route, event handler, hook] |
   | **Downstream consumers** | [What depends on this capability] |
   | **Extend here** | [Safe extension points] |
   | **Do not extend here** | [Fragile or contract-locked areas] |
   | **Key contracts** | [Input shape, output shape, side effects, invariants] |
   | **Change propagation** | [What breaks when this changes] |
   | **Minimum verification** | [Command or check that proves this works] |
   | **Failure modes** | [Known ways this can fail] |
   | **Confidence** | [Verified / Inferred / Unknown-Stale] |

   ## Research Exclusions

   Areas, surfaces, or dimensions intentionally not researched in this pass.

   | Excluded Area | Reason | Revisit Condition | Recorded By |
   |---------------|--------|-------------------|-------------|
   | [e.g. performance profiling] | [Not in feature scope] | [Before production deploy] | [Coordinator / TRK-###] |

   Every unverified dimension from the preset research checklist that was marked
   "not applicable" or "deferred" must appear here with a revisit condition.

   ## Planning Traceability Index

   | PH ID | CAP ID | TRK ID | Evidence IDs | Evidence Quality | Plan Consumer | Required Plan Action | Mandatory? |
   |-------|--------|--------|-------------|-------------------|---------------|----------------------|------------|
   | PH-001 | CAP-001 | TRK-001 | EVD-001, SPK-001 | HIGH / blocking | architecture | Use pattern X | mandatory |
   | PH-002 | CAP-001 | TRK-002 | EVD-003 | MEDIUM / constraining | data-model | Consider limit Y | optional |

   ## Sources

   - [Source title](URL) -> [why it matters]

   ## Planning Handoff Readiness Checklist

   - [ ] All CAPs have explicit exit status (`proven` / `constrained` / `blocked` / `not-viable`)
   - [ ] All PH items trace to evidence (EVD/SPK/repo path)
   - [ ] All spike results recorded with pass/fail outcome
   - [ ] All residual risks explicitly linked to evidence IDs
   - [ ] All research exclusions have revisit conditions
   - [ ] `alignment.md` updated with feasibility result and Planning Gate Recommendation
   - [ ] `context.md` updated with implementation-chain evidence, constraints, rejected options
   - [ ] `references.md` updated with external sources
   - [ ] `workflow-state.md` updated with exit criteria and `next_command`
   - [ ] Reverse Coverage Validation passed (all CAP→PH→Evidence chains closed)
   - [ ] Readiness Refusal Rules all PASS

   ## Next Command

   - [`/sp.plan` | `/sp.clarify` | stop with blocker]
   ```

11. **Update upstream artifacts when research changes planning readiness**:
   - Update `alignment.md`:
     - add feasibility result, capability status, implementation-chain confidence, Planning Handoff readiness, and Planning Gate Recommendation
     - recommend `/sp.deep-research` only when more feasibility work remains
     - recommend `/sp.plan` only when every planning-critical capability is proven, constrained enough, not needed, or explicitly force-accepted
   - Update `context.md`:
     - add implementation-chain evidence, Planning Handoff summary, spike paths, external constraints, rejected options, and residual risks that `/sp.plan` must preserve
   - Update `references.md`:
     - add external sources and reusable insights

12. **Run an artifact review gate**:
    - Review `deep-research.md`, `alignment.md`, and `context.md` for:
      - unproven capability chains presented as facts
      - demos with no pass condition
      - source claims without source attribution
      - subagent findings copied without coordinator synthesis
      - missing or vague research orchestration strategy when multiple tracks were available
      - missing `Planning Handoff` decisions for capabilities that affect plan structure
      - production-code edits from the research phase
      - feasibility risks not reflected in the Planning Gate Recommendation
    - If issues remain, revise the artifacts before handoff.

12b. **Run reverse coverage validation**:
    - Prove every CAP has at least one PH-ID.
    - Prove every PH-ID traces back to at least one evidence item (`EVD-###`, `SPK-###`, or live repository path).
    - Prove every `proven` CAP has no remaining unresolved unknown links.
    - Prove every `blocked` CAP has a concrete block reason and next action.
    - Prove every accepted evidence packet was consumed by at least one PH or explicitly deferred.
    - If any check fails, refuse handoff and write gaps back to `workflow-state.md`.

    ```markdown
    ## Reverse Coverage Validation

    | CAP ID | Has PH? | PH IDs | Has Evidence? | Evidence IDs | Proven / Clean? |
    |--------|---------|--------|---------------|-------------|-----------------|
    | CAP-001 | PASS | PH-001, PH-002 | PASS | EVD-001, SPK-001 | PASS |
    | CAP-002 | FAIL | — | — | — | FAIL: No PH assigned |

    **Decision**: [PASS / FAIL — if FAIL, refuse handoff]
    ```

13. **Write or update `WORKFLOW_STATE_FILE`**:
    - Record:
      - `active_command: sp-deep-research`
      - `phase_mode: research-only`
      - current authoritative files
      - exit criteria for feasibility completion
      - next action required before handoff
      - `next_command` as `/sp.plan`, `/sp.clarify`, or `/sp.deep-research`

14. **Report completion**:
    - branch or feature directory
    - deep-research artifact path
    - spike paths and command results, if any
    - research tracks and subagent evidence packet summary, if any
    - proven capabilities
    - constrained or blocked capabilities
    - Planning Handoff summary for `/sp.plan`
    - updated alignment/context/reference paths
    - recommended next command
    - whether the feature is ready for `/sp.plan`
    - [AGENT] before final completion text, if auto-capture did not preserve a reusable `workflow_gap`, `project_constraint`, or `decision_debt`, use the manual `learning capture` helper surface.
      Required options: `--command`, `--type`, `--summary`, `--evidence`
    - Use the user's current language for explanatory text while preserving literal command names, file paths, and fixed status values exactly as written.

## Readiness Refusal Rules

Before writing final `deep-research.md` and recommending `/sp.plan`, run every
check below. If **any** check fails, refuse handoff, produce a gap report, and
set `next_command` to `/sp.clarify` or mark the phase as blocked.

- [ ] Every CAP has at least one PH-ID assigned
- [ ] Every PH-ID traces to at least one evidence ID (`EVD-###`, `SPK-###`, or live repository path)
- [ ] No CAP remains `blocked` without an explicit user force-accept recorded in `alignment.md`
- [ ] No `proven` CAP still has unresolved unknown links in its implementation chain
- [ ] Every dispatched subagent returned an accepted evidence packet; rejected packets were retried or escalated
- [ ] `dispatch_shape: subagent-blocked` is recorded with a concrete block reason and escalation path
- [ ] Every spike with a defined hypothesis was run and has a captured pass/fail result

When refusal happens, output a gap report inline before the refusal decision:

```markdown
## Readiness Refusal Report

| Check | Status | Affected IDs | Missing / Reason |
|-------|--------|-------------|-------------------|
| All CAPs have PH | FAIL | CAP-003 | No PH assigned |
| All PHs trace to evidence | FAIL | PH-005 | No EVD/SPK/repo path |
| ... | PASS | — | — |

**Decision**: Handoff refused. Next command: `/sp.clarify`
```

## Rules

- Use this command to produce research evidence and a planning handoff, not to design the full architecture.
- Prefer a small, runnable proof over broad speculative prose when the question is "can this work?"
- Disposable demos, research spikes, and proof artifacts validate feasibility for the user's intended capability. They are not a replacement product scope and must not be reframed as the delivered product unless the user explicitly confirms that reduced scope.
- Do not require this command for existing capability tweaks where the repository already shows the path.
- Do not advance to `/sp.plan` when a required capability is still `blocked` or `not viable` unless the user explicitly accepts a redesign or force-proceed risk.
- Keep all prototype work isolated under `FEATURE_DIR/research-spikes/`.
- Do not edit source code, tests, migrations, or production config from this command.
- Do not hand off to `/sp.plan` with only raw research notes; synthesize findings into `Planning Handoff`, constraints, rejected options, and residual risks.
- If this workflow makes actual source/runtime/template/config/test/generated-asset changes in the current run, follow the shared inline closeout contract:

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

## Post-Execution Checks

**Check for extension hooks (after deep research)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.after_deep_research` key.
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

## Codex Subagent Capability Discovery

- Execution model: preserve the workflow's existing `subagent-mandatory`, `subagents-first`, `adaptive`, or `subagent-assisted` policy.
- Dispatch shape: preserve the workflow's existing dispatch shape; use `subagent-blocked` only after the discovery step below fails or is unsafe.
- Execution surface: prefer `native-subagents` when the current runtime supports it; use `none` only after recording the unavailable or unsafe surface.
- Native subagent capability discovery: Before recording `subagent-blocked`, check the active tool surface for the integration-native subagent or task-dispatch entrypoint and record the exact missing surface if unavailable.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch subagents through the integration's native subagent support using the shared prompt contract.
- Join behavior: Use the integration-native join point, then integrate results back on the leader path.
- Preserve this workflow's existing packet, handoff, artifact, and result schema; this section only governs capability discovery before dispatch or blocked-state recording.

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
- If the native tool is unavailable in the current runtime or the tool call fails, ask one concise plain-text question about the missing feasibility or research-track decision, then continue with the existing research workflow.
- In `deep-research`, use this preference for:
  - whether the feasibility question is actually a requirement gap
  - minimum research tracks needed before planning
  - manual confirmation before force-proceeding with unresolved feasibility risk
- Native tool target: `AskUserQuestion`
- When this native tool target is listed for the integration and the runtime does not signal otherwise, assume it is available by default in normal interactive sessions.
- Question count: 1-4 questions per call
- Option count: 2-4 options per question
- Required question fields: `question`, `header`, `options`, `multiSelect`
- Option fields: `label`, `description`, `preview (optional)`
- Use `multiSelect: false` unless the workflow explicitly needs multiple selections.
- Use `metadata` only when tracking or analytics context adds value; otherwise keep the call minimal.
