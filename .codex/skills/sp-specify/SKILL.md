---
name: "sp-specify"
description: "Use when a new or changed feature request needs guided requirement discovery and a planning-ready specification package."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/specify.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: A new or changed feature request needs a planning-ready specification package instead of immediate implementation.
- **Primary objective**: Produce a reviewed, planning-ready specification package through context exploration, one-question-at-a-time clarification, approach comparison, semantic term decomposition, artifact self-review, and user review.
- **Primary outputs**: `FEATURE_DIR/spec.md`, `FEATURE_DIR/alignment.md`, `FEATURE_DIR/context.md`, `FEATURE_DIR/references.md` when useful, `FEATURE_DIR/workflow-state.md`, `FEATURE_DIR/checklists/requirements.md`, and the minimal compatibility handoff `FEATURE_DIR/brainstorming/handoff-to-specify.json`.
- **Default handoff**: After user review, recommend exactly one next command: `/sp.plan`, `/sp.clarify`, or `/sp.deep-research`.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Turn a new or changed feature request into a reviewed, planning-ready specification package through a concise collaborative flow: understand context, clarify one high-impact question at a time, compare approaches, confirm the spec shape, write artifacts, self-review, and ask the user to review before planning.

## Context

- Primary inputs: the user's request, current repository context, passive memory, project cognition only as advisory navigation, and discussion source files when a handoff-ready discussion is supplied or uniquely discoverable.
- Authoritative outputs: `spec.md`, `alignment.md`, `context.md`, `references.md` when useful, `workflow-state.md`, `checklists/requirements.md`, and a minimal `brainstorming/handoff-to-specify.json` compatibility handoff.
- This command is specification-only. It is not permission to implement code.

## Process

- Create or resume the feature workspace and `workflow-state.md`.
- Before creating a feature workspace, classify arguments as either a normal feature description or a discussion handoff path/JSON path/slug. If no arguments are supplied, use exactly one unconsumed `status: handoff-ready` discussion whose `next_command` is `/sp.specify` or `sp-specify`; if there are zero or multiple candidates, stop and ask for a feature description or specific handoff.
- For a discussion handoff, require the Markdown/JSON pair, `handoff_status: handoff-ready` or `discussion-state.md` `status: handoff-ready`, `planning_gate_status: ready`, `quality_gate.status: user_confirmed`, zero hard unknowns, zero open conflicts, a `Handoff Reviewer Guide`, and no Markdown/JSON drift in protected `MP-*`, `CA-###`, source evidence, or settled-decision coverage.
- Derive the feature description from `handoff_goal` plus the implementation target summary. Do not pass the raw handoff path, JSON path, or slug to the create-feature script as the feature description.
- Explore project context only enough to understand ownership, constraints, adjacent surfaces, and source evidence.
- If invoked from `sp-discussion`, re-read the selected `handoff-to-specify.md` and `.json`, then read the handoff-declared source files. At minimum inspect `discussion-log.md`, `requirements.md`, and `open-questions.md` when they exist; inspect `technical-options.md` and `project-context.md` when present or named.
- If invoked from `sp-discussion`, keep the source discussion slug from `.specify/discussions/<slug>/handoff-to-specify.md`; after the feature package is written and self-reviewed, run `specify discussion mark-consumed <slug> --feature-dir "$FEATURE_DIR"` or manually write `handoff_consumption_status: consumed`, `consumed_by_feature_dir: $FEATURE_DIR`, `status: completed`, and `next_command: none`.
- Extract every upstream capability-like signal from those sources and assign exactly one disposition: `preserved`, `in_scope`, `deferred`, `dropped`, or `clarification_blocker`.
- Ask one high-impact question at a time when the answer can change scope, acceptance, architecture, compatibility, security, data shape, external integration, or downstream planning.
- Decompose ambiguous terms such as capability, real, usable, works, end-to-end, fetch, probe, health, model, endpoint, integration, auth, `new` command, `<tool> new`, create, scaffold, authoring, template creation, authoring workflow, CLI path, TUI path, `能力`, `真实`, and `可用` before compiling the spec.
- Treat create/scaffold/`new` command/authoring workflow wording as an operation-shaped capability signal. If surface minimization changes the entry point, preserve the capability operation through an explicit TUI route, core API, public CLI command, or user-confirmed deferral; do not downgrade it to manual copy docs or static template-only support without confirmation.
- Present two or three approaches with trade-offs and a recommendation before committing to the spec shape.
- Present the spec sections for user approval before final artifact release.
- When entered through `sp-auto` with `auto_default_recommendation: true`, automatically accept a single safe recommended approach or section-shape option instead of stopping only for a `1`/`2`/`3` reply; do not use this to confirm scope reduction, dropped upstream signals, out-of-scope conflicts, or unresolved planning-critical ambiguity.
- Write the artifact package, then self-review for placeholders, contradictions, ambiguous requirements, silent scope narrowing, dropped upstream signals, out-of-scope conflicts, missing acceptance proof, and unconfirmed product minimization.
- Ask the user to review the written artifacts before recommending exactly one next command: `/sp.plan`, `/sp.clarify`, or `/sp.deep-research`.

## Output Contract

- Write or update `spec.md`, `alignment.md`, `context.md`, `workflow-state.md`, `checklists/requirements.md`, and `references.md` when useful.
- Write or update a minimal `brainstorming/handoff-to-specify.json` compatibility handoff with `version`, `status`, `entry_source`, `source_handoff`, `source_handoff_json`, `source_files_read`, `source_signal_disposition`, `must_preserve`, `coverage_status`, `planning_gate_status`, `hard_unknown_count`, `open_conflict_count`, and `quality_gate`.
- `alignment.md` must record `Semantic Term Decisions`, `Upstream Intent Disposition`, and `Out-Of-Scope Conflicts` when relevant.
- Do not recommend `/sp.plan` while a capability-like upstream signal lacks disposition, an ambiguous high-impact term lacks confirmation, or an out-of-scope conflict lacks user confirmation.
- Report what was confirmed, what remains open, what was deferred or dropped, and the single valid next command.

## Guardrails

- Do not edit source code, tests, or implementation files from `sp-specify`.
- Do not treat the discussion handoff summary as complete when discussion source files exist.
- Do not silently narrow user scope, redefine broad capability terms, or convert the request into a smaller delivery without user confirmation.
- Do not require legacy brainstorming journals, stage manifests, lock JSON files, or replay artifacts for normal `sp-specify` completion.
- Do not treat this summary block as the workflow itself; the detailed contract below remains authoritative.

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

## Read-Only Evidence Lane Dispatch

Use this shared dispatch contract when a workflow needs independent evidence gathering but the delegated lane must not mutate project state.

Call `choose_evidence_lane_dispatch(command_name="<workflow>", snapshot, workload_shape)` before dispatching read-only evidence lanes.

Perform native subagent capability discovery before recording a delegated lane. Do not record `subagent-blocked` until the active tool surface has been checked and the blocker is specific: no safe lane, no lane contract, no native subagent surface, or unsafe packetization.

Record the selected fields when a lane is used or blocked:

- `lane_mode: read-only-evidence`
- `dispatch_shape: leader-inline | one-subagent | parallel-subagents | subagent-blocked`
- `execution_surface: leader-inline | native-subagents | none`
- `structured_result: evidence_packet`
- `blocked_reason` when `dispatch_shape: subagent-blocked`

Dispatch rules:

- Stay `leader-inline` for simple questions or one narrow evidence check.
- Dispatch `one-subagent` when exactly one safe read-only evidence lane is useful and the runtime exposes native subagents.
- Dispatch `parallel-subagents` when two or more independent read-only evidence lanes can run without overlapping conclusions or state ownership.
- Record `subagent-blocked` only when a read-only evidence lane is required but no safe lane, no lane contract, or no native subagent surface is available.

Every read-only evidence lane must have a compact lane contract:

- objective
- user question or discussion decision it supports
- authoritative inputs
- allowed read scope
- forbidden operations
- acceptance checks
- evidence packet format
- join condition

Allowed delegated operations are file reads, `rg`, project cognition navigation/query output, project memory reads, generated-state reads, docs reads, and template reads.

Forbidden delegated operations are file writes, state writes, handoff writes, tests, builds, package managers, project CLI commands, app/server launch, branch creation, and workflow invocation.

The parent workflow owns judgment. Subagents return evidence packets only; they do not decide product direction, readiness, handoff status, final answers, or next workflow.

## Pre-Execution Checks

**Check for extension hooks before specification**:
- Check whether `.specify/extensions.yml` exists in the project root.
- If it exists, read entries under `hooks.before_specify`.
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

**Resolve discussion handoff intake before feature creation**:
- Classify the supplied arguments before running `.specify/scripts/bash/create-new-feature.sh "$ARGUMENTS"`:
  - normal feature description
  - `.specify/discussions/<slug>/handoff-to-specify.md`
  - `.specify/discussions/<slug>/handoff-to-specify.json`
  - `.specify/discussions/<slug>/handoff.md` or `.specify/discussions/<slug>/handoff.json` when a generated project has adopted neutral filenames
  - a discussion `<slug>` whose workspace contains the handoff pair
  - no arguments with exactly one unconsumed `status: handoff-ready` discussion whose `next_command` is `/sp.specify` or `sp-specify`
- If no feature description is supplied and there is no exactly-one unconsumed handoff-ready discussion, stop with: `ERROR: No feature description provided`.
- If multiple unconsumed `handoff-ready` discussions exist, stop before creating a feature workspace and ask the user for the specific slug or handoff path.
- When a discussion handoff is selected, treat it as the authoritative upstream input and set `SOURCE_HANDOFF_MD`, `SOURCE_HANDOFF_JSON`, and `SOURCE_DISCUSSION_SLUG`. Do not rediscover or switch to another handoff later in the run.
- Require both `handoff-to-specify.md` and `handoff-to-specify.json` before feature creation. Missing Markdown or JSON is `blocked_by_handoff_integrity`; route back to `sp-discussion` to refresh the pair instead of reconstructing it here.
- Parse the JSON before feature creation and require:
  - `entry_source: sp-discussion`
  - `handoff_kind: discussion_requirement_contract` when present; legacy discussion handoffs without this field may continue only if all other gates pass
  - `consumer_eligibility.sp-specify.status: ready` when `consumer_eligibility` is present
  - `handoff_status: handoff-ready` or source `discussion-state.md` `status: handoff-ready`
  - `planning_gate_status: ready`
  - `quality_gate.status: user_confirmed` or `quality_gate.status: user-confirmed`
  - `hard_unknown_count: 0`
  - `open_conflict_count: 0`
- Check the Markdown for `Handoff Reviewer Guide`, `Quality Gate`, `Must-Preserve Ledger`, and source evidence sections before creating a feature workspace.
- Check Markdown/JSON companion integrity for protected downstream facts: quality gate status, planning gate status, handoff status, `MP-*` IDs and claims, `CA-###` IDs and claims, hard unknowns, open conflicts, and structured `source_evidence` / settled-decision coverage. If the Markdown carries protected source evidence or settled decisions that the JSON omits, block before feature creation and return to `sp-discussion` to refresh the handoff pair.
- If `target_project_root` is present and differs from the current repository root, do not create a feature workspace in the wrong project. Ask the user to run the target project's `sp-specify` with this handoff path, or to confirm that the current repository is the intended target.
- Derive the feature description for `.specify/scripts/bash/create-new-feature.sh "$ARGUMENTS"` from `handoff_goal` plus the confirmed implementation target summary. Do not pass the raw handoff file path, JSON path, or slug as the feature description.
- Preserve the selected source handoff path and slug for `workflow-state.md`, `alignment.md`, and `brainstorming/handoff-to-specify.json`.
- Treat `handoff-to-specify.*` as compatibility filenames for the unified `discussion_requirement_contract`. Do not require or generate a second consumer-specific discussion handoff.

**Confirmed discussion handoff default continuation**:
- A `handoff-ready` discussion with `quality_gate.status: user_confirmed` is already a user-reviewed upstream contract. Do not add another pre-artifact approval gate merely to re-approve the same recommended approach or section shape.
- When the handoff and source files support exactly one recommended approach, and that approach preserves the confirmed scope, does not narrow the product intent, does not defer or drop an upstream capability signal, does not waive a risk, and does not contradict explicit user input, record `approach_comparison_status: accepted-from-confirmed-handoff` and continue.
- When the proposed spec section shape is a direct projection of the confirmed handoff, has no requested changes, preserves every Must-Preserve item, and leaves no unresolved planning-critical ambiguity, record `section_approval_status: accepted-from-confirmed-handoff` and write the draft spec package.
- The user review gate after artifact writing remains mandatory. That is where the user reviews the produced `spec.md`, `alignment.md`, `context.md`, checklist, and compatibility handoff JSON.
- Ask before writing artifacts only when the decision would reduce scope, drop or defer user-requested capability, select between materially different valid approaches, resolve an out-of-scope conflict, accept unresolved risk, change the target project boundary, or rely on missing/conflicting evidence.
- Do not ask the user to reply `1`, `2`, or `3` when the only pending action is accepting one safe recommended approach or section shape from the confirmed handoff.

**Set the working boundary**:
- Treat the user request as the starting point for a specification, not permission to implement.
- If no feature description or accepted discussion handoff was supplied, stop with: `ERROR: No feature description provided`.
- Verify the installed CLI surface with `specify --help` when command availability is uncertain; feature creation uses the generated create-feature script, not an imagined `specify create-feature` command.
- Run `.specify/scripts/bash/create-new-feature.sh "$ARGUMENTS"` from the repo root to create or resume the feature workspace using the normal feature description, or the handoff-derived feature description when discussion intake selected a handoff. The default feature workspace name uses a `YYYY-MM-DD-<slug>` prefix; legacy numeric prefixes require the script's explicit `--number` / `-Number` option. For generated projects this resolves to `.specify/scripts/bash/create-new-feature.sh "$ARGUMENTS"` or `.specify/scripts/powershell/create-new-feature.ps1 "$ARGUMENTS"`; Codex-generated skills should run `.specify/scripts/bash/create-new-feature.sh "$ARGUMENTS"` from the repo root for the shell variant.
- If the feature-creation script exits non-zero, stop and report the script error; do not call `specify lane register` or any invented branch command as a substitute.
- After the script succeeds, set:
  - `FEATURE_DIR`
  - `SPEC_FILE`
  - `ALIGNMENT_FILE`
  - `CONTEXT_FILE`
  - `REFERENCES_FILE`
  - `WORKFLOW_STATE_FILE`
- Create or update `workflow-state.md` before substantial analysis. Record `active_command: sp-specify`, `phase_mode: planning-only`, allowed artifact writes, `forbidden_actions`, current stage, next action, and exit criteria.
- Read `.specify/templates/workflow-state-template.md`.
- Create or resume `WORKFLOW_STATE_FILE` immediately after `FEATURE_DIR` is known.
- Treat `WORKFLOW_STATE_FILE` as the stage-state source of truth on resume after compaction for the current command, allowed artifact writes, forbidden actions, authoritative files, next action, and exit criteria.
- When resuming after compaction, re-read `WORKFLOW_STATE_FILE` before proceeding.
- Record `next_command` as `/sp.plan`, `/sp.clarify`, or `/sp.deep-research` once user review has been requested and the artifact self-review is complete.
- At the user review gate, record readiness for the next phase (`$sp-plan` for the mainline in integrations that render hyphenated command invocations) while preserving the literal `next_command` token as `/sp.plan`, `/sp.clarify`, or `/sp.deep-research`.
- Do not edit source code, tests, implementation files, generated build output, or dependency files from this workflow.
- Do not implement code, edit source files, edit tests, or run implementation-oriented fix loops from `sp-specify`.

## Passive Project Learning Layer

- [AGENT] Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@3f003d2bd26e4b4e73b77950c148ccb010ece90c specify learning start --command specify --format json` when available so passive learning files exist and the current specification run sees relevant shared project memory.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order when they exist.
- Open only learning detail docs that clearly match the request, repeated workflow gaps, user preferences, or constraints for the affected area.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail document without asking for routine permission.
- Treat passive memory as advisory evidence. Repository evidence and explicit user confirmation outrank older memory.
- [AGENT] Prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@3f003d2bd26e4b4e73b77950c148ccb010ece90c specify learning capture-auto --command specify --feature-dir '$FEATURE_DIR' --format json` when `workflow-state.md` already preserves route reasons, false starts, hidden dependencies, validation gaps, or reusable constraints.
- Before closeout, if this specification run exposes a reusable workflow gap, user preference, or project constraint, capture it in the learning layer or record why it is one-off.
- Required options: `--command`, `--type`, `--summary`, `--evidence`.

## Project Context Intake

- Explore project context just enough to understand ownership, constraints, adjacent surfaces, reusable patterns, compatibility boundaries, and likely verification routes.
- Check whether `.specify/project-cognition/status.json` exists before trusting project cognition output.
- Run or emulate:

```text
'C:\Users\11034\.specify\bin\project-cognition.exe' compass --intent plan '--query=$ARGUMENTS' --format json
```

After the default compass packet, run the advanced `lexicon -> semantic_intake -> query` path only when `compass_state`, coverage diagnostics, localization, or live evidence requires explicit concept decisions. In that escalation, use `project-cognition lexicon --mode catalog` as the alias catalog, write agent-authored `semantic_intake` and `concept_decisions`, then run `project-cognition query --query-plan "<query_plan_json>"`; include `query_plan`, `semantic_intake`, `concept_decisions`, `covered_facets`, `missing_facets`, `match_sources`, `lexicon_generation_id`, `repository_search_terms`, project-language search terms, and facet coverage; do not search only the raw user words before source search. Agent-owned semantic normalization remains mandatory: `agent_normalization` and raw lexicon ranking are bootstrap signals only; if `agent_normalization` is omitted, treat it as `required=false`; use `write_semantic_intake_from_alias_catalog` when needed. Raw lexicon ranking is only a bootstrap; CJK or mixed CJK/ASCII input still requires agent-owned normalization even when positive raw lexical matches exist. The agent still owns translation. Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`.

- Prefer project cognition when it is available and fresh, but use it as navigation guidance rather than a source that can override live files or user intent.
- When compass reports `query_ready`, read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons.
- When compass reports `review` or partial coverage, perform the returned minimal live reads, inspect `coverage_diagnostics`, and continue with explicit assumptions.
- If freshness is `stale`, record a planning advisory, perform minimal live reads, and continue when those reads provide enough evidence.
- If freshness is `possibly_stale`, inspect the reported changed paths and review topics, perform minimal live reads, and continue with explicit assumptions when sufficient.
- If task-relevant coverage is insufficient, record a planning advisory and continue with minimal live reads instead of guessing.
- For artifact-only `sp-specify` work, use the project cognition freshness helper as advisory navigation only. Freshness is `missing` when the runtime baseline is absent; freshness is `stale` when source changes may invalidate the returned map; freshness is `support_drift` when support surfaces changed; freshness is `partial_refresh` when the helper reports an incomplete refresh and a `recommended_next_action`; freshness is `possibly_stale` when changed paths overlap `must_refresh_topics` or `review_topics`.
- The coverage-model check should identify owning surfaces and truth locations, consumer or adjacent surfaces likely to be affected, change-propagation hotspots, verification entry points, and known unknowns or stale evidence boundaries.
- Coverage is insufficient when the touched area is named only vaguely, lacks ownership or placement guidance, or lacks workflow, constraint, integration, or regression-sensitive testing guidance.
- When `compass_state=needs_semantic_intake`, write `semantic_intake` from project vocabulary, rerun compass with `--semantic-intake-file`, or use the advanced `lexicon -> semantic_intake -> query` path for explicit concept decisions.
- When cognition reports `needs_rebuild` or `blocked`, report the blocking issue and the required project-map command instead of guessing.
- Carry material repository facts into `context.md` and `alignment.md`; do not leave planning-relevant facts only in transient tool output.
- Cognition follow-up: if artifact-only specification work identifies future modules, workflows, integration boundaries, verification surfaces, or ownership facts that the current query-backed runtime does not yet encode, record that as an advisory in `workflow-state.md`, `alignment.md`, or `context.md`; do not mark project cognition dirty or require a refresh until actual source/runtime changes make the runtime truth out of date.
- If this workflow makes actual source/runtime/template/config/test/generated-asset changes in the current run, follow the shared inline closeout contract:

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

## Discussion Source-File Sweep

When `sp-specify` starts from `sp-discussion`, do not trust only the handoff summary.

- Use the `SOURCE_HANDOFF_MD`, `SOURCE_HANDOFF_JSON`, and `SOURCE_DISCUSSION_SLUG` selected by pre-feature-creation discussion handoff intake. If a handoff was supplied but intake did not run, stop and run intake before continuing.
- Read the agent-facing requirement contract first: `agent_requirement_contract.target_need`, `constraints`, `success_criteria`, `design_direction`, `optimal_solution_approach`, and `scope`.
- Confirm `consumer_eligibility.sp-specify.status` is `ready` when present; if it is blocked, route back to `sp-discussion` instead of forcing feature creation.
- Re-read `handoff-to-specify.md` and `handoff-to-specify.json` after `FEATURE_DIR` is known and preserve compatibility fields such as `entry_source: sp-discussion`, `handoff_status: handoff-ready`, `coverage_status`, `planning_gate_status`, `hard_unknown_count`, and `open_conflict_count`.
- When `entry_source: sp-discussion` and `source_handoff` points under `.specify/discussions/<slug>/handoff-to-specify.md`, preserve that slug as the source discussion that must be marked consumed after this command successfully writes and self-reviews the feature specification package.
- Coverage and planning readiness are separate. Use `coverage_status` for upstream signal mapping completeness and `planning_gate_status` for whether downstream planning may proceed.
- Planning gate statuses include `ready`, `blocked_by_hard_unknowns`, `blocked_by_conflict`, `blocked_by_incomplete_coverage`, and `blocked_by_handoff_integrity`.
- Preserve the Must-Preserve Ledger. Every `MP-*` or `MP-###` item must be mapped, deferred, dropped, superseded, or converted into a conflict blocker with source and reopen details.
- Read the handoff-declared source files, not only the handoff summary.
- At minimum inspect these discussion source files when they exist:
  - `discussion-log.md`
  - `requirements.md`
  - `open-questions.md`
- Also inspect `technical-options.md` and `project-context.md` when present or named by the handoff.
- Record every inspected source in `source_files_read`.
- Extract every upstream capability-like signal from the handoff and source files. Capability-like signals include words and phrases around capability, real, usable, works, end-to-end, fetch, probe, health, model, endpoint, integration, auth, `new` command, `<tool> new`, create, scaffold, authoring, template creation, authoring workflow, CLI path, TUI path, `能力`, `真实`, and `可用`.
- For each signal, write exactly one `source_signal_disposition` row:
  - `preserved`
  - `in_scope`
  - `deferred`
  - `dropped`
  - `clarification_blocker`
- Planning readiness is blocked when a capability-like upstream signal has no disposition, when a narrowed interpretation is not user-confirmed, or when an upstream signal is put out of scope without confirmation and a reopen trigger.
- Treat create/scaffold/`new` command/authoring workflow wording as an operation-shaped capability signal, not as documentation garnish. If the user also asked for a small command surface, preserve the capability operation by mapping it to an explicit entry point such as a TUI route, core API, public CLI command, or user-confirmed deferral. Do not silently replace a confirmed create/scaffold operation with manual copy docs, a static template directory, or a template-only note.
- Maintain a capability preservation ledger for any operation-shaped signal whose entry point changes during normalization: upstream expression, selected entry point, artifacts that implement it, acceptance proof, and user confirmation for any narrowing.
- Preserve the disposition ledger in both `alignment.md` and the minimal compatibility `brainstorming/handoff-to-specify.json`.
- If Markdown and JSON mismatch on user-confirmed scope, quality gate, or must-preserve identity, record the mismatch and route back to refresh the handoff instead of silently repairing it.

### Discussion Decision Digest

When the source is `sp-discussion`, build a `Discussion Decision Digest`. This is not just a source-file-read checklist; it is the decision-intent layer that prevents `sp-specify` from flattening discussion value into generic requirements.

Derive the digest from `handoff-to-specify.md`, `handoff-to-specify.json`, `requirements.md`, `technical-options.md`, `project-context.md`, `open-questions.md`, and the `Handoff Reviewer Guide`.

The digest must include:

- `locked_direction`: selected direction, source, rationale, and downstream artifact mapping.
- `rejected_alternatives`: option, rejection reason, source, and reopen condition when the alternative could reappear downstream.
- `accepted_tradeoffs`: accepted tradeoff, accepted risk, user confirmation or source, latest allowed resolve phase, and reopen condition.
- `experience_commitments`: UI/TUI shell, key flows, user-visible states, accessibility or copy constraints, `ui_discussion` status, and `ui_sketch_reference` when present.
- `review_criteria_carried_forward`: approval and change-request criteria from the `Handoff Reviewer Guide` that must still shape `sp-specify` artifact review.
- `must_not_dilute`: decisions downstream workflows must not simplify away, such as turning an approved TUI route into documentation-only support, a guided confirmation into a bare prompt, or a real operation into a manual copy step.

Treat every `must_not_dilute` item as a must not dilute constraint: if `sp-specify` cannot preserve it in requirements, acceptance proof, or planning context, block and return to `sp-discussion`.

Write the digest into `alignment.md#Discussion Decision Digest`, summarize it in `spec.md#Decision Capture`, carry planning-relevant items into `context.md#Discussion Decision Carry-Forward`, and mirror it in `brainstorming/handoff-to-specify.json` as `discussion_decision_digest`.

Planning readiness is incomplete when the selected direction, rejected alternatives that matter, accepted tradeoffs, UI/TUI experience commitments, or carried-forward review criteria appear in the discussion sources but have no digest entry and no artifact mapping.

## Clarification Loop

- The user's text is the starting point, not the finished requirement package. Analyze the whole feature first and produce a planning-ready requirement package, not a surface summary.
- Run the anti-surface warning signs check before treating the request as planning-ready. Words like "simple", "intuitive", "robust", or "clean" are not requirements when boundary conditions, failure behavior, or affected neighboring workflow remain unclear, when there is still no acceptance proof for how success will be judged, or when the proposed behavior may conflict with the current owning module or existing repository pattern.
- Do not release `Aligned: ready for plan` when the current understanding still depends on taste words, implicit defaults, untested assumptions, or missing behavior boundaries, failure handling, compatibility impact, and acceptance-shaping detail.
- Treat phrases such as "make it more intuitive", "handle permissions normally", "keep it compatible", "show an error if something goes wrong", "use the existing pattern", "it should feel fast", "just validate the data properly", "admins can handle the special cases", and "don't break existing clients" as prompts to convert the vague intent into concrete behavior, edge handling, compatibility scope, or acceptance evidence.
- Classify unresolved vague wording as a vague success standard, vague data rule, vague permission boundary, or vague compatibility claim. Terms such as "fast", "smooth", "easy", "clear", or "works well"; "valid", "clean", "normalized", or "properly formatted"; "normal permissions", "admin behavior", or "authorized users"; and "keep compatibility" or "don't break clients" require concrete acceptance-shaping details before planning handoff.
- Run an engineering-completeness gate for boundary-sensitive work. Capture the trigger/event source when behavior depends on a cross-component signal, payload, identifiers, ordering, or delivery contract, state lifecycle, retention, archival, or cleanup expectations, retry/dedup/idempotency expectations for async or event-driven behavior, user-visible failure, stale-state, or recovery behavior, configuration surface and when changes take effect, and observability or support evidence needed to diagnose failures.
- If the user already described the desired UX in natural language, preserve that product behavior while avoiding forcing a transport or browser-API choice unless the requirement truly demands it.
- Do not release for cross-boundary or event-driven features while the trigger or event source, retry, deduplication, idempotency, or replay expectations are still unknown.
- Conversation memory is not a valid handoff surface. An unknown is not an ignored value; record each unresolved planning-critical item as `resolve-now`, `resolve-by-evidence`, `defer-with-contract`, or `waive-with-risk`, and reopen upstream truth when the current specification depends on a missing or contradictory source.
- Ask one high-impact question at a time.
- Ask at most one unanswered high-impact question per message.
- Ask exactly one unresolved high-impact question per turn.
- A question is high-impact when its answer can change scope, acceptance, architecture, compatibility, security, data shape, external integration, UX behavior, migration path, or downstream planning.
- Run a high-impact ambiguity scan across targeted repository evidence and user-supplied references, examples, or linked material.
- Identify 3-5 planning-relevant gray areas before choosing the next single question.
- Derive gray areas from the combination of user intent, the project cognition runtime, and targeted repository evidence. Do not use generic labels like "UX", "behavior", or "data handling".
- Each gray area should be captured internally with: why the decision changes implementation or test shape, desired happy-path behavior, edge case or failure-path behavior, and compatibility, migration, or neighboring-workflow impact.
- Do not batch unrelated high-impact questions. Ask, receive the answer, update the understanding, then decide whether another question is still necessary.
- each clarification turn should contain at most one short checkpoint.
- Do not ask a second high-impact question before the first one is closed.
- Grouped questions are allowed only when the current domain is already narrowed to a local low-risk scope.
- Make the next question build directly on the user's most recent answer rather than resetting to generic prompts.
- If the user's answer remains vague, shallow, or contradictory, ask a targeted narrowing question, example, or recommendation. Do not accept long but still ambiguous answers as sufficient.
- Do not turn this into a freeform brainstorming workflow. Keep it as guided requirement discovery.
- Default to concise clarification turns. Do not restate the full current understanding after every answer. Save the full synthesis for the alignment-ready turn.
- Do not repeat the same question unless the user's answer changes the prior premise or explicitly asks to revisit it.
- If the runtime exposes separate progress/commentary and final reply channels, keep progress in commentary and ask the current clarification question in the final user-visible reply. The user should see the current clarification question exactly once.
- Before generating any clarification question, confirmation, or bounded selection, apply the `sp-auto` Recommended Default Continuation when `auto_default_recommendation: true` is active. If that gate does not auto-resolve the question, check whether a native structured question tool is available. If a native structured question tool is available, you must use it.
- When using a native structured question tool, map the same stage header plus topic label into the native header or title field.
- Do not render the textual fallback block when the native tool is available. Do not self-authorize textual fallback because the question seems simple. Only fall back after the native tool is unavailable or the tool call fails.
- Treat the shared open question block structure below as fallback-only text format guidance.
- Use this open question block structure in the user's current language when rendering the textual fallback block: stage header, question header, prompt, example, recommendation, options, and reply instruction.
- Keep recommendation and example scaffolding short and specific.
- Low-risk defaults may be adopted without interrupting the user, but record them as assumptions in `alignment.md`.
- If the user explicitly accepts unresolved risk, record the risk and use `Force proceed with known risks`; otherwise unresolved planning-critical ambiguity routes to `/sp.clarify`.

## Semantic Term Decomposition

- Decompose ambiguous product terms before writing the final spec.
- If the request contains 2 or more distinct deliverables, enhancements, or behavior changes that would independently change implementation or validation shape, decompose it into capabilities. Present the capability split before asking any detailed clarification question about one capability.
- Label that preview as the proposed capability split so the user can correct the grouping.
- Default to one spec with capability decomposition when the work still belongs to one coherent feature boundary.
- Help the user decompose it into bounded capabilities inside the same spec first.
- Only escalate to separate specs or clearly phased releases when one spec would no longer be coherent to plan or test.
- Do not jump straight into a detailed gray-area question while multiple sibling capabilities are still unsplit or unprioritized.
- confirm which capability should be clarified first while keeping the work in the current spec unless the user explicitly wants separate specs or phased release planning.
- Do not spend one clarification pass collecting requirements for multiple independent capabilities.
- If the request is already one bounded capability, say so briefly and continue inside the current spec.
- Use this section in `alignment.md` for high-value terms whose meanings could change the delivered product:

Use a simple row per term:

- Term: [ambiguous user term]
- Possible Meanings: [meaning A; meaning B; meaning C]
- Selected Meanings: [confirmed selected meanings]
- Excluded Meanings: [confirmed exclusions]
- User Confirmation: [who/when or missing]

- If selected or excluded meanings are missing user confirmation and the term is product-critical, keep the package out of planning-ready state.
- Scope reduction requires confirmation. Do not convert a broad request into an MVP, prototype, demo, or smaller delivery unless the user requested it or explicitly accepted the narrower version.

## Approach Comparison

- When this command runs with `auto_default_recommendation: true`, apply the `sp-auto` Recommended Default Continuation before every bounded question, approach comparison, or section approval gate. If one safe recommended/default answer exists, record it and continue instead of asking; if it is not safe to assume, keep the confirmation gate and include a self-unblock recommendation.
- Present two or three approaches before committing to the spec shape.
- For a requirement-shaping decision, switch into decision-fork mode and present 2-3 concrete options when the choice changes behavior, boundary, compatibility, or acceptance proof.
- Do not use this mode for implementation architecture brainstorming.
- For each approach, summarize product fit, implementation risk, user-visible trade-offs, compatibility impact, and verification implications.
- Recommend one approach and explain why it best preserves the user's stated intent.
- When this command is resumed through `sp-auto` with `auto_default_recommendation: true`, and the only blocked state is `approach_comparison_status: awaiting-user-confirmation` for a previously presented bounded choice, automatically choose the single explicitly recommended approach if it preserves the user's stated intent and does not narrow scope, defer or drop an upstream capability signal, waive a risk, or contradict explicit user input. Record `approach_comparison_status: auto-accepted-recommended`, the selected approach, and the reason in `workflow-state.md` or `alignment.md`, then continue.
- Under `auto_default_recommendation: true`, do not ask the user to reply `1`, `2`, or `3` when the single safe pending action is accepting that recommended approach.
- Scope reduction still requires explicit user confirmation. Out-of-scope conflicts still require explicit user confirmation. Unresolved planning-critical ambiguity still blocks planning readiness.
- If the user chooses a different approach, record that as a locked decision rather than re-litigating it later.

## Spec Section Approval

- Before final artifact release, present the intended spec section shape for user approval.
- The review preview must cover:
  - goal and users
  - confirmed scope
  - out-of-scope and deferred items
  - capability decomposition
  - acceptance proof
  - semantic term decisions
  - upstream signal dispositions
  - open questions or known risks
- When this command is resumed through `sp-auto` with `auto_default_recommendation: true`, and the only blocked state is section-shape confirmation with no requested changes and one safe recommended/default section shape, automatically approve that shape. Record `section_approval_status: auto-approved-recommended` and continue to artifact writing.
- Do not auto-approve a section shape that removes, narrows, defers, or drops user-requested scope, hides an unresolved planning-critical ambiguity, or resolves an out-of-scope conflict without explicit user confirmation.
- Under `auto_default_recommendation: true`, do not ask the user to reply `1`, `2`, or `3` when the single safe pending action is accepting that recommended section shape.
- If the user requests changes, update the working understanding before writing final artifacts.

## Artifact Writing Contract

Write the specification package after context intake, necessary clarification, semantic decomposition, approach comparison, and section approval.

- `spec.md` must capture the product requirement in planning-ready form with confirmed scope, scenarios, capability decomposition, requirements, acceptance proof, decision capture, and risks.
- `alignment.md` must capture current understanding, confirmed facts, assumptions, open questions, `Semantic Term Decisions`, `Upstream Intent Disposition`, `Out-Of-Scope Conflicts`, must-preserve coverage, and readiness decision.
- `context.md` must capture planning context, repository context, reuse notes, integration boundaries, product constraints, change propagation, locked decisions, canonical references, open questions, and deferred ideas.
- When the source is `sp-discussion`, `spec.md`, `alignment.md`, and `context.md` must preserve the `Discussion Decision Digest`: selected direction, rejected alternatives, accepted tradeoffs, experience commitments, review criteria carried forward, and must-not-dilute constraints.
- `references.md` is optional and should be written when external docs, repository examples, issue links, discussion artifacts, or user-provided references materially shaped the spec.
- `workflow-state.md` must record current stage, review state, source-file sweep status, source-signal disposition status, final handoff decision, and next command.
- `checklists/requirements.md` must exist for first-release compatibility and must validate the written spec, not resurrect legacy state machinery.
- `brainstorming/handoff-to-specify.json` must exist as a minimal compatibility handoff for downstream commands. It must include:
  - `version`
  - `status`
  - `entry_source`
  - `source_handoff`
  - `source_handoff_json`
  - `source_files_read`
  - `source_signal_disposition`
  - `discussion_decision_digest`
  - `must_preserve`
  - `coverage_status`
  - `planning_gate_status`
  - `hard_unknown_count`
  - `open_conflict_count`
  - `quality_gate`
- Preserve fidelity requirements and reference behavior inventory when the feature is reference-sensitive or rewrite-style.
- Preserve Senior Consequence Analysis Gate outputs as `CA-###` obligations when triggered: affected object map, state-behavior matrix, dependency impact table, recovery and validation contract, coverage gaps, lifecycle operations, running state behavior, destructive operations, shared state, downstream consumers, and stand-down reason.

## Artifact Self-Review

Before reporting completion, review the written artifacts, not just the chat summary. Review the written `spec.md`, `alignment.md`, and `context.md` as the minimum artifact set.

- No placeholders, TODOs, stale markers, or unresolved clarification markers remain unless the package is explicitly not planning-ready.
- If high-risk artifact review triggers, a read-only reviewer lane MUST run before handoff. If no high-risk review trigger is present, a reviewer lane MUST NOT be added. Review routing is condition-triggered, not preference-triggered.
- Requirements are testable and unambiguous.
- `spec.md`, `alignment.md`, `context.md`, `workflow-state.md`, and the compatibility handoff do not contradict each other.
- Every discussion-originated capability-like upstream signal has a disposition row.
- Every deferred or dropped upstream signal has a source, reason, user confirmation status, and reopen trigger.
- Every out-of-scope conflict with upstream wording is recorded in `Out-Of-Scope Conflicts`.
- Acceptance proof matches the confirmed scope.
- UI/API wording in the spec does not imply deferred capabilities are already real.
- If the self-review finds planning-critical gaps, update the artifacts and repeat the review before closeout.

## User Review Gate

- Ask the user to review the written artifact set before planning.
- Present a current-understanding summary as a misunderstanding-correction gate and ask the user to confirm or correct the current understanding before the final handoff decision is locked.
- Summarize what was confirmed, what remains open, what was deferred or dropped, and what risk remains.
- Use the user's current language for the review summary and cover Business Goals, Users & Roles, confirmed product scope, user-confirmed delivery sequence, business rules, Technical Constraints / Assumptions, confirmed decisions, and Outstanding Questions.
- If the user requests artifact edits, stay in `sp-specify`, update the artifacts, and repeat artifact self-review.
- Recommend exactly one next command:
  - `/sp.plan` when the artifact package is `Aligned: ready for plan`.
  - `/sp.clarify` when planning-critical ambiguity remains.
  - `/sp.deep-research` when requirements are clear enough but feasibility, external evidence, or an implementation-chain proof is still needed.
- Do not present multiple next commands as equally valid.
- No alternative next command is valid for the current state.
- report the single valid next path for the current state. Do not emit a second alternative next command. Do not present multiple downstream command options.
- Only the user review gate may decide whether the canonical next command is `/sp.plan`, `/sp.clarify`, or `/sp.deep-research`.
- The completion state must preserve the literal `next_command` as `/sp.plan`, `/sp.clarify`, or `/sp.deep-research`.
- After the feature package is written, self-reviewed, and `workflow-state.md` records the single next command, mark the source discussion consumed when this run came from `sp-discussion`: run `specify discussion mark-consumed <slug> --feature-dir "$FEATURE_DIR"` where `<slug>` is derived from `.specify/discussions/<slug>/handoff-to-specify.md`. This writes `handoff_consumption_status: consumed`, `consumed_by_feature_dir: $FEATURE_DIR`, `status: completed`, and `next_command: none` in the source `discussion-state.md`, preventing stale `handoff-ready` discussions from blocking future `sp-auto` routing. If the helper command is unavailable, update those same fields manually and note the fallback in the completion report. Do not mark consumed before the artifacts exist and pass self-review.

## Completion Report

Report completion in the user's current language while preserving literal paths, command names, and fixed status values.

Include:
- branch name
- `spec.md` path
- `alignment.md` path
- `context.md` path
- `references.md` path when created
- `workflow-state.md` path
- `checklists/requirements.md` path
- `brainstorming/handoff-to-specify.json` path
- source-file sweep status
- source-signal disposition status
- readiness decision
- single next command
- cognition follow-up for artifact-only advisory state, if relevant

## Extension Hooks

After the completion report, check whether `.specify/extensions.yml` exists.

- If it exists, read entries under `hooks.after_specify`.
- If YAML cannot be parsed, skip hook execution guidance silently.
- Filter out hooks where `enabled` is explicitly `false`.
- Treat hooks without `enabled` as enabled.
- Do not evaluate non-empty hook conditions directly; leave condition evaluation to the HookExecutor implementation.
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

## Quick Guidelines

- Focus on what users need, why they need it, and what a planner must preserve.
- Start with whole-feature understanding before capability details.
- Keep one high-impact question at a time.
- Compare two or three approaches before locking the spec shape.
- Make semantic term narrowing explicit and source-linked.
- Read discussion source files when a discussion handoff exists; the handoff summary is not enough.
- Distinguish confirmed facts, low-risk assumptions, unresolved questions, deferred scope, and dropped scope.
- Avoid implementation design except where a dependency, constraint, boundary, or planning risk must be named.
- Keep generated artifacts concise, reviewable, and useful to `/sp.plan`.
- Do not treat product minimization as the default strategy. Scope reduction requires user confirmation before it can shape `spec.md`.
- Before dispatching independent review or evidence work, use `choose_evidence_lane_dispatch(command_name="specify", snapshot, workload_shape)` and record `lane_mode: read-only-evidence`, `dispatch_shape: one-subagent | parallel-subagents`, and `execution_surface: native-subagents` when a validated isolated read-only lane exists. Use delegated lanes only for isolated review/evidence packets, never for source edits or artifact writes.
- Record impacted surfaces and change-propagation expectations, major affected surfaces, verification entry points and minimum evidence expectations, and known unknowns or stale evidence boundaries that could change planning safety.
- Route to `/sp.clarify` when planning-critical ambiguity remains around scope, workflow behavior, constraints, or success criteria.
- Do not recommend `/sp.plan` until the written artifacts pass self-review and user review has been requested.

## Codex Subagent Capability Discovery

- Execution model: preserve the workflow's existing `subagent-mandatory`, `subagents-first`, `adaptive`, or `subagent-assisted` policy.
- Dispatch shape: preserve the workflow's existing dispatch shape; use `subagent-blocked` only after the discovery step below fails or is unsafe.
- Execution surface: prefer `native-subagents` when the current runtime supports it; use `none` only after recording the unavailable or unsafe surface.
- Native subagent capability discovery: Before recording `subagent-blocked`, confirm the current runtime exposes `spawn_agent`, `wait_agent`, and `close_agent`; if they are not visible, use the active tool discovery mechanism for multi-agent or subagent tools first.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch bounded subagents through `spawn_agent`.
- Join behavior: Rejoin with `wait_agent`, integrate, then `close_agent`.
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
- If the native tool is unavailable in the current runtime or the tool call fails, fall back to the shared open question block structure already defined in this template.
- In `specify`, use this preference for:
  - planning-critical clarification
  - capability split confirmation
  - current-understanding confirmation before `Aligned: ready for plan`
- Native tool target: `request_user_input` if the current Codex runtime exposes it
- Question count: 1-3 short questions per call
- Option count: 2-3 options per question
- Required question fields: `header`, `id`, `question`, `options`
- Option fields: `label`, `description`
- Put the recommended option first and suffix its label with `(Recommended)` when that distinction matters.
- Use this native surface for one bounded clarification or selection step; if it is unavailable or too narrow for the needed interaction, fall back immediately to the template's textual question format.

## Pre-Analysis Protocol

- Before drafting or asking clarification questions, identify the scope boundary, key constraints, affected surface area, known unknowns, and safest next step.
- Keep guided requirement discovery concise and avoid reviving the deprecated fixed heavy discovery lifecycle.
- Treat `final-handoff-decision` as a compatibility readiness check name only; do not restore the legacy staged handoff flow.
- Run project cognition planning navigation with `project-cognition compass --intent plan --query="$ARGUMENTS" --format json` first. Read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons, `verification_hints`, `followup_surfaces`, and `before_fix_claim`; treat `coverage_diagnostics` as confidence and closeout signals, use `expansion_ref` only when coverage state or live evidence requires more map detail, and do not infer final edit scope from first-pass reads. Preserve the advanced `lexicon -> semantic_intake -> query` path with `project-cognition query --intent plan --query-plan` for explicit concept decisions or unresolved coverage.
- The coverage-model check should identify truth-owning surfaces, change-propagation hotspots, verification entry points, and known unknowns relevant to the request, including module ownership, reusable components/services/hooks, integration points, and neighboring workflow constraints.
- Read `.specify/templates/workflow-state-template.md`. Create or resume `WORKFLOW_STATE_FILE` immediately after `FEATURE_DIR` is known with `phase_mode: planning-only`. Do not implement code, edit source files, edit tests, or run implementation-oriented fix loops from `sp-specify`.
- If the topical coverage for the touched area is missing, stale, or too broad: Run a codebase scout before clarification. Build a concise internal scout summary for the request area covering truth-owning surfaces and shared coordination surfaces, change-propagation hotspots, consumer surfaces, and neighboring surfaces likely to require review, verification entry points and regression-sensitive checks, and known unknowns, stale evidence boundaries, or observability gaps.
- Clarify planning-critical ambiguity, decompose the request into capabilities when needed, use default minimum depth as: happy path, failure path, compatibility impact, and acceptance proof. Write `context.md` to `CONTEXT_FILE`. Locked decisions are preserved in context.md. Provide the recommended review follow-up to `/sp.clarify` or `/sp.deep-research` when appropriate.
- Preserve this as an internal understand-before-acting pass; do not replace the one-question-at-a-time requirement discovery flow with a broad analysis report.

## Semantic Traceability Guidance

- Preserve the concise `sp-specify` flow: explore project context, ask one high-impact question at a time, compare two or three approaches, write artifacts, self-review, and ask for user review.
- When `sp-specify` comes from `sp-discussion`, read discussion source files such as `discussion-log.md`, `requirements.md`, and `open-questions.md`, not only the handoff summary.
- Record inspected files in `source_files_read` and every capability-like upstream signal in `source_signal_disposition`.
- Decompose semantic terms before narrowing scope and keep unconfirmed narrowing out of planning-ready state.
- Downstream stages must reopen upstream intent explicitly instead of silently reinterpreting it.

## Project Cognition Freshness Closeout

- This workflow is artifact-only unless the user explicitly requested source/runtime/template/config/test/generated-asset changes; do not call `project-cognition mark-dirty`, `project-cognition complete-refresh`, or `project-cognition validate-build --format json` just because `sp-specify`, `sp-plan`, or `sp-tasks` wrote planning artifacts.
- If this planning workflow makes actual source/runtime/template/config/test/generated-asset changes in the current run, it stops being artifact-only for closeout: run inline project cognition update from the workflow-owned changed paths and affected surfaces.
- Git-baseline freshness only changes after source/runtime/template/config/test/generated-asset changes are recorded; planning-only artifact edits do not require `project-cognition complete-refresh`, and manual override/fallback belongs only to an explicit map-maintenance recovery path.
- Inline project cognition update uses `project-cognition delta append` followed by `project-cognition update --delta-session "$DELTA_SESSION_ID" --reason workflow-finalize --format json` when a delta session exists, or `project-cognition update --payload-file ".specify/project-cognition/updates/<update-id>.json" --reason workflow-finalize --format json` when no delta session exists.
- The payload-file path must include changed_paths, behavior_surfaces, generated_surfaces, state_contracts, verification, known_unknowns, and confidence_notes so the update is equivalent to `sp-map-update`, not just a path stamp; `verification_evidence` and `generated_surface_notes` are accepted compatibility aliases.
- Use `known_unknowns` only for blockers that make the cognition update unsafe to trust. If unrelated dirty or untracked working-tree paths were excluded by explicit workflow-owned paths, record that as `confidence_notes` or `boundary.initial_dirty_paths`, not as blocking `known_unknowns`.
- clean closeout keys on `result_state`, not `update_id`, `last_update_id`, or freshness alone. Treat `ready` and `no_op` as clean, `partial_refresh` as recorded but not fully clean, `needs_rebuild` as a map-scan/map-build route, `blocked` as blocked, and `recorded` as legacy recorded-only output that is never clean completion.
- Use `project-cognition mark-dirty --reason "<reason>" --format json` only when inline update cannot complete.
- `sp-map-update` is for manual/external maintenance and follow-up repair, not routine cleanup for changes this workflow just made; run `/sp-map-scan` followed by `/sp-map-build` only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows outside `greenfield_empty`, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`.

## Codex Subagents-First Dispatch

When running `sp-specify` in Codex, use Codex native subagents only for bounded evidence, challenge, and artifact-review lanes that support the current collaborative specification pass.
- Do not let subagents invent scope, semantic-term choices, or upstream signal dispositions outside the leader-owned artifacts.
- Use `spawn_agent` for bounded source-file sweep, repository evidence, semantic-drift challenge, and artifact validation lanes.
- Use join points before section approval, before artifact self-review, and before the user review gate when delegated lanes are active.
- Launch all independent lanes in the current `parallel-subagents` wave before waiting.
- Suggested bounded lanes include discussion source sweep, targeted repository evidence, semantic-term challenge, upstream disposition review, and written artifact validation.
- Keep structured artifact discipline: Codex subagents may return evidence and challenges, but the leader updates `spec.md`, `alignment.md`, `context.md`, `workflow-state.md`, and `brainstorming/handoff-to-specify.json`.
- Use `wait_agent` only at explicit review join points and before final user review.
- Use `close_agent` after integrating finished subagent results.
- Keep the shared workflow language integration-neutral in user-visible output.
