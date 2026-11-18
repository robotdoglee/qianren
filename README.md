# 问渠

> 不求字字有答，但求一念豁达。——取意朱熹“问渠那得清如许，为有源头活水来”。

> 2026 Qoder 高校创造力大赛 · StudyHack 学习科研赛道参赛作品
>
> - 在线体验（Qoder Sites，公开访问）：https://qianren-9o3elwijmv8.qoder.zone
> - 参赛者：上海交通大学（个人参赛）· Qoder 账号 nick6784593415
> - 天池论坛作品帖：见 [WRITEUP.md](WRITEUP.md)（发布后补上帖子链接）

一句话想法 / 一个具体问题 → 并行检索 OpenAlex、arXiv、Semantic Scholar → 去重排序 → 逐篇抽取 7 个字段 → 全景（方法 × 年份）、带“与你想法的关联”的论文卡片、单篇详情、研究空白点与对比表，并导出 Markdown / CSV / BibTeX。

- 纯静态：HTML + CSS + 原生 ES modules，无构建步骤、无外部 CDN。
- 检索优先在浏览器里直连开放 API；只有 arXiv 必须经同源函数代理（它的响应没有 `Access-Control-Allow-Origin`）。
- 抽取只依据标题与摘要，找不到依据的字段一律写「摘要未提及」，不做补全。
- 全站中文 UI；电脑左侧筛选栏 + 两列卡片 + 右侧详情抽屉，手机单列 + 底部弹层。

## 检索与回退策略

| 数据源 | 直连 | 回退 | 全失败时 |
| --- | --- | --- | --- |
| OpenAlex | 支持 CORS，按 IP 限流 429 | 同源代理 `GET /functions/v1/app/openalex?q=&n=` | 再退避重试一次直连，仍失败才标记失败 |
| Semantic Scholar | 支持 CORS，按 IP 限流 429 | 同源代理 `GET /functions/v1/app/s2?q=&n=` | 同上 |
| arXiv | **不支持 CORS，浏览器直连必失败** | 只走同源代理 `GET /functions/v1/app/arxiv?q=` | 进度里显示「需服务器代理，已跳过（OpenAlex 已收录 arXiv 预印本）」，不算失败 |

纯静态部署（没有函数）时前两个源仍可正常使用，arXiv 自动跳过；单源失败不影响其余结果。

## 三种运行方式

1. **一键演示**（首页 3 个按钮）：读取 `web/demos/<id>.json` 的预计算结果，带 2–3 秒回放式进度，即时渲染。
2. **免 key 实时模式**（默认）：浏览器真实检索 + 规则抽取（中英术语词典查询扩展、线索词字段抽取、TF-IDF 聚类、空白点归纳）。
3. **Qwen 增强模式**：同源函数已配置 `DASHSCOPE_API_KEY` 时默认走服务器端调用；否则在「设置」里填入自己的 DashScope Key，**它只保存在浏览器 localStorage**，可一键清除。LLM 调用失败会自动回落到规则模式并提示。

## 目录结构

```
web/
  index.html          入口
  app.css             样式（暖色纸感风格）
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


## 设计

暖色纸感风格：米白底 #faf9f5、陶土色强调 #c96442。品牌与标题用自托管霞鹜文楷子集（`dev/make-font-subset.py` 生成，OFL），论文标题与关联说明用衬线，正文无衬线。图标是一滴水落在石面上，取“滴水穿石”：一滴恰到好处的点拨，击穿研究里看似坚不可摧的卡点。v2 设计稿见 [DESIGN-v2.md](DESIGN-v2.md)。

## 更新记录

- 2026-11-18（v2）：更名「问渠」，水滴图标；三层导航（全景 → 论文卡片 → 详情抽屉）、方法 × 年份全景图、相关度与筛选排序、电脑/平板/手机三档布局；新增 dev/test-v2.mjs 与 dev/shot-v2.py。

- 2026-11-18：v1 发布到 Qoder Sites 并公开；界面改为暖色纸感风格；完成论坛作品帖。
