# Discussion State: Workflows

## Current Command

- active_command: sp-discussion
- state_surface: discussion-state
- status: handoff-ready
- slug: workflows
- updated_at: 2026-05-29T15:54:40.6502152+08:00

## Phase Mode

- phase_mode: discussion-only
- summary: New discussion opened to explore "workflows". The user chose to start a fresh discussion instead of resuming prior handoff-ready workflow discussions, then selected the overall direction option. The clarified direction is not to invent "workflow skills" as a separate prompt-only system. Existing skills already have passive discovery, explicit invocation, metadata, and sometimes bundled scripts/templates/assets/tools. A workflow phase skill should primarily be a fixed recommended skill set on the phase: selected when the workflow template/phase is authored, surfaced in the active phase prompt, and treated as phase-local skills the agent should pay special attention to. The phase binding should not duplicate reason/appliesWhen-style metadata because the skill itself already owns its description and applicability semantics. Names are acceptable by default; source/qualified reference should be used only when needed for ambiguity or portability. Skill source should be the same current available capability catalog users see in Settings > Skills and plugin capability navigation, not a workflow-local skill store. Current source evidence shows that Settings > Skills uses `/api/skills` and `useSkillStore`, plugin detail can navigate plugin skills into the shared skill detail flow, and frontend skill types already include user/project/plugin/mcp/bundled while the current server API primarily collects user/project/plugin. User confirmed workflow should bind to skills, not plugins; plugin identity is secondary provenance/dependency when a selected skill is plugin-provided. Workflow sharing should use a workflow package model: export the template plus a skill dependency manifest, not skill package contents by default. Import should diagnose available, missing, ambiguous, unsupported-source, and optionally installable skill dependencies. Confirmed default for missing recommended phase skills is import-with-warnings: keep the reference, mark the skill unavailable in import preview/runtime prompt, and soft-audit relevant missing skills; do not block import or completion by default. UI direction is confirmed: phase-local skill selector in WorkflowTemplateEditor is the primary authoring surface, workflow-level import/export shows dependency diagnostics, and runtime surfaces show only lightweight skill status/evidence. Future required/contract phase skills may use stricter blocking or explicit skip evidence. Future explicit bundle mode may be allowed only for reviewed project-owned skills. Whether to use a phase skill remains the agent's judgment based on the current task. The accepted prompt semantics are: these skills are selected for the active phase; pay special attention to them when deciding whether a skill applies; invoke when the current task matches; do not invoke when irrelevant; at phase completion, briefly note any phase skills used or clearly relevant but skipped/unavailable. Phase skills do not auto-execute or block completion by default.

## Session Routing

- current_stage: handoff-ready
- current_topic: workflows
- next_question: none
- blocker_reason: none
- readiness_note: User confirmed the self-reviewed handoff pair. Discussion is handoff-ready for later `sp-specify` input; `sp-specify` was not run automatically.
- ui_discussion_status: completed

## Lightweight Recovery

- latest_event_checkpoint: 2026-05-29T01:46:19.1683045+08:00
- last_compaction_checkpoint: none
- compact_summary_status: current
- ordinary_turn_write_policy: append compact event only
- structured_refresh_policy: semantic-checkpoint-only

## Context Boundary

- context_boundary_status: locked
- current_project_root: F:\github\cc-jiangxia
- current_project_roles:
  - role: discussion-host
    scope: Active repository context where this sp-discussion session is stored.
    evidence_source: current working directory and user-selected new discussion.
    notes: The active repository is the discussion host and the likely product context.
  - role: product-context
    scope: Overall cc-jiangxia workflows product and agent capability direction.
    evidence_source: user selected option 1, "整体方向".
    notes: Source-grounded implementation targets are not yet claimed.
- target_project_root: F:\github\cc-jiangxia
- target_project_roles:
  - role: product-direction-target
    scope: Define the intended role of workflows inside cc-jiangxia before selecting concrete features or implementation paths.
    evidence_source: user selected option 1, "整体方向".
    notes: Technical placement and affected paths remain unverified and out of scope until context-grounding.
- reference_sources:
  - prior discussion candidates: .specify/discussions/workflow-template-management/
  - prior discussion candidates: .specify/discussions/agent-workflow-authoring-tools/
- external_systems: []
- boundary_blockers: []
- path_status: user-confirmed
- boundary_confidence: medium

## Evidence Navigation

- latest_cognition_intent: discussion
- latest_cognition_readiness: blocked
- latest_minimal_live_reads:
  - src/tools/SkillTool/SkillTool.ts
  - src/tools/SkillTool/prompt.ts
  - src/skills/loadSkillsDir.ts
  - src/server/services/workflowTypes.ts
  - src/server/services/workflowRuntimeService.ts
  - src/server/services/workflowToolPolicy.ts
  - src/tools.ts
  - src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.tsx
- latest_live_evidence:
  - src/tools/SkillTool/prompt.ts instructs the model to invoke the Skill tool as a blocking requirement when a matching skill applies.
  - src/tools/SkillTool/SkillTool.ts executes skills by name, supports inline skill insertion and forked sub-agent execution, and can modify allowed tools, model, and effort through the returned context modifier.
  - src/skills/loadSkillsDir.ts parses skill frontmatter including allowed-tools, disable-model-invocation, context=fork, agent, effort, and shell, then builds prompt commands whose content can run prompt shell expansion for non-MCP skills.
  - src/server/services/workflowTypes.ts defines WorkflowSkillDeclaration as source=template plus guidance and provenance, not as an executable skill binding.
  - src/server/services/workflowRuntimeService.ts assembles active workflow prompts and includes skillDeclarations as "Skill guidance".
  - src/server/services/workflowToolPolicy.ts explicitly says workflow skill declarations are prompt-level guidance only and do not enable SkillTool globally.
  - src/tools.ts includes SkillTool and WorkflowTemplateAuthoringTool in the base tool pool and only exposes submit_phase_completion as the current workflow-scoped tool.
  - .codex/skills contains examples of non-prompt-only skill packages with scripts, assets, examples, references, and agents, such as webapp-testing scripts, skill-creator scripts/assets/agents, and code-review-skill assets.
  - desktop/src/api/skills.ts exposes Skills settings API calls for listing skills and loading skill detail by source/name/cwd.
  - desktop/src/stores/skillStore.ts centralizes the desktop skill list/detail state used by Settings.
  - desktop/src/types/skill.ts models skill sources as user, project, plugin, mcp, and bundled.
  - src/server/api/skills.ts currently lists installed skills for user, project, and plugin sources, and exposes detail lookup for those sources.
  - desktop/src/components/skills/SkillList.tsx groups current skills by source for Settings > Skills.
  - desktop/src/components/plugins/PluginDetail.tsx opens plugin skills through the shared skill detail flow when the plugin is enabled.
  - desktop/src/components/workflow/WorkflowTemplateEditor.tsx currently exposes phase skills as an advanced freeform textarea, converting each line into a workflow phase skill declaration.
  - desktop/src/components/workflow/WorkflowTemplateManager.tsx provides Settings workflow template management with create/edit/copy/delete/import/export.
  - desktop/src/components/workflow/WorkflowImportExportDialog.tsx provides import preview and export generation but does not currently show skill dependency status.
  - desktop/src/components/workflow/WorkflowTemplatePicker.tsx is the workflow start template selection surface and can show invalid template diagnostics.
- cognition_authority_rule: project cognition navigates; live repository evidence proves
- unresolved_evidence_conflicts: []

## Session Selection

- incomplete_statuses: active, blocked, handoff-ready
- resume_rule: resume only when exactly one incomplete discussion is available or the user selected a slug
- collision_rule: append date or short numeric suffix when a generated slug already exists

## Handoff Assessment

- handoff_assessment_status: ready-for-specify
- handoff_assessment_path: .specify/discussions/workflows/handoff-assessment.md
- handoff_assessment_decided_at: 2026-05-29T15:33:41.0647544+08:00
- handoff_scope_shape: unified

## Handoff Review

- handoff_review_status: user-confirmed
- handoff_user_confirmed_at: 2026-05-29T15:54:40.6502152+08:00
- handoff_blocker_reason: none
- handoff_quality_gate: draft

## Allowed Artifact Writes

- discussion-state.md
- discussion-log.md
- requirements.md
- technical-options.md
- project-context.md
- open-questions.md
- handoff-assessment.md only after explicit user request
- handoff-to-specify.md draft after explicit user request and boundary lock; mark handoff-ready only after self-review pass and user confirmation
- handoff-to-specify.json draft after explicit user request and boundary lock; mark handoff-ready only after self-review pass and user confirmation

## Forbidden Actions

- create feature branch
- create feature directory
- write spec.md
- write plan.md
- write tasks.md
- edit source code
- edit tests
- run implementation-oriented fix loops
- automatically invoke sp-specify
- infer handoff readiness without explicit user instruction
- add, recommend, or route to sp-split
- write separate split planning artifacts
- write candidate-specific handoff Markdown or JSON
- write pointer-only handoff-to-specify.md or handoff-to-specify.json
- use current project cognition to prove another project's implementation facts

## Authoritative Files

- discussion-state.md
- discussion-log.md
- requirements.md
- technical-options.md
- project-context.md
- open-questions.md
- handoff-assessment.md when present
- handoff-to-specify.md when draft or user-confirmed, according to handoff_review_status
- handoff-to-specify.json when draft or user-confirmed, according to handoff_review_status

## Senior Consequence Analysis

- consequence_gate_status: triggered
- trigger_reason: Workflow-declared executable or higher-priority skills can affect agent instruction priority, tool permissions, skill invocation, workflow phase lifecycle, running and resumed sessions, template validation, compaction/resume, and user trust boundaries.
- stand_down_reason: none
- active_consequence_obligations:
  - CA-001
  - CA-002
  - CA-003
  - CA-004
  - CA-005
  - CA-006
  - CA-007
  - CA-008
  - CA-009
- CA-010
- latest_consequence_handoff: none
- coverage_gap_count: 3

## Handoff

- handoff_to_specify: .specify/discussions/workflows/handoff-to-specify.md
- handoff_to_specify_json: .specify/discussions/workflows/handoff-to-specify.json
- handoff_goal: Specify workflow phase skills as recommended bindings to existing skills, including shared-catalog authoring, dependency-aware import/export, active-phase prompt behavior, and lightweight runtime evidence.
- quality_gate_status: user-confirmed
- handoff_requested_by_user: true
- next_command: /sp.specify with .specify/discussions/workflows/handoff-to-specify.md when the user explicitly requests it
