# Expert 报告传输、来源局部修复与复核恢复

类型：tooling_trap / recovery_path；适用于 Windows Bash、专家 CLI 渲染、来源表 patch、F 复核失败。

- 长中文报告经 Windows Git Bash `-c` 传递可能报引号 EOF，即使命令换行与 heredoc 配对正确。真实会话13条失败命令中9条在去除报告CLI后仍复现；13条改经stdin全部成功。先验证参数传输，不能让模型压缩报告来躲错误。`src/utils/shell/commandTransport.ts` 对 Windows 长 Bash 脚本保留组装结果、改经 `-s` stdin 传递。
- 来源字段的数组是整体替换，补一行可能让其他仍被引用来源消失。`07`局部标签与报告标签可以不同，不能猜`S1=1`。恢复依据已保存草稿的可见引用与真实auditId，保留旧摘要/日期，冲突不猜；只恢复仍被引用且有审计依据的来源。
- F读完材料但API失败后，08缺失是后果，不能直接认定Write权限缺失。自动恢复复用原agentId/transcript；连续失败有界停止并保留草稿。已有原文、分片、审计不能被新任务空历史否定。
- 上游连接错误返回安全requestId、阶段、耗时与有限causeCode；不输出密钥、请求体或整段编译栈。不把恢复机制说成上游稳定性根因已解决。

后续第三轮修正：配对且带引号的CLI标准输入即使是坏JSON也只是数据；不能先JSON.parse失败再把正文的Playwright/curl识别成研究命令。73条实际命令因额外`}`被误判，模板CLI没有执行。定稿止重试必须读取真实工具回执，不能只读模板服务失败元数据；工具层拒绝不会到达模板服务。真实历史重放应证明只通知一次受阻且不触发settled完成通知。详见`artifacts/expert3-ten-hour-loop-audit.md`。

第三轮报告溯源补充：V2EX 工具返回标题“请稍候…”及中文 Cloudflare 安全验证正文，但旧 ledger 为 opened；用户引文仅见于前一 Google SERP。应复用同一页面识别器核对原始动作正文，不能以 opened 压过验证页。浏览审计沿用 detail 字符串附上有界实际摘录，不新增持久化 schema；摘录未包含引文不证明网页没有引文。跨页只匹配到摘要时给非阻塞归属警示，保留原材料，不自动删来源或强迫重查。研究收尾沿关键问题检查未跟进线索，复用既有补查预算，不新增数量门槛；共享覆盖指令只注入一次。报告要保留当前业务默认、方案依据和取舍，避免 DATA_DECLARATION 与 EVIDENCE_STATUS_SUMMARY 重复。核查见 `artifacts/quicker-report3-vs-reference-audit.md`，本轮回归日志见 `artifacts/report3-fix-focused.log`、`report3-fix-followup.log`。

证据：`artifacts/expert-session-2026-11-15-audit.md`、`artifacts/latest-expert-replay-after.log`；280项定向回归通过，覆盖率artifact `artifacts/coverage/expert-repair/lcov.info`。真实provider非流式/流式smoke通过，但failing-unit基线180秒超时；完整门禁尚不能宣称通过。
