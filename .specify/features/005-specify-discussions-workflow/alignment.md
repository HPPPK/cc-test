# Alignment: Workflows Template Management And Chat Entry

## Current Understanding

The feature is one unified `Workflows` product surface. It adds Settings workflow template management, defines workflow templates as staged execution contracts, and adds Chat composer workflow entry with explicit context handling.

## Confirmed Facts

- User confirmed the handoff from `.specify/discussions/workflow-template-management`.
- User confirmed this specification should remain unified rather than splitting or narrowing to Settings-only.
- Hard upstream questions are resolved.
- Remaining soft unknowns can move to planning as long as CA-001 through CA-006 are preserved.
- Project cognition is fresh and query-ready, but repository facts are backed by live reads.

## Assumptions

- Planning can choose exact API route shapes without changing product behavior.
- Planning can choose exact raw JSON editor depth as long as the first version remains schema-aware and not raw-only.
- Planning can decide whether invalid-template warnings link to Settings as long as diagnostics remain visible.

## Semantic Term Decisions

- Term: `Workflows`  
  Possible Meanings: Settings-only template management; Chat workflow mode; staged execution feature spanning authoring and launch  
  Selected Meanings: User-facing unified product surface spanning Settings management, staged workflow contracts, and Chat entry  
  Excluded Meanings: Standalone clone of an unverified external Claude Code `/workflow` feature  
  User Confirmation: confirmed in discussion and unified-spec approval on 2026-05-26

- Term: `manage workflow templates`  
  Possible Meanings: view-only diagnostics; raw JSON editing; CRUD schema-aware management  
  Selected Meanings: CRUD schema-aware Settings management for user templates with validate/save/import/export  
  Excluded Meanings: view-only; raw JSON-only; built-in direct editing  
  User Confirmation: confirmed in discussion

- Term: `workflow`  
  Possible Meanings: prompt collection; slash-command preset; staged execution contract  
  Selected Meanings: staged execution contract with ordered phases, intake, work definition, output artifact, handoff, completion, transition, and recovery  
  Excluded Meanings: prompt-only collection  
  User Confirmation: confirmed in discussion

- Term: `phase system prompt`  
  Possible Meanings: opaque system prompt replacement; phase instructions; structured phase prompt/protocol  
  Selected Meanings: editable phase instructions plus structured phase contract fields that runtime can map into phase context  
  Excluded Meanings: replacing global system prompt only  
  User Confirmation: inferred from user acceptance of phase field model and live runtime evidence

- Term: `summarize current context`  
  Possible Meanings: freeform user-written summary; `/compact` command semantics; transcript mutation  
  Selected Meanings: `/compact`-style semantics: clear conversation history while keeping a summary in context, or equivalent internal route  
  Excluded Meanings: silent context discard; in-place conversion of original normal chat  
  User Confirmation: confirmed in discussion

- Term: `linked workflow session`  
  Possible Meanings: mutate current chat; create unrelated session; create new workflow session with provenance and chosen context  
  Selected Meanings: create a new workflow session carrying inherited or summarized context while preserving original normal chat  
  Excluded Meanings: in-place conversion of existing normal chat  
  User Confirmation: confirmed in discussion

## Upstream Intent Disposition

| ID | Signal | Source | Disposition | Artifact Location | User Confirmed | Reopen Trigger |
| --- | --- | --- | --- | --- | --- | --- |
| MP-001 | Add user-facing Workflows surface for managing templates and starting sessions from chat | requirements.md | preserved | spec.md In Scope | yes | Settings or Chat scope dropped |
| MP-002 | User-facing labels should use Workflows | requirements.md/user | preserved | spec.md FR-001/FR-012 | yes | label changed without confirmation |
| MP-003 | Custom templates are global user-level only | open-questions.md Q-007 | preserved | spec.md FR-005 | yes | project-level templates enter scope |
| MP-004 | Built-ins read-only/protected and copyable | requirements.md/open-questions.md | preserved | spec.md FR-004 | yes | built-ins editable in place |
| MP-005 | CRUD schema-aware Settings management | technical-options.md Option B | preserved | spec.md FR-003/FR-007 | yes | view-only or raw-only design |
| MP-006 | JSON import/export, preview, selected import, auto-rename conflicts | requirements.md/open-questions.md | preserved | spec.md FR-009-FR-011 | yes | import overwrites by default |
| MP-007 | Workflows are staged execution contracts | requirements.md | preserved | spec.md Capability 2 | yes | prompt-only authoring |
| MP-008 | Every phase requires output artifact and handoff contract | open-questions.md Q-011 | preserved | spec.md FR-006/FR-007 | yes | phases save without output/handoff |
| MP-009 | Common phase fields first, advanced collapsed | requirements.md | preserved | spec.md FR-007/FR-008 | yes | flat advanced-only UI |
| MP-010 | Chat exposes Workflows from composer plus menu | technical-options.md Option F | preserved | spec.md FR-012/FR-013 | yes | entry point moved without confirmation |
| MP-011 | Non-empty chats require inherit/summarize/clear choice | open-questions.md Q-012 | preserved | spec.md FR-015 | yes | workflow starts without context choice |
| MP-012 | Inherit/summarize creates linked new workflow session | open-questions.md Q-013 | preserved | spec.md FR-016 | yes | original chat converted in place |
| MP-013 | Do not mutate existing workflow session snapshots | requirements.md/CA-004 | preserved | spec.md FR-017 | yes | retroactive mutation proposed |
| MP-014 | Do not anchor to unverified external `/workflow` | project-context.md | preserved | spec.md Out of Scope | yes | external feature becomes hard contract without fresh evidence |
| MP-015 | No hard unknowns remain; soft details downstream | handoff-assessment.md | preserved | spec.md Deferred Scope | yes | soft unknown becomes contradiction |
| SIG-001 | `real` management means usable CRUD, not hidden JSON | discussion-log.md | in_scope | spec.md FR-003 | yes | management reduced without confirmation |
| SIG-002 | `valid/startable` diagnostics are visible | handoff-to-specify.md | in_scope | spec.md FR-002/Acceptance | yes | invalid diagnostics omitted |
| SIG-003 | `auth` is not a new capability in this feature | source sweep | dropped | spec.md Out of Scope | yes by absence from confirmed scope | auth introduced without requirement |

## Out-Of-Scope Conflicts

- Project-level workflow templates conflict with MP-003 and are out of scope for this version.
- Direct built-in edits conflict with MP-004 and CA-003.
- Prompt-only phase authoring conflicts with MP-007, MP-008, and CA-006.
- In-place conversion of existing normal chats conflicts with MP-012 and CA-005.
- Retroactive workflow session mutation conflicts with MP-013 and CA-004.
- Unverified external `/workflow` cloning conflicts with MP-014.

## Approach Comparison

### Approach A: View And Diagnostics First

- Product fit: too narrow for the confirmed CRUD/import/export scope.
- Implementation risk: low.
- User-visible trade-off: users still edit JSON manually.
- Compatibility impact: minimal.
- Verification implications: mostly UI/list API tests.
- Decision: rejected because user selected active management.

### Approach B: CRUD For User Templates With Schema-Aware Form

- Product fit: best match for confirmed management and standard workflow contract.
- Implementation risk: medium-high due to schema, validation, import/export, and persistence rules.
- User-visible trade-off: more UI surface, but safer and more discoverable.
- Compatibility impact: requires lossless writes and built-in protection.
- Verification implications: server API, registry, desktop UI, import/export, and workflow creation regression tests.
- Decision: selected and locked.

### Approach C: Raw JSON Editor Plus Guided Validation

- Product fit: useful as optional power-user affordance, not sufficient alone.
- Implementation risk: medium.
- User-visible trade-off: fast but error-prone and less accessible.
- Compatibility impact: high if saves are lossy.
- Verification implications: JSON parse/save/validation tests.
- Decision: not selected as primary; exact optional depth deferred.

### Chat Entry Approach: Composer Plus Menu Workflows Dialog

- Product fit: selected by user and aligns with existing composer affordances.
- Implementation risk: medium; linked-session semantics require careful design.
- User-visible trade-off: one extra dialog for explicit context strategy in non-empty chats.
- Compatibility impact: preserves original normal chats and workflow session snapshots.
- Verification implications: ChatInput/EmptySession/ActiveSession plus server session creation tests.
- Decision: selected and locked.

## Senior Consequence Analysis

Gate status: triggered.

### Affected Object Map

- `~/.claude/cc-jiangxia/workflows.json`
- `WorkflowTemplateRegistryService`
- `/api/workflows/templates` and future mutation/import/export endpoints
- Settings navigation and content routing
- Desktop workflow template list/editor/import/export UI
- Desktop chat composer `+` menu
- Workflow template picker/dialog
- Workflow session creation payloads
- Workflow session state snapshots
- Existing dialogue sessions/transcripts
- `/compact` or equivalent compaction service path
- Invalid-template diagnostics
- Workflow status, transition controls, and report links

### Dependency Impact Table

- Direct dependencies: Settings UI, ChatInput, EmptySession, ActiveSession, sessions API client/types, server router, workflow template registry service.
- Indirect consumers: workflow runtime, workflow session state service, session list/detail metadata, transcript persistence, tests and fixtures.
- Shared state: cc-jiangxia config directory, registry cache, workflow session snapshots.
- Compatibility surfaces: unknown fields in user config, built-in id rules, linear-only workflow constraints, API response shape, transcript persistence, workflow metadata.

### Recovery And Validation Contract

- Preserve unknown fields on write.
- Do not mutate protected Claude files outside cc-jiangxia-owned workflow config.
- Keep built-ins startable when user config is missing or invalid.
- Reset registry cache after successful writes.
- Reject built-in shadowing, duplicate ids, missing required phase contracts, and unsupported branching/loop/parallel/nested workflow definitions.
- Validate before saving imports.
- Existing workflow sessions must continue from snapshots.
- Linked workflow session creation must be explicit, recoverable, and tested.
- Summarize path must reuse `/compact` semantics or equivalent internal compaction behavior.

### Coverage Gaps

- CG-002: Exact UI depth for schema editing versus optional raw JSON affordances remains planning-level.
- CG-003: Exact internal API mechanism for linked workflow session creation and compact-style summary carry-over remains planning-level.
- Project cognition returned path guidance but no detailed subgraph nodes for this query; live reads supply current evidence.

## Consequence Obligations

- CA-001: Keep built-in templates startable even when user workflow config is missing, malformed, or contains invalid templates. Owner workflow: sp-specify/sp-plan. Latest resolve phase: plan. Status: pending. Stop and reopen if invalid user config blocks the built-in template.
- CA-002: Preserve unknown fields in cc-jiangxia-owned `workflows.json` for any write path. Owner workflow: sp-specify/sp-plan/sp-implement. Latest resolve phase: implement. Status: pending. Stop and reopen if write behavior becomes lossy.
- CA-003: Treat built-in templates as protected from direct mutation and prevent user templates from shadowing built-in ids. Owner workflow: sp-specify/sp-plan. Latest resolve phase: plan. Status: pending. Stop and reopen if UI/API permits built-in in-place edits or saving user template `agent-development`.
- CA-004: Do not mutate existing workflow session snapshots when source templates are edited. Owner workflow: sp-specify/sp-plan. Latest resolve phase: specify. Status: preserved. Stop and reopen if requirements imply retroactive mutation.
- CA-005: Chat-page workflow selection must not silently convert normal chats or discard context; non-empty chats require context choice and linked-session behavior for inherit/summarize. Owner workflow: sp-specify/sp-plan. Latest resolve phase: specify. Status: preserved. Stop and reopen if Workflows starts from non-empty chat without explicit context strategy.
- CA-006: Custom workflow authoring must preserve phase output artifacts and handoff contracts as first-class schema. Owner workflow: sp-specify/sp-plan. Latest resolve phase: specify. Status: preserved. Stop and reopen if authoring becomes prompt-only.

## Readiness Decision

Aligned: ready for user review. If the user approves or requests no artifact edits, the single next command is `/sp.plan`.
