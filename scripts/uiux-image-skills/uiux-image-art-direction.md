---
name: uiux-image-art-direction
description: 只为选定方向编写可控的 image_generation 提示，独立配置的图片 Provider/model 才负责生成；聊天模型识图不等于图像模型收到了源图像素。工具若没有传参考图片参数，只能诚实称文本约束生成，不能宣称参考图已传入。
---

## UIUX generated-image-only applicability
This is the executable image-native adaptation. Audited upstream originals and licenses are archived under third_party and are not runtime instructions.

# UIUX image art direction
只为选定方向编写可控的 image_generation 提示，独立配置的图片 Provider/model 才负责生成；聊天模型识图不等于图像模型收到了源图像素。工具若没有传参考图片参数，只能诚实称文本约束生成，不能宣称参考图已传入。
## 图像简报
产物与画幅；用户任务与第一眼主角；不可变事实逐字列出；主次区域比例与阅读轴；字体角色、中文行长和数字基线；色彩职责；留白密度；必要材质；一处有任务意义的签名细节；明确禁止改动。
高质量依赖信息组织和精确控制，不依赖堆“8K、顶级、高级”。来源规律必须已经由图片观察证实，不传入未见过的设计描述。
## 控制文字与资产
interface-copy-craft 服务所有难懂文案，价格换算只是一个可选例子。给精确短标签，保留数字/单位/权益。无法保真的品牌或不可读小字在最终核对中标问题，不声称一比一复刻。
## 制作与复审
调用 image_generation operation=generate；成功后立即 Read 精确 Image 路径（PNG/JPEG/WebP 均可能）。生成失败与宿主预览失败分开：前者按真实错误用 AskUserQuestion；后者保留既有图，修复预览后只重读，不额外付费生成。
首图有实质缺陷才写 image-revision-brief（精确最新路径、可见缺陷、不可变事实、定向修正），最多一轮修订并 Read。不要自动降级成其他产物；以图片与统一复审 JSON 收口。
