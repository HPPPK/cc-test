# References: Workflows Template Management And Chat Entry

## Discussion Artifacts

- `.specify/discussions/workflow-template-management/handoff-to-specify.md` - confirmed handoff summary and must-preserve ledger.
- `.specify/discussions/workflow-template-management/handoff-to-specify.json` - structured handoff, source evidence, senior consequence analysis, MP and CA ledgers.
- `.specify/discussions/workflow-template-management/discussion-log.md` - chronological user decisions and evidence checkpoints.
- `.specify/discussions/workflow-template-management/requirements.md` - product requirements, workflow contract, UI sketches, acceptance signals.
- `.specify/discussions/workflow-template-management/open-questions.md` - resolved hard questions and remaining soft questions.
- `.specify/discussions/workflow-template-management/technical-options.md` - approach comparison and selected options.
- `.specify/discussions/workflow-template-management/project-context.md` - repository evidence and external reference boundary.
- `.specify/discussions/workflow-template-management/handoff-assessment.md` - handoff readiness assessment.

## Live Repository Evidence

- `desktop/src/pages/Settings.tsx` - Settings navigation/content routing.
- `desktop/src/stores/uiStore.ts` - Settings tab routing state.
- `desktop/src/i18n/locales/en.ts` and `desktop/src/i18n/locales/zh.ts` - localized Settings labels.
- `desktop/src/components/chat/ChatInput.tsx` - composer plus menu, message count detection, current launch controls, empty-session replacement.
- `desktop/src/pages/EmptySession.tsx` - current workflow template picker and new session workflow payload.
- `desktop/src/pages/ActiveSession.tsx` - workflow status, transition controls, and report link display.
- `desktop/src/components/workflow/*` - existing workflow picker/status/control components.
- `desktop/src/api/sessions.ts` - desktop sessions API client including `listWorkflowTemplates()` and `create()`.
- `desktop/src/types/session.ts` - frontend workflow types.
- `src/server/router.ts` - `/api/workflows/templates` routing.
- `src/server/api/sessions.ts` - current GET-only workflow template API and workflow session creation snapshot path.
- `src/server/services/workflowTemplateRegistryService.ts` - built-in/user template registry, validation, write behavior, unknown-field preservation.
- `src/server/services/workflowTypes.ts` - workflow template, phase, lifecycle, transition, and session state types.
- `src/server/services/workflowRuntimeService.ts` - runtime phase context assembly.
- `src/commands/compact/index.ts` and `src/commands/compact/compact.ts` - `/compact` product semantics and implementation paths.

## External References

- Current official Claude Code docs were checked during discussion on 2026-05-26 for Skills, Commands, Hooks, Subagents, Schedules, and release notes.
- No stable official standalone Claude Code `/workflow` contract was found. This feature must use this repository's Workflows model as authoritative and treat external Skills/Commands concepts as UX inspiration only.
