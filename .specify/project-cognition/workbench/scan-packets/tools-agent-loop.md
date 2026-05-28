# MapScanPacket: tools-agent-loop

mode: read_only
packet_id: tools-agent-loop
lane_id: tools-agent-loop
result_handoff_path: .specify/project-cognition/workbench/worker-results/tools-agent-loop.json

## Objective
Collect graph-native scan evidence for tools-agent-loop.

## Authoritative Inputs
- .specify/project-cognition/workbench/repository-universe.json
- Live repository files listed below

## Allowed Read Scope
- src/services/compact/apiMicrocompact.ts
- src/services/compact/autoCompact.test.ts
- src/services/compact/autoCompact.ts
- src/services/compact/cachedMCConfig.ts
- src/services/compact/cachedMicrocompact.ts
- src/services/compact/compact.ts
- src/services/compact/compactWarningHook.ts
- src/services/compact/compactWarningState.ts
- src/services/compact/grouping.ts
- src/services/compact/microCompact.ts
- src/services/compact/postCompactCleanup.ts
- src/services/compact/prompt.ts
- src/services/compact/reactiveCompact.ts
- src/services/compact/sessionMemoryCompact.ts
- src/services/compact/snipCompact.ts
- src/services/compact/snipProjection.ts
- src/services/compact/timeBasedMCConfig.ts
- src/services/compact/workflowSummaryCarryover.test.ts
- src/services/compact/workflowSummaryCarryover.ts
- src/tasks/DreamTask/DreamTask.ts
- src/tasks/InProcessTeammateTask/InProcessTeammateTask.tsx
- src/tasks/InProcessTeammateTask/types.ts
- src/tasks/LocalAgentTask/LocalAgentTask.tsx
- src/tasks/LocalMainSessionTask.ts
- src/tasks/LocalShellTask/LocalShellTask.tsx
- src/tasks/LocalShellTask/guards.ts
- src/tasks/LocalShellTask/killShellTasks.ts
- src/tasks/LocalWorkflowTask/LocalWorkflowTask.ts
- src/tasks/MonitorMcpTask/MonitorMcpTask.ts
- src/tasks/RemoteAgentTask/RemoteAgentTask.tsx
- src/tasks/pillLabel.ts
- src/tasks/stopTask.ts
- src/tasks/types.ts
- src/tools.ts
- src/tools/AgentTool/AgentTool.tsx
- src/tools/AgentTool/UI.tsx
- src/tools/AgentTool/agentColorManager.ts
- src/tools/AgentTool/agentDisplay.ts
- src/tools/AgentTool/agentMemory.ts
- src/tools/AgentTool/agentMemorySnapshot.ts
- src/tools/AgentTool/agentToolUtils.test.ts
- src/tools/AgentTool/agentToolUtils.ts
- src/tools/AgentTool/built-in/claudeCodeGuideAgent.ts
- src/tools/AgentTool/built-in/exploreAgent.ts
- src/tools/AgentTool/built-in/generalPurposeAgent.ts
- src/tools/AgentTool/built-in/planAgent.ts
- src/tools/AgentTool/built-in/statuslineSetup.ts
- src/tools/AgentTool/built-in/verificationAgent.ts
- src/tools/AgentTool/builtInAgents.test.ts
- src/tools/AgentTool/builtInAgents.ts
- src/tools/AgentTool/constants.ts
- src/tools/AgentTool/forkSubagent.ts
- src/tools/AgentTool/loadAgentsDir.cache.test.ts
- src/tools/AgentTool/loadAgentsDir.ts
- src/tools/AgentTool/prompt.test.ts
- src/tools/AgentTool/prompt.ts
- src/tools/AgentTool/resumeAgent.ts
- src/tools/AgentTool/runAgent.ts
- src/utils/swarm/It2SetupPrompt.tsx
- src/utils/swarm/backends/ITermBackend.ts
- src/utils/swarm/backends/InProcessBackend.ts
- src/utils/swarm/backends/PaneBackendExecutor.ts
- src/utils/swarm/backends/TmuxBackend.ts
- src/utils/swarm/backends/detection.ts
- src/utils/swarm/backends/it2Setup.ts
- src/utils/swarm/backends/registry.ts
- src/utils/swarm/backends/teammateModeSnapshot.ts
- src/utils/swarm/backends/types.ts
- src/utils/swarm/constants.ts
- src/utils/swarm/inProcessRunner.ts
- src/utils/swarm/leaderPermissionBridge.ts
- src/utils/swarm/permissionSync.ts
- src/utils/swarm/reconnection.ts
- src/utils/swarm/spawnInProcess.ts
- src/utils/swarm/spawnUtils.ts
- src/utils/swarm/teamHelpers.ts
- src/utils/swarm/teammateInit.ts
- src/utils/swarm/teammateLayoutManager.ts
- src/utils/swarm/teammateModel.ts
- src/utils/swarm/teammatePromptAddendum.test.ts
- src/utils/swarm/teammatePromptAddendum.ts
- src/utils/swarm/teammateRuntime.test.ts
- src/utils/swarm/teammateRuntime.ts
- src/utils/swarm/teammateRuntimeProviders.test.ts
- src/utils/swarm/teammateRuntimeProviders.ts

## Forbidden Paths
- .specify/** except the packet, repository-universe, and worker-result path for workflow operation
- node_modules/**, artifacts/**, build output, secrets, environment files

## Packet Ledger
- todo: 85 assigned paths
- doing: 0
- done: 0
- blocked: 0
- overflow: 0

## Acceptance Checks
- Return JSON at .specify/project-cognition/workbench/worker-results/tools-agent-loop.json
- Top-level acceptance must be pass or a fail_* value
- Repeat assigned_paths exactly
- paths_read must be a non-empty concrete path array
- Account for every assigned path in coverage
- Evidence rows must include source_path and support read/deep_read coverage outcomes

## Required Handoff Shape
{
  "packet_id": "tools-agent-loop",
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
