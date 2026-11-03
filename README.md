# 阿斌实验室

可运行的前端实验室与技术教程库，记录全栈、跨端、游戏开发和智能体实践。基于 VitePress 和 Vue 构建，使用 GitHub Actions 发布到 GitHub Pages。

## 页面

- 首页：个人介绍、学习入口与可显式启动的光谱/粒子实验。
- 实验室：10 项交互实验，各自关联实现教程和同版本源码下载。
- 博客：响应式网格、分类筛选、关键词搜索与源码片段预览。
- 专题教程：按章节组织的学习路径，支持目录、续读、手动完成记录与课程离线缓存。
- 开源项目：可打断的排序与筛选动效，整张卡片直接打开对应 GitHub 仓库。
- 智能问答：完全本地的站内知识检索、对比、总结与学习路线。
- 关于：工程方法、技术能力与有来源的作品时间线。

全站共享导航、页脚和站内搜索，支持浅色、深色、跟随系统与键盘导航；文章内提供关联上下文的问答入口。

## 本地开发

本站使用 Node.js 22 维护分支、pnpm 10.20.0 和仓库锁文件。教程示例在各自目录中维护独立的版本与运行说明。

```sh
pnpm install
pnpm dev
pnpm check
pnpm test
pnpm test:e2e
pnpm build
pnpm test:production
pnpm preview
```

默认站点前缀为 `/abinzhao/`。部署到根路径时，通过 `VITEPRESS_BASE=/` 构建。`pnpm verify` 连续执行全部质量检查；构建最后会检查所有页面的内部链接、锚点与静态资源。

`pnpm test:production` 启动 5203 端口的生产预览，验证分包预算、双主题响应式、无 JavaScript 正文与 Service Worker 更新/失败恢复。性能采样需先启动生产预览，例如 `pnpm preview --port 5202`，再运行 `node scripts/measure-site.mjs http://127.0.0.1:5202/abinzhao/`；默认每页五轮，结果写临时目录，不覆盖历史测量。下载的 `site-labs.zip` 包含完整站点与逐文件 SHA256 清单。

## 专题教程

| 专题 | 内容 |
| --- | --- |
| [全栈开发](https://abinzhao.github.io/abinzhao/columns/fullstack-development/) | HTML、CSS、JavaScript、TypeScript、React、Node.js、PostgreSQL、认证、安全、测试与运维 |
| [Agent Harness](https://abinzhao.github.io/abinzhao/columns/agent-harness/) | Agent 循环、Skills、MCP、上下文、工具、安全、恢复、多 Agent、SDK 和评测 |
| [微信小程序](https://abinzhao.github.io/abinzhao/columns/wechat-mini-program/) | 原生 TypeScript 开发、生命周期、网络、身份、隐私、性能和预约项目 |
| [Agent 产品经理](https://abinzhao.github.io/abinzhao/columns/agent-product-manager/) | 任务发现、产品规格、权限恢复、评测统计、成本、治理、运维与作品集 |
| [uni-app](https://abinzhao.github.io/abinzhao/columns/uni-app/) | Vue 3、TypeScript、平台边界、状态、请求、能力适配和跨端预约项目 |
| [Godot](https://abinzhao.github.io/abinzhao/columns/godot/) | GDScript、2D、UI、存档、AI、音频、3D、性能、测试与完整收集关卡 |

各专题记录官方来源、版本核验日期与实践范围。版本发布事实、示例测试结果和目标平台验收分别说明；平台文档支持不能替代真机测试。完整项目位于 `examples/`，按各项目 README 运行。

## Pages 部署与访问检查

仓库 Settings → Pages 的发布源应为 **GitHub Actions**。仅有成功的历史 workflow 不代表 Pages 当前仍已启用；配置缺失时工作流的 `configure-pages` 步骤会明确失败。

业务、内容与功能维护线为 `dev`。本版本工作流仅接受 `dev` 推送，手动触发同样校验 `refs/heads/dev`；流水线执行类型、单元、浏览器、静态构建与生产验证，上传同一制品，再部署与检查线上页面。`release.json` 保存构建提交，线上检查会确认发布版本与当前构建一致。

远端迁移目标为 `master` 仅保留个人介绍 `README.md`，Pages 的发布环境仅允许 `dev`。本地工作流修改不会自动更新远端分支内容或 Settings；这些设置须在迁移获准后单独完成并核验。

已有对应提交的本地构建时，可执行：

```sh
node scripts/verify-site.mjs --url https://abinzhao.github.io/abinzhao/ --expected-sha COMMIT_SHA
```

`COMMIT_SHA` 替换为实际完整提交哈希。默认本地构建的版本标记为 `local`，不能用它证明线上某个提交已经发布。

## 智能问答

问答能力完全在浏览器本地运行。构建阶段把所有已发布博客和专题章节解析为知识块，页面按需加载本地索引与正文，支持中英文检索、资料查找、概念解释、对比、文章总结、学习路线和排查清单。正文和代码均可检索，不将问题、历史或文章内容发送到云端推理。

回答只引用站内已发布内容，并提供可点击的文章或章节来源。资料不足时会明确提示，不提供开放互联网搜索，也不会生成站内没有依据的结论。

会话记录只保存在当前浏览器，最多保留 30 段会话、每段 100 条消息，支持复制和 Markdown 导出。记录不会跨设备同步；浏览器存储不可用时，当前页面仍可继续问答和导出。

检索索引、完整正文和问答界面位于独立的懒加载块，首页不预加载它们。内容预算以提交 `152605af` 的 119 篇文章、1,278,461 字节 Markdown 为基线，按新增正文体积维持原压缩密度：索引 gzip 250 KiB、正文原始 2 MiB / gzip 600 KiB 随内容等比例增长，同时受索引 gzip 512 KiB、正文原始 4 MiB / gzip 1 MiB 的绝对上限约束。达到上限后需要拆分语料，不能无限抬高预算；完整词项、代码、元数据和检索排名仍由回归测试验证。

## 视觉与性能

视觉变量集中于 `docs/.vitepress/theme/styles/tokens.css`。浅色与深色共享青绿语义色、清晰的正文表面和统一圆角。核心内页使用紧凑标题、筛选和内容布局，六个专题共用卡片与阅读导航；长代码和表格在自身区域滚动。

GPU 实验仅在明确启动后加载；粒子优先使用 WebGPU 计算，缺失时降级为 Canvas2D，光谱材质使用 WebGL2。统一资源互斥保证只有一个持续重实验，本地模型忙碌时暂停图形；离屏/后台暂停，关闭后销毁。连续两秒平均帧率不足时逐级降低 DPR，最低档仍不足则切回静态预览。

导航与主题共享可取消的 View Transition，卡片重排使用 WAAPI/FLIP，磁吸只移动视觉内层。系统减少动态优先于完整效果设置。首屏预算为 JS gzip ≤110KiB、CSS gzip ≤25KiB；加载测量、图形微基准与真实设备表现分别记录，不把模拟测试当作手机帧率或现场 INP。

## 精选仓库

| 项目 | 内容 |
| --- | --- |
| [鸿蒙学习笔记](https://github.com/abinzhao/harmony-next-blog) | 鸿蒙应用学习笔记与实践教程 |
| [命令行图片压缩](https://github.com/abinzhao/cps) | 基于 Node.js 的图片压缩工具 |
| [前端工程实践](https://github.com/abinzhao/scio-design) | 多包管理、工程规范与效能组件 |
| [组件与工具库](https://github.com/abinzhao/scioPro) | React 组件、自定义钩子与工具函数 |
| [代码分析工具](https://github.com/abinzhao/code-cnalysis) | 面向代码理解与分析的工具实践 |

[访问博客](https://abinzhao.github.io/abinzhao/) · [GitHub](https://github.com/abinzhao)
