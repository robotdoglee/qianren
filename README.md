# 前人做过吗

一句话想法 / 一个具体问题 → 并行检索 OpenAlex、arXiv、Semantic Scholar → 去重排序 → 逐篇抽取 7 个字段 → 方法簇、研究空白点、可排序对比矩阵，并导出 Markdown / CSV / BibTeX。

- 纯静态：HTML + CSS + 原生 ES modules，无构建步骤、无外部 CDN。
- 检索在浏览器里直连三个开放 API，服务器不参与，不记录任何输入。
- 抽取只依据标题与摘要，找不到依据的字段一律写「摘要未提及」，不做补全。
- 全站中文 UI，移动端友好（矩阵可横向滚动 / 首列固定 / 一键切换卡片视图）。

## 三种运行方式

1. **一键演示**（首页 3 个按钮）：读取 `web/demos/<id>.json` 的预计算结果，带 2–3 秒回放式进度，即时渲染。
2. **免 key 实时模式**（默认）：浏览器真实检索 + 规则抽取（中英术语词典查询扩展、线索词字段抽取、TF-IDF 聚类、空白点归纳）。
3. **Qwen 增强模式**：同源函数已配置 `DASHSCOPE_API_KEY` 时默认走服务器端调用；否则在「设置」里填入自己的 DashScope Key，**它只保存在浏览器 localStorage**，可一键清除。LLM 调用失败会自动回落到规则模式并提示。

## 目录结构

```
web/
  index.html          入口
  app.css             样式（深靛蓝 + 暖色点缀）
  js/
    terms.js          中英学术术语词典、停用词、数据集/指标表、线索词、规则查询扩展
    search.js         三源并行检索（12s 超时、429 最多退避重试 1 次）、摘要还原、去重、BM25 风格排序
    extract-rules.js  规则抽取 7 字段、方法聚类、空白点、模式 B 思路分组
    llm.js            Qwen（同源函数 / 浏览器直连 DashScope compatible-mode）、key 与偏好存取
    render.js         进度面板、统计、检索式、簇卡片、空白点（[n] 可点击定位）、对比矩阵
    export.js         Markdown / CSV / BibTeX 生成
    main.js           编排与交互（模式切换、示例、一键演示回放、导出下载、设置）
  demos/
    index.json        演示清单（结果 JSON 由作者以真实检索结果补充）
functions/
  index.ts            可选 Deno 边缘函数：/health、/llm、/arxiv 代理
dev/
  test-rules.mjs      离线单元测试（不访问网络）
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
node dev/test-rules.mjs
# 用假数据检查渲染器：http://localhost:8000/web/index.html?demoFile=../dev/fixture.json
```

## 配置 DASHSCOPE_API_KEY（可选，用于 Qwen 增强）

不配置也能用：免 key 实时模式与一键演示均不依赖它。

- 本地调试函数（需安装 deno）：

  ```bash
  DASHSCOPE_API_KEY=sk-xxx deno run --allow-net --allow-env functions/index.ts
  ```

- 部署环境（Qoder Sites / 其他 Deno 边缘运行时）：在函数的环境变量/密钥设置里新增 `DASHSCOPE_API_KEY`，值为阿里云百炼（DashScope）的 API Key。该变量只存在于服务端，前端不会读到。

配置后自检：`GET /functions/v1/app/health` 应返回 `{"ok":true,"llm":true}`，页面「设置」里会显示“同源函数可用”。

限制：请求体 ≤ 64KB、模型白名单 `qwen-plus|qwen-turbo|qwen-max`、上游超时 50s、错误只返回分类码不回显原始异常。

访客自备 key 的路径：页面「设置」→ 粘贴 key → 保存（仅 localStorage），浏览器直连
`https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`。

## 数据来源与致谢

文献数据来自 [OpenAlex](https://openalex.org)、[arXiv](https://arxiv.org)、[Semantic Scholar](https://www.semanticscholar.org)（免费开放 API）。
Thank you to arXiv for use of its open access interoperability.

抽取结果基于摘要，可能不完整，请以原文为准。
