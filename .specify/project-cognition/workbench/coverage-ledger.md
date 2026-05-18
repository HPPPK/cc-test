# Coverage Ledger

Scan coverage summary for `sp-map-scan` on cc-haha.

## Source and Symbol Surfaces

| Area | Total Nodes | Critical | Important | Low-Risk | Status |
|------|------------|----------|-----------|----------|--------|
| src/ | 38 | 12 | 20 | 6 | classified |
| desktop/ | 14 | 5 | 8 | 1 | classified |
| adapters/ | 5 | 0 | 5 | 0 | classified |
| config | 3 | 2 | 1 | 0 | classified |
| infrastructure | 3 | 0 | 3 | 0 | classified |
| **Source Total** | **63** | **19** | **37** | **7** | **classified** |

## Capability Surfaces

| Category | Count | Critical | Important | Low-Risk |
|----------|-------|----------|-----------|----------|
| Capabilities | 21 | 9 | 11 | 1 |

## Risk Surfaces

| Category | Count | Critical | Important |
|----------|-------|----------|-----------|
| Security/Risk | 8 | 3 | 5 |
| Observability | 3 | 0 | 3 |

## Test Surfaces

| Area | Status | Notes |
|------|--------|-------|
| server tests | 46 test files | src/server/__tests__/ |
| desktop tests | Colocated | stores .test.ts + __tests__/ |
| adapter tests | Per-package | adapters/*/__tests__/ |

## Coverage Risks

| Surface | Lines Coverage | Target | Gap |
|---------|--------------|--------|-----|
| agent-tools | 17.1% | 60% | 42.9pp |
| agent-utils | 14.42% | 60% | 45.58pp |
| desktop functions | 52.49% | 70% | 17.51pp |

## Unknown Surfaces

None. All project-relevant surfaces classified.
