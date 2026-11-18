# v2.2 自带凭证与文件导入 · v2.3 论文之外的扩展

## v2.2 自带凭证（可选，基础仍是开放数据库）

合规前提：谷歌学术、知网没有面向个人的开放 API，**不做**账号登录、Cookie 注入或网页抓取。

1. 设置 →「自带凭证（可选）」：
   - Semantic Scholar API key（提高限流）
   - Elsevier Scopus API key（dev.elsevier.com，需机构 IP/授权的由用户自理）
   - IEEE Xplore API key
   - Springer Nature Meta API key
   - CORE API key（开放获取全文）
   - SerpApi key（第三方付费的 Google Scholar API，用户自担条款与费用）
   - 每项旁边一句说明和申请链接；只存 localStorage，可一键清除。
2. 调用：有 key 的来源才启用；请求经边缘函数转发，key 放请求头 `X-User-Key-<source>`，函数**不记录、不缓存** key，响应缓存键不含 key。
3. 文件导入（覆盖知网 / 谷歌学术 / Zotero）：首页「导入文献」，支持 RIS、BibTeX、EndNote（.enw）、NoteExpress（.net 文本）、知网导出的 Refworks 文本。纯前端解析，不上传。导入的论文与检索结果一起去重、抽取、进全景；来源标「导入」。
4. 测试：每种格式至少一个样例解析单测；key 不出现在任何日志或导出里。

## v2.3 论文之外（以论文为主，其余为辅）

1. 触发：高相关论文 < 3 篇，或用户点「拓展到书籍与社区」。
2. 来源（均为官方免费 API）：Open Library 搜索、Google Books（无 key 基础额度）、Wikipedia（中英 REST summary/search）、GitHub 仓库搜索（未认证限流，走函数）、Hugging Face models/datasets 搜索、Stack Exchange（stackoverflow 等站）、Hacker News Algolia、dev.to articles。每源取 3–5 条。
3. 展示：结果页新增「论文之外」一栏，排在论文卡片之后；每条带类型小标（书 / 百科 / 代码 / 模型 / 问答 / 博客）和「未经同行评审」提示。
4. 综合解答（RAG）：有 Qwen key 时，把论文（[P1]…）与其他资源（[R1]…）的标题+摘要/片段作为上下文，生成「综合解答」：先论文证据，再辅助资源，每句带引用编号，证据不足就明说；无 key 时只按规则列出资源，不生成。
5. 导出：Markdown 增加「论文之外」与综合解答小节，标明资源类型。

## 验收

- 现有测试全过，新增导入解析与扩展触发测试。
- 不填任何 key 时体验与 v2.1 一致。
- README、PROGRESS-v2.md、更新记录同步。
