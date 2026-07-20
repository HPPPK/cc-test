# Debug Session: workflow-checkpoint-history-rollback

status: resolved
understanding_confirmed: true
causal_map_completed: true
investigation_contract_completed: true
log_investigation_plan_completed: true
observer_framing_completed: true
execution_model: leader-inline
dispatch_shape: leader-inline
execution_surface: leader-inline
dispatch_reason: The reported defect appears to be one focused state consistency problem around workflow checkpoint restore; start with leader-inline evidence after confirmation.
project_cognition_status: unavailable
project_cognition_note: Windows project-cognition runtime path from sp-debug is unavailable in this macOS workspace; continue with live repository evidence after user confirms the checkpoint.

## User Report

workflow 存储后回退，当前 session 的历史记录没有一并回退。

## Debug Understanding Checkpoint

| Item | Current understanding |
| --- | --- |
| Symptom | Workflow 点击“存储”后再“回退”，代码/workflow stage 可能能回到 checkpoint，但当前 session 的聊天历史、工具调用历史、agent/subagent 输出记录没有一起回到当时的历史位置。用户看到回退后的 session 仍保留 checkpoint 之后的消息和执行痕迹。 |
| Expected behavior | 一次 workflow checkpoint restore 应该恢复同一测试点的整体状态：项目文件、workflow active phase/state、以及当前 session 可见历史都应与选择的 checkpoint 对齐，至少 checkpoint 之后的消息/工具执行历史不能继续作为当前有效历史误导后续执行。 |
| Reproduction / failing signal | 已知用户手动复现：workflow 存储后回退，当前 session 历史记录没有回退。具体 session id、checkpoint id、是否应删除 transcript 还是隐藏/标记 superseded 暂未知。 |
| Known evidence | 之前已修过 rollback 时仍有 agent 继续执行的问题；当前新问题是“session history/transcript 没有随 checkpoint 回退”。Project cognition runtime 在当前 macOS 工作区不可用，只能在确认后用 live repository evidence 调查。 |
| Investigation boundary | Include: workflow checkpoint restore 对项目文件、workflow state、session transcript/history/UI projection 的一致性。Exclude: provider/auth/billing/MCP/model routing、非 workflow 的普通聊天 rewind。Escalate if: 发现需要改变全局 chat transcript 存储语义或 destructive history deletion 策略。 |
| Candidate focus | primary: checkpoint 只保存/恢复 git tree 和 workflow state，没有保存/恢复 session transcript boundary。contrarian: transcript 已有 turn-checkpoint/rewind 机制，但 workflow checkpoint restore API 没有调用或没有把目标 checkpoint 绑定到对应历史位置。 |
| Investigation plan | 1. 确认 workflow checkpoint 创建时是否记录 session history boundary；2. 检查 restore API 是否只恢复文件和 workflow state；3. 查已有 session rewind/turn checkpoint 是否可复用；4. 明确“回退历史”的安全语义：删除、截断、隐藏、还是标记 checkpoint 后消息 superseded；5. 加最小回归测试后实现最小修复。 |
| First evidence action | 读取 workflow checkpoint service/API、session transcript/rewind service、前端 history rendering 相关最小文件，确认当前 checkpoint 与 transcript 的数据流。 |
| Fix gate | 只有证明 checkpoint 缺少 transcript boundary 或 restore 未调用已有 rewind 机制后，才允许改代码。修复必须有 regression test 证明 restore 后 session history 与 checkpoint 对齐。 |
| Progress signal | 能指出一个 truth owner：checkpoint metadata、session transcript store、或 UI projection，并用测试复现“restore 后 checkpoint 后历史仍存在”的失败。 |

Reply with `确认` to continue, or `修改：...` with corrections.

## Current Focus

User confirmed the checkpoint. Next action: leader-inline evidence read of workflow checkpoint restore, session rewind/transcript storage, and the API/UI boundary to locate the truth owner for session history rollback.

## Evidence

- project-cognition runtime unavailable on current macOS workspace: Windows path from skill does not exist.
- Related reusable lessons reviewed from `.specify/memory/learnings/INDEX.md`: workflow source/session state drift and desktop workflow state projection bugs have occurred before.
- User confirmed the debug checkpoint and authorized source-level investigation.
- `src/server/services/workflowGitCheckpointService.ts` previously stored git tree and workflow state snapshots, but no transcript/message boundary.
- `src/server/api/sessions.ts` restore path restored workflow state and files, and already stopped the active session, but did not trim or refresh session transcript history.
- `desktop/src/pages/ActiveSession.tsx` restore handler updated workflow state and reloaded checkpoint list, but did not reload current chat history after restore.
- Fix stores a transcript snapshot `{ messageCount, lastMessageId }` with each new workflow checkpoint, trims messages after that saved count during restore, and reloads desktop chat history after a transcript-backed restore.
- Older checkpoints remain compatible: if no transcript snapshot exists, restore keeps existing transcript behavior while still restoring files/workflow state.

## Eliminated

- Provider/model/runtime routing: no evidence needed; failure is checkpoint/session transcript state coupling.
- Template/stage prompt behavior: unrelated to transcript rollback.

## Root Cause

Workflow checkpoints were scoped to project files plus workflow state. They did not persist the current session transcript boundary, so restore had no authoritative point at which to remove checkpoint-after messages. The desktop restore UI also did not refresh chat history after restore, so any server-side correction would not be visible immediately without reloading.

## Fix

- Added workflow checkpoint transcript snapshot storage next to the existing workflow state snapshot.
- Added `SessionService.trimSessionMessagesAfterCount()` for checkpoint-style rollback semantics.
- Extended workflow checkpoint restore API to trim transcript history and report removed message ids.
- Reloaded desktop chat history when restore includes a transcript snapshot.
- Added server regression coverage proving checkpoint restore removes messages created after the checkpoint.

## Verification

- PASS: `bun test src/server/__tests__/sessions.test.ts -t "workflow checkpoint routes"`
- PASS: `bun test src/server/services/workflowGitCheckpointService.test.ts`
- PASS: `cd desktop && bunx tsc --noEmit --pretty false`
- PASS: `git diff --check -- src/server/services/workflowGitCheckpointService.ts src/server/services/sessionService.ts src/server/api/sessions.ts desktop/src/types/session.ts desktop/src/pages/ActiveSession.tsx src/server/__tests__/sessions.test.ts`

## Status

resolved
