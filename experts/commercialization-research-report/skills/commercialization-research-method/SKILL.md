---
name: commercialization-research-method
version: 1.0.0
source: package-local
summary: Evidence-led method for commercializing a new product idea without turning assumptions into conclusions.
---

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
Use the supplied HTML template as the document skeleton. Populate only supported content and the template designated fields. Do not modify the template structure, CSS, chapter order, or table headers. Use the session workDir and the fixed-template structured Write contract; do not ask the user to troubleshoot internal saving or rendering errors.
