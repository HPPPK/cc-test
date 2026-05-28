# MapScanPacket: adapters-services-risk

mode: read_only
packet_id: adapters-services-risk
lane_id: adapters-services-risk
result_handoff_path: .specify/project-cognition/workbench/worker-results/adapters-services-risk.json

## Objective
Collect graph-native scan evidence for adapters-services-risk.

## Authoritative Inputs
- .specify/project-cognition/workbench/repository-universe.json
- Live repository files listed below

## Allowed Read Scope
- adapters/README.md
- adapters/bun.lock
- adapters/common/__tests__/chat-queue.test.ts
- adapters/common/__tests__/config.test.ts
- adapters/common/__tests__/format.test.ts
- adapters/common/__tests__/http-client.test.ts
- adapters/common/__tests__/message-buffer.test.ts
- adapters/common/__tests__/message-dedup.test.ts
- adapters/common/__tests__/pairing.test.ts
- adapters/common/__tests__/permission.test.ts
- adapters/common/__tests__/session-store.test.ts
- adapters/common/__tests__/ws-bridge.test.ts
- adapters/common/attachment/__tests__/attachment-limits.test.ts
- adapters/common/attachment/__tests__/attachment-store.test.ts
- adapters/common/attachment/__tests__/image-block-watcher.test.ts
- adapters/common/attachment/attachment-limits.ts
- adapters/common/attachment/attachment-store.ts
- adapters/common/attachment/attachment-types.ts
- adapters/common/attachment/image-block-watcher.ts
- adapters/common/chat-queue.ts
- adapters/common/config.ts
- adapters/common/format.ts
- adapters/common/http-client.ts
- adapters/common/message-buffer.ts
- adapters/common/message-dedup.ts
- adapters/common/pairing.ts
- adapters/common/permission.ts
- adapters/common/session-store.ts
- adapters/common/ws-bridge.ts
- adapters/dingtalk/__tests__/ai-card.test.ts
- adapters/dingtalk/__tests__/helpers.test.ts
- adapters/dingtalk/__tests__/permission-card.test.ts
- adapters/dingtalk/__tests__/stream-state.test.ts
- adapters/dingtalk/ai-card.ts
- adapters/dingtalk/helpers.ts
- adapters/dingtalk/index.ts
- adapters/dingtalk/media.ts
- adapters/dingtalk/permission-card.ts
- adapters/dingtalk/stream-state.ts
- adapters/feishu/__tests__/card-errors.test.ts
- adapters/feishu/__tests__/cardkit.test.ts
- adapters/feishu/__tests__/extract-payload.test.ts
- adapters/feishu/__tests__/feishu.test.ts
- adapters/feishu/__tests__/flush-controller.test.ts
- adapters/feishu/__tests__/markdown-style.test.ts
- adapters/feishu/__tests__/media.test.ts
- adapters/feishu/__tests__/streaming-card.test.ts
- adapters/feishu/card-errors.ts
- adapters/feishu/cardkit.ts
- adapters/feishu/extract-payload.ts
- adapters/feishu/flush-controller.ts
- adapters/feishu/index.ts
- adapters/feishu/markdown-style.ts
- adapters/feishu/media.ts
- adapters/feishu/path-safety.ts
- adapters/feishu/streaming-card.ts
- adapters/package.json
- adapters/telegram/__tests__/media.test.ts
- adapters/telegram/__tests__/telegram.test.ts
- adapters/telegram/index.ts
- adapters/telegram/media.ts
- adapters/tsconfig.json
- adapters/wechat/__tests__/protocol.test.ts
- adapters/wechat/__tests__/typing.test.ts
- adapters/wechat/index.ts
- adapters/wechat/media.ts
- adapters/wechat/protocol.ts
- adapters/wechat/typing.ts
- src/memdir/findRelevantMemories.ts
- src/memdir/memdir.ts
- src/memdir/memoryAge.ts
- src/memdir/memoryScan.ts
- src/memdir/memoryShapeTelemetry.ts
- src/memdir/memoryTypes.ts
- src/memdir/paths.ts
- src/memdir/teamMemPaths.ts
- src/memdir/teamMemPrompts.ts
- src/services/AgentSummary/agentSummary.ts
- src/services/MagicDocs/magicDocs.ts
- src/services/MagicDocs/prompts.ts
- src/services/PromptSuggestion/promptSuggestion.ts
- src/services/PromptSuggestion/speculation.ts
- src/services/SessionMemory/prompts.ts
- src/services/SessionMemory/sessionMemory.ts
- src/services/SessionMemory/sessionMemoryUtils.ts
- src/services/analytics/config.ts
- src/services/analytics/datadog.ts
- src/services/analytics/firstPartyEventLogger.ts
- src/services/analytics/firstPartyEventLoggingExporter.ts
- src/services/analytics/growthbook.ts
- src/services/analytics/index.ts
- src/services/analytics/metadata.ts
- src/services/analytics/sink.ts
- src/services/analytics/sinkKillswitch.ts
- src/services/api/adminRequests.ts
- src/services/api/azureOpenAI.ts
- src/services/api/bootstrap.ts
- src/services/api/claude.ts
- src/services/api/client.test.ts
- src/services/api/client.ts
- src/services/api/dumpPrompts.ts
- src/services/api/emptyUsage.test.ts
- src/services/api/emptyUsage.ts
- src/services/api/errorUtils.ts
- src/services/api/errors.ts
- src/services/api/filesApi.ts
- src/services/api/firstTokenDate.ts
- src/services/api/grove.ts
- src/services/api/logging.ts
- src/services/api/metricsOptOut.ts
- src/services/api/overageCreditGrant.ts
- src/services/api/promptCacheBreakDetection.ts
- src/services/api/referral.ts
- src/services/api/sessionIngress.ts
- src/services/api/ultrareviewQuota.ts
- src/services/api/usage.ts
- src/services/api/withRetry.ts
- src/services/autoDream/autoDream.ts
- src/services/autoDream/config.ts
- src/services/autoDream/consolidationLock.ts

## Forbidden Paths
- .specify/** except the packet, repository-universe, and worker-result path for workflow operation
- node_modules/**, artifacts/**, build output, secrets, environment files

## Packet Ledger
- todo: 120 assigned paths
- doing: 0
- done: 0
- blocked: 0
- overflow: 0

## Acceptance Checks
- Return JSON at .specify/project-cognition/workbench/worker-results/adapters-services-risk.json
- Top-level acceptance must be pass or a fail_* value
- Repeat assigned_paths exactly
- paths_read must be a non-empty concrete path array
- Account for every assigned path in coverage
- Evidence rows must include source_path and support read/deep_read coverage outcomes

## Required Handoff Shape
{
  "packet_id": "adapters-services-risk",
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
