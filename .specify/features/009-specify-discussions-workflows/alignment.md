# Alignment: Workflow Phase Execution Contracts

## Current Understanding

The user-confirmed feature is a unified workflow contract capability for cc-jiangxia. Workflows should define phase execution contracts that combine grouped phase fields, soft-by-default constraints, recommended phase skill bindings, dependency-aware sharing, lifecycle/completion rules, runtime/editor UI behavior, compatibility, and validation.

This is not a request to implement code in `sp-specify`. It is a planning-ready specification package for `/sp.plan`.

## Confirmed Facts

- The discussion handoff is user-confirmed and handoff-ready.
- The target project is the current repository: `F:\github\cc-jiangxia`.
- The selected approach is a canonical product contract with existing implemented behavior treated as baseline evidence.
- Project cognition is available but `review` / `partial_refresh`; it selected `SkillTool - Skill Invocation` and a broad coverage-gap node. Live repository reads are authoritative for implementation facts.
- Live reads show existing workflow-related behavior already includes lifecycle statuses, completion submission statuses, stateVersion, pending confirmation, transition history, phase skill references, phase skill resolution, dependency manifests, import/export diagnostics, recommended skill selector UI, recommended skill status UI, and transition-control tests.

## Assumptions

- Existing behavior may be incomplete, inconsistent, or insufficiently tested; `/sp.plan` must classify each requirement as existing, missing, or hardening work.
- The shared skill catalog/API/resolver is the integration boundary. Settings > Skills is evidence of user-facing source of truth, not the reusable implementation boundary by itself.
- No source/runtime/test files should be changed by this workflow.

## Approach Decision

- **Selected**: Canonical product contract with baseline evidence.
- **Rejected**: Remaining-gap-only spec, because it risks dropping user-confirmed upstream scope.
- **Rejected**: Direct grouped-persistence migration spec, because it conflicts with the confirmed compatibility-first decision.
- **User confirmation**: user selected `1`, then approved section-shape continuation with `继续`.

## Capability Split

1. Phase contract field model.
2. Constraint semantics and gate behavior.
3. Recommended phase skill bindings and soft audit.
4. Dependency-aware workflow package sharing.
5. Lifecycle and completion submission state model.
6. Runtime/editor UI grouping and controls.
7. Compatibility, validation, old-template fixtures, and stateVersion protection.

## Semantic Term Decisions

| Term | Possible Meanings | Selected Meanings | Excluded Meanings | User Confirmation |
| --- | --- | --- | --- | --- |
| workflow | Product workflow template/session; GitHub Actions workflow; Spec Kit command workflow | cc-jiangxia product workflow template/session | GitHub Actions and Spec Kit command flow as primary target | Confirmed by handoff and Approach 1 |
| phase execution contract | Cosmetic editor grouping; runtime-enforced scheduler; phase intent plus execution/evidence/transition contract | Phase intent, contract, evidence policy, lifecycle and transition behavior | Full scheduler/engine | Confirmed by MP-001 and MP-002 |
| real / usable skill | Prompt text only; SkillTool-invocable capability; plugin package | Existing SkillTool skill capability with its own metadata/effects | Plugin as primary binding target; prompt-only guidance | Confirmed by OQ-014 and MP-005 |
| recommended phase skill | Hard requirement; auto-executed skill; advisory phase binding | Fixed phase-local recommended binding, emphasized when relevant | Default auto-execution and default hard gates | Confirmed by OQ-006, OQ-011, MP-005 |
| priority / higher priority | Safety override; fixed user-visible ranking; prompt/candidate emphasis | Stronger phase-context attention and candidate relevance | Permission bypass, safety override, forced invocation | Confirmed by OQ-009, OQ-011, CA-002 |
| completion | User saying continue; terminal runtime success only; structured completion submission | `ready` / `blocked` / `unable` submission with stateVersion, handoff, rationale, evidence | Treating blocked/unable as terminal runtime failure | Confirmed by OQ-016 and MP-008 |
| authoring / create / scaffold | Manual static template copy; UI/API/tool workflow template creation and editing | Authoring through validated workflow template API/tool/UI surfaces | Static-template-only support | Confirmed by UI discussion and live authoring surfaces |
| dependency manifest | Bundled skill contents; diagnostic references; installer plan | Template export metadata listing referenced skill dependencies and resolution status | Default arbitrary skill bundle | Confirmed by OQ-015 and MP-007 |
| runtimeState | Editable template config; session-owned state | Session-owned status, pending confirmation, artifacts, transition history, evidence, snapshots | Editable template runtime data | Confirmed by MP-003 |

## Upstream Intent Disposition

| ID | Source Signal | Source | Disposition | Artifact Location | User Confirmed | Reopen Trigger |
| --- | --- | --- | --- | --- | --- | --- |
| MP-001 | Workflows as phase execution contracts | handoff, requirements, technical-options | preserved | `spec.md#overview`, `spec.md#requirements` | yes | Contract semantics reduced to cosmetic grouping |
| MP-002 | Unified scope across fields, constraints, skills, sharing, lifecycle, UI, compatibility, validation | OQ-018, handoff | preserved | `spec.md#confirmed-scope`, `spec.md#capability-decomposition` | yes | Scope split drops lifecycle/UI consistency |
| MP-003 | `intent`, `contract`, `evidencePolicy`, session-owned `runtimeState` | technical-options | in_scope | `spec.md#requirements` | yes | Runtime state becomes editable template data |
| MP-004 | Guidance, policy, evidence, gate strengths | technical-options | in_scope | `spec.md#requirements` | yes | Every instruction becomes hard gate |
| MP-005 | Recommended phase skills bind to existing skills, not plugins, soft by default | requirements, OQ-006, OQ-014 | preserved | `spec.md#requirements`, `spec.md#semantic-term-decisions` | yes | Plugins become primary target or skills auto-run |
| MP-006 | Bounded soft audit only for used/relevant skipped/unavailable skills | OQ-007, OQ-008 | preserved | `spec.md#requirements` | yes | Audit lists everything or records nothing |
| MP-007 | Template plus dependency manifest, no default bundled skill packages | OQ-015 | preserved | `spec.md#requirements`, `spec.md#scenarios-and-usage-paths` | yes | Import drops references or export implies bundled skills |
| MP-008 | Lifecycle status separate from completion submission outcome | OQ-016 | preserved | `spec.md#requirements` | yes | Blocked/unable become terminal failures |
| MP-009 | Pending confirmation resolves through Confirm/Reject/Retry and blocks duplicate ready submissions | OQ-016, OQ-017 | preserved | `spec.md#requirements` | yes | Pending ready submissions overwrite silently |
| MP-010 | Safe runtime controls and authority labels | OQ-017 | preserved | `spec.md#requirements` | yes | UI mixes manual completion with pending confirmation |
| MP-011 | Compatibility-aware adapter before grouped persistence migration | technical-options | preserved | `spec.md#confirmed-scope`, `spec.md#decision-capture` | yes | Destructive migration without old-template fixtures |
| MP-012 | Non-goals: scheduler, auto-execution, required gates, bundles, destructive migration | requirements, technical-options | deferred | `spec.md#confirmed-scope`, `spec.md#decision-capture` | yes | Feature expands into scheduler/capability engine |
| MP-013 | Live repository evidence authoritative while cognition is stale/partial | project-context, cognition intake | deferred | `context.md#project-cognition-intake`, `references.md` | yes | Restored cognition contradicts live-read assumptions |

## Capability-Like Signal Disposition

| Signal | Source | Disposition | Notes |
| --- | --- | --- | --- |
| grouped phase fields | handoff, technical-options | in_scope | Intent, Contract, Evidence in authoring; Runtime Status session-owned |
| soft-by-default constraints | technical-options | preserved | Hard gates sparse and explainable |
| recommended phase skill bindings | requirements, OQ-006 through OQ-015 | preserved | Advisory by default, skill target not plugin target |
| real/usable skill capability | requirements, discussion-log | preserved | SkillTool semantics and skill metadata remain authoritative |
| create/authoring workflow | UI discussion, live editor/API reads | in_scope | Validated UI/API/tool authoring surfaces; not manual copy-only |
| dependency-aware sharing | OQ-015, handoff | preserved | Export dependency manifest and import diagnostics |
| lifecycle/completion model | OQ-016 | preserved | Completion outcome separate from runtime lifecycle |
| runtime controls | OQ-017 | preserved | Pending, manual, blocked/unable, auto label, session controls |
| compatibility and validation | handoff, project guidelines | preserved | Old fixtures and same-area tests required |
| full scheduler/execution engine | non-goal | deferred | Future scope only |
| auto-executing recommended skills | non-goal | deferred | Future explicit request required |
| default required skill hard gates | non-goal | deferred | Future narrow quality-gate mode |
| arbitrary skill bundle export | non-goal | deferred | Future reviewed bundle mode |
| direct grouped persistence migration | tradeoff | deferred | Requires migration plan and old-template fixtures |
| session cancel/resume implementation detail | non-goal | deferred | Preserve separation only in first scope |

## Out-Of-Scope Conflicts

No active out-of-scope conflict remains. The deferred items above are confirmed deferrals, not silent drops.

## Senior Consequence Analysis

### Gate Status

- triggered: yes
- trigger_reason: The feature affects lifecycle operations, running workflow sessions, prompt behavior, SkillTool permission-sensitive behavior, shared skill/catalog state, import/export compatibility, final reports, and user-visible transition controls.

### Consequence Obligations

| ID | Claim | Affected Objects | Owner Workflow | Latest Resolve Phase | Status | Stop And Reopen |
| --- | --- | --- | --- | --- | --- | --- |
| CA-001 | Define stable skill binding identity across local, bundled, plugin, managed, and MCP sources | skill references, catalog, resolver, import/export | sp-specify -> sp-plan | specification | mapped | Spec lacks source/provenance semantics |
| CA-002 | Define priority without overriding safety boundaries | prompts, SkillTool, permissions | sp-specify -> sp-plan | specification | mapped | Priority implies unsafe override |
| CA-003 | Define degraded skill behavior | resolver, validation, import preview, runtime UI | sp-specify -> sp-plan | specification | mapped | Missing skills silently degrade to prose |
| CA-004 | Preserve explicit SkillTool permission handling | SkillTool, workflow runtime, tool policy | sp-plan | planning | mapped | Workflow references bypass SkillTool semantics |
| CA-005 | Preserve skill provenance in session lifecycle states | sessions, snapshots, reports | sp-plan | planning | mapped | Source edits silently change active session |
| CA-006 | Make skill use/skip/unavailable decisions observable when relevant | completion evidence, runtime UI, reports | sp-specify -> sp-plan | specification | mapped | Skills can run or be skipped invisibly |
| CA-007 | Validate skill bindings across authoring/import/start paths | editor, API, validation, session creation | sp-plan | planning | mapped | Invalid references persist without diagnostics |
| CA-008 | Define UI labels/affordances for contract states | editor, import/export, status panel, controls | sp-specify -> sp-plan | specification | mapped | UI states unspecified |
| CA-009 | Preserve evidence through compaction/resume/report/imports | state, artifacts, reports, imports | sp-plan | planning | mapped | Evidence drops across lifecycle boundaries |
| CA-010 | Prevent recursive/unbounded nested invocation | SkillTool, future auto/required modes | sp-plan | planning | mapped | Auto/required invocation lacks depth/loop limits |

## Readiness Decision

- coverage_status: source sweep complete with live repository verification and cognition coverage advisory
- source_signal_disposition_status: complete
- hard_unknown_count: 0
- open_conflict_count: 0
- planning_gate_status: ready after artifact self-review and user review request
- recommended next command after review gate: `/sp.plan`
