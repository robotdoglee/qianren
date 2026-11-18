# 问渠

> 不求字字有答，但求一念豁达。——取意朱熹“问渠那得清如许，为有源头活水来”。

> 2026 Qoder 高校创造力大赛 · StudyHack 学习科研赛道参赛作品
>
> - 在线体验（Qoder Sites，公开访问）：https://qianren-9o3elwijmv8.qoder.zone
> - 参赛者：上海交通大学（个人参赛）· Qoder 账号 nick6784593415
> - 天池论坛作品帖：见 [WRITEUP.md](WRITEUP.md)（发布后补上帖子链接）

一句话想法 / 一个具体问题 → 并行检索 OpenAlex、Semantic Scholar、Crossref、Europe PMC、DBLP、arXiv → 去重合并 → 逐篇抽取 7 个字段 → 全景（方法 × 年份）、带“与你想法的关联”的论文卡片、单篇详情、研究空白点与对比表，并导出 Markdown / CSV / BibTeX；有 DOI 时再用 Unpaywall 补全开放获取全文链接。也可以导入自己从知网、谷歌学术、Zotero 等处导出的文献文件（RIS / BibTeX / EndNote / NoteExpress / RefWorks），与检索结果一起去重、抽取、进全景；导入只在浏览器本地解析，不上传。

- 纯静态：HTML + CSS + 原生 ES modules，无构建步骤、无外部 CDN。
- 检索优先在浏览器里直连开放 API；arXiv、Crossref、DBLP 必须经同源函数代理（响应没有 CORS 头），Semantic Scholar 优先走代理以避开时好时坏的 CORS，Europe PMC 直连。
- 抽取只依据标题与摘要，找不到依据的字段一律写「摘要未提及」，不做补全。
- 全站中文 UI；电脑左侧筛选栏 + 两列卡片 + 右侧详情抽屉，手机单列 + 底部弹层。

## 检索与回退策略

默认并行检索 OpenAlex、Semantic Scholar、Crossref、arXiv；输入命中医学/生物词时追加 Europe PMC，命中计算机/AI 词时追加 DBLP（可在设置里关闭自动选择、手动勾选来源）。

| 数据源 | 直连 | 回退 | 全失败时 |
| --- | --- | --- | --- |
| OpenAlex | 支持 CORS，按 IP 限流 429 | 同源代理 `GET /functions/v1/app/openalex?q=&n=` | 再退避重试一次直连，仍失败才标记失败 |
| Semantic Scholar | CORS 时好时坏，按 IP 限流 429 | 优先同源代理 `GET /functions/v1/app/s2?q=&n=` | 再试直连，仍失败显示中文提示，不影响其他来源 |
| Crossref | **不支持 CORS** | 只走同源代理 `GET /functions/v1/app/crossref?q=&n=` | 自动跳过，由其他来源补齐 |
| Europe PMC | 支持 CORS | 无（官方接口直接跨域） | 自动跳过 |
| DBLP | **不支持 CORS** | 只走同源代理 `GET /functions/v1/app/dblp?q=&n=` | 自动跳过 |
| arXiv | **不支持 CORS** | 只走同源代理 `GET /functions/v1/app/arxiv?q=` | 自动跳过（OpenAlex 已收录 arXiv 预印本） |
| Unpaywall（OA 补全） | 需联系邮箱，只走代理 | `GET /functions/v1/app/unpaywall?doi=…` | 不显示开放获取按钮，不影响检索结果 |

合并规则：DOI（小写）> arXiv ID > PMID > 规范化标题同年 ±1 年；字段取最长摘要、最大引用数、较权威 venue（Crossref/DBLP > Europe PMC > OpenAlex/S2 > arXiv），并保留 `oaUrl`。浏览器 sessionStorage 缓存 30 分钟，边缘函数内存缓存 10 分钟；arXiv 限制 ≤1 次/3 秒。

纯静态部署（没有函数）时 OpenAlex、Semantic Scholar、Europe PMC 仍可用，Crossref、DBLP、arXiv、Unpaywall 自动跳过；单源失败不影响其余结果。Crossref/OpenAlex polite pool 与 Unpaywall 所需的联系邮箱只从函数环境变量 `CONTACT_EMAIL` 读取，不写进前端或仓库。

## 三种运行方式

1. **一键演示**（首页 3 个按钮）：读取 `web/demos/<id>.json` 的预计算结果，带 2–3 秒回放式进度，即时渲染。
2. **免 key 实时模式**（默认）：浏览器真实检索 + 规则抽取（中英术语词典查询扩展、线索词字段抽取、TF-IDF 聚类、空白点归纳）。
3. **Qwen 增强模式**：同源函数已配置 `DASHSCOPE_API_KEY` 时默认走服务器端调用；否则在「设置」里填入自己的 DashScope Key，**它只保存在浏览器 localStorage**，可一键清除。LLM 调用失败会自动回落到规则模式并提示。

### 自带凭证（可选）

设置里可以填写六家服务的个人 key：Semantic Scholar、Elsevier Scopus、IEEE Xplore、Springer Nature Meta、CORE、SerpApi（Google Scholar 的付费第三方接口）。全部留空时行为与 v2.1 完全一致。

| 服务 | 用途 | 转发方式 |
| --- | --- | --- |
| Semantic Scholar | 提高配额（不填也能检索） | `X-User-Key-s2` 请求头 → 同源函数 |
| Elsevier Scopus | 追加 Scopus 结果 | `X-User-Key-scopus` → 函数转成 `X-ELS-APIKey` |
| IEEE Xplore | 追加 IEEE 结果 | `X-User-Key-ieee` → 函数拼进 `apikey` 参数 |
| Springer Nature Meta | 追加 Springer 结果 | `X-User-Key-springer` → 函数拼进 `api_key` 参数 |
| CORE | 追加开放获取全文元数据 | `X-User-Key-core` → 函数转成 `Authorization: Bearer` |
| SerpApi | 追加 Google Scholar 结果 | `X-User-Key-serpapi` → 函数拼进 `api_key` 参数 |

- key **只存 localStorage**（前缀 `qianren.userkey.`），只在检索请求里放进自定义请求头发给同源函数，由函数转发给对应服务；函数不记录、不写日志，缓存键与 key 无关（`ieee:/springer:/serpapi:` 均使用不含 key 的缓存键）。
- 凭证类来源必须经同源函数转发；没有函数时即使填了 key 也不会启用，设置里会标注“当前不可用”。
- 不做谷歌学术 / 知网的登录、抓取或逆向；SerpApi 是用户自行付费的第三方接口，Scopus 等机构订阅的访问权限由用户自己负责。
- 导入的文献、导出结果与页面展示都不会包含任何 key。

### 导入文献

首页「导入文献」支持 `.ris .bib .bibtex .enw .net .txt`，自动识别 RIS、BibTeX、EndNote、NoteExpress、CNKI/RefWorks 五种文本格式；一次可选多个文件，导入条目与检索结果按 DOI / 标题去重，来源标为「导入」，同样参与规则/Qwen 抽取与全景图，并导出进 Markdown / CSV / BibTeX。解析全部在浏览器里完成，**文件不上传**。

## 目录结构

```
web/
  index.html          入口
  app.css             样式（暖色纸感风格）
  js/
    terms.js          中英学术术语词典、停用词、数据集/指标表、线索词、规则查询扩展
    search.js         六源并行检索与合并去重（缓存、429 退避、代理回退）、摘要还原、BM25 风格排序、Unpaywall OA 补全
    extract-rules.js  规则抽取 7 字段、方法聚类、空白点、模式 B 思路分组
    llm.js            Qwen（同源函数 / 浏览器直连 DashScope compatible-mode）、key 与偏好存取
    render.js         进度面板、来源徽标、统计、检索式、簇卡片、空白点（[n] 可点击定位）、对比矩阵
    export.js         Markdown / CSV / BibTeX 生成
    userkeys.js       自带凭证的 provider 元数据、localStorage 存取、请求头与启用判断
    import-papers.js  RIS / BibTeX / EndNote / NoteExpress / RefWorks 本地解析与格式识别
    main.js           编排与交互（模式切换、示例、一键演示回放、来源选择、导入、凭证设置、导出下载、设置）
  demos/
    index.json        演示清单（结果 JSON 由作者以真实检索结果补充）
functions/
  index.ts            可选 Deno 边缘函数：/health、/llm、/arxiv、/openalex、/s2、/crossref、/dblp、/unpaywall，以及凭证转发 /scopus、/ieee、/springer、/core、/serpapi
dev/
  test-rules.mjs      离线单元测试（不访问网络）
  test-v2.mjs         v2 纯函数测试（含导入、凭证、去重合并）
  fixture.json        渲染自测用假数据（不发布，不在 web/ 下）
SPEC.md               产品与技术规格
```

## 本地运行

任意静态服务器都可以，例如在项目根目录：

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000/web/index.html
```

跑单元测试与渲染自测：

```bash
node dev/test-rules.mjs   # 45 项
node dev/test-v2.mjs      # 18 项
# 用假数据检查渲染器：http://localhost:8000/web/index.html?demoFile=../dev/fixture.json
# 截图自查（需要 Playwright Chromium）：python3 dev/shot-v2.py
```

## 配置边缘函数（可选）

不配置也能用：免 key 实时模式与一键演示均不依赖它；只是 Crossref、DBLP、arXiv、Unpaywall 在无函数时自动跳过。

- 本地调试函数（需安装 deno）：

  ```bash
  DASHSCOPE_API_KEY=sk-xxx CONTACT_EMAIL=you@example.com deno run --allow-net --allow-env functions/index.ts
  ```

- 部署环境（Qoder Sites / 其他 Deno 边缘运行时）在函数的环境变量/密钥设置里配置：

  | 变量 | 必填 | 用途 |
  | --- | --- | --- |
  | `CONTACT_EMAIL` | 建议 | Crossref/OpenAlex polite pool 的 `mailto`，Unpaywall 必填；缺失时 Unpaywall 静默跳过 |
  | `DASHSCOPE_API_KEY` | 可选 | Qwen 增强；不配则只用规则抽取 |
  | `S2_API_KEY` | 可选 | Semantic Scholar 更高配额；不配也能检索 |

  这些变量只存在于服务端，前端不会读到；联系邮箱不要写进任何前端文件或提交到仓库。

- 凭证转发路由（/scopus、/ieee、/springer、/core、/serpapi）从请求头 `X-User-Key-<source>` 读取访客自带 key，用完即弃：不记录、不写日志、不放进缓存键；缺失时返回 400。服务端不需要为这些来源配置任何变量。

配置后自检：`GET /functions/v1/app/health` 返回 `{"ok":true,"llm":…,"contactEmail":…,"sources":[…]}`，页面「设置」里会显示“同源函数可用”。

限制：请求体 ≤ 64KB、模型白名单 `qwen-plus|qwen-turbo|qwen-max`、上游超时 50s、每路由 60 次/分钟、arXiv ≤1 次/3 秒、错误只返回分类码不回显原始异常。

访客自备 key 的路径：页面「设置」→ 粘贴 key → 保存（仅 localStorage），浏览器直连
`https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`。

## 数据来源与致谢

文献数据来自以下官方公开 API，仅按其条款访问并遵守限流：

- [OpenAlex](https://openalex.org)（CC0）
- [Semantic Scholar](https://www.semanticscholar.org)（S2 API License，需署名）
- [Crossref](https://www.crossref.org)（元数据基本公有领域）
- [Europe PMC](https://europepmc.org)（元数据开放，需署名）
- [DBLP](https://dblp.org)（CC0）
- [arXiv](https://arxiv.org)
- 开放获取链接来自 [Unpaywall](https://unpaywall.org)（CC0）

可选凭证来源（仅在用户填入自己的 key 且同源函数可用时检索，按各服务条款使用）：[Semantic Scholar](https://www.semanticscholar.org/product/api)、[Elsevier Scopus](https://dev.elsevier.com/)、[IEEE Xplore](https://developer.ieee.org/)、[Springer Nature](https://dev.springernature.com/)、[CORE](https://core.ac.uk/services/api)、[SerpApi](https://serpapi.com/)。Scopus 的机构订阅权限、SerpApi 的费用均由用户自行承担；本项目不登录、不抓取谷歌学术或知网。

Thank you to arXiv for use of its open access interoperability.

抽取结果基于摘要，可能不完整，请以原文为准。联系邮箱只配置在边缘函数环境变量中，不出现在前端或仓库。


## 设计

暖色纸感风格：米白底 #faf9f5、陶土色强调 #c96442。品牌与标题用自托管霞鹜文楷子集（`dev/make-font-subset.py` 生成，OFL），论文标题与关联说明用衬线，正文无衬线。图标是一滴水落在石面上，取“滴水穿石”：一滴恰到好处的点拨，击穿研究里看似坚不可摧的卡点。v2 设计稿见 [DESIGN-v2.md](DESIGN-v2.md)。

## 更新记录

- 2026-11-18（v2.2）：新增六家服务的自带凭证（仅 localStorage，经同源函数转发，函数不记录、缓存键不含 key）；无函数或未填 key 时行为不变。新增本地文献导入，支持 RIS / BibTeX / EndNote / NoteExpress / RefWorks，导入条目参与去重、抽取、全景与导出，文件不上传。测试增至 63 项（45 + 18）。

- 2026-11-18（v2.1）：新增 Crossref、Europe PMC、DBLP 三源与 Unpaywall 开放获取补全；DOI/arXiv/PMID/标题并集去重与字段合并；设置里可自动/手动选择来源；检索缓存与 429 退避；修复手机「处理进度」检索式挤在右侧的问题；新增合并/去重/JATS 去标签测试（45 项）。

- 2026-11-18（v2）：更名「问渠」，水滴图标；三层导航（全景 → 论文卡片 → 详情抽屉）、方法 × 年份全景图、相关度与筛选排序、电脑/平板/手机三档布局；新增 dev/test-v2.mjs 与 dev/shot-v2.py。

- 2026-11-18：v1 发布到 Qoder Sites 并公开；界面改为暖色纸感风格；完成论坛作品帖。
