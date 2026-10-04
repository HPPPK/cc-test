---
name: website-reference-research
description: 先完成 inspiration_sources。用户提供 URL 优先且默认锁定具体页面；用户允许扩展后才可以扩站。未给来源时主动 AskUserQuestion，不能自行替用户选择。
---

## UIUX generated-image-only applicability
This is the executable image-native adaptation. Audited upstream originals and licenses are archived under third_party and are not runtime instructions.

# Website reference research
先完成 inspiration_sources。用户提供 URL 优先且默认锁定具体页面；用户允许扩展后才可以扩站。未给来源时主动 AskUserQuestion，不能自行替用户选择。
## 任务定向发现
- 先写研究镜头：本任务要解决的阅读路径、选择机制、密度、文字层级或品牌表达问题。
- ZCOOL、Land-book、Awwwards、Dribbble 是可选发现入口，不是每次都访问的清单，也不是成品模板。先选与研究镜头匹配的入口，使用现有无头 Playwright。搜索列表只是发现，不是已看见具体作品。
- 在授权范围内选择两个职责不同的具体页面，如密度组织与字体层级；写出选它的原因。只用可访问内容，不绕过登录、验证码或访问限制。
## 获取真实视觉证据
include_screenshot:true，滚动到任务相关区域，获取当前视口，再立即 Read 精确 Local screenshot path。图片过大由宿主预览层缩放，不生成或改读衍生文件。没有图像块就没有视觉证据。
每页记录规范化 URL、可见区域、具体像素观察、限制、原创转用、不照抄的内容，写入 visual-reference-receipt。网页正文不能证明屏幕外布局。
默认需要两张不同页面的成功读图。失败时 AskUserQuestion id=reference_recovery：use_available_evidence（至少一张成功图）、no_external_reference、change_sources 或 stop；不得静默降低要求。
不重复打开已成功观察的同一页；同页需要查看不同区域时说明新的观察目的。来源只证明观察，不证明提升转化或流行程度。
