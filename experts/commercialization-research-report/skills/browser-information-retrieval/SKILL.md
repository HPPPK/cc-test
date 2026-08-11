---
name: browser-information-retrieval
version: 2.1.0
source: package-local
description: 使用透明、可前台观察的 Playwright 浏览器动作做多入口公开信息发现、逐页核验、来源留痕与合规容错。
---

# 浏览器信息检索方法

## 工具边界

Playwright 是全软件共享的通用浏览器操作能力，不是研究黑盒。

它执行明确给出的真实 Playwright 动作：导航、输入、点击、双击、悬停、键盘、滚动、普通页面元素拖拽、标签页切换、等待、DOM 读取、截图等。每次调用都必须显式传 `visible: true`，让用户在前台 Chromium 窗口中观察每一步；工具结果会逐步回传动作轨迹、URL、标题、正文、链接和错误。

简单动作不足以完成普通页面交互时，可以使用 Playwright 的 `script` 动作，在同一受管浏览器会话中直接调用官方 `page`、`context`、`browser`、`pages()` 与 `playwright` API。例如滚动容器、处理动态搜索框、打开标签、读取 Shadow DOM、操作普通拖拽筛选器或等待复杂页面状态。不得因为“没有一个同名简单动作”就放弃前台浏览器操作。

本 Skill 只决定研究方法：查什么字段、用什么关键词、选择哪个公开入口、哪些链接继续打开、如何记录来源。它不授予登录、验证码处理、代理/VPN、下载、上传、付款、表单提交或绕过访问限制的权限。

## 核心规则

1. 搜索页只用于发现候选链接；搜索摘要、排名、热榜不能直接证明产品、用户或市场结论。
2. 最终使用的网页必须单独打开。只有实际打开的具体页面，才能写入来源表并支撑字段。
3. 动作必须真实、前台可观察且可检查。不说“搜索了某平台”；让 Playwright 显式展示打开、输入、回车、滚动、点击、等待和提取的动作。普通网页控件需要复杂交互时，继续用 Playwright 的 `script` 动作，而不是改用其他浏览器、Bash 或虚构结果。
4. 出现 CAPTCHA、登录墙、403/429、区域限制或空页时，记录引擎、关键词、最终 URL 和限制；不伪造结果，也不自动绕过。验证码页面必须保留在前台。本专家包声明了同一 Expert 会话内主代理与研究子代理共享这一前台 Playwright 上下文；不得因切换子代理而关闭、替换或遗忘该页面。
5. **验证码接力格式**：当 Playwright 返回验证码/人机验证且页面已在前台保留时，子代理**不得调用 AskUserQuestion**，也不得关闭、刷新或自行换页。专家运行时会直接打开“协助完成网站验证”弹窗并等待用户的明确选择：完成验证→下一次 `Playwright` 使用 `verification_resolution: "verified"`，在原标签页 wait/extract（最多一次 reload）；换入口→保留当前 URL 的受限记录，下一次用 `verification_resolution: "switch_public_entry"` 并优先打开其他搜索入口、已发现公开链接或官网；记缺口→只在用户明确选择后，用 `verification_resolution: "record_evidence_gap"` 且 actions 为空释放页面。用户没有明确选择时，持续等待，不自动降级。
6. Bing/360 的线索不能写成 Google/百度 SEO 结果。Google、百度、Bing、360 各自的成功、受限、无结果或未尝试状态都必须独立记录在渠道证据包、Playwright 审计回执和运行日志中；任何引擎受限时，不能由另一引擎冒充其结果。最终 HTML 的 5.5 `SEARCH_ACQUISITION_NOTE` 只写最多两句采集边界说明，不写查询 URL、最终 URL、异常码、逐引擎流水或过程台账。Google 受限时可简短写“Google 本轮受限，未据其 SERP 作出 SEO 或 SEM 判断”；如影响正文结论，来源表可保留一条简短受限记录。

## 前台操作与人工验证接力（强制）

1. **所有浏览器调用均在前台进行**：每一次 `Playwright` 调用都显式传入 `visible: true`；默认使用 `slow_mo_ms: 350`，使用户能看见打开、输入、点击、滚动、拖拽普通控件和页面切换。
2. **正常网页交互应主动完成**：搜索框遮挡、页面需要滚动、动态下拉框、Cookie 同意、普通滑块筛选器、分页、展开内容、悬停菜单或新标签页，不是“无法操作”的理由。先用明确动作；需要更复杂的官方 Playwright 能力时使用 `script`。
3. **验证码由用户协助，不由模型破解**：出现图片验证码、百度安全验证、滑块人机验证或登录二次验证时，停止后续自动点击，保持当前浏览器窗口和页面不关闭。子代理不调用 AskUserQuestion；专家运行时会直接弹出“需要你协助完成网站验证”的前台窗口。用户未明确点击任何选项时，页面和研究任务保持等待，不自动换入口或写证据缺口。
4. 用户选择“我已在前台完成验证，继续检查”后，**不要从头重开浏览器或改用其他工具**。在同一 Playwright 会话先执行 `wait`、`extract`；若页面仍停留在验证页，再仅做一次 `reload` 后重新 `extract`。用户明确选择“换一个公开入口”后，优先继续 Google、百度、Bing、360 中尚未完成的入口、已发现公开链接或官网；只有这些合理替代入口仍无法支持该字段时，才如实写为证据缺口。
5. 不得通过自动拖动验证码、识别验证码图片、伪造鼠标轨迹、代理/VPN 或其他方式绕过访问控制。这里的“可拖拽”仅指普通网页交互控件，不包括人机验证。

## 透明搜索动作模板

将“关键词”替换为当前字段需要的具体查询词。每个引擎都是可观察的页面动作，不存在自动搜索的黑盒。

### Google

~~~text
Playwright({
  visible: true,
  slow_mo_ms: 350,
  actions: [
    { type: "navigate", url: "https://www.google.com/" },
    { type: "fill", selector: "textarea[name='q']:visible, input[name='q']:visible", text: "关键词" },
    { type: "press", selector: "textarea[name='q']:visible, input[name='q']:visible", key: "Enter" },
    { type: "wait", ms: 1800 },
    { type: "extract", selector: "body" },
    { type: "screenshot" }
  ],
  include_screenshot: true
})
~~~

如先显示 Cookie 同意页，可先观察页面，再以明确 click 动作点击可见的同意按钮；若出现验证/限制页，保持浏览器前台，按“前台操作与人工验证接力”请求用户协助；不得自动拖动或破解。

### 百度

~~~text
Playwright({
  visible: true,
  slow_mo_ms: 350,
  actions: [
    { type: "navigate", url: "https://www.baidu.com/" },
    { type: "fill", selector: "input#kw:visible, input[name='wd']:visible", text: "关键词" },
    { type: "press", selector: "input#kw:visible, input[name='wd']:visible", key: "Enter" },
    { type: "wait", ms: 1800 },
    { type: "extract", selector: "body" },
    { type: "screenshot" }
  ],
  include_screenshot: true
})
~~~

如出现百度安全验证或滑块，保持该前台页面不关闭，并按“前台操作与人工验证接力”请求用户协助。用户确认完成后，在同一会话继续 wait / extract；不得自动拖动或破解。

### Bing

~~~text
Playwright({
  visible: true,
  slow_mo_ms: 350,
  actions: [
    { type: "navigate", url: "https://www.bing.com/" },
    { type: "fill", selector: "#sb_form_q:visible, textarea[name='q']:visible, input[name='q']:visible", text: "关键词" },
    { type: "press", selector: "#sb_form_q:visible, textarea[name='q']:visible, input[name='q']:visible", key: "Enter" },
    { type: "wait", ms: 1800 },
    { type: "extract", selector: "body" }
  ]
})
~~~

### 360 搜索

~~~text
Playwright({
  visible: true,
  slow_mo_ms: 350,
  actions: [
    { type: "navigate", url: "https://www.so.com/" },
    { type: "fill", selector: "#keyword:visible, input[name='q']:visible, input[name='keyword']:visible", text: "关键词" },
    { type: "press", selector: "#keyword:visible, input[name='q']:visible, input[name='keyword']:visible", key: "Enter" },
    { type: "wait", ms: 1800 },
    { type: "extract", selector: "body" }
  ]
})
~~~

## 输入框找不到时的统一恢复（必须执行一次）

不要因为首个 selector 超时就宣布该引擎不可用、停止整个子代理，或把首页当作搜索结果。

1. 在同一可见页面先使用一次 `script`，只检查 `input, textarea, [contenteditable="true"]` 中 **可见** 元素的 `id/name/type/placeholder/aria-label`；不得使用 `require`、`process`、`fs` 或任何 Node/Bash API。
2. 用观察到的可见 selector 重试一次 `fill → press Enter → wait → extract`。
3. 若仍失败，记录该引擎的真实限制；继续本字段的下一个已计划入口或已发现具体页面。不能把“首页能打开”写成“该引擎搜索成功”。
4. 结果明显跑偏时（例如品牌撞名、结果未包含产品类别/任务词），必须换成包含 **产品类别 + 用户任务 + 平台/市场** 的查询词后再试一次；跑偏结果只能作为“歧义/无效检索”记录，不能写入 SEO 结论。

示例脚本（只用于观察，不负责搜索）：

~~~text
{ type: "script", script: "await page.locator('input, textarea, [contenteditable=\"true\"]').evaluateAll(nodes => nodes.filter(node => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0 }).map(node => ({ tag: node.tagName, id: node.id, name: node.getAttribute('name'), type: node.getAttribute('type'), placeholder: node.getAttribute('placeholder'), ariaLabel: node.getAttribute('aria-label') })))" }
~~~

## 发现后逐页取证

对每一个可能用于报告的具体页面，单独执行打开、等待、提取、截图。记录页面标题、最终 URL、访问日期、用于哪个报告字段、证据类型和是否已被独立复核。

~~~text
Playwright({
  visible: true,
  actions: [
    { type: "navigate", url: "https://候选网站的具体页面" },
    { type: "wait", ms: 900 },
    { type: "extract", selector: "body" },
    { type: "screenshot" }
  ],
  include_screenshot: true
})
~~~

## 字段级容错

每个待验证字段先建立一行计划：字段、要证明的内容、查询词、首个入口、候选具体页、成功标准、受限后的处理。

- 竞品定价：官网或 Bing 发现 pricing/价格页；页面直接写明金额或套餐才是事实。
- 用户痛点：Google、百度、Bing、360 或公开平台入口发现具体帖子、评论、评价页；可读到真实角色、任务和困难才是证据。

不要预设产品、国家、语言、平台或人群。Google、百度、Bing、360 都是独立入口；根据字段需要分别尝试并分别记录成败。
