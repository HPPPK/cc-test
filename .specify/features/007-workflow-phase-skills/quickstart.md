# Quickstart: Workflow Phase Skills Validation

This quickstart is for implementers after `/sp.tasks`. It describes expected behavior and verification, not manual user setup.

## 1. Authoring Scenario

1. Create or load a workflow template with at least two phases.
2. Ensure the local skill catalog contains one project/user skill and one missing reference.
3. Open `WorkflowTemplateEditor`.
4. Add an available skill to one phase through the phase-local recommended skill selector.
5. Add or import a missing recommended skill reference.
6. Save the template.

Expected:

- Saved phase `skills` contain references, not copied skill instructions.
- Old `{ name, reason }` entries still round-trip.
- Missing recommended skill is visible as degraded/warning state.
- Unknown fields are preserved.

## 2. Export Scenario

1. Export the workflow template.
2. Inspect the export payload.

Expected:

- Export includes templates plus a dependency manifest.
- Manifest lists every phase recommended skill.
- Export does not include skill package contents.
- Missing/degraded dependency diagnostics are visible before sharing.

## 3. Import Scenario

1. Import a package into an environment missing one recommended skill.
2. Preview the import.
3. Commit the import.

Expected:

- Preview reports the missing skill as a warning.
- Candidate remains selectable when missing recommended skills are the only issue.
- Imported template preserves unresolved skill references.
- Invalid reference shape remains an error.

## 4. Runtime Prompt Scenario

1. Start a workflow phase with one available and one missing recommended skill.
2. Inspect assembled prompt in a focused runtime test.

Expected:

- Prompt includes a distinct active-phase recommended skills block.
- Available skills are presented as recommended and attention-worthy.
- Missing skills are marked unavailable.
- Prompt says to invoke only when the task matches.
- Runtime does not auto-call SkillTool.

## 5. Evidence Scenario

1. Complete a phase where a recommended skill was used.
2. Complete another phase where a recommended skill was relevant but unavailable.
3. Create or retrieve the final report.

Expected:

- Evidence includes only `used`, `relevant-skipped`, or `relevant-unavailable` entries.
- Irrelevant recommended skills are not listed as unused.
- Final report and status panel show concise evidence/status.
- Resume/compaction preserves enough summary to explain prior phase skill behavior.

## Focused Test Targets

Server:

- `src/server/__tests__/workflowTemplates.test.ts`
- `src/server/__tests__/skills.test.ts`
- `src/server/__tests__/sessions.test.ts`
- `src/server/services/workflowRuntimeService.test.ts`
- `src/server/services/workflowFinalReport.test.ts`
- `src/server/services/workflowReportStore.test.ts`
- `src/server/services/workflowSummary.test.ts`
- `src/server/services/workflowToolPolicy.test.ts`
- `src/server/services/workflowTemplateRegistryService.test.ts`

Desktop:

- `desktop/src/components/workflow/WorkflowComponents.test.tsx`
- `desktop/src/__tests__/skillsSettings.test.tsx`
- `desktop/src/__tests__/pluginsSettings.test.tsx`
- `desktop/src/api/sessions.test.ts`
- `desktop/src/stores/sessionStore.test.ts`

Compact/resume:

- `src/services/compact/workflowSummaryCarryover.test.ts`

## Required Gates Before Implementation Completion

Run narrow focused tests first, then:

```powershell
bun run check:server
bun run check:desktop
bun run check:coverage
bun run verify
```

For later work that affects core agent loop/provider behavior beyond prompt assembly, also run a live baseline when provider credentials are available:

```powershell
bun run quality:providers
bun run quality:gate --mode baseline --allow-live --provider-model <provider:model[:label]>
```

If live providers are not configured, run the non-live gate and record the live-baseline blocker explicitly.
