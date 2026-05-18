# Specification Draft Ledger: Layered Test Verification

**Feature Branch**: `003-layered-test-verify`
**Created**: 2026-05-17
**Status**: Complete - ready for plan
**Purpose**: Fixed-heavy discovery content ledger and resume anchor for `sp-specify`

## Intent Analysis Record

- current_intent_hypothesis: Add layered test verification with under-1-minute fast lane and reorganized PR/verify toward 5-minute target
- likely_affected_surfaces: scripts/quality-gate/, scripts/pr/, package.json
- biggest_open_ambiguity: Resolved via discussion handoff - technical direction confirmed as Option B

## Domain Progress Ledger

- current_domain: acceptance-and-completeness-gap-closure
- domain_statuses:
  - goal-and-users: closed-by-existing-evidence
  - triggers-and-primary-flow: closed-by-existing-evidence
  - boundaries-and-non-goals: closed-by-existing-evidence
  - failure-paths-exceptions-and-permissions: closed-by-existing-evidence
  - dependencies-constraints-and-upstream-downstream-impact: closed-by-existing-evidence
  - acceptance-and-completeness-gap-closure: closed-by-existing-evidence

## Question Batch Ledger

- **Batch**: Discussion Handoff
  Domain: All domains
  Questions: Pre-resolved via sp-discussion
  Answer summary: Discussion handoff provided complete product and technical coverage with user confirmation
  Disposition: closed

## Adversarial Review Ledger

- **Batch / domain**: Not required
  Challenge focus: Discussion handoff already completed adversarial analysis
  Findings: None - handoff provides comprehensive coverage
  Reopen decision: none

## Completeness Gap Register

No gaps - discussion handoff provides complete coverage.

## Final Audit Inputs

- audit_readiness: audit-passed
- planning_readiness_summary: All domains closed by evidence, no hard unknowns, soft unknown appropriately deferred
- handoff_candidate: /sp.plan

## Facts Lock Notes

- entry_source: sp-discussion
- discussion_slug: test-suite-slimming
- feature_request: Layered test verification workflow
- users_and_roles: contributors, maintainers, ai-coding-agents
- in_scope: Fast lane, PR/verify layering, existing architecture reuse
- out_of_scope: Impact graph, test deletion, coverage weakening
- hard_unknown_count: 0
- soft_unknown_count: 1 (coverage strategy)

## Route Lock Notes

- primary_route: feature-extension
- matched_rules:
  - R-001: Extends existing architecture
  - R-002: Bounded to first slice
  - R-003: Preserves quality contracts
  - R-004: Fresh project cognition

## Intent Lock Notes

- goal: Add layered test verification with fast lane and reorganized PR/verify
- non_goals:
  - Deleting tests
  - Weakening coverage
  - Full impact graph
  - Replacing verify entrypoint
- success_criteria:
  - SC-001: Fast lane under 1 minute
  - SC-002: PR/verify under 5 minutes for routine changes
  - SC-003: Explainable routing
  - SC-004: High-risk triggers heavy checks
  - SC-005: Clear output semantics
  - SC-006: Regression tests for lane routing
- must_preserve:
  - verify remains entrypoint
  - Quality contracts preserved
  - Fast ≠ PR-ready
- allowed_optimization_scope:
  - Refine lane selection
  - Add fast mode
  - Extend impact-report
  - Optimize test selection

## Complexity Lock Notes

- complexity_level: T2-Structured
- matched_triggers:
  - C-001: Extends multi-file architecture
  - C-002: Coherent subsystem
  - C-003: No cross-boundary changes
- execution_mode: subagent-mandatory

## Unknown Handling Notes

- unresolved_unknowns:
  - field: full_coverage_handling
    question: Exact coverage handling under 5-minute PR target
    blocking_level: soft
    resolver: sp-plan
    latest_resolve_phase: sp-plan
    status: deferred

## Handoff To Specify Notes

- facts_file: brainstorming/facts.json ✓
- route_file: brainstorming/route.json ✓
- intent_file: brainstorming/intent.json ✓
- complexity_file: brainstorming/complexity.json ✓
- compile_ready: true

## Brainstorming Companion Rules

- Every note must map to a field, rule, or lock state. ✓
- After every answer, update the relevant truth file immediately. ✓
- Do not use freeform brainstorming chat as a substitute for field closure. ✓
- Route selection is valid only when `route.json` records a primary route, matched rules, and any rejected-route reasoning. ✓
- Complexity selection is valid only when `complexity.json` records the chosen level and matched trigger rules. ✓
- `unknown` is a pending decision object, not a default exit state. ✓
- Every unresolved `unknown` must carry required fields. ✓
- Do not hand off past the current gate while a hard unknown remains unresolved. ✓
