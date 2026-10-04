---
name: source-fidelity-final-pass
description: 在用户图像/文字中建立不可变事实清单；生成后 Read 最新图片再逐项核对，不能只对生成提示词自查。
---

## UIUX generated-image-only applicability
This is the executable image-native adaptation. Audited upstream originals and licenses are archived under third_party and are not runtime instructions.

# Source fidelity final pass
在用户图像/文字中建立不可变事实清单；生成后 Read 最新图片再逐项核对，不能只对生成提示词自查。
## 必查类别
brand：品牌文字与标识；names：产品/套餐/模块名称；prices：价格、单位、周期和总额；quantities：数量、容量、期限；rights：授权对象、使用范围与限制；required-copy：用户明确保留的文案。
每类记录 source（来自用户哪项事实）、observed（图上实际是什么）、status（match / mismatch / unknown / not-applicable）。细字看不清就是 unknown；未提供该类内容可记 not-applicable 并说明，不编造核对值。
## 常见事实错误
软件全家桶不意味着家庭共享、多人使用；长期套餐不意味着永久更新；场景语言不能变成新功能。没有证据的原价、折扣、保障、设备数、销量、评分或二维码不能添加。品牌标识不可被擅自换成类似图形。
## 重复扫描
逐区检查导航、登录、账户切换、主操作、价格、权益是否重复或互相矛盾；多次登录入口与相反购买信息不能用“提升转化”解释过去。
关键保真问题优先于装饰偏好。需要修订时指出精确区域、保留事实与修正；预算用尽则 NEEDS_WORK。禁止只写“源图已核对、无重复”而不提供实际观察。
