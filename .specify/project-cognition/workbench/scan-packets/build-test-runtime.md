# Scan Packet: Build/Test/Runtime Discovery

**Lane ID**: build-test-runtime
**Mode**: read_only
**Result Handoff**: `.specify/project-cognition/workbench/scan-packets/build-test-runtime-handoff.json`
**Status**: completed

## Objective
Document build systems, test frameworks, runtime configuration, CI/CD, and release infrastructure.

## Authoritative Inputs
- `package.json` scripts and dependencies
- `desktop/package.json`
- `adapters/package.json`
- `tsconfig.json` files
- `bunfig.toml` files
- `.github/workflows/`
- `scripts/` directory
- `desktop/src-tauri/Cargo.toml`

## Allowed Read Scope
- All config files listed above
- Script listings
- Workflow YAML files
- Release notes directory

## Forbidden
- Deep-read of all GitHub Actions workflow contents
- Modification of any file

## Coverage Classification
- Build system — **deep-read**
- CI/CD — **deep-read**
- Test framework — **deep-read**
- Runtime config — **deep-read**
- Dependencies — **deep-read**

## Acceptance Checks
- 5 CI/CD workflows identified
- Quality gate modes documented (pr/baseline/release)
- Desktop release matrix documented (5 platforms)
- 18 release versions documented
- All key runtime and dev dependencies enumerated
