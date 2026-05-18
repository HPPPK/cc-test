# Scan Packet: Git Evolution and Risk

**Lane ID**: git-evolution-risk
**Mode**: read_only
**Result Handoff**: `.specify/project-cognition/workbench/scan-packets/git-evolution-risk-handoff.json`
**Status**: in_progress

## Objective
Document recent git evolution, volatility patterns, risk areas, and security-observability surfaces.

## Authoritative Inputs
- Git log (recent 50+ commits)
- `.gitignore`
- `scripts/` security-related files
- Known hot areas from diff history

## Allowed Read Scope
- `git log --oneline --all -100`
- `git diff --stat` for recent commits
- Security-related files in `src/` and `scripts/`
- `AGENTS.md` and `CLAUDE.md` for known risk areas
- `scripts/quality-gate/` for test coverage risks

## Forbidden
- Modification of any file
- Writing final cognition truth

## Coverage Classification
- Git evolution — **sampled** (recent 20+ commits)
- Risk areas — **sampled**
- Security surfaces — **inventory**

## Acceptance Checks
- Recent commit themes identified
- Volatility hotspots documented
- Risk areas (permissions, MCP, OAuth, plugins) noted
- Quality gate coverage risks documented
- subagent-blocked: no blockers expected
