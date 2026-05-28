# MapScanPacket: server-workflow-api

mode: read_only
packet_id: server-workflow-api
lane_id: server-workflow-api
result_handoff_path: .specify/project-cognition/workbench/worker-results/server-workflow-api.json

## Objective
Collect graph-native scan evidence for server-workflow-api.

## Authoritative Inputs
- .specify/project-cognition/workbench/repository-universe.json
- Live repository files listed below

## Allowed Read Scope
- src/server/__tests__/adapters.test.ts
- src/server/__tests__/computer-use-api.test.ts
- src/server/__tests__/computer-use-python.test.ts
- src/server/__tests__/computer-use-requirements.test.ts
- src/server/__tests__/conversation-service.test.ts
- src/server/__tests__/conversations.test.ts
- src/server/__tests__/cron-scheduler-launcher.test.ts
- src/server/__tests__/cron-scheduler.test.ts
- src/server/__tests__/desktop-cli-launcher.test.ts
- src/server/__tests__/desktop-ui-preferences.test.ts
- src/server/__tests__/diagnostics-service.test.ts
- src/server/__tests__/doctor-service.test.ts
- src/server/__tests__/e2e/business-flow.test.ts
- src/server/__tests__/e2e/full-flow.test.ts
- src/server/__tests__/filesystem.test.ts
- src/server/__tests__/fixtures/mock-sdk-cli.ts
- src/server/__tests__/h5-access-api.test.ts
- src/server/__tests__/h5-access-auth.test.ts
- src/server/__tests__/h5-access-policy.test.ts
- src/server/__tests__/h5-access-service.test.ts
- src/server/__tests__/haha-oauth-api.test.ts
- src/server/__tests__/haha-oauth-service.test.ts
- src/server/__tests__/haha-openai-oauth-api.test.ts
- src/server/__tests__/haha-openai-oauth-service.test.ts
- src/server/__tests__/mcp.test.ts
- src/server/__tests__/memory.test.ts
- src/server/__tests__/open-target-api.test.ts
- src/server/__tests__/open-target-service.test.ts
- src/server/__tests__/persistence-upgrade.test.ts
- src/server/__tests__/plugins.test.ts
- src/server/__tests__/provider-presets.test.ts
- src/server/__tests__/providers-real.test.ts
- src/server/__tests__/providers.test.ts
- src/server/__tests__/proxy-streaming.test.ts
- src/server/__tests__/proxy-transform.test.ts
- src/server/__tests__/real-llm-test.ts
- src/server/__tests__/scheduled-tasks.test.ts
- src/server/__tests__/sessions.test.ts
- src/server/__tests__/settings.test.ts
- src/server/__tests__/skills.test.ts
- src/server/__tests__/tasks.test.ts
- src/server/__tests__/team-watcher.test.ts
- src/server/__tests__/teams.test.ts
- src/server/__tests__/title-service.test.ts
- src/server/__tests__/websocket-handler.test.ts
- src/server/__tests__/workflowTemplates.test.ts
- src/server/__tests__/workspace-service.test.ts
- src/server/__tests__/ws-memory-events.test.ts
- src/server/api/sessions.ts
- src/server/api/workflowTemplates.ts
- src/server/router.ts
- src/server/services/__fixtures__/workflow-sessions/accepted-completion-state.json
- src/server/services/__fixtures__/workflow-sessions/completed-final-report-state.json
- src/server/services/__fixtures__/workflow-sessions/completed-final-report.json
- src/server/services/__fixtures__/workflow-sessions/corrupt-final-report.json
- src/server/services/__fixtures__/workflow-sessions/corrupt-state.json
- src/server/services/__fixtures__/workflow-sessions/final-report-with-unknown-fields.json
- src/server/services/__fixtures__/workflow-sessions/model-fallback-state.json
- src/server/services/__fixtures__/workflow-sessions/old-dialogue-session.json
- src/server/services/__fixtures__/workflow-sessions/pending-ready-state.json
- src/server/services/__fixtures__/workflow-sessions/rejected-completion-state.json
- src/server/services/__fixtures__/workflow-sessions/resume-missing-template-state.json
- src/server/services/__fixtures__/workflow-sessions/resume-stale-template-state.json
- src/server/services/__fixtures__/workflow-sessions/state-with-unknown-fields.json
- src/server/services/__fixtures__/workflow-sessions/superseded-completion-state.json
- src/server/services/__fixtures__/workflow-sessions/unsafe-artifact-pointer.json
- src/server/services/__fixtures__/workflow-templates/agent-development.json
- src/server/services/__fixtures__/workflow-templates/builtin-id-conflict.json
- src/server/services/__fixtures__/workflow-templates/duplicate-template-ids.json
- src/server/services/__fixtures__/workflow-templates/invalid-user-workflows.json
- src/server/services/__fixtures__/workflow-templates/malformed-workflows.json
- src/server/services/__fixtures__/workflow-templates/more-than-five-linear-workflow.json
- src/server/services/__fixtures__/workflow-templates/non-linear-workflows.json
- src/server/services/__fixtures__/workflow-templates/user-template-with-unknown-fields.json
- src/server/services/__fixtures__/workflow-templates/valid-user-workflows.json
- src/server/services/workflowFinalReport.test.ts
- src/server/services/workflowFinalReport.ts
- src/server/services/workflowReportStore.test.ts
- src/server/services/workflowReportStore.ts
- src/server/services/workflowRuntimeService.test.ts

## Forbidden Paths
- .specify/** except the packet, repository-universe, and worker-result path for workflow operation
- node_modules/**, artifacts/**, build output, secrets, environment files

## Packet Ledger
- todo: 80 assigned paths
- doing: 0
- done: 0
- blocked: 0
- overflow: 0

## Acceptance Checks
- Return JSON at .specify/project-cognition/workbench/worker-results/server-workflow-api.json
- Top-level acceptance must be pass or a fail_* value
- Repeat assigned_paths exactly
- paths_read must be a non-empty concrete path array
- Account for every assigned path in coverage
- Evidence rows must include source_path and support read/deep_read coverage outcomes

## Required Handoff Shape
{
  "packet_id": "server-workflow-api",
  "acceptance": "pass",
  "assigned_paths": [],
  "paths_read": [],
  "coverage": [],
  "evidence": [],
  "provisional_nodes": [],
  "provisional_edges": [],
  "observations": [],
  "confidence": "high"
}
