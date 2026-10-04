---
name: browser-information-retrieval
version: 2.1.1
source: package-local
description: 使用透明、可前台观察的 Playwright 浏览器动作做多入口公开信息发现、逐页核验、来源留痕与合规容错。
---

# 浏览器信息检索方法

## 工具边界

Playwright 是全软件共享的通用浏览器操作能力，不是研究黑盒。

它执行明确给出的真实 Playwright 动作：导航、输入、点击、双击、悬停、键盘、滚动、普通页面元素拖拽、标签页切换、等待、DOM 读取、截图等。每次调用都必须显式传 `visible: true`，让用户在前台 Chromium 窗口中观察每一步；工具结果会逐步回传动作轨迹、URL、标题、正文、链接和错误。

简单动作不足以完成普通页面交互时，可以使用 Playwright 的 `script` 动作，在同一受管浏览器会话中调用受运行时隔离的官方 Playwright 形状 `page`、`context`、`browser`、`pages()` 与 `playwright` API。例如滚动容器、处理动态搜索框、通过 `context.newPage()` 或 `page.waitForEvent("popup")` 打开当前代理自己的标签、读取 Shadow DOM、操作普通拖拽筛选器或等待复杂页面状态。共享 Expert 浏览器中，`context.pages()`、`browser.contexts()[0].pages()` 和 `pages()` 只返回当前代理的页面；不得监听全局 `BrowserContext page` 事件、关闭共享 context/browser 或接管兄弟代理标签。不得因为“没有一个同名简单动作”就放弃前台浏览器操作。

本 Skill 只决定研究方法：查什么字段、用什么关键词、选择哪个公开入口、哪些链接继续打开、如何记录来源。它不授予登录、验证码处理、代理/VPN、下载、上传、付款、表单提交或绕过访问限制的权限。

## 先观察再输入（减少动态搜索页误操作）

- 审计跟随实际页面和成功动作：分开调用的 `extract`、输入并回车后的实际结果页、脚本最终返回的可见正文都由运行时记录；未执行或失败的动作不算提取。脚本只有导航记录而无该页正文返回时，不声称已提取该页。
- 运行时按真实调用回执收尾：同一次脚本内的多页只算一个调用；普通首页访问不抵作首路线的定向取证。首路线真实受限/失败/无结果，或两次定向搜索/具体页调用仍未取得提取证据时，转同字段备选，不直接省略备选。备选成功提取、真实受限/失败/无结果即可结束；备选两次调用仍没有具体证据则记 unresolved（未取得证据），不得称网站受限或已核验。
- 遇到搜索引擎首页或页面结构未知、变化频繁时，**第一轮只执行** `navigate` 加 `extract`，或用 `script` 列出当前可见的 `input`、`textarea`、`contenteditable` 控件；看见实际页面状态后，再用第二轮调用输入和回车。
- 不要在首次调用里把“打开搜索首页 → 用猜测 selector 输入 → 回车”串成一条长动作链。若没有可用输入框，不要对同一旧 selector 等待或重试 35 秒；保留当前页面证据，让正常验证码/登录检测接管，或记录该入口当前不可用并继续其他公开入口和直接来源页。
- 需要新标签页时，优先直接使用带 URL 的 `new_tab`；也允许先开空标签再用同一次动作链中的 `navigate` 导航，避免把这一正常浏览器序列误判为工具格式错误。

## 核心规则

1. 搜索页只用于发现候选链接；搜索摘要、排名、热榜不能直接证明产品、用户或市场结论。
2. 最终使用的网页必须单独打开。只有实际打开的具体页面，才能写入来源表并支撑字段。
3. 动作必须真实、可观察且可检查。不说“搜索了某平台”；让 Playwright 显式执行打开、输入、回车、滚动、点击、等待和提取。正常展示由专家会话运行时控制：后台协助模式会最小化窗口，用户点“查看操作”或网站需要协助时才显示；模型不负责切换窗口。普通网页控件需要复杂交互时，继续用 Playwright 的 `script` 动作，而不是改用其他浏览器、Bash 或虚构结果。
4. 出现 CAPTCHA、登录墙、403/429、区域限制或空页时，记录引擎、关键词、最终 URL 和限制；不伪造结果，也不自动绕过。每个研究子代理都有独立的逻辑 Playwright 会话键、页面集合和活动标签，但共享一个 Browser / BrowserContext；验证码页面只属于触发它的那一代理，必须保留。运行时会弹出专用验证提示，只有用户点击“打开验证浏览器”或主动查看时才显示**同一页面**。不得因切换子代理而关闭、替换或遗忘该页面，也不得让其它代理接管它。
5. **验证码接力格式**：当 Playwright 返回验证码/人机验证时，子代理**不得调用 AskUserQuestion**，也不得关闭、刷新、自行换页或自行发送 `verification_resolution: "verified"`。专家运行时会打开“协助完成网站验证”专用提示并持续观察同一保留页面；后台模式不会自行恢复 Chromium，用户点击“打开验证浏览器”后才显示该页面，且之后不再自动最小化或收回。用户完成网页验证后，连续两次健康检测会自动解除原等待并关闭提示，原调用在同一标签页继续 wait / extract（最多一次 runtime-owned reload）。用户明确选择“改查其他入口”，或运行时返回 verification_deferred 时，按真实验证未完成状态保留当前页并继续其它公开入口。人工验证的共享等待预算为两分钟；预算内在同一页面真实验证成功才恢复原调用。超过预算仍未解除时，运行时保留验证页并释放共享等待，记录 verification_deferred（尚未完成验证）后继续其它公开入口；这不表示用户拒绝或验证成功，也不表示其它尚未执行的网站受限。用户仍可主动打开保留页，系统不再抢焦点或自动收回窗口。用户明确点击“改查其他入口”、关闭该专用提示、按 Esc 或点击背景时，都视为明确选择改查其他入口：释放当前等待，并按其它公开入口、已发现链接或官网继续。
6. Bing/360 的线索不能写成 Google/百度 SEO 结果。Google、百度、Bing、360 各自的真实 SERP、入口已打开、受限、无结果或未尝试状态都必须独立记录在渠道证据包、Playwright 审计回执和运行日志中；任何引擎受限时，不能由另一引擎冒充其结果。最终 HTML 的 5.5 `SEARCH_ACQUISITION_NOTE` 只写最多两句采集边界说明，不写查询 URL、最终 URL、异常码、逐引擎流水或过程台账。只有真正用于某项 SEO/SEM 判断的引擎 SERP，或替代入口与具体公开页面仍无法支持该项判断时，才可简短说明其边界。单个引擎或具体 URL 的导航、连接或受限失败只留内部审计；已经通过其它入口或具体页面完成取证后，不得写入正文或来源表。

## 前台操作与人工验证接力（强制）

1. **浏览器窗口由会话策略控制**：每一次 `Playwright` 调用都显式传入 `visible: true`，默认使用 `slow_mo_ms: 350`，以保留可交互的真实浏览器；后台协助模式由运行时最小化并避免抢焦点，全程显示模式才持续展示。模型不通过 `visible` 决定窗口展示策略。
2. **正常网页交互应主动完成**：搜索框遮挡、页面需要滚动、动态下拉框、Cookie 同意、普通滑块筛选器、分页、展开内容、悬停菜单或新标签页，不是“无法操作”的理由。先用明确动作；需要更复杂的官方 Playwright 能力时使用 `script`。
3. **验证码由用户协助，不由模型破解**：出现图片验证码、百度安全验证、滑块人机验证或登录二次验证时，停止后续自动点击，保持触发验证的当前浏览器会话和页面不关闭。子代理不调用 AskUserQuestion；专家运行时会保留该页面并弹出“需要你协助完成网站验证”提示，只有用户点击“打开验证浏览器”或主动查看时才恢复同一 Chromium 窗口。人工验证的共享等待预算为两分钟；预算内在同一页面真实验证成功才恢复原调用。超过预算仍未解除时，运行时保留验证页并释放共享等待，记录 verification_deferred（尚未完成验证）后继续其它公开入口；这不表示用户拒绝或验证成功，也不表示其它尚未执行的网站受限。用户仍可主动打开保留页，系统不再抢焦点或自动收回窗口。
4. 用户在网页中完成验证后，**不要从头重开浏览器、另开搜索页或改用其他工具**。运行时会在同一 Playwright 会话被动观察页面；连续两次确认恢复后，自动关闭验证弹窗并继续原始 `wait` / `extract`（若仍停留在验证页，最多一次 runtime-owned `reload`）。用户明确选择“换一个公开入口”，或共享等待预算到期返回 verification_deferred 后，优先继续 Google、百度、Bing、360 中尚未完成的入口、已发现公开链接或官网；只有这些合理替代入口仍无法支持该字段时，才如实写为证据缺口。
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
    { type: "fill", selector: "#kw:visible, textarea[name='wd']:visible, input[name='wd']:visible", text: "关键词" },
    { type: "press", selector: "#kw:visible, textarea[name='wd']:visible, input[name='wd']:visible", key: "Enter" },
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

## 本轮关键路线的真实取证

当 01-research-brief.md 中某个属于你负责 Markdown 的 `### Route` 明确写有 `- Required route: yes` 时，这条路线是本轮动态选定的执行承诺，不是全局平台清单：

1. 先分页 Read 01；自己的分片已存在才分页 Read，新分片直接 Write 创建，确认该 Route 的 `Primary target host`、`Fallback target host` 和 `Evidence field`。
2. 必须实际导航到首选域名的具体内容页，正常页面必须执行 `navigate → wait → extract`；搜索页、候选链接和模型概述都不算完成。
3. 若首选页真实出现登录墙、403、CAPTCHA、跳转、无结果或工具失败，保留该限制，不要绕过；立即继续同一 Evidence field 的 fallback 域名具体页，同样使用 `navigate → wait → extract`。
4. 首选与 fallback 的真实受限、失败或无结果均可如实留下 evidence gap。没有明确终态时，每侧至多两次有针对性的搜索或具体页调用仍未取得正文，也结束为 unresolved；这表示证据未解决，不是网站受限或已验证。首选没有正文时仍尝试同字段 fallback，不无限重试，也不让报告整体卡住。
B站、知乎、小红书、YouTube、Reddit、GitHub/Gitee、X、贴吧与微博按 A/B/C 分工围绕本产品/竞品做有界发现。发现相关结果就选具体帖子、视频说明/可见评论、讨论或官方详情页提取并写实际观察；不能只打开根入口就结束具体内容任务。无结果、受限或弱相关时记录真实检索与边界、换一个同字段公开备选，不反复刷新，不绕过验证。公司目录的普遍浅扫描与这些具体取证任务不是同一完成标准，英文 Required 标记只是可选细化。

## 字段级容错

每个待验证字段先建立一行计划：字段、要证明的内容、查询词、首个入口、候选具体页、成功标准、受限后的处理。

- 竞品定价：官网或 Bing 发现 pricing/价格页；页面直接写明金额或套餐才是事实。
- 用户痛点：Google、百度、Bing、360 或公开平台入口发现具体帖子、评论、评价页；可读到真实角色、任务和困难才是证据。

不要预设产品、国家、语言、平台或人群。Google、百度、Bing、360 都是独立入口；根据字段需要分别尝试并分别记录成败。
## 研究任务的完成判定（商业化专家子代理）

不要用“已经找到一些资料”“已有足够证据”作为结束条件。先完成自己来源包中每个入口的一次终态，并完成工作单中的维度状态表，再回传；每处理 6–10 个入口就追加保存一次 Markdown，避免最后一次性写入：

- **竞品任务**：直接竞品功能、平台、价格/免费边界、替代关系；
- **需求任务**：围绕与产品相关的候选用户群（例如开发者/重度效率用户、办公知识工作者、普通个人用户）以及市场规模/时机取证；这些是研究覆盖维度，不是固定问询选项，具体人群应由产品证据决定；
- **渠道任务**：价格/升级路径、SEO、SEM、应用商店、内容/社区渠道。

每个维度只能标为：`已取得`、`受限`、`未取得` 或 `不适用`，并附上已打开 URL 或受限原因；来源包逐项尝试使用 opened、access_limited 或 failed/no-result，pending 不能作为完成。搜索引擎 SERP 受限时，保留审计并继续打开此前发现或可构造的官方具体页、价格页、文档、商店、GitHub 或公开内容页；一个 SERP 受限不能让整个任务提前结束。


### 保存与任务结束分离
Write/Edit 后 Read-back 只确认 checkpoint。继续本次分配的产品问题和平台路线，完成有界取证后才回短路径状态。用 Edit 增量补充自己的台账，不用 Bash/嵌套代理绕道保存。真实失败、无结果、验证未解决只影响证据边界，不阻止保存，不冒充网站成功。
