# Scan Packet: lane-root-github

## Packet Contract
- **packet_id**: lane-root-github
- **family_id**: root-config
- **mode**: read_only
- **result_handoff_path**: .specify/project-cognition/workbench/worker-results/lane-root-github.json

## Objective
Scan root-level files and .github/ for project config, CI/CD, issue templates, and metadata.

## Assigned Paths (27 total)
- .cognitionignore
- .env.example
- .github/FUNDING.yml
- .github/ISSUE_TEMPLATE/bug_report.md
- .github/ISSUE_TEMPLATE/config.yml
- .github/ISSUE_TEMPLATE/question.md
- .github/copilot-instructions.md
- .github/pull_request_template.md
- .github/workflows/build-desktop-dev.yml
- .github/workflows/deploy-docs.yml
- .github/workflows/pr-quality.yml
- .github/workflows/pr-triage.yml
- .github/workflows/release-desktop.yml
- AGENTS.md
- CLAUDE.md
- CONTRIBUTING.md
- LICENSE
- README.en.md
- README.md
- bunfig.toml
- complexity.json
- handoff-to-specify.json
- intent.json
- package.json
- preload.ts
- route.json
- tsconfig.json

## Required Output
Return a JSON file at the handoff path with:
- packet_id, family_id, assigned_paths, paths_read
- ledger: {todo, doing, done, blocked, overflow}
- coverage: [{path, outcome, evidence_ids}]
- confidence: verified|high|medium|low|provisional
- acceptance: pass|fail_gap|fail_quality|fail_contract

## Evidence Requirements
For each path read, create an evidence row with:
- id (E-xxx format), source_path, evidence_type, summary, classification, criticality

## Node Requirements
Create provisional nodes for discovered capabilities, modules, commands, tools, services, components, and entrypoints.
Each node needs: id, type, title, paths, confidence, evidence_ids, attrs (with aliases, domain, owner).

## Edge Requirements
Create edges for dependency, ownership, containment, and data-flow relationships.
Each edge needs: id, type, source_id, target_id, confidence, evidence_ids.

## Observation Requirements
Create observations for notable patterns, risks, and architectural decisions.
Each observation needs: id, observation_type, summary, evidence_ids.
