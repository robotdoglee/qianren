# v2 实施进度

- 第 1 步：已用 web/assets/logo.svg 替换头部 ✳ 与 favicon；已生成 117KB 的霞鹜文楷 UI 子集（dev/make-font-subset.py 可重跑），待接入 app.css 字体栈。剩余：第 2–5 步。
- 第 2 步：已完成 relevance（规则模式解析前缀 / Qwen prompt 输出）与 cluster 回写；dev/write-demo-meta.mjs 已给三个演示补字段。剩余：第 3–5 步界面。
- 第 3 步：已完成 L1 卡片（相关度/年份/会议/引用、关联 3 行、簇与数据集 chip）、排序与筛选（PC 左栏 / 平板手机横向 chip），对比矩阵收进「对比表」标签页。
- 第 4 步：已完成 L2 详情（PC 右抽屉 480px、手机底部弹层可上滑全屏）、同簇/共享数据集切换与返回、#paper-n hash、Esc/背景关闭。
- 第 5 步：已完成 L0 一句话结论、方法×年份 SVG 全景（点按开详情、泳道筛选、数据集/指标/不连关系线、与卡片筛选联动）与空白点列表。
- 新增 /tmp 之外的产物：dev/write-demo-meta.mjs、dev/test-v2.mjs（7 项纯函数测试）；app.css / render.js 已按 DESIGN-v2 重排。
- 未完成：本环境缺 Chromium 系统库，未能截图核验 1280×800 / 390×844；下次会话请跑 dev/e2e.py 或带浏览器的环境复查视觉与触屏。
