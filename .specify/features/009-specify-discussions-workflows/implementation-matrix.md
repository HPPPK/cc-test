# Implementation Matrix

Artifact-only guardrail for T001. This freezes the requirement-to-task mapping before any source edit work begins.

- `unmapped_obligation_count`: `0`
- Coverage scope: `FR-001..FR-030`, `NFR-001..NFR-006`, `SC-001..SC-004`, `MP-001..MP-013`, `CA-001..CA-010`
- Required narrow gates: task-local tests from T002, T003, T007, T009, T011, T013, T015, and T017
- Required final gate: T018 with `bun run check:server`, `bun run check:desktop`, and `bun run verify`

## Task Verification Index

| Task | Verification |
| --- | --- |
| T001 | `Test-Path .specify/features/009-specify-discussions-workflows/implementation-matrix.md` |
| T002 | `bun test src/server/services/workflowTypes.test.ts src/server/services/workflowTemplateRegistryService.test.ts` |
| T003 | `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx` |
| T004 | `bun test src/server/services/workflowTypes.test.ts src/server/services/workflowTemplateRegistryService.test.ts src/server/__tests__/workflowTemplates.test.ts` |
| T005 | `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx` |
| T006 | `bun test src/server/services/workflowTypes.test.ts src/server/services/workflowTemplateRegistryService.test.ts`; `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx` |
| T007 | `bun test src/server/services/workflowPhaseSkillResolver.test.ts src/server/services/workflowToolPolicy.test.ts src/server/services/workflowRuntimeService.test.ts` |
| T008 | `bun test src/server/services/workflowPhaseSkillResolver.test.ts src/server/services/workflowToolPolicy.test.ts src/server/services/workflowRuntimeService.test.ts src/server/services/workflowFinalReport.test.ts src/server/services/workflowSummary.test.ts src/server/__tests__/skills.test.ts` |
| T009 | `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx src/api/skills.test.ts src/__tests__/skillsSettings.test.tsx` |
| T010 | `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx src/api/skills.test.ts src/__tests__/skillsSettings.test.tsx` |
| T011 | `bun test src/server/__tests__/workflowTemplates.test.ts src/server/services/workflowTemplateRegistryService.test.ts` |
| T012 | `bun test src/server/__tests__/workflowTemplates.test.ts src/server/services/workflowTemplateRegistryService.test.ts src/server/services/workflowPhaseSkillResolver.test.ts` |
| T013 | `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx` |
| T014 | `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx` |
| T015 | `bun test src/server/services/workflowRuntimeService.test.ts src/server/services/workflowSessionStateService.test.ts src/server/services/workflowFinalReport.test.ts src/services/compact/workflowSummaryCarryover.test.ts` |
| T016 | `bun test src/server/services/workflowRuntimeService.test.ts src/server/services/workflowSessionStateService.test.ts src/server/services/workflowFinalReport.test.ts src/services/compact/workflowSummaryCarryover.test.ts` |
| T017 | `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx` |
| T018 | `bun run check:server`; `bun run check:desktop`; `bun run verify` |

## T006 US1 Join Evidence

- `bun test src/server/services/workflowTypes.test.ts src/server/services/workflowTemplateRegistryService.test.ts` -> `36 pass, 0 fail, 103 expect() calls, 2 files`; legacy flat phase projection, grouped-only authoring, invalid grouped strength/provenance rejection, and runtimeState stripping all passed.
- `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx` -> `47 tests passed`; grouped authoring sections, grouped payload mapping, and runtimeState exclusion all passed.
- Old-template fixture coverage remains accounted for by `src/server/services/__fixtures__/workflow-templates/legacy-flat-phase-contract.json` through the passing registry projection test, so no legacy compatibility gap is left unverified.
- Logs: `.specify/features/009-specify-discussions-workflows/validation-logs/t006-server.log` and `.specify/features/009-specify-discussions-workflows/validation-logs/t006-desktop.log`.
- Residual risk: the desktop Vitest run still emits existing `act(...)` warnings from `WorkflowTemplateEditor` async updates, but they do not fail the suite.

## Checkpoint Gates

- `checkpoint-0` after T001: no implementation task starts until the matrix is complete.
- `checkpoint-us1` after T004 and T005, validated by T006.
- `checkpoint-us2` after T008 and T010, with T006 evidence still intact.
- `checkpoint-us3` after T012 and T014.
- `checkpoint-us4` after T016 and T017.
- `final-gate` after T018.

## Functional Requirements

| ID | Coverage | Tasks / checkpoint |
| --- | --- | --- |
| FR-001 | Grouped intent, contract, and evidencePolicy semantics | T002, T004, T005, checkpoint-us1 |
| FR-002 | Runtime state stays session-owned, not editable template data | T002, T004, T005, T015, T016, T017 |
| FR-003 | Flat phase fields map into grouped semantics without destructive migration | T002, T004, T006 |
| FR-004 | Guidance, policy, evidence, and gate constraints stay distinct | T002, T004, T015, T016 |
| FR-005 | Hard gates stay limited to explainable evidence-backed conditions | T002, T004, T015, T016, T017 |
| FR-006 | Recommended phase skills reference existing skills as the primary target | T007, T008, T009, T010 |
| FR-007 | Plugin identity is provenance metadata only | T007, T008, T011, T012 |
| FR-008 | Recommended skills remain advisory and do not auto-execute or block by default | T007, T008, T010 |
| FR-009 | Runtime semantics tell the agent to pay attention, invoke when relevant, and skip when irrelevant | T008, T010 |
| FR-010 | Use, relevant skip, and unavailable states are auditable when material | T008, T009, T010, T015, T016 |
| FR-011 | Soft audit is bounded and not mechanically exhaustive | T008, T009, T010, T016 |
| FR-012 | Skill references support names-first storage plus provenance qualifiers | T007, T008, T011, T012 |
| FR-013 | Export includes a dependency manifest and does not bundle skill contents | T011, T012, T014 |
| FR-014 | Import preview reports dependency diagnostics before commit | T011, T012, T013, T014 |
| FR-015 | Missing recommended skills warn and preserve unresolved references | T011, T012, T013, T014 |
| FR-016 | Invalid skill references are validation errors | T002, T004, T011, T012 |
| FR-017 | Session creation snapshots template identity and skill resolution/provenance | T008, T015, T016 |
| FR-018 | Runtime prompt includes contract context, evidence expectations, required artifacts, authority, and skill status | T008, T010, T015, T016 |
| FR-019 | Completion submissions require phaseId, stateVersion, status, handoff, rationale, and evidence | T015, T016, T017 |
| FR-020 | Completion submission statuses are ready, blocked, and unable | T015, T016, T017 |
| FR-021 | Blocked and unable stay recoverable inside running unless runtime/system failed | T015, T016, T017 |
| FR-022 | Pending confirmation blocks duplicate ready submissions | T015, T016, T017 |
| FR-023 | Transition actions record stateVersion and transition history | T015, T016, T017 |
| FR-024 | Pending confirmation UI exposes Confirm, Reject, and Retry only | T017 |
| FR-025 | Manual completion stays separate from confirming an agent-ready submission | T015, T016, T017 |
| FR-026 | Blocked/unable UI shows reason/evidence and Retry, without advancement controls | T015, T016, T017 |
| FR-027 | Auto-advance appears as an authority/status label, not a completion button | T015, T016, T017 |
| FR-028 | Stale and missing templates keep session snapshots authoritative | T008, T015, T016, T017 |
| FR-029 | Final reports and workflow artifacts preserve evidence, transition provenance, and relevant skill audit | T008, T015, T016, T017 |
| FR-030 | Recommended skill references are validated across authoring, import/export, and session start | T002, T004, T007, T008, T011, T012, T014, T015, T016 |

## Non-Functional Requirements

| ID | Coverage | Tasks / checkpoint |
| --- | --- | --- |
| NFR-001 | Skill-derived tools, shell behavior, hooks, forked agents, model changes, and effort changes keep explicit permission semantics | T007, T008, T010 |
| NFR-002 | Unknown fields and skill references are preserved unless validation rejects them | T002, T004, T006, T011, T012, T015, T016 |
| NFR-003 | User-facing states are perceivable without relying on color alone | T003, T009, T013, T017 |
| NFR-004 | Runtime diagnostics are actionable for missing, ambiguous, disabled, invalid, stale, or unsupported references | T007, T008, T011, T012, T013, T014, T017 |
| NFR-005 | Same-area tests and local quality gates are required before PR readiness | T002, T003, T007, T009, T011, T013, T015, T017, T018 |
| NFR-006 | Evidence and provenance survive resume, compaction, final report generation, and import/export boundaries | T008, T015, T016, T017, T018 |

## Success Criteria

| ID | Coverage | Tasks / checkpoint |
| --- | --- | --- |
| SC-001 | Server tests prove validation, resolver status, import/export diagnostics, session snapshotting, completion submissions, pending conflict behavior, and transition history | T002, T007, T011, T015, checkpoint-us2, checkpoint-us3, checkpoint-us4 |
| SC-002 | Desktop tests prove grouped editor behavior, skill selector provenance, dependency diagnostics, recommended skill status/evidence, pending controls, manual completion, blocked/unable retry, and stale/missing-template control hiding | T003, T009, T013, T017, checkpoint-us1, checkpoint-us2, checkpoint-us3, checkpoint-us4 |
| SC-003 | Old-template fixtures prove legacy flat fields and unknown fields remain compatible | T002, T004, T006, T011, T012 |
| SC-004 | Local PR gates pass or report explicit blockers | T018, final-gate |

## Must-Preserve Obligations

| ID | Coverage | Tasks / checkpoint |
| --- | --- | --- |
| MP-001 | Workflows stay phase execution contracts, not cosmetic grouping or hints | T001, T002, T004, T005, T006, T018 |
| MP-002 | Unified boundary across fields, constraints, skills, sharing, lifecycle, UI, compatibility, and validation | T001, T002, T003, T004, T005, T006, T011, T012, T013, T014, T015, T016, T017, T018 |
| MP-003 | Grouped intent, contract, evidencePolicy, and session-owned runtimeState stay distinct | T002, T004, T005, T015, T016, T017 |
| MP-004 | Guidance, policy, evidence, and gate strengths stay distinct with sparse hard gates | T002, T004, T015, T016 |
| MP-005 | Recommended phase skills bind to existing skills and remain soft by default | T007, T008, T009, T010 |
| MP-006 | Soft audit is bounded to used or clearly relevant skipped/unavailable skills | T008, T009, T010, T015, T016 |
| MP-007 | Sharing exports template data plus dependency manifest, not bundled skill content | T011, T012, T013, T014 |
| MP-008 | Lifecycle status stays separate from completion submission outcome | T015, T016, T017 |
| MP-009 | Pending confirmation uses Confirm, Reject, Retry and blocks duplicate ready submissions | T015, T016, T017 |
| MP-010 | Runtime controls stay safe and authority labels remain explicit | T015, T016, T017 |
| MP-011 | Compatibility-first adaptation comes before grouped persistence migration | T002, T004, T006, T011, T012 |
| MP-012 | Scheduler, auto-execution, default required gates, skill bundle export, and destructive migration stay out of scope | T001, T004, T008, T012, T016, T018 |
| MP-013 | Live repository evidence remains authoritative while project cognition is partial | T001, T006, T018 |

## Consequence Obligations

| ID | Coverage | Tasks / checkpoint |
| --- | --- | --- |
| CA-001 | Stable skill binding identity across local, bundled, plugin, managed, and MCP sources | T007, T008, T011, T012 |
| CA-002 | Priority semantics never override safety boundaries | T007, T008 |
| CA-003 | Missing, stale, disabled, invalid, ambiguous, plugin-disabled, unsupported-source, or unavailable skills degrade visibly | T007, T008, T011, T012, T013, T014 |
| CA-004 | Skill-derived tools and execution changes keep permission handling explicit | T007, T008 |
| CA-005 | Running, pending, completed, resumed, stale-template, and missing-template sessions preserve provenance or snapshot records | T008, T015, T016 |
| CA-006 | Used, skipped, and unavailable recommended skill decisions are observable when relevant | T008, T009, T010, T015, T016 |
| CA-007 | Workflow skill bindings are validated across authoring, import/export, duplicate/update, and session start | T002, T004, T011, T012 |
| CA-008 | UI labels and affordances distinguish recommended, unavailable, blocked, unable, pending, manual, auto, stale, and missing states | T003, T005, T009, T010, T013, T014, T017 |
| CA-009 | Skill evidence, completion evidence, and transition provenance survive compaction, resume, final reports, and imports | T015, T016, T018 |
| CA-010 | Recursive or unbounded nested skill invocation stays prevented | T007, T008 |

## Verification Summary

- The matrix is complete when every FR, NFR, SC, MP, and CA row points to at least one task or checkpoint.
- The implementation sequence is frozen by `checkpoint-0`, which makes T001 the only allowed write before source edits.
- The narrow checks are the per-task test commands indexed above.
- The final gate is T018 and must end with `bun run check:server`, `bun run check:desktop`, and `bun run verify`.

## T018 Final Evidence

- Behavior surfaces changed: server workflow template validation/registry/runtime/tool policy, workflow session/report/summary tests, desktop workflow editor/import/status/transition UI, desktop skill catalog/store/API, workflow i18n strings, and diagnostics stderr resilience for startup errors.
- Same-area tests added or updated: server workflow type/registry/resolver/runtime/session/report/tool-policy/API/summary tests; desktop workflow component, ActiveSession, skill API/store/settings tests; diagnostics startup stderr regression test.
- `bun run check:server` passed: 101 files, 1160 pass, 7 skip, 0 fail. Log: `.specify/features/009-specify-discussions-workflows/validation-logs/t018-check-server.log`.
- `bun run check:desktop` passed after T018 recovery: 98 files, 860 tests, 0 fail, followed by successful production build. Log: `.specify/features/009-specify-discussions-workflows/validation-logs/t018-check-desktop-rerun.log`.
- `bun run check:coverage --changed` passed: 5 suites passed, 0 failures, changed-line coverage 95.33% (531/557), minimum 90%; diagnosticsService changed lines are 100% (5/5). Report: `F:\github\cc-jiangxia\artifacts\coverage\2026-06-12T07-02-49-587Z\coverage-report.md`.
- Final `bun run verify` executed and produced no failed lanes: 9 passed, 0 failed, 2 skipped. It exited 1 because PR readiness is policy-blocked by CLI core change governance, not because any required local check failed. Report: `F:\github\cc-jiangxia\artifacts\quality-runs\2026-06-12T07-06-45-734Z\report.md`; coverage report: `F:\github\cc-jiangxia\artifacts\coverage\2026-06-12T07-10-24-168Z\coverage-report.md`.
- Skipped lanes in final verify: adapter checks and docs checks, both skipped by impact report because those areas were not required for this PR scope.
- Explicit blocker for PR-ready status: impact report says CLI core changes require the `allow-cli-core-change` label and maintainer approval. This is outside local agent authority; local checks required by the gate passed.
- E2E/live evidence: workflow session mode smoke passed in final verify. Live provider/model smoke was not run because PR-mode quality gate does not allow live checks and maintainer-controlled credentials/labels are required for the escalated `live-provider-checks` risk note.
- Project cognition closeout: inline `project-cognition update` executed with update id `upd-20260612T071641.981574600Z` and result_state `partial_refresh`; current status is `stale`, readiness `review`, recommended_next_action `review_project_cognition_update`. Log: `.specify/features/009-specify-discussions-workflows/validation-logs/t018-project-cognition-update.log`.
- Remaining risks: repository worktree contains many pre-existing unrelated dirty files, so impact scope reports 660 changed files; target coverage gaps remain for legacy agent-tools/agent-utils and desktop function coverage, but the changed-line coverage gate passed and no coverage failure remains; project cognition is recorded but not clean because the inline update returned `partial_refresh`.
