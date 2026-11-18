# 数据源加强方案（v2.1）

目标：检索更全、更稳，且只用官方开放接口，合法合规。参考 PaperQA2（Semantic Scholar + Crossref + Unpaywall 多源合并元数据）、OpenAlex/Crossref 官方使用建议。

## 原则（硬性）

- 只调用官方公开 API，遵守各自条款与限流；**不抓取** Google Scholar、CNKI、万方、ResearchGate、Sci-Hub 等网页或影子库。
- 每个来源在页脚和 README 写明出处与许可；arXiv 致谢语保留。
- 联系邮箱（Crossref/OpenAlex polite pool、Unpaywall 必填）只放在边缘函数环境变量 `CONTACT_EMAIL`，**不写进前端代码和仓库**；未配置时函数不带 mailto，照常工作。
- 结果缓存：浏览器 sessionStorage（同一检索式 30 分钟），边缘函数内存缓存（10 分钟），避免重复请求。
- 429/5xx：指数退避 1 次；仍失败就跳过该源，界面用中文说明（如「Semantic Scholar 暂时限流，已用其他来源补齐」），不再出现英文 "Failed to fetch"。

## 来源

| 来源 | 用途 | 调用方式 | 许可 / 条款要点 |
| --- | --- | --- | --- |
| OpenAlex（已有） | 主检索、引用数、摘要（倒排索引还原） | 浏览器直连，失败走函数；带 mailto | 数据 CC0 |
| Semantic Scholar（已有，修） | 检索、引用数、TLDR | **默认走函数**（浏览器直连 429 时没有 CORS 头，表现为 Failed to fetch）；函数可选 `S2_API_KEY` | S2 API License，需署名 |
| arXiv（已有） | 预印本 | 函数代理，≤1 次/3 秒 | 须致谢 |
| **Crossref（新）** | 期刊/会议元数据、DOI、部分摘要（JATS 需去标签） | 函数代理，`/works?query=…&rows=10&select=…`，带 mailto | 元数据基本公有领域，遵守 etiquette |
| **Europe PMC（新）** | 生物医学文献（含 PubMed），摘要完整 | 浏览器直连（CORS *），`/webservices/rest/search?format=json&resultType=core&pageSize=10` | 元数据开放，需署名 |
| **DBLP（新）** | 计算机领域会议/期刊，补 venue | 函数代理 `/search/publ/api?format=json&h=10` | 数据 CC0 |
| **Unpaywall（新，增强）** | 给最终保留的论文补开放获取 PDF 链接 | 函数按 DOI 批量查（只查保留的 10–15 篇），必须带 email；无 `CONTACT_EMAIL` 时跳过 | 数据 CC0 |

按领域启用：检索式含医学/生物词时启用 Europe PMC；含计算机/AI 词时启用 DBLP；其他默认 OpenAlex + S2 + Crossref + arXiv。用户可在设置里勾选来源。

## 合并与去重

- 统一 schema：沿用现有 paper 字段，`sources` 记录全部命中来源。
- 去重键：DOI（小写）> arXiv id > PMID > 规范化标题（去标点、小写、去空格）+ 年份 ±1。
- 字段合并：摘要取最长的非空来源；引用数取最大值并记录来源；venue 优先 Crossref/DBLP；`oaUrl` 来自 Unpaywall 或 arXiv。
- 排序不变，但给「多源命中」小幅加分。

## 界面

- 处理进度：每个来源一行，显示命中数、耗时或中文跳过原因；手机上检索式换到下一行，不挤在右侧。
- 卡片与详情：来源小标（OpenAlex / S2 / Crossref / Europe PMC / DBLP / arXiv）；有 `oaUrl` 时详情里显示「开放获取全文」按钮。
- 页脚：列出全部来源与致谢。

## 验收

- `node dev/test-rules.mjs`、`node dev/test-v2.mjs` 全过，新增合并/去重/摘要去 JATS 标签的单元测试。
- 三个演示不变；实时检索在任一源失败时仍出结果，且无英文报错。
- 边缘函数新增路由 `/crossref`、`/dblp`、`/unpaywall`，各自限流与缓存；`/health` 列出可用来源。
