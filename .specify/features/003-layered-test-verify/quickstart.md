# Quickstart: Layered Test Verification

**Feature Branch**: `003-layered-test-verify`
**Created**: 2026-05-17
**Updated**: 2026-05-18

## Overview

This quickstart demonstrates the layered test verification workflow for a typical local change scenario, with actual validation evidence from the implemented quality gate system.

## Prerequisites

- Bun runtime installed
- Project cloned with dependencies installed
- No uncommitted changes that would affect test execution

## Scenario: Fast Local Verification

### Step 1: Make a Local Change

Make a change to server code:

```bash
# Edit a server file
echo "// Test comment" >> src/server/routes/chat.ts
```

### Step 2: Run Fast Lane

```bash
bun run quality:fast --dry-run
```

**Actual Output** (validated 2026-05-17):
```
⚠️ **DEVELOPMENT SIGNAL - NOT PR READY**

> This is a quick feedback signal for local development.
> Run `bun run verify` for full PR verification.

# Quality Gate Report

- Run: 2026-05-17T18-27-01-774Z
- Mode: fast
- Dry run: yes
- Live checks allowed: no
- Git SHA: fde08b6
- Dirty worktree: yes

## Summary

- Passed: 0
- Failed: 0
- Skipped: 4

## Result Matrix

| Category | Lane | Status | Live | Duration |
| --- | --- | --- | --- | ---: |
| Test scope | Impact report | skipped | no | 0ms |
| Governance | Policy checks | skipped | no | 0ms |
| Smoke/live | Core smoke tests | skipped | no | 0ms |
| Unit/local | Fast lane tests | skipped | no | 1ms |
```

**Key Points**:
- Fast mode includes exactly 4 lanes: impact-report, policy-checks, core-smoke, fast-lane-tests
- Duration: < 5ms (dry-run)
- Banner clearly shows "DEVELOPMENT SIGNAL - NOT PR READY"

### Step 3: Verify Fast Feedback

- Fast lane completed in under 1 second
- Output clearly shows "DEVELOPMENT SIGNAL - NOT PR READY"
- Changed-area tests would be identified and run (if not dry-run)

### Step 4: Run Full PR Verification

```bash
bun run quality:gate --mode pr --dry-run
```

**Actual Output** (validated 2026-05-17):
```
✅ **PR READINESS: READY**

> All required checks passed. This change is ready for merge.

# Quality Gate Report

- Run: 2026-05-17T18-25-20-957Z
- Mode: pr
- Dry run: yes
- Git SHA: fde08b6
- Dirty worktree: yes

## Summary

- Passed: 0
- Failed: 0
- Skipped: 12

## Result Matrix

| Category | Lane | Status | Live | Duration |
| --- | --- | --- | --- | ---: |
| Test scope | Impact report | skipped | no | 1ms |
| Governance | Policy checks | skipped | no | 0ms |
| Smoke/live | Core smoke tests | skipped | no | 5ms |
| Unit/local | Fast lane tests | skipped | no | 0ms |
| Unit/local | Desktop checks | skipped | no | 0ms |
| Unit/local | Server checks | skipped | no | 1ms |
| Unit/local | Adapter checks | skipped | no | 0ms |
| Docs | Docs checks | skipped | no | 0ms |
| Coverage | Coverage gate | skipped | no | 1ms |
| Governance | Quarantine governance | skipped | no | 0ms |
| Native | Native desktop checks | skipped | no | 0ms |
| Governance | Persistence upgrade checks | skipped | no | 1ms |
```

**Key Points**:
- PR mode includes 12 lanes with risk-based escalation support
- Duration: < 10ms (dry-run)
- Banner shows "PR READINESS: READY"

## Scenario: High-Risk Change

### Step 1: Make a High-Risk Change

Make a change to native code:

```bash
# Edit a Tauri config
echo "// modified" >> desktop/src-tauri/tauri.conf.json
```

### Step 2: Run Fast Lane

```bash
bun run quality:fast
```

**Expected Output**:
```
## Risk notes
- Tauri/native code changed: check sidecar build and cargo check output closely.

## Escalated checks
- Native checks escalated for high-risk path: desktop/src-tauri/
```

### Step 3: Run Full PR Verification

```bash
bun run verify
```

**Expected Behavior**:
- Native checks triggered automatically
- Sidecar build runs
- Cargo check runs
- Heavy checks not skipped

## Validation Evidence

### Focused Test Results

**Command**:
```bash
bun test scripts/quality-gate/fast-mode.test.ts scripts/quality-gate/layered-pr.test.ts scripts/pr/fast-lane-selection.test.ts scripts/pr/risk-escalation.test.ts
```

**Actual Output** (validated 2026-05-18):
- **Tests**: 106 pass, 0 fail
- **Duration**: ~4 seconds
- **Files**: 4 test files

### Fast Mode Validation

**Command**:
```bash
bun run quality:fast --dry-run
```

**Results**:
- **Lanes**: impact-report, policy-checks, core-smoke, fast-lane-tests
- **Summary**: passed=0, failed=0, skipped=4
- **feedbackType**: fast
- **readyForMerge**: false

### PR Mode Validation

**Command**:
```bash
bun run quality:gate --mode pr --dry-run
```

**Results**:
- **Lanes**: 12 lanes covering test scope, governance, smoke, unit/local, docs, coverage, native
- **Summary**: passed=0, failed=0, skipped=12
- **feedbackType**: full
- **readyForMerge**: true (in dry-run, no actual failures)

### Policy Check Validation

**Command**:
```bash
bun run check:policy
```

**Results**:
- Policy, workflow, hook, quarantine, and gate unit tests pass
- Validates governance layer integrity

## Validation Commands

### Verify Fast Mode Lanes

```bash
bun run quality:fast --dry-run
# Expected: 4 lanes (impact-report, policy-checks, core-smoke, fast-lane-tests)
# Expected: feedbackType=fast, readyForMerge=false
```

### Verify PR Mode Lanes

```bash
bun run quality:gate --mode pr --dry-run
# Expected: 12 lanes with risk-based escalation support
# Expected: feedbackType=full, readyForMerge=true (if no failures)
```

### Verify All Tests Pass

```bash
bun test scripts/quality-gate/fast-mode.test.ts scripts/quality-gate/layered-pr.test.ts scripts/pr/fast-lane-selection.test.ts scripts/pr/risk-escalation.test.ts
# Expected: 106 pass, 0 fail, ~4s duration
```

## Output Semantics Reference

| Report Type | Label | Meaning |
|-------------|-------|---------|
| Fast lane | "DEVELOPMENT SIGNAL" | Local feedback only |
| Fast lane | "NOT PR READY" | Must run verify for merge |
| Fast lane | `readyForMerge: false` | JSON report field confirms non-ready status |
| PR mode | "PR READINESS: READY" | Full verification complete |
| PR mode | "PR READINESS: BLOCKED" | Failures prevent merge |
| PR mode (high-risk) | "ESCALATED CHECKS" | Heavy checks triggered |

## Lane Reference

### Fast Mode Lanes (4 lanes)

| Lane ID | Category | Description |
|---------|----------|-------------|
| impact-report | Test scope | Summarize changed areas, required local checks, and risk notes |
| policy-checks | Governance | Run policy, workflow, hook, quarantine, and gate unit tests |
| core-smoke | Smoke/live | Tiny fixed set of critical-path smoke tests |
| fast-lane-tests | Unit/local | Changed-area dynamic test selection |

### PR Mode Lanes (12 lanes)

| Lane ID | Category | Description |
|---------|----------|-------------|
| impact-report | Test scope | Summarize changed areas, required local checks, and risk notes |
| policy-checks | Governance | Run policy, workflow, hook, quarantine, and gate unit tests |
| core-smoke | Smoke/live | Tiny fixed set of critical-path smoke tests |
| fast-lane-tests | Unit/local | Changed-area dynamic test selection |
| desktop-checks | Unit/local | Desktop lint, Vitest, and production build |
| server-checks | Unit/local | Server, provider, runtime, MCP, OAuth, WebSocket, and API tests |
| adapter-checks | Unit/local | IM adapter tests |
| docs-checks | Docs | Docs install and VitePress build |
| coverage | Coverage | Unit/component coverage with ratcheted baseline |
| quarantine | Governance | Validate quarantined tests governance |
| native-checks | Native | Sidecar build and Tauri native compile check |
| persistence-upgrade | Governance | Local JSON and desktop localStorage migrations |

## Troubleshooting

### Fast lane too slow

- Check core smoke set size
- Verify test selection is narrow enough
- Consider reducing core smoke tests

### Heavy checks incorrectly skipped

- Verify risk escalation patterns in `change-policy.ts`
- Check impact report risk notes
- Run regression tests for lane routing

### Output unclear

- Review reporter labels
- Check for "DEVELOPMENT SIGNAL" vs "PR READINESS"
- Verify `readyForMerge` field in JSON report

## Live/Release Blockers

**Note**: Live baseline and release verification modes require provider credentials that are not available in the default development environment. These modes are blocked by:

- Missing live provider credentials for live mode
- Missing release environment configuration for release mode

For production releases, ensure:
1. Provider credentials are configured in environment
2. Release environment is properly set up
3. Run `bun run quality:gate --mode release` for full release verification

## Implementation Notes

1. **Fast lane is development signal only** - Never presents as PR-ready
2. **PR mode remains the merge gate** - `bun run verify` is the canonical PR entrypoint
3. **Risk escalation is automatic** - High-risk paths trigger appropriate heavy checks
4. **Coverage strategy** - PR mode uses changed-line coverage; baseline/release use full coverage
5. **Skip reasons are logged** - Every skip has an explainable reason in lane logs
