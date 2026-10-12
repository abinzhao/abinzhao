# abinzhao knowledge site

阿斌的技术教程、工程实践与长期积累。

站点以 VitePress 为底座，使用“深空棱镜 / 白昼折射”双主题，通过 GitHub Pages 发布到：

<https://abinzhao.github.io/abinzhao/>

## 本地开发

环境要求：Node.js 22 或更高版本。

```bash
npm ci
npm run docs:dev
```

默认地址：<http://127.0.0.1:5173/abinzhao/>

## 验证

```bash
npm run lint
npm test
npm run typecheck
npm run docs:build
npm run test:e2e
```

## 内容结构

- `docs/tutorials/`：按学习依赖组织的技术教程。
- `docs/topics/`：跨技术栈的完整实践专题。
- `docs/projects/`：公开项目与工程判断。
- `docs/.vitepress/`：配置、自定义主题和构建期数据。

教程包含 16 条路径、49 篇正文：Git、Shell、HTML、CSS、JavaScript、
TypeScript、React、Vue、Node.js、浏览器、浏览器插件、现代前端工程化、
Node.js 全栈、AI Agent、Rust、Python。每条路径包含基础、实践和进阶，
Node.js 全栈另附前端、API、会话与 PostgreSQL 统一的任务应用实战。
四个专题将教程串成前端工程、全栈应用、浏览器插件和本地 Agent 实践。

新增教程时，在 `docs/.vitepress/data/tutorials.ts` 注册章节，再编写 Markdown。
构建期校验元信息、同路径的章节顺序和目录注册；正文不会被注入首页数据。
站点使用 `/abinzhao/` 前缀与 `.html` 深层 URL，内部设计文档排除公开构建。

评论使用 Giscus，映射到仓库 Discussions 的 `Announcements` 分类。
启用时配置 GitHub Actions Variables `VITE_GISCUS_REPO_ID` 和
`VITE_GISCUS_CATEGORY_ID`；本地通过忽略提交的环境文件提供。
未配置时展示 Discussions 入口，不影响教程阅读。
