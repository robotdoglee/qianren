# v2 实施进度

- 第 1 步：已用 web/assets/logo.svg 替换头部 ✳ 与 favicon；已生成 117KB 的霞鹜文楷 UI 子集（dev/make-font-subset.py 可重跑），待接入 app.css 字体栈。剩余：第 2–5 步。
- 第 2 步：已完成 relevance（规则模式解析前缀 / Qwen prompt 输出）与 cluster 回写；dev/write-demo-meta.mjs 已给三个演示补字段。剩余：第 3–5 步界面。
- 第 3 步：已完成 L1 卡片（相关度/年份/会议/引用、关联 3 行、簇与数据集 chip）、排序与筛选（PC 左栏 / 平板手机横向 chip），对比矩阵收进「对比表」标签页。
- 第 4 步：已完成 L2 详情（PC 右抽屉 480px、手机底部弹层可上滑全屏）、同簇/共享数据集切换与返回、#paper-n hash、Esc/背景关闭。
- 第 5 步：已完成 L0 一句话结论、方法×年份 SVG 全景（点按开详情、泳道筛选、数据集/指标/不连关系线、与卡片筛选联动）与空白点列表。
- 新增 /tmp 之外的产物：dev/write-demo-meta.mjs、dev/test-v2.mjs（7 项纯函数测试）；app.css / render.js 已按 DESIGN-v2 重排。
- 未完成：本环境缺 Chromium 系统库，未能截图核验 1280×800 / 390×844；下次会话请跑 dev/e2e.py 或带浏览器的环境复查视觉与触屏。

## 2026-11-18 打磨结果
- 字体：文楷只留给品牌名与固定区块标题；一句话结论、泳道标签、论文标题、关联文字、抽屉标题分别改用无衬线/衬线栈，动态文字不再缺字回退。
- 全景：泳道标签按最长簇名动态预留左侧宽度（上限 220px），长名从末尾截断并加 `<title>` 提示；PC/手机均无左侧裁切。
- 年份筛选：桌面侧栏与手机筛选各自持有起止年份输入并同步状态，重置可用；实测把 15 篇筛到 6 篇。原先把同一组输入复用两处导致节点被移走、只剩「–」。
- 锚点：`#panel-progress`、`#panel-result`、`.paper-card` 等加 `scroll-margin-top: 92px`；结果滚动后顶部距 sticky 头部 15px。`prefers-reduced-motion` 时 `scrollIntoView` 用 `auto`。
- 详情抽屉：会议名 chip 单行省略并带 `title`，不再换行占两行。
- 规则模式：免 key 实时检索 15 张卡片全部显示「规则抽取」标签；dev/e2e-replay.py 回放 15 行正常；模拟三源与函数接口后无 pageerror / console error。另修复全景年份线 `y2=NaN`（`overviewLayout` 补齐 `padB` 返回值）。
- 对比度：次要灰字、chip、按钮、标签等关键配对均 ≥4.5:1（灰色 5.4–6.3，白字/陶土按钮 4.91，warning 5.30）。
- 测试：`node dev/test-rules.mjs` 38/38、`node dev/test-v2.mjs` 7/7 通过。
- 截图：dev/shot-v2.py 生成 1280×800 / 390×844 的 home/result/full/detail；另存 v2-live-overview/cards/detail 与筛选面板截图。

## 2026-11-18 v2.1 多源检索结果
- 数据源：OpenAlex / Semantic Scholar / Crossref / Europe PMC / DBLP / arXiv 六源并行；默认四源，医学/生物自动加 Europe PMC，计算机/AI 自动加 DBLP，可在设置里改为手动勾选。Unpaywall 按 DOI 批量补全开放获取全文链接。
- 合并去重：DOI（小写）> arXiv ID > PMID > 规范化标题同年 ±1 年（并查集）；字段取最长摘要、最大引用数、较权威 venue（Crossref/DBLP > Europe PMC > OpenAlex/S2 > arXiv），保留 `oaUrl` 与来源并集。JATS/HTML 标签与实体统一清洗。
- 边缘函数：新增 `/crossref`、`/dblp`、`/unpaywall`；OpenAlex 追加 `mailto`、S2 支持 `S2_API_KEY`；10 分钟内存缓存、每路由 60 次/分钟、arXiv ≤1 次/3 秒。`CONTACT_EMAIL` 只在函数环境变量读取，前端与仓库无字面量。
- 前端：进度面板按实际来源动态生成，卡片与详情显示来源徽标及「开放获取全文 ↗」；sessionStorage 缓存 30 分钟；所有错误文案中文，不泄漏 `Failed to fetch`。
- 手机进度修复：`.step` 改为 22px + minmax(0,1fr) 两列、检索式/详情固定落在第二列并允许 `overflow-wrap: anywhere`；Playwright 实测 label 底边 316.6、main 顶边 318.6，不再挤到右侧。
- 测试：`node dev/test-rules.mjs` 45/45、`node dev/test-v2.mjs` 7/7 通过；新增 JATS 去标签、Crossref/Europe PMC/DBLP 适配、跨源字段合并、PMID 去重、来源选择、OA 补全测试。
- 截图与模拟：dev/shot-v2.py 无 pageerror；本地 Playwright 模拟六源 + Unpaywall 响应，手机端进度六行全部完成、合并来源 chip（如 OpenAlex + Semantic Scholar / OpenAlex + Crossref）、OA 按钮均正常，console 无错误。
- 文档：README 更新检索与回退策略表、来源致谢与许可、函数环境变量、目录结构与 v2.1 更新记录。

## 2026-11-18 v2.2 自带凭证与文件导入
- 凭证：设置里新增 Semantic Scholar / Elsevier Scopus / IEEE Xplore / Springer Nature Meta / CORE / SerpApi 六项，key 只存 localStorage（`qianren.userkey.*`），检索时经 `X-User-Key-<source>` 请求头发给同源函数；函数用完即弃，不记录、不写日志，缓存键不含 key（IEEE/Springer/SerpApi 显式使用 key-free cacheKey）。无函数时只提示、不启用凭证来源，未填 key 时行为与 v2.1 一致。
- 合规：不登录、不注入 Cookie、不抓取谷歌学术或知网；SerpApi 明示为第三方付费接口，Scopus 机构权限由用户自负；页面、导出与结果对象均不含 key（测试覆盖）。
- 导入：新增 `import-papers.js`，纯浏览器解析 RIS、BibTeX、EndNote、NoteExpress、CNKI/RefWorks，自动识别格式；支持多文件，导入条目来源标「导入」，与检索结果按 DOI/标题去重，参与规则/Qwen 抽取、全景与 Markdown/CSV/BibTeX 导出，文件不上传。`includeImported` 保证导入文献不被相关性过滤淘汰。
- 函数：新增 `/scopus`、`/ieee`、`/springer`、`/core`、`/serpapi` 路由与对应主机白名单；`/s2` 支持访客 key 覆盖环境变量。
- 界面：首页「导入文献」按钮与导入摘要（篇数/格式/前三条/清除），设置里六行密码框与申请链接、启用状态徽标、清除全部。
- 测试：`node dev/test-rules.mjs` 45/45、`node dev/test-v2.mjs` 18/18 通过；新增五种格式解析、格式识别、导入去重与相关性保留、六项凭证启用/请求头/泄漏、五个适配器、key 只进请求头测试。
- 截图：dev/shot-v2.py 增加模拟 `/health` 与 favicon、RIS 导入、设置填 key；1280×800 与 390×844 均无 pageerror、无 console error，导入摘要「已导入 1 篇」、凭证 6 项与徽标、12 张演示卡片与详情抽屉正常。
