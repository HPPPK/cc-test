---
name: prototype-visual-quality-gate
description: A quality gate for product and landing-page prototypes. It turns a product brief into a specific visual direction, rejects generic AI-template treatments, and requires screenshot-led revision before final delivery.
---

# Prototype Visual Quality Gate

## 1. The real goal

A prototype is not successful because it contains all the usual landing-page sections. It is successful when a target user can quickly understand what this product is, why it matters, and what to do next, while the page has a visual identity that belongs to this product rather than an anonymous template.

Apply this Skill to the high-fidelity pass together with 'frontend-design'. The fidelity workflow controls what must be delivered; this Skill controls whether the final visual treatment earns delivery.

## 2. Write a visual direction before writing high-fidelity HTML

Add a compact '视觉方案' section to prototype-brief.md. It must contain all of the following:

1. 页面任务 — one sentence: what should the visitor understand or do?
2. 目标读者与场景 — who is arriving and what uncertainty do they have?
3. 视觉基调 (visual register) — name a specific mood or material language grounded in the product, not modern, premium, or tech.
4. Token plan — confirmed brand palette plus named neutral and semantic colors, type hierarchy, spacing rhythm, radius/border/shadow policy. Color count and saturation must serve the brief rather than a universal style rule.
5. 构图和密度 — how the hero proves the product thesis; where content is dense, where it rests, and why.
6. 一个记忆点 — one defensible visual or interaction moment connected to the product real activity.
7. 动效目的 — only meaningful load, scroll, hover, or state feedback; honor prefers-reduced-motion.
8. 反模板风险 — list the two generic treatments most likely for this brief and how the page will avoid them.

If the user supplied a reference URL or screenshot, transpose only abstract observations such as hierarchy, density, contrast, or interaction rhythm. Do not copy its brand, layout, wording, logo, image, code, or distinctive asset.

## 3. Build around real product material

- Turn supplied capabilities into concrete actions and outcomes. Prefer a real product action over unsupported leadership claims.
- Preserve known facts exactly. Mark missing prices, reviews, system support, logos, download links, and account/payment flows as 演示占位 / 待替换 when the user allows demo content.
- Do not use fake testimonial portraits, fake social proof, invented numerical gains, fake charts, QR codes, or brand-like logos to make the page feel complete.
- Use real DOM text for user-facing labels. Do not place semantic content in CSS pseudo-elements.

## 4. Reject generic first renders

After the first high-fidelity screenshot review, reject and correct any visible generic gradient SaaS hero unrelated to the product, a wall of equal-size cards, all content centered, default typography without deliberate hierarchy, oversized empty space hiding proof or CTA, anonymous AI copy, unsupported big numbers or compatibility claims, or decorative motion that impairs reading.

The correction must modify the HTML. Naming a defect without changing the rendering does not count.

## 5. Screenshot-led revision loop

1. Write 01-low-fidelity.html, 02-mid-fidelity.html, and 03-high-fidelity.html with one shared architecture.
2. Call PrototypePreview({"fidelity":"high"}) for actual CSS viewports 1440x1000, 1024x900, and 390x844. Read its exact unique imgs/qa/<runId>/ PNG paths after the tool returns. Never use Bash screenshot commands. Treat structured needs-work issues as failures, not as prose-overridable suggestions. Inline CSS/JS and use local authorized assets; external CDN requests are blocked.
3. Use Read on every high-fidelity PNG. Inspect hierarchy, actual layout crop/overflow, legibility, CTA visibility, spacing, card repetition, touch-target plausibility, and image/placeholder loading. Record interaction and reduced-motion checks separately; a still image is not execution evidence.
4. Record concrete first-render defects in prototype-evidence.md, then revise 03-high-fidelity.html.
5. Render all three high-fidelity viewports again and Read every revised PNG.
6. Only then finalize the evidence file and response.

This is visual QA for browser viewports. It is not a claim of physical iOS, Android, macOS, or Windows device testing.

## 5.1 Non-negotiable viewport failure conditions

Treat every one of the following as **NEEDS WORK**. Do not describe it as passed, partially passed, or “kept visible” until the rendered PNG after a real HTML change proves otherwise:

- At 390px, any part of the navigation, primary CTA, hero copy, key visual, FAQ control, or user-facing text is clipped by layout/overflow/occlusion (not merely below the fold); or a desktop-width panel forces horizontal scrolling.
- At 1024px, a desktop two-column composition leaves a label, heading, paragraph, CTA, or visual panel visibly disconnected, overlapped, or reduced to an implausibly narrow reading column.
- At 1440px, the hero proves nothing beyond decorative geometry, the primary action is visually buried, or page rhythm creates an oversized empty gap before the first proof.
- A screenshot is an error page, has a missing local resource, is not the final HTML revision, or cannot be Read.

The review must distinguish an observation from an expectation: write what is visibly present in the named PNG, not what the CSS was intended to do. If a problem remains after the allowed correction loop, keep the delivery in NEEDS WORK and explain the exact visual blocker.

## 6. Final receipt

The final response and prototype-evidence.md must contain a prototype-visual-review-receipt that names the Skills actually applied and includes:

- the selected visual register and why it fits this product;
- actual first-render problems or specific observable improvement opportunities found in the PNGs; never fabricate a quota of defects;
- the actual HTML changes made after the review;
- one concrete observation each for desktop 1440, tablet 1024, and mobile 390, including nav/CTA visibility, content crop status, and the actual reflow visible in that PNG;
- the fact/content boundary and any 演示占位 / 待替换 material;
- an explicit statement that this was viewport visual QA, not real-device compatibility testing.

If Chromium rendering, PNG reading, a final-HTML screenshot, or a required product fact is unavailable, say NEEDS WORK, record the exact reason, and do not claim the visual result is complete.

## 7. Multi-screen acceptance

除了首页三视口截图，按 prototype-brief.md 的屏幕/区块清单逐项审核：

1. **范围**：产品默认 8–12 张（至少 6 个任务屏 + 2 个关键状态屏），落地页默认 8–10 个实质区块；已确认较小 PRD 可有记录的例外。低/中/高、移动缩版、换色不重复计数。空白撑高、只改标题、复制卡片凑数量 → NEEDS WORK。
2. **内容**：每屏核对 PRD 对应、主要操作、输入/输出字段、真实或标明演示的数据、反馈与恢复路径；“上传”只是更换文案、对比线不能操作、所有区块都是相同空框 → NEEDS WORK。
3. **一致性**：三档的 screenId、任务/状态数量、字段与导航一致；共同 design-tokens、配色确认依据、按钮层级、圆角和图标风格一致。套内色彩漂移、记录前后对不上、某保真档少屏 → NEEDS WORK。
4. **全量观察**：总览可定位全部画板，按屏/区块获得实际可读图，不用一张极小缩略长图代表都看清了。记录每个 screenId 的观察与未覆盖项；只审第一屏不能写“全套通过”。长页面正常纵向滚动不是裁切，首屏以下内容没有截图就写未观察，不能误判失败也不能猜测通过。
5. **行为证据**：截图不能证明选择文件、点击、拖拽、键盘或 prefers-reduced-motion 已执行。台账列控件、预期行为、代码位置、是否实际操作、结果/缺口；没有获准的执行能力就明确“仅代码检查，交互未实测”，不扩大工具权限。
6. **导出**：若要求独立 PNG，每张要有 screenId/尺寸/最终 HTML 版本对应，导出不能裁掉产品控件；图片只是 HTML 渲染，不是生图，也不是可编辑 Figma 图层。
7. **参考/素材**：参考要落在某屏具体问题上，不能只是品牌名字。用户没有提供或明确委托配色、没有证据的品牌/素材、伪造下载或来源 → 不可当已确认成品。

回执增加任务屏数/状态屏数（或落地区块数）、PRD 覆盖/范围例外、实际采用的参考模式、配色来源、逐屏未验证项。视觉通过和功能通过分开写；数量达标不等于视觉好，更不等于可投产。
