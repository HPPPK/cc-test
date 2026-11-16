# CC-JIANGXIA 换电脑交接（2026-11-13）

这是一份完整工作区源码快照的交接说明，不是新版本发布，也不是全部现场验收通过。GitHub 仓库为 HPPPK/cc-test；请获取 `fix/old-photo-research-live` 分支，不要只克隆默认 main。源码快照包含专家、工作流、消息契约、SDK 类型、桌面、通知及原生打包的累计未提交修改，并保留原有提交历史。

## 用户约束

- 使用大白话沟通，不能把源码测试、打包成功、正在运行的 App、真实模型结果混为一谈。
- 当前研究实跑使用用户配置的 OpenAI `gpt-6-luna`；不要静默改模型或换成 Pro。密钥不在仓库，需新电脑本地配置。
- 产品调研最终 HTML 必须通过 `expert-template-fill` CLI 填固定母版，不允许 Write/Edit 生成或修改最终 HTML，也不能自行重造模板。研究 Markdown 可以 Write/Edit。
- 默认“金舟 C 端工具业务”规则是用户需要的；可以被本轮明确用户规则覆盖，不要擅自删除。
- 用户只输入一句产品方向，App 应自行澄清会改变范围的关键问题，复用真实回答，不重复提问；不需要外部 AI 手工分配研究线、补写内容或修改报告。
- 真搜到、内容相关、可追溯的资料应保留；区分页面事实、有限观察、AI 推断和缺口。不要用过严的来源数/字数/获客效果证明门槛把有用材料删光，也不能伪造。
- 验证或登录由用户操作；后台浏览器平时不能抢前台，只在用户点打开时显示。每隔约 3 秒检查原页面，页面实际通过再继续。用户选择改查其他入口，仅跳过本次受阻入口，不能让历史验证码污染后来成功页面或阻断无关网站。
- 不发布、不打 tag、不自行合并主分支。用户另行明确授权除外。

## 专家目前流程与入口

专家包：`experts/commercialization-research-report/`，manifest 为 `0.13.58-local`（以当前文件为准）。

1. 主代理结合业务规则、用户材料评估范围；关键用户选择通过 AskUserQuestion 获取，服务端保存真实回执。已确认后继续研究，不能拿工具调用 ID 冒充用户消息 ID。
2. 保存 `commercialization-research/01-research-brief.md`。内置来源目录是相关候选库，不要求把全部约 119 个入口逐个访问。
3. A/B/C 分别研究竞品、用户需求、商业化与渠道，首次并行，按需有界跟进。各代理写自己的 `.parts` Markdown，主代理按文件交接，避免把整篇研究结果塞回聊天上下文。
4. 浏览器保存实际打开页面、查询、正文及受限/恢复事件；成功加载与取得有效相关内容是两回事。历史受限和后续成功必须分别保留。
5. D 独立证据复核写 `05-evidence-review.md`；E 吸收细节与来源到 `07-report-field-absorption.md`，不能压成几句泛泛总结。
6. 主代理用 CLI 的真实 schema 填固定母版，CLI 写盘并确认保存。F 检查最终 HTML 与原始材料，写 `08-report-completeness-review.md`，包括事实/来源/遗漏和单位成本复核。
7. 必修字段通过 CLI 恢复完整字段后最小修正并再次确认；保留研究、来源和可恢复状态。失败回传主代理可理解的具体问题，不允许无限空转，也不能把停止重试当作报告完成。

主要源码：

- `experts/commercialization-research-report/prompts/system.md`、`skills/commercialization-research-method/SKILL.md`：方法、分工、范围及质量规则。
- `src/server/services/expertResearchIntakeService.ts`：范围评估、用户回答与门禁。
- `src/server/services/expertResearchSourceSelection.ts`、`expertResearchSourceLibraryService.ts`：来源计划和候选目录。
- `src/server/services/expertResearchAutoContinueService.ts`：结束状态、文件交接及定向恢复。
- `src/server/services/expertBrowserActivityService.ts`、`expertResearchBrowserPolicyService.ts`：浏览器状态与审计。
- `src/server/services/expertResearchEvidenceReviewService.ts`、`expertResearchEvidenceAbsorptionService.ts`、`expertResearchQualityCheckpoint.ts`：复核、吸收及质量恢复。
- `src/server/services/expertResearchDeliveryService.ts`、`expertResearchCompletionService.ts`：交付与最终完成。
- `src/tools/PlaywrightTool/playwright-browser-runner.ts`、`browserDriver.ts`：实际浏览器 runner 与驱动选择。
- `desktop/scripts/build-sidecars.ts`：Node runner 和运行依赖打包。
- 通用消息身份与恢复跨正常聊天、专家和工作流；查看 `src/types/message.ts`、`src/utils/messageKind.ts` 及桌面聊天历史恢复路径，不能只修专家展示。

开发工作流的默认目标仍为 `efficient-constrained-dev-debug-workflow-v5`（引导式产品开发流程）。`skills-development`、`stradn-managed-development-workflow-v1` 等另保留，不要混改或删除。

## 最新 Patchright 接入

- 锁定 `patchright@1.64.3`，内置受管 Chromium 默认经 Patchright 启动。仍使用现有 Chromium、隔离环境、后台窗口和人工验证策略。
- 外部授权 CDP 继续使用原 Playwright。没有导入日常浏览器 Cookie、轮换代理或自动解验证码。
- 通过进程环境变量 `CC_JIANGXIA_BROWSER_DRIVER=playwright` 可回退；重启 runner 后生效。候选库懒加载，避免库加载异常连带阻断回退。
- 启动失败返回实际错误，不静默换驱动或反复重启。打包携带 playwright、playwright-core、patchright、patchright-core。
- 本机原 App 内 Chromium 为 149.0.7827.55；Patchright 推荐配套版本不同。本机动作测试不等于所有操作系统/浏览器版本兼容，换电脑必须复测。

## 已有测试事实及尚未通过之处

2026-11-13 本机常规全仓门禁 `10-37-14-747Z`：12 通过、0 失败、0 跳过，包括核心类型、服务端、桌面、适配器、原生、文档、持久化和覆盖率；整体 PR 就绪仍被 CLI 核心审批策略阻挡，不能宣称可合并。

覆盖率：服务端 79.53%，桌面行覆盖 83.36%；Agent tools/utils 有历史低覆盖债务，门禁通过不等于全部达到目标。报告留在旧电脑忽略的 `artifacts/quality-runs/2026-11-13T10-37-14-747Z/` 与 `artifacts/coverage/2026-11-13T10-48-15-424Z/`，不会上传原始日志。

最后集中浏览器回归：47 通过；打包脚本 13 通过；新增驱动选择模块单测 100% 行/函数覆盖。懒加载修订后重新跑了集中回归和核心类型。

真实编译后 Node runner + App 自带 Chromium：Patchright 和回退 Playwright 均通过公开页正文、新标签、填充点击、模拟验证保留、等待期间阻止导航、明确改查后恢复。这是直接 runner 验证，不能代替完整原生 App 界面验收。

真实网站小样本对照：同一电脑/代理/后台参数/全新上下文，两轮 Google 中原 Playwright 均出现异常流量，Patchright 均取得搜索结果正文；V2EX 和 AutoHotkey 两种驱动均被挑战。不能宣称通用免验证或长期稳定。

保留风险：有一次后台输入框 fill 等待可操作超时；后续完整复跑及三次后台多标签输入通过。原因尚未定位，不得说已经根治，也不要用抢前台/强制点击掩盖。

Luna 6 现场基线 `10-49-14-112Z`：6 通过、2 失败。跨模块重构用例中模型没有改要求的 `src/config.ts`、`src/runner.ts`；桌面 agent-browser smoke 因 PATH 缺 `agent-browser` 未启动。供应商连通及其余五个编码基线通过。没有完成接入后的原生 App 全流程“老照片修复”验收。

已安装 App / 最新旧构建时间为 2026-11-13 17:28；不能据此断言含本轮后续 Patchright 源码。用户换电脑后应从本分支重新构建；不要沿用旧安装包冒充新代码。

## 新电脑开始顺序

1. 获取正确分支，先读 `AGENTS.md`、本交接与 `docs/starup/jiangxia-startup.md`。核对 git 分支/提交，保留其他窗口改动。
2. 按根目录 → desktop → adapters 安装依赖。不要复制旧 node_modules 或旧平台二进制。
3. 本地配置 OpenAI Luna 6 密钥；不要提交或打印密钥。GitHub 代码同步不包含 `~/.claude` 的会话、供应商、Skills/MCP 私有配置或登录 Cookie。若需历史会话，用单独受保护的迁移，不能公开推送这些目录。
4. 先跑相关单测及 `bun run verify`；文档检查会执行 npm ci，不能同时跑依赖同一 node_modules 的检查。
5. 按系统构建：macOS Apple Silicon 使用 `desktop/scripts/build-macos-arm64.sh`；其他平台查启动指南和 sidecar 配置，不复用 Mac 二进制。先 build 桌面前端，再按文档启动。
6. 单独复测 Patchright 普通页、新标签、输入/点击、验证通知、手动打开、3 秒检查、切换入口及回退驱动。不要自动点击验证码或无故抢前台。
7. 修复/补齐 agent-browser 环境后跑桌面真实模型 smoke；再从原生 App 用一句“老照片修复”独立实跑。允许回答澄清和处理验证，外部 AI 不代写报告或引导研究细节。
8. 验收实际网站相关性、需求帖子/评论、独立竞品、定价条件、渠道样本、审计恢复、材料到 HTML 的细节保留及总耗时。不要只看 HTML 是否生成或是否通过结构校验。
9. 优先定位重复失败/重试的真实输入、响应和恢复状态，再决定修代码还是精简提示词；保留模型灵活性。不要新增来源数/字数配额来伪装质量。

## 迁移范围

源码、测试、工作流/专家原包与构建脚本在 Git 中；依赖通过锁文件重建。构建缓存、安装包、原始测试/会话日志、API 密钥和用户私有配置不属于 Git 源码同步。对照的用户 HTML 报告如需继续质量比对，应由用户单独迁移，仓库固定母版不等于那份用户报告。
