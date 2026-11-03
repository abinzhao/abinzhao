# 阿斌实验室

全栈工程师与独立开发者。写可维护的前端，设计可验证的服务，构建用户可控的智能体。源码公开，经验成文。

[在线站点](https://abinzhao.github.io/abinzhao/) · [实验室](https://abinzhao.github.io/abinzhao/labs/) · [专题教程](https://abinzhao.github.io/abinzhao/columns/) · [GitHub](https://github.com/abinzhao)

## 站点内容

- **实验室**：10 项可交互实验，覆盖 WebGPU 粒子、程序化光谱材质、渲染管线、知识图谱、共享元素过渡、可打断重排、执行轨迹与作品时间线；每项都关联实现教程与同版本源码。
- **专题教程**：六条完整学习路径，共 184 篇章节，支持章节目录、续读、完成记录与课程离线缓存。
- **博客**：独立技术文章、分类筛选、站内搜索与代码预览。
- **开源项目**：可排序与筛选的项目索引，整张卡片直达对应仓库。
- **本地助手**：站内知识检索、对比、总结与学习路线，全部在浏览器本地运行。
- **关于**：工程方法、技术能力与可查证的作品时间线。

全站支持浅色、深色与跟随系统主题，兼容键盘导航和减少动态效果偏好；文章正文在关闭 JavaScript 时仍可阅读。

## 分支与发布

- `dev`：站点源码、内容与功能的唯一维护线，也是 GitHub Pages 的唯一构建来源。
- `master`：保留本 README 作为个人介绍入口。

Pages 使用 GitHub Actions 构建同一份制品后发布，并在部署完成后核对线上版本与页面链接。推送 `dev` 即触发完整的类型检查、单元测试、浏览器回归、生产资源与离线验证。

## 技术栈

VitePress 1.6、Vue 3.5、TypeScript、pnpm、Playwright 与 Vitest。图形实验按需加载：粒子优先使用 WebGPU，缺失时降级 Canvas2D；光谱材质使用 WebGL2。首屏预算为 JS gzip ≤110 KiB、CSS gzip ≤25 KiB，实验资源在明确启动前不请求。

本地开发命令、内容约定与测量方法见 `dev` 分支的 README：

```sh
git switch dev
pnpm install
pnpm dev
```

## 精选仓库

| 项目 | 内容 |
| --- | --- |
| [鸿蒙学习笔记](https://github.com/abinzhao/harmony-next-blog) | 鸿蒙应用学习笔记与实践教程 |
| [命令行图片压缩](https://github.com/abinzhao/cps) | 基于 Node.js 的图片压缩工具 |
| [前端工程实践](https://github.com/abinzhao/scio-design) | 多包管理、工程规范与效能组件 |
| [组件与工具库](https://github.com/abinzhao/scioPro) | React 组件、自定义钩子与工具函数 |
| [代码分析工具](https://github.com/abinzhao/code-cnalysis) | 面向代码理解与分析的工具实践 |

[访问站点](https://abinzhao.github.io/abinzhao/) · [GitHub](https://github.com/abinzhao)
