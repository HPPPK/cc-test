# stradn管理开发

这是从 `efficient-constrained-dev-debug-workflow-v5` 当前磁盘版本完整复制出的独立工作流包。原工作流不会被此包覆盖。

新包保留原有 Skills 与宿主工具声明，并增加 `workflow:stradn-delivery-manager`。原来的计划、分批实现/审查、场景 QA 三个阶段被融合为 `stradn-delivery`：内部仍有 plan-lock、Coder -> Reviewer、失败修复回环和独立 QA 门禁。App runtime 是权限、锁、任务收据、暂停和恢复的唯一状态源。
