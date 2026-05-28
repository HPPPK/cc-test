# Handoff Assessment: Workflow Template Management

- assessed_at: 2026-05-26T15:20:33.5855977+08:00
- decision_status: ready-for-specify
- required_next_action: write-unified-handoff

## Rationale

The discussion has one coherent implementation boundary: add a user-facing `Workflows` surface in the current `F:\github\cc-jiangxia` repository. The scope includes Settings workflow template management and Chat composer workflow entry.

Hard product choices are resolved:

- Settings management is CRUD for global user-level workflow templates.
- Built-in templates remain protected/read-only and copyable into user templates.
- JSON import/export is included.
- Import preview lets users select which workflows to import; conflicts default to automatic rename.
- Workflow phases are staged contracts, not prompt-only steps, and require output artifacts plus handoff contracts.
- Chat entry is through composer `+ > Workflows`.
- Non-empty chats require explicit context handling: inherit, summarize with `/compact`-style semantics, or clear.
- Inherit/summarize creates a linked new workflow session carrying chosen context; original normal chat is not mutated in place.

The remaining open questions are soft downstream decisions:

- Exact raw JSON affordance depth versus form-only editing.
- Whether invalid-template warnings should link directly to Settings.
- Exact server/API mechanism for linked workflow session creation and summary carry-over.

These do not block specification because the core behavioral contract and risk obligations are already explicit.

## Assessment Dimensions

- feature_coherence: coherent unified feature
- implementation_target_clarity: locked to current project `F:\github\cc-jiangxia`
- current_repository_role: implementation target and source evidence
- reference_source_clarity: active repository live files plus official Claude Code docs for inspiration only
- planning_shape: one unified feature with Settings, server API, registry persistence, desktop chat entry, and session creation changes
- validation_shape: server tests, desktop tests, workflow/session regression tests, then project verification gate
- risk_profile: medium-high due to persistence writes, user-owned config preservation, workflow session state, and linked-session behavior

## Source Evidence

- `.specify/discussions/workflow-template-management/requirements.md`
- `.specify/discussions/workflow-template-management/technical-options.md`
- `.specify/discussions/workflow-template-management/project-context.md`
- `.specify/discussions/workflow-template-management/open-questions.md`
- `src/server/services/workflowTemplateRegistryService.ts`
- `src/server/api/sessions.ts`
- `src/server/services/workflowTypes.ts`
- `src/server/services/workflowRuntimeService.ts`
- `desktop/src/pages/Settings.tsx`
- `desktop/src/components/chat/ChatInput.tsx`
- `desktop/src/pages/ActiveSession.tsx`
- `src/commands/compact/index.ts`
- `src/commands/compact/compact.ts`

## Blocking Unknowns

None.

## Soft Unknowns To Carry

- Raw JSON editing depth can be decided during specification/planning.
- Invalid-template shortcut placement can be decided during UI specification.
- Internal linked-session and compact-summary API shape can be decided during technical planning, provided CA-005 is preserved.

## Decision

Proceed to a single draft handoff package for review: `handoff-to-specify.md` and `handoff-to-specify.json`.
