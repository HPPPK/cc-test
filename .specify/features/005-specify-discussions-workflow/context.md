# Planning Context: Workflows Template Management And Chat Entry

**Feature Branch**: `005-specify-discussions-workflow`  
**Created**: 2026-05-26  
**Status**: User review requested  
**Derived From**: discussion handoff, discussion source files, project cognition, and targeted live repository reads

## Planning Context

- Scope is one unified `Workflows` feature covering Settings template management, standard staged workflow contracts, and Chat composer workflow entry.
- The user confirmed the unified spec shape after the `sp-discussion` handoff.
- No hard unknowns remain. Soft planning details are raw JSON editing depth, invalid-warning shortcut placement, and internal API shape for linked workflow sessions.
- Senior consequence analysis is triggered because this feature touches lifecycle state, user-owned config, session creation, transcripts, workflow snapshots, and compatibility surfaces.

## Relevant Repository Context

- `desktop/src/pages/Settings.tsx` owns Settings tab navigation/content routing. A new `Workflows` tab must fit this pattern.
- `desktop/src/stores/uiStore.ts` owns `SettingsTab`; adding a Settings tab requires updating this union and routing.
- `desktop/src/i18n/locales/en.ts` and `desktop/src/i18n/locales/zh.ts` own Settings labels.
- `desktop/src/components/chat/ChatInput.tsx` owns composer `+` menu behavior, message count detection, empty-session replacement, and current launch controls.
- `desktop/src/pages/EmptySession.tsx` already loads workflow templates and sends workflow metadata during new session creation.
- `desktop/src/pages/ActiveSession.tsx` shows workflow status, transition controls, and report links when `session.workflow` exists.
- `desktop/src/components/workflow/*` contains existing workflow picker/status/control UI patterns.
- `desktop/src/api/sessions.ts` currently exposes `listWorkflowTemplates()` as `GET /api/workflows/templates` and `create()` with optional workflow metadata.
- `desktop/src/types/session.ts` defines workflow template list, validation issue, and workflow session summary types.
- `src/server/router.ts` routes `/api/workflows/templates` to `handleWorkflowTemplatesApi`.
- `src/server/api/sessions.ts` currently implements workflow template API as GET-only and creates workflow metadata only when `POST /api/sessions` includes `workflow`.
- `src/server/services/workflowTemplateRegistryService.ts` owns built-in/user template loading, validation, writing, unknown-field merge behavior, built-in id protection, and registry cache.
- `src/server/services/workflowTypes.ts` defines workflow lifecycle, template, phase, artifact, prompt, transition, and session state types.
- `src/server/services/workflowRuntimeService.ts` assembles phase runtime context from instructions, phase prompt, action policy, artifacts, completion criteria, skills, and model info.
- `src/commands/compact/index.ts` defines `/compact` as clearing conversation history while keeping a summary in context.
- `src/commands/compact/compact.ts` implements compaction through available session-memory, reactive, or traditional compaction paths.

## Existing Patterns And Reuse Notes

- Existing Settings pages use internal tab state and localized labels; the `Workflows` UI should follow that pattern.
- Existing workflow template list API returns summaries plus invalid template issues; mutation/import/export can extend the workflow API rather than creating unrelated storage.
- Existing registry write behavior already attempts unknown-field preservation; all new write paths must keep that invariant.
- Existing workflow session creation snapshots a registry template into workflow state; this supports the requirement that edits affect future sessions only.
- Existing ActiveSession workflow panels should remain the display source for workflow status and transitions.
- Existing `/compact` semantics are the product reference for summarize-current-context.

## Integration Boundaries

- **Settings boundary**: UI edits must call server APIs rather than writing files from the desktop frontend.
- **Persistence boundary**: Only cc-jiangxia-owned `~/.claude/cc-jiangxia/workflows.json` is writable for this feature; protected Claude/shared files are out of scope.
- **Registry boundary**: Built-in templates remain canonical in code and cannot be shadowed by user templates.
- **Session boundary**: Existing normal chat transcripts are not mutated into workflow sessions in place.
- **Workflow snapshot boundary**: Created workflow sessions continue from stored snapshots even if source templates later change.
- **Compaction boundary**: Summary carry-over must reuse `/compact`-style semantics or a proven equivalent internal compaction route.
- **Streaming boundary**: Starting Workflows from active streaming chats must be disabled or explicitly designed and tested.

## Product Boundary Constraints

- First version custom workflow templates are global user-level only.
- Workflows are staged execution contracts, not prompt collections.
- Every phase must have an explicit output artifact and handoff contract.
- Advanced phase schema should be available without overwhelming the default editor.
- Import conflicts default to automatic rename and never overwrite by default.
- No external Claude Code `/workflow` feature is treated as a stable contract.

## Affected Object Map

| Obligation | Object / State Surface | Owner | Consumers | Evidence | Coverage Gap |
| --- | --- | --- | --- | --- | --- |
| CA-001 | Built-in template list/startability | server registry/API | Settings, EmptySession, Chat picker | `workflowTemplateRegistryService.ts`, `sessions.ts` | mutation API tests needed |
| CA-002 | `~/.claude/cc-jiangxia/workflows.json` writes | server registry | Settings editor, import/export | registry `writeTemplates` merge behavior | all new write paths must preserve invariant |
| CA-003 | Built-in id protection | registry validation, Settings UI | import/export, editor, session creation | built-in id validation | planner must define API errors/UI states |
| CA-004 | Workflow session snapshots | workflow state service/runtime | ActiveSession, resume, reports | session creation snapshot behavior | no retroactive migration in scope |
| CA-005 | Existing normal chats/transcripts | ChatInput, sessions API, compaction path | users, session list, workflow runtime | ChatInput and `/compact` live reads | linked-session API shape unresolved |
| CA-006 | Phase output/handoff schema | registry types, editor, validation | runtime, planner, users | workflow types/runtime | exact editor field mapping remains planning work |

## State-Behavior Matrix

| State | Required Behavior |
| --- | --- |
| Missing user config | Built-in workflow remains visible and startable. |
| Malformed user config | Built-in remains startable; diagnostics visible; writes must not silently destroy content. |
| Valid user template | Visible, editable, exportable, and startable for future sessions. |
| Invalid user template | Visible with diagnostics; not startable; rejected by save/import validation. |
| Built-in template | Read-only and copyable; no direct edit/delete. |
| Running/completed workflow session | Continues from snapshot; source template edits do not mutate it. |
| New empty chat | Can start Workflow through current launch flow. |
| Existing normal chat | Requires context choice, then creates linked workflow session; original chat remains unchanged. |
| Existing workflow chat | Remains workflow and shows status/transition controls. |
| Active streaming chat | Must not allow unsafe workflow start/conversion without explicit design and tests. |

## Dependency Impact Table

| Surface | Impact | Required Handling |
| --- | --- | --- |
| Desktop Settings | New tab, list/editor/import/export dialogs | Follow existing tab and localization patterns. |
| Server workflows API | Must move beyond GET-only template list | Validate inputs and preserve registry invariants. |
| Registry persistence | Shared global user config | Preserve unknown fields, reset cache, reject unsafe ids. |
| Desktop Chat composer | New plus-menu action and dialog | Must preserve attachment/slash/menu behavior. |
| Session creation | Existing workflow snapshot path | Extend or add linked-session creation without in-place conversion. |
| Compaction | Summary carry-over for non-empty chats | Reuse `/compact` semantics or equivalent service path. |
| Workflow runtime/status | Existing workflow sessions | Keep status panels and transitions compatible. |

## Change Propagation Matrix

| Change Surface | Upstream Inputs | Downstream Consumers | Constraint / Risk |
| --- | --- | --- | --- |
| Workflow template mutation API | Settings CRUD/import | registry, desktop API client, tests | lossless writes and validation required |
| Settings Workflows UI | user edits/import JSON | server API, i18n, validation UI | accessible and schema-aware without raw-only UI |
| Chat Workflows dialog | plus-menu selection, current session state | session creation, tab/navigation, workflow runtime | explicit context strategy required |
| Linked workflow session | current chat context, summary/clear strategy | session list, transcript persistence, workflow state | original chat must remain unchanged |
| Phase contract validation | authoring fields | runtime prompt assembly, transition controls | output/handoff cannot be unstructured prompt text only |

## Locked Decisions Carry-Forward

- Unified feature scope is confirmed by the user.
- User-facing label is `Workflows`.
- Built-ins are protected and copyable.
- User templates are global user-level only.
- JSON import/export is in scope with preview and auto-rename conflict handling.
- Non-empty chat entry requires explicit context handling and linked-session behavior.
- Existing workflow snapshots are not mutated by template edits.

## Must-Preserve Carry-Forward

- Preserve `MP-001` through `MP-015` exactly as mapped in `spec.md`.
- Stop and reopen if Settings management or Chat entry is dropped, if built-ins become editable in place, if project-level templates enter first-version scope, if import overwrites by default, if phases become prompt-only, if non-empty chats enter Workflows without explicit context choice, or if existing sessions are mutated retroactively.

## Canonical References

- `.specify/features/005-specify-discussions-workflow/spec.md`
- `.specify/features/005-specify-discussions-workflow/alignment.md`
- `.specify/discussions/workflow-template-management/handoff-to-specify.md`
- `.specify/discussions/workflow-template-management/handoff-to-specify.json`
- `.specify/discussions/workflow-template-management/requirements.md`
- `.specify/discussions/workflow-template-management/technical-options.md`
- `.specify/discussions/workflow-template-management/project-context.md`

## Outstanding Questions

- Exact raw JSON editing depth in the Settings editor.
- Whether invalid template warnings in session creation should link directly to Settings.
- Internal API design for linked workflow session creation and compact-style summary carry-over.

## Deferred / Future Ideas

- Project-level workflow templates and precedence.
- Retroactive migration or update flows for existing workflow sessions.
- Branching, loop, parallel, or nested workflow definitions.
- Treating a future official external `/workflow` feature as a hard reference after fresh evidence.
