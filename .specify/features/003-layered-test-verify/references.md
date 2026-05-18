# References: Layered Test Verification

**Feature Branch**: `003-layered-test-verify`  
**Created**: 2026-05-17

## Discussion Handoff

- **Source**: `.specify/discussions/test-suite-slimming/handoff-to-specify.md`
- **Description**: Product and technical discussion handoff with confirmed requirements and technical direction
- **Relevance**: Primary source of truth for this specification
- **Reusable insights**: 
  - Option B (Layered PR Gate) confirmed by user
  - Quality definition: regression protection + low flake + changed-area coverage
  - Fast lane target: under 1 minute
  - PR/verify target: under 5 minutes for routine changes
- **Spec impact mapping**: All MP-* items mapped to spec.md and context.md sections

## Discussion Source Files

### requirements.md
- **Source**: `.specify/discussions/test-suite-slimming/requirements.md`
- **Description**: Confirmed product requirements and acceptance signals
- **Relevance**: Defines what "done" means for this feature
- **Reusable insights**:
  - Primary optimization target: test speed
  - Quality expectation: high test quality preserved while reducing runtime
  - Candidate requirement themes for acceptance criteria
- **Spec impact mapping**: spec.md#success-criteria, spec.md#current-delivery-boundary

### technical-options.md
- **Source**: `.specify/discussions/test-suite-slimming/technical-options.md`
- **Description**: Technical options analysis with user confirmation
- **Relevance**: Confirms Option B as implementation direction
- **Reusable insights**:
  - Option B complexity: medium
  - Impacted modules identified
  - Migration/compatibility concerns documented
  - Testing strategy outlined
- **Spec impact mapping**: spec.md#capability-decomposition, context.md#affected-surfaces

### project-context.md
- **Source**: `.specify/discussions/test-suite-slimming/project-context.md`
- **Description**: Project cognition evidence and existing surfaces
- **Relevance**: Grounds specification in repository reality
- **Reusable insights**:
  - Existing quality-gate architecture surfaces
  - Existing commands and their mappings
  - Inference: extend existing architecture
- **Spec impact mapping**: context.md#canonical-references, context.md#existing-capability-and-reuse-notes

## Project Cognition

### status.json
- **Source**: `.specify/project-cognition/status.json`
- **Description**: Project cognition freshness status
- **Relevance**: Confirms runtime is fresh for architectural decisions
- **Reusable insights**:
  - freshness: fresh
  - baseline_state: ready
  - last_refresh_reason: map-build
- **Spec impact mapping**: Used to validate architectural decisions

### coverage.json
- **Source**: `.specify/project-cognition/coverage.json`
- **Description**: Project surface classification and test surfaces
- **Relevance**: Identifies test surfaces and coverage gaps
- **Reusable insights**:
  - Server tests: 46 files in src/server/__tests__/
  - Desktop tests: colocated and __tests__/
  - Adapter tests: per-package __tests__/
  - Coverage gaps: agent-tools, agent-utils, desktop functions
- **Spec impact mapping**: context.md#upstream-dependencies

## Repository Sources

### package.json
- **Source**: `package.json`
- **Description**: Project scripts and dependencies
- **Relevance**: Existing commands that must be preserved
- **Reusable insights**:
  - verify → quality:pr
  - quality:pr → quality:gate --mode pr
  - Existing check:* commands for area-specific tests
- **Spec impact mapping**: context.md#canonical-references

### scripts/quality-gate/modes.ts
- **Source**: `scripts/quality-gate/modes.ts`
- **Description**: Quality gate mode definitions
- **Relevance**: Existing lane architecture to extend
- **Reusable insights**:
  - PR, baseline, release modes defined
  - Lane selection infrastructure exists
- **Spec impact mapping**: context.md#affected-surfaces

### scripts/quality-gate/runner.ts
- **Source**: `scripts/quality-gate/runner.ts`
- **Description**: Quality gate runner with lane selection
- **Relevance**: Existing runner with impact-based skipping
- **Reusable insights**:
  - Already supports lane selection
  - Already supports impact-based skipping for area-specific lanes
- **Spec impact mapping**: context.md#affected-surfaces

### scripts/pr/impact-report.ts
- **Source**: `scripts/pr/impact-report.ts`
- **Description**: Impact report generator
- **Relevance**: Existing infrastructure for changed-file analysis
- **Reusable insights**:
  - Emits required local checks
  - Emits coverage signals
  - Emits risk notes
  - Emits agent/model testing policy
- **Spec impact mapping**: context.md#affected-surfaces

### scripts/pr/change-policy.ts
- **Source**: `scripts/pr/change-policy.ts`
- **Description**: Path classification and risk triggers
- **Relevance**: Existing infrastructure for risk-based routing
- **Reusable insights**:
  - Classifies desktop, server, adapter, docs, release, cli-core paths
  - Enforces same-area test signals
- **Spec impact mapping**: context.md#affected-surfaces
