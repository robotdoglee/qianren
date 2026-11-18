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
