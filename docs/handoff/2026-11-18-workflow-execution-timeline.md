# 工作流执行时间线

行为面：desktop、server。

工作流会话顶部新增「执行时间线」。打开后每 2 秒同步一次，显示阶段切换、子任务进度、工具调用参数、返回结果、错误和授权等待。可展开详情，按工具、阶段与子任务、错误与等待筛选，加载更早记录。查看旧记录时停止跟随滚动；重新勾选「跟随最新」恢复自动滚动。

## 本次改动范围

- 服务端：新增 `src/server/services/workflowTimelineService.ts`、`src/server/api/workflowTimeline.ts`；在 `workflowSessionStateService.ts`、`api/sessions.ts` 和 `ws/handler.ts` 接入记录与读取。
- 桌面：新增 `desktop/src/api/workflowTimeline.ts`、`desktop/src/components/workflow/WorkflowTimeline.tsx`，在 `desktop/src/pages/ActiveSession.tsx` 接入，包括退出工作流后的历史入口。
- 回归：新增同名服务、API 客户端和组件测试，以及 `src/server/__tests__/workflow-timeline.test.ts`；扩展 `ActiveSession.test.tsx`，将兼容测试加入 `scripts/quality-gate/persistence-upgrade.ts`。
- 浏览器：`scripts/quality-gate/desktop-smoke/workflow-timeline.ts` 和 `desktop/scripts/workflow-timeline-*` 使用隔离的生产构建与测试数据。
- 验证修正：`src/server/__tests__/workflowTemplates.test.ts` 的测试 HTTP 服务器空闲超时从 Bun 默认值调整为与正式服务器一致的 60 秒，避免冷启动目录扫描时连接提前断开；保留原断言和测试超时要求。
- 类型修正：工作区已有的 `workflowDependencyRiskPolicy.test.ts` 中，`passReceipt.reviewStatus` 显式保持 `'pass'` 字面量类型，解决 TS2769；不修改测试断言或依赖风险规则。
- 项目认知状态保持 stale/dirty，并登记本次新增入口；未将旧认知标记为已更新。

## 数据与兼容

- 新事件追加到应用存储目录 `workflow-sessions/<sessionId>/timeline.jsonl`，每条使用独立的 `schemaVersion: 1`。不修改原会话 JSONL、模板或共享 settings。
- 在 WebSocket 广播检查客户端连接之前记录工具及状态事件，关闭时间线也继续记录。阶段和任务变化随工作流状态写入记录。
- 旧会话没有 timeline 文件时，在读取时从阶段历史和主会话、子 Agent 存档恢复工具记录，无需重写旧数据。旧版未保存的实时事件无法恢复。
- 工具开始与结果通过父 Agent 调用和工具 id 联合关联，重复交付合并。不同子 Agent 复用同一个工具 id 时仍保留独立记录。结果显示工具名称、成功或失败和耗时，并保留工具发起时的阶段；终止后未返回的工具显示「已中断」。
- 详情移除常见凭据和图片数据，限制 8,000 字符。大结果仍以原会话存档为准。
- 损坏行被跳过并显示警告；未知未来日志版本保留原始文件并显示警告。日志写入失败不打断 AI 执行，读取时报告可能缺失。

## 实时性与异常

API：`GET /api/sessions/:id/workflow/timeline?limit=100&before=<event-id>`，单页最多 200 条，响应禁止缓存。界面在打开时顺序轮询，不重叠请求；切换会话或关闭时忽略未完成请求。发生大批事件时自动补读中间页。断网保留已经加载的记录并重试。

顶部优先显示服务端提供的阻塞原因、阶段确认和授权等待。执行中 60 秒未出现新事件时提示可能正在等待工具或模型响应，不把沉默判为失败。显示的进度来自可观测事件，不包含模型私有推理过程。

## 验证入口

- `bun test ./src/server/services/workflowTimelineService.test.ts ./src/server/__tests__/workflow-timeline.test.ts`
- `cd desktop && bunx vitest run src/components/workflow/WorkflowTimeline.test.tsx src/api/workflowTimeline.test.ts src/pages/ActiveSession.test.tsx`
- `bun run check:persistence-upgrade` 包含旧会话无 timeline 文件的升级回归。
- `node --experimental-strip-types scripts/quality-gate/desktop-smoke/workflow-timeline.ts`：真实生产组件，隔离浏览器和 HTTP 测试数据，覆盖实时更新、详情展开、历史翻页、筛选、断网恢复和重新加载。
- 全量交付检查：`bun run verify`；实时模型基线使用 `bun run quality:gate --mode baseline --allow-live --provider-model <selector>`。

浏览器测试结果与截图写入 `artifacts/quality-runs/workflow-timeline-smoke/`，不提交生成产物。

## 本轮非实时验证结果

- 新时间线后端：14 通过、0 失败；`artifacts/coverage/workflow-timeline-focused/lcov.info` 中新增 API 与日志服务共 222 个可执行行全部覆盖。
- 新时间线桌面组件与 API：10 通过、0 失败；`artifacts/coverage/workflow-timeline-desktop/coverage-summary.json` 的行覆盖率 99.45%、函数覆盖率 100%、分支覆盖率 90.07%。
- 完整桌面检查：132 个文件、1,255 项测试通过，类型检查和生产构建通过。
- 核心类型与契约检查：TypeScript 编译和 114 个测试文件通过；策略检查 110 项通过；工作流会话模式 smoke 通过。
- 持久化升级检查：服务端 36 项、桌面迁移 9 项、原生配置脚本 10 项通过，1 项 macOS 专属测试按平台跳过，0 失败。
- 独立浏览器 smoke：7 项通过、0 失败；结果与截图在 `artifacts/quality-runs/workflow-timeline-smoke/`。
- 文档检查：`bun run check:docs` 通过，包含 `npm ci` 和 VitePress 生产构建。

`bun run verify` 的本轮日志位于 `artifacts/quality-runs/2026-11-18T05-16-42-198Z/logs/`。运行超过一小时，在服务端全量测试中确认下列阻塞后停止，**本轮没有生成完整 report.md/report.json，也没有整库通过或完整 changed-line coverage 通过结论**：

1. `expertTemplateFillContract.test.ts` 和 `sessionAgentResult.test.ts` 在测试准备阶段创建文件符号链接，Windows 返回 EPERM；未修改机器权限，也未跳过或放宽对应业务断言。
2. 当前工作区的开发工作流提示词已采用严格 JSON Coder 回执，`workflowDevelopmentContracts.test.ts` 仍断言旧的 `readyForReview: true/false` 文本和已移除的句子。检查确认后保留工作流和该测试原样，避免替本功能改动已有的批次完成规则。

服务端全量检查未运行完，整库覆盖率和后续整体验证仍有缺口。上述专项通过结果不能替代完整 PR / release 门禁；未降低覆盖率基线或阈值。

## 本轮实时基线的验证缺口

真实服务商选择器：`openai-gpt-6-luna:main:openai-gpt-6-luna-main`。
`artifacts/quality-runs/2026-11-18T04-26-40-462Z/report.md` 记录 2 项通过、7 项失败、0 项跳过：服务商 live/proxy smoke 和用例目录校验通过，6 个 Coding Agent 用例分别在 180–300 秒的预算内未能完成，整桌面 agent-browser smoke 在等待测试服务器 `/health` 时超时。

只读核查基线会话确认，模型已经调用 Skill、Read、Grep 和任务管理工具；这些超时不能当作完整端到端通过证据。本功能独立的生产构建浏览器验证通过 7 个交互检查；整库非实时 `verify` 结果应单独查看，不能与上述实时基线混为一项通过结论。
