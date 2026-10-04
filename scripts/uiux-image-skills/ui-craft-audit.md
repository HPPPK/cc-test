---
name: ui-craft-audit
description: 只审查图片可支持的层面。静态像素并不等价于技术审计。
---

## UIUX generated-image-only applicability
This is the executable image-native adaptation. Audited upstream originals and licenses are archived under third_party and are not runtime instructions.

# UI craft audit — static evidence boundary
只审查图片可支持的层面。静态像素并不等价于技术审计。
## 可见检查
- 文字和背景可辨、关键标签不截断；颜色不是状态的唯一线索。
- 操作与对应对象邻近，标签含义明确，危险操作没有被弱化或误标。
- 选中态、空态、加载、错误等只在实际展示或用户要求时审查，不虚构测试过的状态。
- 当前画幅中的边缘、重叠、遮挡、内容溢出、信息密度与视觉触达。
## 不能从一张图证明
键盘可达、读屏语义、交互行为、动画性能、精确对比度合规、响应式、真实支付与转化提升：明确未验证。不要求为图片任务运行三端技术审计。
## 产出
Checked（当前实际图片与画幅）、观察证据、严重度、修正建议、未验证项。审计结果并入统一复审 JSON 的 observations、remainingIssues、limitations；未看见的区域不标通过。
