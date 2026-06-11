# Scan Packet: lane-src-other

## Packet Contract
- **packet_id**: lane-src-other
- **family_id**: src-important
- **mode**: read_only
- **result_handoff_path**: .specify/project-cognition/workbench/worker-results/lane-src-other.json

## Objective
Scan remaining src/ subdirectories for secondary modules, config, and supporting code.

## Assigned Paths (99 total)
- src/QueryEngine.ts
- src/Task.ts
- src/Tool.ts
- src/assistant/AssistantSessionChooser.ts
- src/assistant/gate.ts
- src/assistant/index.ts
- src/assistant/sessionDiscovery.ts
- src/assistant/sessionHistory.ts
- src/bootstrap/state.ts
- src/buddy/CompanionSprite.tsx
- src/buddy/companion.ts
- src/buddy/observer.ts
- src/buddy/prompt.ts
- src/buddy/sprites.ts
- src/buddy/types.ts
- src/buddy/useBuddyNotification.tsx
- src/commands.ts
- src/context.ts
- src/coordinator/coordinatorMode.ts
- src/coordinator/workerAgent.ts
- src/cost-tracker.ts
- src/costHook.ts
- src/daemon/main.ts
- src/daemon/workerRegistry.ts
- src/dialogLaunchers.tsx
- src/environment-runner/main.ts
- src/goals/goalState.test.ts
- src/goals/goalState.ts
- src/history.ts
- src/ink.ts
- src/interactiveHelpers.tsx
- src/jobs/classifier.ts
- src/keybindings/KeybindingContext.tsx
- src/keybindings/KeybindingProviderSetup.tsx
- src/keybindings/defaultBindings.ts
- src/keybindings/loadUserBindings.ts
- src/keybindings/match.ts
- src/keybindings/parser.ts
- src/keybindings/reservedShortcuts.ts
- src/keybindings/resolver.ts
- src/keybindings/schema.ts
- src/keybindings/shortcutFormat.ts
- src/keybindings/template.ts
- src/keybindings/types.ts
- src/keybindings/useKeybinding.ts
- src/keybindings/useShortcutDisplay.ts
- src/keybindings/validate.ts
- src/localRecoveryCli.ts
- src/main.tsx
- src/memdir/findRelevantMemories.ts
- src/memdir/memdir.ts
- src/memdir/memoryAge.ts
- src/memdir/memoryScan.ts
- src/memdir/memoryShapeTelemetry.ts
- src/memdir/memoryTypes.ts
- src/memdir/paths.ts
- src/memdir/teamMemPaths.ts
- src/memdir/teamMemPrompts.ts
- src/moreright/useMoreRight.tsx
- src/native-ts/color-diff/index.ts
- src/native-ts/file-index/index.ts
- src/native-ts/yoga-layout/enums.ts
- src/native-ts/yoga-layout/index.ts
- src/outputStyles/loadOutputStylesDir.ts
- src/plugins/builtinPlugins.ts
- src/plugins/bundled/index.ts
- src/proactive/index.ts
- src/proactive/useProactive.ts
- src/projectOnboardingState.ts
- src/query.ts
- src/query/config.ts
- src/query/deps.ts
- src/query/stopHooks.test.ts
- src/query/stopHooks.ts
- src/query/tokenBudget.ts
- src/query/transitions.ts
- src/remote/RemoteSessionManager.ts
- src/remote/SessionsWebSocket.ts
- src/remote/remotePermissionBridge.ts
- src/remote/sdkMessageAdapter.ts
- src/replLauncher.tsx
- src/schemas/hooks.ts
- src/screens/Doctor.tsx
- src/screens/REPL.tsx
- src/screens/ResumeConversation.tsx
- src/self-hosted-runner/main.ts
- src/setup.ts
- src/ssh/SSHSessionManager.ts
- src/ssh/createSSHSession.ts
- src/tasks.ts
- src/tools.ts
- src/upstreamproxy/relay.ts
- src/upstreamproxy/upstreamproxy.ts
- src/vim/motions.ts
- src/vim/operators.ts
- src/vim/textObjects.ts
- src/vim/transitions.ts
- src/vim/types.ts
- src/voice/voiceModeEnabled.ts

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
