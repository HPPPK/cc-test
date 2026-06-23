# Agent Tool Surface Computer Use Fallback

## Status

- stage: awaiting_human_verify
- causal_map_completed: true
- investigation_contract_completed: true
- log_investigation_plan_completed: true
- observer_framing_completed: true
- execution_model: leader-inline
- dispatch_shape: leader-inline
- execution_surface: leader-inline
- dispatch_reason: Small focused investigation from one transcript and one regression test lane; evidence chain is tool availability, shell/edit tool registration, computer-use request admission, and model-facing tool descriptions.

## User Report

In a cc-jiangxia agent conversation, the agent tried `Bash` and `Write`, received `No such tool available`, then attempted to use `computer-use` despite the user wanting normal shell/file operations. When the user said not to use computer use and mentioned PowerShell, the agent still attempted `Bash` and finally asked the user to run commands manually.

## Project Cognition Intake

- readiness: review
- freshness: partial_refresh
- selected_concepts: `concept:GEN-20260610T112843.959253900Z:N-030`
- normalized_query: Debug desktop/agent tool availability: missing Bash/Write style tools, bad fallback to computer-use, Windows PowerShell shell surface not recognized by model/runtime.
- minimal_live_reads:
  - `src/tools`
  - `src/utils/shell`
  - `src/utils/computerUse`
  - `src/services/mcp/client.ts`
  - `desktop/sidecars`
  - `src/utils/standaloneAgent.ts`
  - `src/utils/processUserInput`
  - `.env.example`
- coverage_gap: cognition route is broad and path-index-backed, so live code must prove any claim.

## Observer Framing

- primary suspected loop: task instruction -> model assumes Claude Code tool names (`Bash`, `Write`) -> runtime only exposes cc-jiangxia tool surface or MCP tools -> tool call rejects as unavailable -> model chooses visible computer-use MCP as fallback -> user intent and project fallback policy are violated.
- primary_candidate: tool-surface mismatch between the prompt/skill expectations and actual runtime tools exposed in the cc-jiangxia conversation.
- contrarian_candidate: shell exists but is exposed under a different tool name or blocked by permission mode/config, and the model chose the wrong label (`Bash`) rather than using the real shell tool.
- recommended_first_probe: inspect tool registration, shell provider naming, computer-use injection, and prompt/skill instructions that mention Bash/Write.
- nearest_neighbor_related_risk: computer-use should not become an automatic substitute for missing file/shell tools.

## Investigation Contract

- primary_candidate_id: `tool-surface-mismatch`
- candidate_queue:
  1. `tool-surface-mismatch`: Bash/Write are not registered tool names in this runtime, while computer-use MCP tools are visible.
  2. `windows-shell-name-drift`: PowerShell is supported internally, but model-facing prompt/examples still say Bash.
  3. `missing-tool-discovery-or-recovery`: when a tool call returns unavailable, the agent does not inspect available tools or stop with a precise runtime limitation.
  4. `computer-use-overexposure`: computer-use tools are available in contexts where they should not be used for coding workflow fallback.
- related_risk_targets:
  - tool schema generation and filtering
  - session prompt/tool instructions
  - computer-use enablement/config
  - desktop/sidecar CLI task launch environment

## Log Investigation Plan

- existing log targets: transcript supplied by user, source-level tool registration, tests around shell/computer-use.
- candidate signal mapping:
  - `tool-surface-mismatch`: registered tool names differ from `Bash`/`Write`.
  - `windows-shell-name-drift`: shell provider resolves PowerShell but prompt/tool call examples remain Bash.
  - `missing-tool-discovery-or-recovery`: no recovery instruction on unavailable tool errors.
  - `computer-use-overexposure`: computer-use setup injects dynamic MCP allowed tools broadly unless disabled.
- observability escalation: if source does not identify tool names, reproduce with a local session tool list or inspect serialized API tool schemas.

## Current Focus

Automated verification passed. Awaiting user verification that simple folder/file/project creation prompts no longer trigger computer-use in the desktop agent.

## Truth Ownership Map

- decision truth owner: runtime tool registry and the model prompt/tool schema given to the provider.
- reflecting layers: desktop transcript UI, user-visible tool call cards, computer-use permission UI.
- cached/projected state: session messages and MCP connected tool list.

## Control State

- available tool schema list sent to the model.
- MCP server/tool enablement.
- permission mode and computer-use enabled/config flags.

## Observation State

- transcript errors: `No such tool available: Bash`, `No such tool available: Write`.
- agent prose claiming no command/file-write capability.
- computer-use permission/tool-call cards.

## Closed Loop

User asks implementation -> agent chooses a tool name -> runtime validates tool availability -> tool executes or errors -> model updates plan -> user sees transcript and progress.

## Evidence

- E1: User transcript shows `Bash` and `Write` calls failed with `No such tool available`, then the agent attempted multiple `mcp__computer-use__*` calls.
- E2: Project constitution says fallbacks require consent and failures must stay visible.
- E3: `src/services/tools/toolExecution.ts` emits `No such tool available` when `findToolByName(toolUseContext.options.tools, toolName)` cannot find the requested tool. This proves the failure happens before shell/file execution.
- E4: Built-in tool names do exist in this codebase: `Bash` in `src/tools/BashTool/toolName.ts`, `Write` in `src/tools/FileWriteTool/prompt.ts`, and `PowerShell` in `src/tools/PowerShellTool/toolName.ts`.
- E5: `src/server/services/workflowToolPolicy.ts` disallows implementation tools (`Write`, edit tools, `Bash`, `PowerShell`, `Agent`) for active workflow phases other than `implementation`/`implement`; `verification` keeps shell but denies file-edit tools.
- E6: Desktop session startup passes workflow disallowed tools through `--disallowed-tools` in `src/server/services/conversationService.ts`; CLI `--tools` also converts missing base tools into deny rules in `src/utils/permissions/permissionSetup.ts`.
- E7: Forked skills inherit `context.options.tools` as `availableTools` in `src/tools/SkillTool/SkillTool.ts`, so a skill child cannot regain `Bash`/`Write` if the parent context lacks them.
- E8: Windows `PowerShell` is gated: external builds require `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`, and default shell resolution remains `bash` unless settings explicitly choose `powershell`.
- E9: `src/main.tsx` can dynamically configure Computer Use MCP on Windows/macOS and pushes its tools into `allowedTools`; `--no-computer-use` disables that path.
- E10: Follow-up transcript shows the agent's own available-tool inventory contained `AskUserQuestion`, `Glob`, `Grep`, `Read`, `SendMessage`, `Skill`, `TaskCreate`/`TaskUpdate`/`TaskList`, `TeamCreate`, `WebFetch`, `workflow_template_authoring`, and MCP tools, but not `Bash`, `Write`, or `Edit`. This matches a restricted/read-orchestration tool surface rather than an implementation-capable tool surface.
- E11: Current user workflow session `3239e5e3-40d0-4eff-9dbe-b8adb5433d68` uses template `superspec-development-workflow`, status `running`, active phase `sp-implement`. `workflowToolPolicy.ts` only treats `implementation` and `implement` as implementation phase IDs, so `sp-implement` falls through to the non-implementation deny list.
- E12: 2026-06-17 RED test `bun test src/vendor/computer-use-mcp/toolCalls.test.ts` showed `request_access` does not reject filesystem/coding fallback reasons such as "Create a project folder with mkdir" or "创建文件夹并运行命令初始化项目"; it proceeds to the permission path.
- E13: `src/main.tsx` dynamically injects `mcp__computer-use__*` into `allowedTools` on supported platforms when computer-use is enabled, so the model sees those tools as ordinary callable tools unless tool descriptions or runtime admission reject the task.
- E14: `src/vendor/computer-use-mcp/tools.ts` previously described how to use `request_access`, `type`, `key`, `write_clipboard`, and `computer_batch` without a model-facing warning that Computer Use is not a fallback for filesystem/shell/coding tasks.
- E15: GREEN test `bun test src/vendor/computer-use-mcp/toolCalls.test.ts` now proves English and Chinese folder/project creation fallback reasons are rejected before the permission dialog, while terminal output inspection remains allowed.

## Root Cause

The original transcript had a tool-surface mismatch: `Bash` and `Write` are valid cc-jiangxia tools globally, but were absent from that specific conversation's `options.tools` list, so the model treated visible `mcp__computer-use__*` tools as a fallback. The 2026-06-17 recurrence exposed a second root cause: computer-use request admission and tool descriptions did not explicitly reject filesystem, shell, or coding fallback tasks. As a result, simple folder creation could start the computer-use permission path before later tier gates prevented typing into terminal/IDE windows.

## Contributing Factors

- Workflow phase state denies implementation tools unless the active phase is exactly `implementation` or `implement`; SuperSpec uses `sp-implement`, so it is currently misclassified.
- Forked skill execution does not rebuild an implementation-capable tool pool; it inherits the parent context tool list.
- PowerShell is not automatically available for external Windows builds, and the default shell remains `bash`.
- Computer-use tools are exposed as MCP tools when enabled, so the model sees them even though they are not a correct substitute for coding/file operations.
- Terminal/IDE tier gates block keyboard input late, after the model has already requested app access and shifted onto the wrong execution path.
- The unavailable-tool recovery path reports the raw failure but does not steer the model to inspect available tools, stop, or ask for the correct runtime surface.

## Eliminated

- Project-level absence of `Bash`/`Write`: eliminated by built-in tool registration.
- Shell executable failure: eliminated because the error is generated before shell/file execution.
- PowerShell as automatic replacement: eliminated for external Windows defaults unless explicitly enabled/configured.

## Recommended Fix Direction

- Done: add model-facing tool description guardrails so `request_access`, `type`, `key`, `write_clipboard`, and `computer_batch` say not to use Computer Use for filesystem, shell, or coding fallbacks.
- Done: add a `request_access` runtime guard that rejects English and Chinese fallback reasons for folder/file creation, source edits, dependency installs, git operations, and terminal commands before any OS permission or app approval flow.
- Done: preserve legitimate GUI inspection by allowing terminal output inspection without typing.
- Remaining adjacent risk: if a model phrases a fallback reason without any configured action/object terms, the heuristic may miss it; future transcripts should extend the classifier with evidence.

## Verification

- RED: `bun test src/vendor/computer-use-mcp/toolCalls.test.ts` initially failed because `request_access` allowed "Create a project folder with mkdir" and "创建文件夹并运行命令初始化项目".
- GREEN: `bun test src/vendor/computer-use-mcp/toolCalls.test.ts` passed with 4 tests, 13 assertions.
- Broader gate: `bun run check:server` passed with 1178 pass, 7 skip, 0 fail.
- Unified gate: `bun run verify` reported 8 passed, 1 failed, 2 skipped. The failed lane was `check:native`, caused by Windows `PermissionDenied` in the default Tauri target directory while a desktop process held build artifacts.
- Native recovery check: `cd desktop && bun run build:sidecars && cd src-tauri && cargo check` with isolated `CARGO_TARGET_DIR=$env:TEMP\cc-jiangxia-tauri-target-codex-computer-use` passed.
- Project cognition closeout: update payload written to `.specify/project-cognition/updates/20260617-computer-use-coding-fallback-guard.json`, but `project-cognition update` and `mark-dirty` both failed because `project-cognition.db metadata schema_version has "1", expected "2"`.

## Fix Scope

- classification: control-boundary
- changed_code_paths:
  - modified: `src/vendor/computer-use-mcp/toolCalls.ts`
  - modified: `src/vendor/computer-use-mcp/tools.ts`
  - added: `src/vendor/computer-use-mcp/toolCalls.test.ts`
- changed_behavior_surfaces:
  - computer-use MCP request admission
  - computer-use MCP model-facing tool descriptions
  - desktop agent tool selection guardrail
- loop_restoration_proof: A prompt reason that clearly asks to create folders/files or run coding/shell work is now rejected at `request_access` before permission UI or app control starts; the model also sees the same rule in the relevant tool descriptions, reducing wrong tool selection before runtime rejection.

## Human Verification

- status: awaiting_human_verify
- request: In the desktop app, try a simple prompt such as "创建一个 test 文件夹" or "create a project folder". Expected result: the agent should use direct shell/file tools when available, or report the missing tool surface; it should not request `mcp__computer-use__request_access` for terminal/IDE/Finder/Explorer control.
