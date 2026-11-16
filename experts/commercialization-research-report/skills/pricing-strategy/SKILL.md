---
name: pricing-strategy
description: "Analyze and design pricing strategies including pricing models, competitive pricing analysis, willingness-to-pay estimation, and price elasticity. Use when setting prices, evaluating pricing models, preparing for a pricing change, or comparing freemium vs paid approaches."
---

## Pricing Strategy

Design a pricing strategy grounded in value delivery, competitive positioning, and willingness to pay.

### Context

You are developing a pricing strategy for **$ARGUMENTS**.

If the user provides files (competitor pricing, survey data, financial models, or usage data), read them first. Build candidate URLs from trusted product entry points and use Playwright to verify competitor pricing if needed.

### Instructions

1. **Understand the value delivered**:
   - What is the core value proposition?
   - What is the customer's alternative (and its cost)?
   - What quantifiable outcomes does the product deliver? (time saved, revenue gained, cost reduced)
   - What is the customer's willingness to pay based on that value?

2. **Evaluate pricing models** — recommend the best fit:

   | Model | Best For | Example |
   |---|---|---|
   | **Flat-rate** | Simple products, predictable costs | Basecamp ($99/mo flat) |
   | **Per-seat** | Collaboration tools, team products | Slack, Figma |
   | **Usage-based** | Infrastructure, API products | AWS, Twilio |
   | **Tiered** | Products with distinct user segments | Most SaaS (Free/Pro/Enterprise) |
   | **Freemium** | Products with viral/network effects | Spotify, Notion |
   | **Freemium + usage** | Platform products | Vercel, OpenAI API |
   | **Value-based** | High-impact enterprise tools | Salesforce, Palantir |

3. **Analyze competitive pricing**:
   - 核验原始价格数字及相邻条件，保留原文、URL/审计身份和日期；比较前对齐地区、币种、税费、计费周期、付款频率、优惠资格和续费。
   - 折扣标价与 “For first year X after that” 要按原文区分首年与续费，不自动判为矛盾；年付折算月价不等于按月结账。原文不明确时保留未知，不能补造结账页、实付额或税后价。
   - 所有派生单位成本（含 AI 推断）先对齐周期、币种、税费和单位，年费对每月额度必须将额度乘以 12 后归一，再计入每任务消耗；一次性与周期用量没有明确比较期限不可直接计算。D/E/F 回读原始额度条件和来源，F 在同一 expert-report-review 块的 calculations 中逐项保留 fieldId/amount/amountPeriod/allowance/allowancePeriod/unitsPerTask/reportedCost；无可重建派生成本才空数组；不可重建者必须列对应字段 factual-error 而不造 calculation 项。缺操作数不得编造，列必修事实错误并移除不支持成本。
   - 已识别的价格数字、单位、付款周期、优惠条件或来源归属错误都是必修；即使总体建议不变，也不能标为可选。修正摘要、正文、表格与来源中的全部出现位置；商业专家 F 在唯一 expert-report-review JSON 块中按实际 schema 字段逐项列 factual-error/source-error，不能只改来源表。
   - D/E 独立核对原始摘录与上下文，07 保留对应证据；F 从 07 原始摘录检查最终价格表述，缺原文则写明具体边界。只有相同套餐、条件和时点的主张互不相容才记冲突，不同口径标为不可直接比较。
   - Map competitor pricing tiers and what's included
   - Identify where your product sits (premium, mid-market, budget)
   - Find pricing gaps or opportunities
   - Note any industry pricing conventions

4. **Design the pricing structure**:
   - **Tiers**: Define 2-4 tiers with clear differentiation
   - **Feature gating**: Which features go in which tier? (Use value metrics, not arbitrary limits)
   - **Value metric**: What unit do you charge on? (users, events, storage, API calls)
   - **Anchor pricing**: Set the most popular tier to feel like the obvious choice
   - **Annual discount**: Use only observed public terms; no assumed category discount.

5. **Estimate price sensitivity**:
   - Van Westendorp Price Sensitivity Meter (if survey data available):
     - Too cheap → quality concerns
     - Cheap → good value
     - Expensive → starting to hesitate
     - Too expensive → won't buy
   - Without user research, competitor offers support only labeled pricing hypotheses, not measured willingness to pay or elasticity.

6. **Plan pricing experiments**:
   - A/B test pricing pages (different price points, tier names, feature bundles)
   - Founder-led sales conversations to test willingness to pay
   - Landing page tests with different price anchors
   - Cohort analysis of conversion rates by price point

7. **Output a pricing recommendation**:
   ```
   Recommended Model: [Model type]
   Value Metric: [What you charge on]

   | Tier | Price | Target Segment | Key Features | Positioning |
   |---|---|---|---|---|

   Key Assumptions:
   - [Assumption] → [How to test]

   Risks:
   - [Risk] → [Mitigation]
   ```

Think step by step. Save as markdown. Flag any assumptions that need validation before launch.

---

### Further Reading

- [Product Pricing Strategies 101](https://www.productcompass.pm/p/product-pricing-strategies-101)
- [The AI Product Pricing Masterclass: OpenAI Product Lead on Why SaaS Pricing Fails in AI (and How to Fix It)](https://www.productcompass.pm/p/ai-product-pricing) (video course)
