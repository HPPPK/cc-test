# 项目体检 Expert 实现总结

## 当前实现状态

### ✅ 已完成的部分

#### 1. Expert 框架核心（ExpertAIRunner.ts）
- 支持通用 AI 客户端接口 (`AICallClient`)
- 实现了 5 个 intent 的智能提示词系统：
  - `run-guide` — 启动指南
  - `test-guide` — 测试指南
  - `project-overview` — 项目概览
  - `full-health-check` — 完整体检
  - `ai-handoff` — AI 交接摘要
- 改进的 AI 响应解析和容错机制
- 无 AI 客户端时的静态分析回退

#### 2. 会话管理集成（ExpertSessionService.ts）
- 为 `repo-health-check-expert` 添加了专门的处理逻辑
- 集成了 `RepoHealthCheckExpertRunner` 进行静态分析
- 支持 AI 增强分析的流程

#### 3. 项目体检能力（repoHealthCheckExpertRunner.ts）
- 完整的工作区验证逻辑
- 项目扫描和技术栈检测
- 启动、测试、构建命令识别
- 风险区域标识
- 4 种输出格式生成（summary、json、evidence、handoff）

#### 4. Expert Pack 结构（.expert-packs/repo-health-check-pack/）
```
manifest.json              # 包清单
experts/
  repo-health-check-expert/
    expert.json           # 专家定义
    prompts/
      system.md          # 系统提示
      intake.md          # 进场指引
    forms/
      intake.json        # 用户输入表单
    outputs/
      material-protocol.json  # 输出协议
skills/
  repo-health-check-guide/
    SKILL.md             # 技能指导文档
```

#### 5. API 路由（src/server/api/experts.ts）
- `GET /api/experts` — 列表专家
- `POST /api/experts/packs/import` — 导入 expert pack
- `POST /api/experts/sessions/<sessionId>/enter` — 进入专家模式
- `POST /api/experts/sessions/<sessionId>/run` — 执行分析

### ⏳ 还需要完成的部分

#### 1. 聊天窗口集成
**需要改动的文件：**
- `desktop/src/lib/experts.ts` — 专家列表和调用
- `desktop/src/components/experts/ExpertSelectionDialog.tsx` — 专家选择 UI
- `desktop/src/stores/expertStore.ts` — 专家状态管理
- `desktop/src/api/experts.ts` — 聊天窗口的 API 调用

**关键任务：**
- 在聊天窗口的 "+" 菜单中暴露专家调用
- 实现 intake form 的 UI 渲染
- 将分析结果实时流到聊天窗口

#### 2. AI 客户端集成
**当前问题：**
- `ExpertAIRunner` 仍然硬编码使用 Anthropic SDK
- 应该接收聊天窗口的 `AICallClient` 配置

**修复方案：**
```typescript
// 在 ExpertSessionService 中
const chatWindowClient = getChatWindowAIClient(sessionId)
aiRunner.setClient(chatWindowClient)
```

#### 3. 流式输出实现
**需要：**
- 在 WebSocket 或 Server-Sent Events 中流送分析进度
- 实现回调机制用于实时更新

**参考模式：**
```typescript
const progressCallback = (stage: string, progress: number) => {
  // 通知聊天窗口
}
```

#### 4. 完整测试流程
- 选择 expert → ✅ (API 已支持)
- 填写 intake form → ⏳ (需要 UI)
- 运行分析 → ✅ (API 已支持)
- 输出到聊天窗口 → ⏳ (需要集成)

## 关键代码路径

### Expert Pack 导入流程
```
UI: 用户选择 ZIP
  ↓
ExpertPackRegistryService.importExpertPackZip()
  ├─ 验证包结构
  ├─ 保存到 ~/.claude/expert-packs/
  └─ 更新 registry
```

### Expert 执行流程
```
用户选择 expert 并运行
  ↓
ExpertSessionService.runExpertAgent()
  ├─ 如果是 repo-health-check:
  │   ├─ RepoHealthCheckExpertRunner.run() — 静态分析
  │   └─ ExpertAIRunner.runExpertAgent() — AI 增强（可选）
  └─ 其他 expert:
      ├─ ExpertRuntimeService.analyze() — 通用分析
      └─ ExpertAIRunner.runExpertAgent() — AI 增强
  ↓
写入输出文件 (material-summary.md, material.json, evidence.md)
  ↓
更新 session 状态为 'completed'
```

## 关键配置

### 5 个 Intent 的分析深度差异

| Intent | 重点 | 输出内容 |
|--------|------|---------|
| run-guide | 启动 | 启动命令、依赖、环境变量 |
| test-guide | 测试 | 测试命令、质量检查 |
| project-overview | 结构 | 项目类型、技术栈、目录 |
| full-health-check | 完整 | 所有方面的深入分析 |
| ai-handoff | 摘要 | 精简的 AI 交接信息 |

## 下一步行动项

1. **聊天窗口集成** — 修改 `desktop/src/` 中的文件，暴露 expert 调用
2. **AI 客户端配置** — 实现从聊天窗口获取 AI 配置的机制
3. **测试和验证** — 端到端测试整个工作流
4. **优化和完善** — 改进 UI/UX、添加进度显示、错误处理

## 关键文件位置

| 功能 | 文件 |
|------|------|
| 专家 AI 运行器 | `src/server/services/expertAIRunner.ts` |
| 会话管理 | `src/server/services/expertSessionService.ts` |
| 项目体检 | `src/server/services/repoHealthCheckExpertRunner.ts` |
| 包管理 | `src/server/services/expertPackRegistryService.ts` |
| API 端点 | `src/server/api/experts.ts` |
| 聊天窗口 API | `desktop/src/api/experts.ts` |
| 聊天窗口 Store | `desktop/src/stores/expertStore.ts` |

## 已通过的关键验证

- ✅ ExpertAIRunner 支持 5 个 intent 的动态提示词
- ✅ 无 AI 客户端时能降级到静态分析
- ✅ RepoHealthCheckExpertRunner 完整实现项目分析
- ✅ ExpertSessionService 能集成两种分析源
- ✅ Expert pack 结构完整且规范

## 已知限制

1. 还未集成到聊天窗口 UI
2. 还未实现流式输出到聊天窗口
3. AI 客户端配置还是硬编码（需改为动态）
4. 缺少实时进度显示
