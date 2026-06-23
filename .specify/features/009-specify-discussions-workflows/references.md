# References: Workflow Phase Execution Contracts

## Discussion Sources

| Source | Role In Spec |
| --- | --- |
| `.specify/discussions/workflows/handoff-to-specify.md` | User-confirmed downstream handoff, Must-Preserve ledger, consequence analysis, capability map |
| `.specify/discussions/workflows/handoff-to-specify.json` | Compatibility companion with quality gate, source evidence, must-preserve ledger, and consequence obligations |
| `.specify/discussions/workflows/discussion-log.md` | Chronological record of product decisions and user confirmations |
| `.specify/discussions/workflows/requirements.md` | Confirmed product intent, scope, non-goals, acceptance-shaping signals, UI discussion |
| `.specify/discussions/workflows/open-questions.md` | Resolved hard questions OQ-001 through OQ-018 and remaining soft/deferred items |
| `.specify/discussions/workflows/technical-options.md` | Approach comparison, grouped schema recommendation, lifecycle model, runtime control matrix |
| `.specify/discussions/workflows/project-context.md` | Prior live evidence and cognition coverage caveats |

## Project Cognition

| Source | Claim |
| --- | --- |
| `.specify/project-cognition/status.json` | Project cognition exists but is `review` / `partial_refresh`; use as advisory navigation only |
| `project-cognition lexicon --intent plan ...` | Alias catalog had product workflow coverage gaps and false-positive workflow/process candidates |
| `project-cognition query --intent plan ...` | Minimal live reads should include workflow services, SkillTool, skill loader/catalog, workflow APIs, desktop workflow UI, and tests |

## Live Repository Reads

| Source | Claim Verified |
| --- | --- |
| `src/server/services/workflowTypes.ts` | Workflow lifecycle, completion submission statuses, phase skill references, pending confirmation, transition records, stateVersion, artifact lifecycle, and session state are already modeled |
| `src/server/services/workflowTemplateValidation.ts` | Phase skills normalize as recommended references with source/provenance fields and validation diagnostics |
| `src/server/services/workflowTemplateRegistryService.ts` | Template writes preserve unknown fields and validate phase skills against a catalog |
| `src/server/services/workflowPhaseSkillResolver.ts` | Recommended skill resolution supports available, missing, ambiguous, unsupported-source, plugin-disabled, installable, and invalid-reference states |
| `src/server/services/workflowSessionCreateService.ts` | Workflow sessions snapshot template identity and phase skill resolutions at creation |
| `src/server/services/workflowRuntimeService.ts` | Runtime formats phase prompts/recommended skills, records completion artifacts, manages pending confirmation/retry/confirm/reject, and records transition history |
| `src/server/services/workflowToolPolicy.ts` | `submit_phase_completion` requires phaseId, stateVersion, status, handoff, rationale, and evidence; recommended skills do not grant SkillTool permissions |
| `src/server/api/workflowTemplates.ts` | Export/import already includes workflow package dependency manifest and dependency diagnostics |
| `src/server/api/skills.ts` | Current Settings skill API covers user/project/plugin skill listing/detail |
| `src/skills/loadSkillsDir.ts` | Runtime skill loader handles broader skill sources and permission-sensitive frontmatter |
| `src/tools/SkillTool/SkillTool.ts` | SkillTool owns invocation validation, permission handling, forked execution, usage recording, and context modifiers |
| `src/tools/SkillTool/prompt.ts` | SkillTool prompt treats matching skills as a normal invocation requirement; workflow recommendations must not bypass it |
| `desktop/src/types/session.ts` | Desktop types model workflow skill references, resolution statuses, evidence, dependency manifests, imports/exports, lifecycle, and transition actions |
| `desktop/src/types/skill.ts` | Desktop skill catalog item shape includes workflow phase skill source information |
| `desktop/src/api/skills.ts` | Desktop skill client supports list/catalog/detail calls |
| `desktop/src/stores/skillStore.ts` | Shared desktop skill store backs catalog and detail state |
| `desktop/src/components/workflow/WorkflowTemplateEditor.tsx` | Workflow editor already exposes recommended skill selection from the shared skill catalog |
| `desktop/src/components/workflow/WorkflowImportExportDialog.tsx` | Import/export dialog renders dependency diagnostics |
| `desktop/src/components/workflow/WorkflowTemplatePicker.tsx` | Workflow start picker is an adjacent start-time diagnostic surface |
| `desktop/src/components/workflow/WorkflowStatusPanel.tsx` | Runtime status panel displays pending/blocked artifacts, recommended skill status/evidence, stale/missing labels, and read-only artifact history |
| `desktop/src/components/workflow/WorkflowTransitionControls.tsx` | Runtime controls implement pending confirmation, manual completion, retry, stateVersion, and transition context |
| `desktop/src/pages/ActiveSession.tsx` | Active session view wires workflow status/controls and hides controls for completed/stale/missing states |
| `desktop/src/components/workflow/WorkflowComponents.test.tsx` | Existing tests cover import/export diagnostics, recommended skill selector, provenance, status evidence, pending priority, artifact history, and safe controls |

## Advisory Constraints

- The repository guidelines require same-area tests for production changes and `bun run verify` before claiming PR readiness.
- Persistent storage compatibility rules require forward migration, old-fixture regression tests, and preservation of unknown fields for storage shape changes.
- This `sp-specify` pass is artifact-only and does not require project-cognition mutation closeout.
