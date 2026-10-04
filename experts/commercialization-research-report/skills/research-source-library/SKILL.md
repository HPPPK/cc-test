---
name: research-source-library
version: 1.4.0
source: package-local, company-PM-core + maintained-open-network
summary: 公司产品经理沉淀的 119 个核心商业调研入口，加上维护的开放平台网络；三名研究者分账后逐项做一次有界真实尝试，不要求逐站成功、深读或引用。
---

每次派遣 `expert-evidence-researcher` 时，用可选 `research_task_kind` 明确本次任务：`source-batch`（省略时的兼容默认）执行服务端本线下一批公司/开放来源 URL；`targeted-evidence` 只补直接竞品官网、价格、具体平台页或 Required route 证据缺口。两者都设置唯一 `research_artifact_path` 标明 02/03/04 研究方向；运行时按 agentId 分配独立 .parts Markdown，完整正文只写实际分配的分片，回传仅路径与极短状态。不要用 source-batch 派“只查某竞品”的相反任务。专项补证仍保留真实浏览审计，但不领取或完成固定来源批次；119 核心及开放入口的剩余队列、一次定向重试和原有复核门槛保持不变，不得用专项任务跳过它们。每个批次/专项工作者使用运行时分配的独立 .parts Markdown，不共享追加同一个大文件。同线多个专项可以分工协作，但同一来源批次仍由一名工作者负责，不能重复派发。


# 商业调研来源系统：公司 PM 核心库 + 开放补充网络

## 这份来源系统在运行时怎么用

这份 Skill 有两层：

1. **公司 PM 核心来源库**：用户提供的 119 个候选链接，是公司产品经理真实商业调研中会优先查看的高价值入口。
2. **开放补充来源网络**：B 站、知乎、小红书、YouTube、Reddit、Product Hunt、应用商店、社区、评价、趋势和本轮新发现来源。它补足核心库未覆盖的用户表达、内容、评价、海外信号和新兴渠道；不是封闭名单，发现更相关的公开页面仍可继续加入。

### 全量分账、逐项尝试，但不做机械逐站深读

- 本轮所有**核心库候选入口**由服务端按 A / B / C 的唯一 02 / 03 / 04 Markdown 路径预先分账：每个入口只进入一个主要负责人的真实执行包，三人的执行包合起来正好覆盖 119 个核心入口，不能被泛搜索悄悄绕过或遗漏。维护的开放补充网络也按同一原则分账，确保主流社交、内容、商店、海外社区与趋势平台真的进入本轮执行。
- A / B / C 每次只会收到自己的 <expert-research-source-assignment> 当前小批次，每线最多 10 个仍未终态的 URL。对本批次每个核心入口和维护的开放入口，都至少做一次有界真实 Playwright 尝试，并留下 opened、access_limited、failed/no-result 或 interrupted 终态；pending 仍表示没有完成，interrupted 只表示子代理在批次完成前中断。这里要求的是“尝试过”，不是每个链接都必须成功、深读、进入报告或反复重试。
- 当前小批次处理完就把进展追加保存到自己的 Markdown；服务端依据真实浏览回执只下发下一批剩余 URL。单个入口受限、失效、无结果或与产品弱相关时，如实记录并继续下一个；不要停住、刷新循环或为了完成度编造内容。
- 服务端会在 06-browser-audit.md 自动展示全量任务池的默认分账和真实浏览状态，并按 A/B/C 三线并行、每线最多 10 个 URL 逐批补齐未终态入口。opened、access_limited、failed/no-result 和 interrupted 都会让该 URL 退出队列；只有 pending / 尚未执行继续留队。interrupted 不等于网站受限或访问失败。相同来源批次已真实结束却缺回执时，运行时最多定向补查一次；再次结束仍缺回执的入口如实记为 interrupted（未执行/未完成），不得记为已访问、网站受限或无结果，然后继续后续阶段。仍在运行的批次不重复派发；派发回执不是完成证明。D / E / 08 / 最终报告等待的是“每个入口有一次真实终态”，不是单站成功率；已派发但没有回执绝不能冒充完成。
- 主代理必须按当前产品、目标市场、平台形态、待验证字段和已知竞品，给 A / B / C 写核心库处置、开放平台处置和同字段备用路线。业务相关性决定深挖优先级，不再作为“完全不尝试已分配入口”的理由。来源库外的官网、搜索、社媒、应用商店、媒体和新发现链接仍然可用。
- 首页、目录页或搜索结果只用于发现；对有价值的路线继续打开具体内容页。遇到登录、付费、反爬或无结果，记录真实状态并切换下一个入口。每个最终事实、数字、限制判断或用户/渠道观察，仍必须来自本轮 Playwright 实际打开的具体 URL 或用户提供材料。
- 来源包的逐项尝试不是 Required route: yes，也不要求所有入口成功。来源多不等于结论已证实；第一方事实、权威数据、第三方观察、社交信号、AI 推断和证据缺口必须分开。查不到数字或直接事实时，报告仍应基于已有证据写出有依据、标注“AI 推断”、说明可推翻条件的方向性判断，不能用一句“待验证”把整个板块压缩掉，也不能编造精确数字。

## A/B/C 的来源批次分工

- **A 竞品与替代方案**：默认负责核心库中的移动应用、产品数据、ASO / 增长入口；也负责竞品官网、价格、文档、下载/分发页、Product Hunt、GitHub、Gitee、应用商店、G2、Capterra、Trustpilot、浏览器扩展商店和竞品评价等产品/替代路线。
- **B 用户需求与市场信号**：默认负责核心库中的行业、用户、内容、品牌与公开研究入口；也负责知乎、B 站、小红书、百度贴吧、V2EX、微博、微信内容、抖音、快手、即刻、少数派、Reddit、YouTube、Hacker News、Medium 等具体帖子、视频、回答、评论和内容信号。平台首页和搜索摘要只是发现入口。
- **C 商业化与渠道**：默认负责核心库中的投融资、公司、资本市场、战略研究及其它用户提供候选入口；也负责 Google Trends、Similarweb、Semrush、Ahrefs、关键词 / SEO / SEM、内容分发、流量、品牌、渠道落地页、X 与 Indie Hackers 等公开路线。
- 对 brief 已知且会进入直接竞品/价格/功能对比的产品，三人按上面的 A/B/C 路线合计完成官网、B站、YouTube、Reddit、GitHub、Gitee、X、小红书、知乎、百度贴吧、微博的一次有界尝试，不是每个人重复全部平台。若某个直接竞品是在并行研究中才被发现、brief 尚未列出，发现者不能假设兄弟代理会自动看到它，应自行补齐官网和这些主流平台的一次发现/具体页尝试；无结果或受限即可终止该路线。
- 三人都可跨板块使用更相关的真实页面；但默认批次由服务端明确注入，是为了不漏项和避免重复。每人先完成自己执行包中的核心与开放入口尝试，再按直接相关具体页和同字段备用路线推进，而不是只选一个泛搜索入口后就停止。

## 本轮路线与实际使用如何对账

- 主代理写 01-research-brief.md 时，为 A / B / C 各写一小段来源任务池处置：待验证字段、自己批次的核心类别如何分为直接相关 / 可能相关 / 当前不适用、已分配的主流开放平台、当前最相关的具体入口或检索方向，以及同字段备用路线。运行时再把具体 URL 清单按唯一 Markdown 路径交给对应子代理；brief 是透明研究导航，不是硬编码域名白名单、固定逐站清单或已经覆盖的声明。
- A / B / C 在各自 Markdown 中保留本批次的实际处置：实际打开的具体页面、观察、不能外推的边界，以及真实的受限/失败记录。不要为未使用或不相关站点编造回执，也不要抄写整份来源库。
- 服务端会在 06-browser-audit.md 追加用户候选来源库任务池与浏览状态和用户候选来源库实际命中，分别对照**公司 PM 核心来源库**和**开放补充来源网络**。没有浏览回执表示尚未执行到匹配入口，不表示该站点受限、无价值、已被否定或已经覆盖。
- D、E、F 与最终报告只可把 06 中实际打开且被研究材料采用的具体页称为已使用 / 已引用。候选库中没有实际命中的站点只能写为后续候选或本轮未执行到，不得用覆盖了某平台暗示已经取证。
<!-- research-source-library-tier: core -->

## 用户提供的候选入口

> 来源库建立日期：2026-08-24。下列是候选入口，不代表这些页面已在任何一轮调研中打开、仍可访问或已成为最终证据。原始清单中包含一个带访问令牌的 Trefis 链接；为避免把可能敏感的令牌写入 Expert Pack，此处仅保留其公开根站入口。

### 中国移动应用、产品数据与 ASO / 增长入口
- talkingdata：https://www.talkingdata.com/
- 易观：http://www.analysys.cn/
- QuestMobile：http://www.questmobile.com.cn/
- 酷传：http://www.coolchuan.com/
- 友盟：http://www.umeng.com/
- 比达网：http://www.bigdata-research.cn/
- 清源火眼：https://www.huoyanapp.com/
- dataeye：https://www.dataeye.com/
- Geo集奥聚合雷达：http://www.appmapps.com/
- itrustdata：http://www.itrustdata.cn/
- 莲子数据网：http://www.lotuseed.com/
- 神策分析：https://www.sensorsdata.cn/
- 百度关键词：http://www2.baidu.com/
- ASO100：http://aso100.com/
- 应用雷达：http://www.ann9.com/
- 199IT中文互联网资讯中心：http://www.199it.com/
- 鹅智库：http://re.qq.com/
- 微报告：http://data.weibo.com/
- 艾瑞咨询：http://www.iresearch.com.cn/
- 艺恩：http://www.entgroup.com.cn/
- 赛诺数据：http://cn.sino-mr.com/index
- Geo集奥聚合：http://www.geotmt.com/html/reports/
- Yeahmobi易点天下：http://cn.yeahmobi.com/downloads
- 百度数据研究中心：http://data.baidu.com/index.html
- DCCI：http://www.dcci.com.cn/
- 阿里指数：http://index.1688.com/
- 新版阿里指数：https://alizs.taobao.com/
- 映潮指数：http://www.yingchaozhishu.com/
- 数据套：http://www.datataotao.com/
- 数据雷达：http://www.ibbd.net/
- Useit 知识库：http://www.useit.com.cn/
- 今日报告网：http://www.imxdata.com/
- 爱知客：http://www.izhike.cn/
- 艾媒网：http://www.iimedia.cn/
- 360研究报告：http://zt.360.cn/report/
- 91行业报告：http://tech.91.com/industry-list/industryreport/
- PPTV指数行业报告：http://www.pptv.com/aboutus/download/
- 优酷指数行业报告：http://c.youku.com/ykvr/index
- 腾讯云数据：http://data.qq.com/
- simplyKOL：http://kol.simplybrand.com/
- 微问数据：http://wewen.io/
- Alexa：http://www.alexa.com/
- Google Trend：http://www.google.com/trends
- 百度指数：http://index.baidu.com/
- 互联网增长的第一本数据分析手册：https://blog.growingio.com/posts/hu-lian-wang-chuang-ye-gong-si-yong-hu-zeng-zhang-shi-zhan-mi-ji
- socialbeta：http://socialbeta.com/
- Flurry：https://developer.yahoo.com/
- 国外 Our Mobile Planet：http://www.thinkwithgoogle.com/mobileplanet/zh-cn/
- StatCounter Global Stats：http://gs.statcounter.com/
- Presentations and Whitepapers：http://www.comscore.com/
- Digital Marketing News：http://www.emarketer.com/Articles
- GSMA Intelligence：https://www.gsmaintelligence.com/
- ml Cisco：http://www.cisco.com/c/en/us/solutions/collateral/service-provider/visual-networking-index-vni/mobile-white-paper-c11-520862.html
- similar web：https://www.similarweb.com/website/zhihu.com
- Insights - Jampp：http://blog.jampp.com/insights/
- Fiksu：https://www.fiksu.com/
- adfonic：http://adfonic.com/
- Precisely：https://www.comscore.com/Insights/Data-Mine?cs_edgescape_cc=CN
- App Annie Blog：https://www.appannie.com/insights/

### 中国行业、用户、内容、品牌与公开研究入口
- 阿里研究院：http://www.aliresearch.com/
- 投资中国：http://www.chinaventure.com.cn/
- 领英：https://business.linkedin.com/zh-cn/talent-solutions
- IT橙子：https://www.itjuzi.com/
- 36KR：http://36kr.com/
- 速途研究院：http://research.sootoo.com/
- 中国软件咨询网：http://www.cnsoftnews.com/
- 中国电子商务研究中心：http://www.ec100.cn/
- T汇客：http://www.cniteyes.com/article.html
- 淘宝UED用户研究报告：http://ued.taobao.org/blog/category/bowen/user-research/&r=
- 网易UED用户研究报告：http://uedc.163.com/
- 腾讯交互设计报告：http://ecd.tencent.com/
- 讲座PPT-腾讯大讲堂：http://djt.qq.com/ppts/
- 腾讯-业绩报告：http://www.tencent.com/zh-cn/ir/reports.shtml
- 腾讯MXD移动互联网设计中心：http://mxd.tencent.com/
- 梅花网：http://www.meihua.info/
- 中国互联网信息中心：http://www.cnnic.net.cn/
- 中国国家信息中心：http://www.sic.gov.cn/Column/250/0.htm
- 中国信息通信研究院：http://www.catr.cn/
- 凯度：http://www.ctrchina.cn/
- 凯度中国：http://www.kantarworldpanel.com/cn
- 千讯咨询：http://www.qianinfo.com/
- 德勒：http://www2.deloitte.com/cn/zh.html
- 贝恩：http://www.bain.cn/
- 益普索：http://www.ipsos.com.cn/
- 思略特：http://www.strategyand.pwc.com/cn-s/home
- 埃森哲：https://www.accenture.com/cn-zh
- 麦肯锡大中华区：http://www.mckinsey.com.cn/insights/
- Archive：http://archive.org/
- 普华永道：http://www.pwccn.com/home/chi/index_chi.html
- 罗兰贝格行业评论：https://www.rolandberger.com/zh/

### 投融资、公司、资本市场与战略研究入口
- 券商行业研究报告：http://data.eastmoney.com/report/hyyb.html
- 摩根投行：http://www.jpmorganchina.com.cn/country/CN/zh/jpmorgan
- Tencent Holdings Ltd：https://www.trefis.com/
- KPMG：https://home.kpmg.com/xx/en/home/insights.html
- PWC：https://www.pwcmoneytree.com/
- NVCA：http://nvca.org/research/venture-investment/
- Dow Jones LP Source：http://www.dowjones.com/press-room/dow-jones-venturesource-2q16-u-s-venture-capital-report/
- PitchBook：https://pitchbook.com/news/reports
- PrivCo：http://www.privco.com/dashboard
- IPO Center：http://www.renaissancecapital.com/ipohome/marketwatch.aspx
- 独角兽公司：https://www.cbinsights.com/research-unicorn-companies
- 世界经济论坛：https://www.weforum.org/reports
- PwC publications：https://www.pwc.com/us/en/publications.html
- Home | GfK Global：http://www.gfk.com/
- Mobile, Online & Digital Market Research, Data & Consultancy：http://www.juniperresearch.com/home
- Canalys | Insight. Innovation. Impact：https://www.canalys.com/
- IDC：http://www.idc.com/search/geography/perform_.do?page=1&hitsPerPage=25&sortBy=RELEVANCY&lang=English&srchIn=ALLRESEARCH&src=&athrT=10&geo=3_332&cmpT=10&pgT=10&_xpn=false
- gartner：http://www.gartner.com/newsroom/archive/
- newzoo：https://newzoo.com/category/press-releases/
- BI Intelligence：http://www.businessinsider.com/intelligence/bi-intelligence-all-access-membership

### 其他用户提供候选入口
- Compete：http://www.compete.com/
- Kantar Worldpane：http://www.kantarworldpanel.com/global
- Ipsos MORI：https://www.ipsos-mori.com/
- A nation addicted to smartphones：http://consumers.ofcom.org.uk/news/a-nation-addicted-to-smartphones/
- CTIA-The Wireless Association Home Page：http://www.ctia.org/
- 未命名入口：http://Informa.com
- - Home：http://www.informa.com/
- GamesIndustry：http://www.gamesindustry.biz/
- Ericsson：https://www.ericsson.com/

## 取证回执要求

当本库中的入口被尝试时，在对应研究 Markdown 中写清真实状态；成功打开具体页面时，再写它服务的报告字段、实际 URL、观察、日期、来源类型和不能外推的边界。最终 HTML 来源表收录正文实际采用且有审计依据的页面及其具体支撑内容；其它已访问入口完整保留在 06，报告数据声明指向完整台账；受限、失败、interrupted、pending 和未打开候选只留在 06-browser-audit.md。


<!-- research-source-library-tier: open -->

## 系统维护的开放补充来源网络

> 这批入口补充公司 PM 核心库，不代表穷尽互联网。它们同样按 A/B/C 分账并逐项做一次有界真实尝试；不要求全部成功或深读。任何更相关的新公开来源都可以加入本轮路线。平台首页、站内搜索和外部搜索只用于发现，最终判断回到具体页面。

### 中文社区、内容、短视频与产品讨论
- B 站：https://www.bilibili.com/
- 知乎：https://www.zhihu.com/
- 百度贴吧：https://tieba.baidu.com/
- 小红书：https://www.xiaohongshu.com/
- V2EX：https://www.v2ex.com/
- 微博：https://weibo.com/
- 微信内容检索：https://weixin.sogou.com/
- 抖音：https://www.douyin.com/
- 快手：https://www.kuaishou.com/
- 即刻：https://web.okjike.com/
- 少数派：https://sspai.com/

### 海外产品、开发者、社区与内容信号
- Reddit：https://www.reddit.com/
- YouTube：https://www.youtube.com/
- Product Hunt：https://www.producthunt.com/
- Hacker News：https://news.ycombinator.com/
- GitHub：https://github.com/
- Gitee：https://gitee.com/
- X：https://x.com/
- Indie Hackers：https://www.indiehackers.com/
- Medium：https://medium.com/

### 应用商店、用户评价与产品口碑
- Apple App Store：https://apps.apple.com/
- Google Play：https://play.google.com/
- G2：https://www.g2.com/
- Capterra：https://www.capterra.com/
- Trustpilot：https://www.trustpilot.com/
- Chrome Web Store：https://chromewebstore.google.com/

### 趋势、搜索与公开流量 / SEO 线索
- Google Trends：https://trends.google.com/
- Similarweb：https://www.similarweb.com/
- Semrush：https://www.semrush.com/
- Ahrefs：https://ahrefs.com/
