# 专家已结束工作者的恢复必须使用实际可用的同一上下文

- 真实会话 `b051442f-c2a2-4984-9de3-a3b109ce402f` 暴露：四反引号证据围栏被三反引号正则拒绝；主代理修好文件不等于原审计已保存。不要把格式失败诊断成API认证或网络不稳定。
- 普通 Agent 的继续执行已通过 SendMessage 实现，但过去被 agent-teams 开关隐藏。工具可用性、参数校验和恢复指令必须一致；普通原agentId文本恢复无需团队功能，广播/团队协议仍需开关。恢复指令须包含必需summary。
- 新 Agent 没有旧工作者的浏览transcript，也不能读旧工作者分片。恢复应复用实际持有浏览审计的原agentId；不能默认选择最后结束的空修复任务。
- 已结束且审计未完成与仍在运行是不同状态。前者明确要求原工作者save-only恢复，不能反复提示等待旧TaskOutput、重新派D或假称系统还在研究。
- 证据代码块兼容至少三个且相同长度的配对反引号；继续校验唯一块、JSON/lane、引文和真实审计，不降低来源真实性要求，不加数量门槛。
- 回归：`SendMessageTool.test.ts`、`expertResearchQualityCheckpoint.test.ts`、`expertResearchQualityCheckpoint.integration.test.ts`、`expertResearchAutoContinueService.test.ts`。现场只读观察见 `artifacts/quicker-manual-4-observation.md`。
- 当前机器无project-cognition CLI，已使用现有交接、项目记忆与限定源码验证；图索引尚未更新，不把它当作已验证的当前导航。
