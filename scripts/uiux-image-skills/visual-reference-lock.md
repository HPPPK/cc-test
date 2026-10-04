---
name: visual-reference-lock
description: 目的是在少量合适来源上看深，而不是大量逛站造成上下文噪声。
---

## UIUX generated-image-only applicability
This is the executable image-native adaptation. Audited upstream originals and licenses are archived under third_party and are not runtime instructions.

# Visual reference lock
目的是在少量合适来源上看深，而不是大量逛站造成上下文噪声。
## 锁定与去重
维护 URL → 任务角色 → 已访问区域 → 截图精确路径 → Read 结果 → 可迁移规律。规范化 www、尾斜杠、锚点后去重。两个页面必须提供不同的有效观察，不能把同页两次截图算两站。
用户给的具体 URL 不等于授权漫游；只在这些页面 navigate/scroll/wait/extract/screenshot。需要另一个 URL 时先 AskUserQuestion 取得范围变更。获准公开扩展时，先发现再锁定两个任务相关页面。
## 执行
参考必须在选方向和生图之前 Read 成功并形成 visual-reference-receipt；已有方向可以保留，但不能冒称跳过的研究完成。只读原始 Local screenshot path；读取失败报告宿主预览限制，不调用脚本转图。
change_sources 清掉本轮旧参考证据，重新确定范围；stop 停止研究和制作。use_available_evidence 只有用户明确接受且至少一页可见时才降低到一页；拒绝外部参考则直接跳过并标明未研究。
## 转用
每条参考写出“观察到什么 → 为何适合当前任务 → 如何在当前事实和品牌下重新组织 → 不借什么”。不照搬完整布局、标识、插图或文案。
