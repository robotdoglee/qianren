# 前人做过吗 — 产品与技术规格（给 Qoder 的构建说明）

参赛：2026 Qoder 高校创造力大赛 · StudyHack 赛道。目标用户：研究生。全站中文 UI，移动端友好，简洁干净（学术、克制、留白，主色可用深靛蓝 #2B3A67 + 暖色点缀），无需任何框架构建步骤：纯静态 HTML + CSS + 原生 ES modules，放在 `web/` 目录（`web/index.html` 为入口）。不要依赖外部 CDN（全部自带，体积小）。

**隐私：站点任何地方都不能出现作者真实姓名、手机号、邮箱。**

## 两种模式

### 模式 A「我有个想法」
输入：一句话研究想法（中文或英文）。流程：
1. 查询扩展：把想法变成 3–5 条英文检索式。
   - 有 LLM（访客自填 DashScope key，或服务器函数可用）时：调用 Qwen 生成。
   - 无 LLM 时（免 key 实时模式）：规则法——内置一个小型中英学术术语词典（~150 条常见 CS/AI/生物医学/材料/经管术语，如 大模型→large language model, 幻觉→hallucination, 检索增强→retrieval-augmented generation, 图神经网络→graph neural network, 小样本→few-shot, 类别不平衡→class imbalance, 医学影像→medical imaging, 分子性质→molecular property prediction …），中文分词用最长匹配，英文输入直接提取关键词（去停用词），组合出 3–4 条检索式（全量关键词、核心两两组合等）。
2. 并行检索三个免费 API（浏览器直接 fetch，均支持 CORS；每个请求 12s 超时，任一失败不影响其他，界面上显示该源失败/限流）：
   - OpenAlex: `https://api.openalex.org/works?search=<q>&per-page=15&select=id,doi,title,publication_year,authorships,primary_location,abstract_inverted_index,cited_by_count,relevance_score` （摘要需由 abstract_inverted_index 还原）
   - Semantic Scholar: `https://api.semanticscholar.org/graph/v1/paper/search?query=<q>&limit=15&fields=title,abstract,year,authors,venue,externalIds,url,citationCount`
   - arXiv: `https://export.arxiv.org/api/query?search_query=all:<q>&max_results=10`（Atom XML，用 DOMParser 解析）。如果浏览器因 CORS 失败，自动改走同源函数代理 `/functions/v1/app/arxiv?q=`（若存在），否则跳过并在进度中注明。
   - 遇 429 显示“限流，稍后重试”，不要无限重试（最多 1 次退避重试）。
3. 去重：按 DOI → arXiv ID → 规范化标题（小写去标点）合并，合并来源标记。
4. 排序取前 10–15：相关度 = 想法关键词与 标题(权重2)+摘要 的匹配 (BM25 风格或 TF 覆盖率) + 0.1·log(引用+1) 小幅加成 + 多源命中加成。无摘要的论文降权。
5. 逐篇抽取 7 字段（只依据标题+摘要）：研究问题、方法、数据集、指标、主要结果、局限、与该想法的关系。
   - **缺失字段一律写「摘要未提及」，绝不编造。**
   - LLM 模式：一次请求批量抽取（JSON 输出，中文填写，原文引用的数据集/指标名保留英文），并给出聚类、空白点。
   - 规则模式：按句切分摘要；用线索词抽取——研究问题（"we study/address/investigate/aim/problem/challenge"等所在句）、方法（"we propose/present/introduce/develop/our method/approach/framework"）、数据集（"dataset/benchmark/corpus"附近的大写专名、已知数据集名词表如 ImageNet, CIFAR-10, MIMIC, PubMedQA, MedQA, QM9, MoleculeNet, COCO…）、指标（accuracy, F1, AUC, BLEU, ROUGE, RMSE, MAE, precision, recall, mAP…）、主要结果（含数字/百分比/outperform/improve 的句子）、局限（limitation/however/fail/remain/challenge 句子）；规则模式下字段内容为英文原句摘录（标注“原文摘录”），关系字段用关键词重叠给出“高/中/低相关 + 共同关键词”。抽不到就是「摘要未提及」。
   - 规则模式聚类：按方法关键词的 TF-IDF 余弦相似做简单层次/贪心聚类成 3–5 簇，簇名取高频方法词。
   - 规则模式空白点：基于“出现频次低的 (方法×数据集/场景) 组合”、“多数论文未报告的指标”、“局限句中反复出现的问题”给出 2–4 条，每条引用具体论文编号 [1][3]。
6. 输出：
   - **对比矩阵**：表格，行=论文（标题链接到论文页面/DOI），列=年份、来源、引用数、7 个字段。可按任一列排序；顶部文本筛选框 + 年份范围 + 来源筛选 + “只看有数据集的”。移动端：表格横向滚动 + 首列固定，或切换为卡片列表。
   - **方法簇卡片**：3–5 张卡，名称、一句概括、代表论文（可点击跳转到矩阵对应行）。
   - **「空白点」分析**：每条引用具体论文（[n] 可点击定位）。
   - **导出**：Markdown（矩阵+簇+空白点）、CSV（UTF-8 BOM 便于 Excel）、BibTeX（由元数据生成，key=第一作者姓+年份+标题首词）。
### 模式 B「我遇到个问题」
输入：一个具体问题（如“我的分类模型在类别极度不平衡的医学影像上召回率很低”）。流程同上（检索、去重、抽取），但输出为：按“解决思路/方法流派”分组（3–5 组），每组：思路名称、做法概述、代表论文（2–4 篇，链接）、报告的效果（来自摘要，缺失写摘要未提及）、局限。同样提供矩阵（折叠）与导出。

## 三种运行方式（评委无需任何 key 即可使用）
1. **一键演示**（首页 3 个按钮）：加载 `web/demos/*.json` 预计算结果（真实 API 检索结果 + 基于真实摘要的抽取），即时渲染，并带一个“回放”式进度动画（2–3 秒）。
2. **免 key 实时模式**（默认）：真实检索 + 规则抽取，全部在浏览器运行。
3. **增强模式（Qwen）**：
   - 若服务器函数存在且已配置 `DASHSCOPE_API_KEY`（`GET /functions/v1/app/health` 返回 `{ok:true, llm:true}`），默认用服务器端调用 `POST /functions/v1/app/llm`。
   - 否则访客可在“设置”里粘贴自己的 DashScope API Key，**仅存 localStorage**，浏览器直接调用 `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`（已验证支持 CORS），模型可选 qwen-plus（默认）/ qwen-turbo / qwen-max。明确提示“key 只保存在你的浏览器本地”。可一键清除。
   - LLM 调用失败时自动回落到规则模式并提示。

## 进度展示
实时步骤列表：①理解想法/生成检索式（显示生成的检索式）②检索 OpenAlex / arXiv / Semantic Scholar（各自状态：进行中/命中 N 篇/失败）③去重排序（显示 去重前→后数量）④抽取字段（n/N）⑤聚类与空白点。显示总耗时计时器，目标 <60s。

## 数据结构（演示 JSON 与实时结果共用，渲染器只吃这个）
```json
{
  "id": "demo-rag-med",
  "mode": "idea",            // "idea" | "problem"
  "input": "用户原始输入",
  "engine": "demo|rules|qwen",
  "generatedAt": "2026-11-18",
  "queries": ["..."],
  "stats": {"openalex": 30, "arxiv": 10, "s2": 15, "deduped": 41, "kept": 12, "seconds": 23.4},
  "papers": [{
    "n": 1, "id": "doi:10.xxx|arxiv:2301.xxxxx|title:...",
    "title": "", "authors": ["A. B", "..."], "year": 2024, "venue": "",
    "url": "https://...", "doi": "10.xxx", "arxiv": "2301.00001",
    "sources": ["openalex","s2"], "citations": 12, "abstract": "...", "score": 0.83,
    "fields": {"question": "", "method": "", "dataset": "", "metric": "", "result": "", "limitation": "", "relation": ""}
  }],
  "clusters": [{"name": "", "summary": "", "papers": [1,4,7]}],
  "gaps": [{"title": "", "detail": "引用 [2][5]", "papers": [2,5]}],
  "approaches": [{"name": "", "summary": "", "papers": [1,3], "effect": "", "limits": ""}]
}
```
`approaches` 仅模式 B 有；`clusters`/`gaps` 模式 A 必有，模式 B 可有。

## 页面结构
- 顶部：品牌「前人做过吗」+ 副标题“一句话，查清前人做过什么、还空着什么”。
- 模式切换 Tab（我有个想法 / 我遇到个问题），大输入框，示例占位，开始按钮；下方 3 个一键演示按钮；右上角“设置”（引擎选择、DashScope key）。
- 进度面板 → 结果区（摘要统计、检索式、簇卡片/方法分组、空白点、矩阵、导出）。
- 页脚：数据来源致谢 “文献数据来自 OpenAlex、arXiv、Semantic Scholar（免费开放 API）。Thank you to arXiv for use of its open access interoperability.” 链接到各自官网；“使用 Qoder 构建，部署于 Qoder Sites”；免责声明：抽取结果基于摘要，可能不完整，请以原文为准。

## 可选服务器函数（`functions/index.ts`，Deno edge，`Deno.serve`）
路由（路径后缀匹配，不假设完整 pathname 含 app）：
- `GET …/health` → `{ok:true, llm: Boolean(Deno.env.get('DASHSCOPE_API_KEY'))}`
- `POST …/llm` body `{messages, model}` → 用 `Deno.env.get('DASHSCOPE_API_KEY')` 调 DashScope compatible-mode；未配置返回 `{ok:false,error:'service_not_configured'}` 503；限制 body ≤ 64KB，model 白名单，超时 50s，不回显原始异常。
- `GET …/arxiv?q=` → 代理固定地址 export.arxiv.org（只允许 q 参数，长度≤300），返回 XML；超时 12s。
- 未知路径 404。
前端必须在函数不存在（404/HTML）时正常工作。

## 文件
- `web/index.html`, `web/app.css`, `web/js/*.js`（search.js, extract-rules.js, llm.js, render.js, export.js, terms.js, main.js 等），`web/demos/index.json` + 3 个 demo JSON（由 Hark 提供数据，你只需确保渲染器能读）。
- `functions/index.ts`（可选，见上）。
- `README.md`。
