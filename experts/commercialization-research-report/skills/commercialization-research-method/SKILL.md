---
name: commercialization-research-method
version: 1.0.0
source: package-local
summary: Evidence-led method for commercializing a new product idea without turning assumptions into conclusions.
---


最多 6 次研究启动：A/B/C 各首次启动一次，每线最多一次定向补证。每名研究者最多 12 次浏览器工具调用，整个会话共用自专家激活起的 15 分钟有效研究窗口（不计运行时确认的人工验证等待）；调用次数不等于独立页面数，同一次 script 多页仍只算一次调用。先选与产品、竞品和关键商业问题最相关的具体页面，不全量遍历候选库。预算耗尽立即停止新研究和浏览，保存已取得证据、真实限制与未取得字段，Read-back 后提交真实审计；未访问候选不能标成失败、受限或已覆盖。D、E、F/08 与固定母版 CLI 交付仍必需，且不受研究窗口截止阻止。不得为凑目录覆盖、必选路线或来源数量反复派研究者。

# Commercialization Research Method

## Purpose
Turn a product direction and user materials into a decision-ready commercialization research report. Distinguish verified facts, reasoned inferences, untested hypotheses, and evidence gaps.

## Research sequence
1. Extract the product definition and constraints from supplied information first. This expert provides a complete commercial analysis with Chinese and overseas evidence by default; do not ask which analysis direction or decision the report should prioritize. Only when missing user-owned information would materially change the product scope, use AskUserQuestion for the unresolved product-specific question. Otherwise record assumptions and begin the brief and research; missing optional materials are not a prerequisite.
2. Create a field-level evidence plan before drawing conclusions. For each required report field, record the needed evidence, preferred source type, owner, and remaining gap.
3. Research product and competitor facts from first-party product pages, pricing pages, help centers, app stores, release notes, and other original sources.
4. Research market and demand signals separately. Never turn traffic, content volume, social engagement, feature count, or a single community thread into market size, user frequency, willingness to pay, or a core-user conclusion.
5. Build commercial options around target segment, value proposition, alternatives, pricing boundary, upgrade path, distribution path, risks, and validation experiments.
6. Require independent evidence review of every numerical or time-sensitive claim before the final HTML is written.

## Evidence labels
- Verified: the cited source directly supports the statement and has a URL/date.
- Inference: derived from cited evidence; explicitly state the reasoning and uncertainty.
- Hypothesis: plausible but untested; provide the fastest validation method.
- Evidence gap: record unavailable, inaccessible, or missing evidence and continue with bounded inference or an explicit gap instead of inventing a conclusion. The parent uses AskUserQuestion only when missing user-owned product information would materially change scope; internal review, absorption and delivery never ask for permission to finish.

## Delivery rule
Use the supplied HTML template as the document skeleton. Populate only supported content and the template designated fields. Do not modify the template structure, CSS, chapter order, or table headers. Use the session workDir and the fixed-template fixed-template CLI contract; do not ask the user to troubleshoot internal saving or rendering errors.

## Decision depth within bounds
Assign complementary A/B/C questions in the brief and share acquired competitor facts instead of repeating discovery. Before stopping, identify the decision-changing evidence gaps; use at most one targeted follow-up per lane within the existing budget, with an explicit new question and stop condition. Preserve concrete task, alternative, mechanism, contradiction, pricing unit, source and uncertainty through D, 07 and the fixed-template chapters. Two posts and several video descriptions are limited signals, never representative demand or willingness-to-pay validation. Prefer a bounded honest conclusion over fabricated market numbers or product promises. Research and all review/absorption roles use DeepSeek Flash only, never auto-fallback to DeepSeek Pro.
