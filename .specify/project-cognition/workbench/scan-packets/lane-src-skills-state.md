# Scan Packet: lane-src-skills-state

## Packet Contract
- **packet_id**: lane-src-skills-state
- **family_id**: src-critical
- **mode**: read_only
- **result_handoff_path**: .specify/project-cognition/workbench/worker-results/lane-src-skills-state.json

## Objective
Scan src/skills/, src/cli/, src/entrypoints/, src/state/, src/migrations/ for skill orchestration, CLI entrypoints, app startup, state management, and schema evolution.

## Assigned Paths (107 total)
- src/cli/bg.ts
- src/cli/exit.ts
- src/cli/handlers/agents.ts
- src/cli/handlers/ant.ts
- src/cli/handlers/auth.ts
- src/cli/handlers/autoMode.ts
- src/cli/handlers/mcp.tsx
- src/cli/handlers/plugins.ts
- src/cli/handlers/templateJobs.ts
- src/cli/handlers/util.tsx
- src/cli/ndjsonSafeStringify.ts
- src/cli/print.ts
- src/cli/remoteIO.ts
- src/cli/structuredIO.ts
- src/cli/transports/HybridTransport.ts
- src/cli/transports/SSETransport.ts
- src/cli/transports/SerialBatchEventUploader.ts
- src/cli/transports/Transport.ts
- src/cli/transports/WebSocketTransport.ts
- src/cli/transports/WorkerStateUploader.ts
- src/cli/transports/ccrClient.ts
- src/cli/transports/transportUtils.ts
- src/cli/update.ts
- src/entrypoints/agentSdkTypes.ts
- src/entrypoints/cli.tsx
- src/entrypoints/init.ts
- src/entrypoints/mcp.ts
- src/entrypoints/sandboxTypes.ts
- src/entrypoints/sdk/controlSchemas.ts
- src/entrypoints/sdk/controlTypes.ts
- src/entrypoints/sdk/coreSchemas.ts
- src/entrypoints/sdk/coreTypes.generated.ts
- src/entrypoints/sdk/coreTypes.ts
- src/entrypoints/sdk/runtimeTypes.ts
- src/entrypoints/sdk/sdkUtilityTypes.ts
- src/entrypoints/sdk/settingsTypes.generated.ts
- src/entrypoints/sdk/toolTypes.ts
- src/migrations/migrateAutoUpdatesToSettings.ts
- src/migrations/migrateBypassPermissionsAcceptedToSettings.ts
- src/migrations/migrateEnableAllProjectMcpServersToSettings.ts
- src/migrations/migrateFennecToOpus.ts
- src/migrations/migrateLegacyOpusToCurrent.ts
- src/migrations/migrateOpusToOpus1m.ts
- src/migrations/migrateReplBridgeEnabledToRemoteControlAtStartup.ts
- src/migrations/migrateSonnet1mToSonnet45.ts
- src/migrations/migrateSonnet45ToSonnet46.ts
- src/migrations/resetAutoModeOptInForDefaultOffer.ts
- src/migrations/resetProToOpusDefault.ts
- src/skills/bundled/batch.ts
- src/skills/bundled/claude-api/SKILL.md
- src/skills/bundled/claude-api/csharp/claude-api.md
- src/skills/bundled/claude-api/curl/examples.md
- src/skills/bundled/claude-api/go/claude-api.md
- src/skills/bundled/claude-api/java/claude-api.md
- src/skills/bundled/claude-api/php/claude-api.md
- src/skills/bundled/claude-api/python/agent-sdk/README.md
- src/skills/bundled/claude-api/python/agent-sdk/patterns.md
- src/skills/bundled/claude-api/python/claude-api/README.md
- src/skills/bundled/claude-api/python/claude-api/batches.md
- src/skills/bundled/claude-api/python/claude-api/files-api.md
- src/skills/bundled/claude-api/python/claude-api/streaming.md
- src/skills/bundled/claude-api/python/claude-api/tool-use.md
- src/skills/bundled/claude-api/ruby/claude-api.md
- src/skills/bundled/claude-api/shared/error-codes.md
- src/skills/bundled/claude-api/shared/live-sources.md
- src/skills/bundled/claude-api/shared/models.md
- src/skills/bundled/claude-api/shared/prompt-caching.md
- src/skills/bundled/claude-api/shared/tool-use-concepts.md
- src/skills/bundled/claude-api/typescript/agent-sdk/README.md
- src/skills/bundled/claude-api/typescript/agent-sdk/patterns.md
- src/skills/bundled/claude-api/typescript/claude-api/README.md
- src/skills/bundled/claude-api/typescript/claude-api/batches.md
- src/skills/bundled/claude-api/typescript/claude-api/files-api.md
- src/skills/bundled/claude-api/typescript/claude-api/streaming.md
- src/skills/bundled/claude-api/typescript/claude-api/tool-use.md
- src/skills/bundled/claudeApi.ts
- src/skills/bundled/claudeApiContent.ts
- src/skills/bundled/claudeInChrome.ts
- src/skills/bundled/debug.ts
- src/skills/bundled/dream.ts
- src/skills/bundled/hunter.ts
- src/skills/bundled/index.ts
- src/skills/bundled/keybindings.ts
- src/skills/bundled/loop.ts
- src/skills/bundled/loremIpsum.ts
- src/skills/bundled/remember.ts
- src/skills/bundled/runSkillGenerator.ts
- src/skills/bundled/scheduleRemoteAgents.ts
- src/skills/bundled/simplify.ts
- src/skills/bundled/skillify.ts
- src/skills/bundled/stuck.ts
- src/skills/bundled/updateConfig.ts
- src/skills/bundled/verify.ts
- src/skills/bundled/verify/SKILL.md
- src/skills/bundled/verify/examples/cli.md
- src/skills/bundled/verify/examples/server.md
- src/skills/bundled/verifyContent.ts
- src/skills/bundledSkills.ts
- src/skills/loadSkillsDir.ts
- src/skills/mcpSkillBuilders.ts
- src/skills/mcpSkills.ts
- src/state/AppState.tsx
- src/state/AppStateStore.ts
- src/state/onChangeAppState.ts
- src/state/selectors.ts
- src/state/store.ts
- src/state/teammateViewHelpers.ts

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
