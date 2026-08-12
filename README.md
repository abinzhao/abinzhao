# ZJB.DEV

> 把复杂，做得有意思。

赵建斌的项目、技术文章与创意代码实验室。

站点包含三个主要入口：

- **项目**：公开项目与工程实践。
- **博客**：技术文章与实践记录。
- **实验室**：创意代码和交互实验。

## 技术概览

站点基于 Astro、TypeScript、Three.js 与 Markdown 构建，并通过 GitHub Pages 发布到 `/abinzhao/` 子路径。

全站共享一套 Three.js 数字宇宙场景，根据首页、项目、博客、About、实验室和 404 等页面切换构图与粒子强度。地球表面、云层、城市灯光、法线和高光纹理均作为本地静态资源加载；实验详情页由实验 Canvas 独占 WebGL 上下文。

场景支持深空与光昼主题、键盘操作和清晰焦点状态。系统启用 `prefers-reduced-motion`、WebGL 不可用、上下文丢失或 JavaScript 不可用时，页面会保留可阅读、可导航的静态视觉与内容。

## 公开站点

[https://abinzhao.github.io/abinzhao/](https://abinzhao.github.io/abinzhao/)

## 验证

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

## 真实性边界

站点内容只使用可核对的公开资料。未确认的个人联系方式、履历、合作信息与数据指标不会作为公开事实展示。
