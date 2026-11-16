---
name: research-source-library
version: 1.5.0
source: package-local, company-PM-core + maintained-open-network
summary: 119 个核心加 30 个开放候选入口；按产品相关性有界选择，不做全量访问。
---

# 商业调研来源系统：公司 PM 核心来源库 + 开放补充来源网络

最多 6 次研究启动：A/B/C 各首次启动一次，每线最多一次定向补证。每名研究者最多 12 次浏览器工具调用，整个会话共用自专家激活起的 25 分钟有效研究窗口（不计运行时确认的人工验证等待）；调用次数不等于独立页面数，同一次 script 多页仍只算一次调用。先选与产品、竞品和关键商业问题最相关的具体页面，不全量遍历候选库。预算耗尽立即停止新研究和浏览，保存已取得证据、真实限制与未取得字段，Read-back 后提交真实审计；未访问候选不能标成失败、受限或已覆盖。D、E、F/08 与固定母版 CLI 交付仍必需，且不受研究窗口截止阻止。不得为凑目录覆盖、必选路线或来源数量反复派研究者。

每次派遣 `expert-evidence-researcher` 使用 `research_task_kind: "targeted-evidence"`，明确本次最关键的产品/竞品/用户/渠道问题。旧 `source-batch` 参数仅兼容历史调用，在本专家内同样选择相关候选，不领取全量清单。设置唯一 `research_artifact_path` 标明 02/03/04 方向；运行时按 agentId 分配独立 .parts Markdown。正文只写分片，回传仅路径与极短状态。首次 A/B/C 并行，每线最多一次有明确问题的定向跟进；同一任务、已访问页面和运行中工作者不重复派遣。

按不同决策问题选择具体页面；A 约 2–4 个直接竞品可作计划参考，不是最低证据配额，也不因已经看过少量页面便认为充分；不要求用满六次启动或十二次调用。新发现产品不触发跨代理互补扫库，也无 GitHub/Gitee 相互补查义务。

## 选择与对账

选源是发现入口，不是查询范围上限；围绕竞品替代、用户任务、收费、市场背景与分发路径取证。相关线索优先跟进，背景资料按口径使用；用关键问题和实际取得判断广度，不以来源数量或耗尽预算判断。不能直接证明需求不等于没有背景价值；市场、平台和行业资料按原口径用于背景，不外推目标需求。入口受限或跑偏时，优先沿同一字段和目标人群换相关路线；不能用海外结果填平中文缺口。D/F同时核对关键问题、未跟进的相关线索及07细节去向，不只检查格式；有依据的产品方案和商业建议须保留依据、取舍与推翻条件。研究员结束前、主代理进入D前，区分关键问题已支持、已有线索未跟进、受阻或未查；现有预算与每线一次补查优先解决决策缺口，不因最低覆盖通过就收工。理由与下一路线留在已有Markdown，不新增表单、文件或审批；无增量或预算耗尽则带缺口交付。

119 个核心入口加 30 个补充入口，共 149 个候选入口，是真实选源目录，不是装饰，也不是逐站访问队列。新会话在启动 A/B/C 前，先在 `01-research-brief.md` 写且只写一个 `expert-source-selection` JSON 代码块。它是选源计划，不能填写虚构浏览结果。

结构示意（尖括号占位必须按本轮问题替换，URL 从下方目录原样选取）：
```expert-source-selection
{"version":1,"lanes":[{"lane":"competitors","coreRationale":"<本线为何选择或暂不选择核心库的具体类别>","picks":[{"candidateUrl":"<来源库完整URL>","purpose":"<希望解决的具体问题或字段>","reason":"<本来源为何适配；不是笼统可选>"}],"coreConsidered":[{"candidateUrl":"<核心库中的完整URL，不能用补充库条目冒充>","reason":"<该核心候选与本线问题的关系或暂不采用的理由>"}]},{"lane":"user-needs","coreRationale":"<核心统计/研究与具体用户材料如何分工>","picks":[{"candidateUrl":"<来源库完整URL>","purpose":"<用户任务或替代/问题线索>","reason":"<为什么选这个具体平台>"}],"coreConsidered":[{"candidateUrl":"<核心库中的完整URL，不能用补充库条目冒充>","reason":"<该核心候选与本线问题的关系或暂不采用的理由>"}]},{"lane":"channels","coreRationale":"<相关增长/趋势/产品数据入口的取舍>","picks":[{"candidateUrl":"<来源库完整URL>","purpose":"<公开获客路径或分发问题>","reason":"<能够提供什么客观观察>"}],"coreConsidered":[{"candidateUrl":"<核心库中的完整URL，不能用补充库条目冒充>","reason":"<该核心候选与本线问题的关系或暂不采用的理由>"}]}]}
```

- 如运行时提供 `<expert-source-selection-catalog>`，优先从中复制 `candidateId` 写入 picks 和 coreConsidered，可省略 candidateUrl；兼容旧 version:1 的 candidateUrl 计划。两字段同时填写必须对应同一目录身份。仅协议 http/https 不同且主机、端口、路径、查询完全一致时，运行时才允许无歧义映射回原目录 URL；这不是浏览成功，也不是地址可用保证。
- 修复选源错误时先 Read 最新 01，解析结构化 JSON，按目录身份去重并核对 selected/deferred 与 picks 一致，再完整替换唯一代码块，保留其它内容。不要连续猜测旧字符串做局部 Edit，也不要通过追加 YouTube 等已有候选来修复另一个条目的错误。所有字段校验通过后再派遣 A/B/C。
- 每线选择 1–3 个候选（含备用），记录 purpose、reason 和 coreRationale；每线另列 1–3 个实际核心候选 coreConsidered（candidateId 或 candidateUrl、reason）。选择只写在 picks；程序从实际 picks 推导 selected/deferred，旧 decision 输入仅为兼容，不作为第二份选择。核心库与问题有关时优先选入；不能仅因拿不到真实转化率就略过能提供客观趋势、流量或产品线索的相关入口。确实不适用则按类别说明理由，不强求核心来源配额，不以“都是可选”整库略过。
- A 以官网事实/价格为主，可从目录选择产品、商店、替代或数据入口辅助；B 优先真正使用者的具体帖子、评价和任务；C 按产品适配性选择公开搜索、内容、分发、流量或趋势入口。核心数据/研究不冒充具体用户需求，服务商展示不冒充消费者反馈。
- 目录中的样例路径只是入口参考，可在所选平台发现与当前产品相关的具体页面；运行时按选定平台对账，attemptedUrls 才是实际尝试地址，不表示样例页面或其中数据已读取。不要为匹配目录访问不相关的样例对象。
- 研究者会收到本线计划与真实访问状态。候选覆盖只作建议，不因入口未访问强制补查；优先跟进关键问题的相关线索。已有更相关材料或入口不适用时说明取舍，未访问状态仍如实保留，不为完成目录占用补查。已保存的同线回执可复用；搜索词里提及平台不算访问。
- 失败、受限、付费墙、无相关内容时保留真实状态，并在预算内转同字段公开来源；登录/验证码仍按人工协助规则处理。不能获得后台数据不阻止客观公开分析。未访问只写未执行，不能写网站失败或数据不存在。
- D 根据服务端真实回执对账。整线没有尝试任何选定路线时，最多使用既有的一次定向跟进；名额或时间耗尽则保留遗漏并继续，不加新代理、不恢复全库排队。
- HTML 只引用实际采用且有审计依据的具体页面，完整访问记录保留在 06。计划只证明选源意图，不证明已读取或事实成立。

历史 `<expert-research-source-assignment>` 仅保留候选提示，不恢复扫库队列。用户候选来源库任务池与浏览状态由 06 记录；已派发但没有回执绝不能冒充完成。官网、B站、YouTube、Reddit、GitHub、Gitee、X、小红书、知乎、百度贴吧、微博 等按本线问题选取，不要求逐产品逐平台遍历。“当前不适用”必须有具体理由，未执行保持未执行。最终 HTML 来源表收录正文实际采用且有审计依据的页面及其具体支撑内容；其它已访问入口完整保留在 06。

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

> 这批入口补充公司 PM 核心库，不代表穷尽互联网。它们同样只是按产品相关性选择的候选；不要求逐项访问、全部成功或深读。任何更相关的新公开来源都可以加入本轮路线。真实取得的首页信息与相关搜索摘要可按其实际内容采用；深入判断优先追具体页面，不把全文读取作为所有线索进入报告的门槛。

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
