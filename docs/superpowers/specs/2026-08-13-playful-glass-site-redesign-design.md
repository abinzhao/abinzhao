# ZJB.DEV 活泼透彩站点重构设计

## 目标

以已确认的第五版首页原型为唯一视觉基线，彻底停止使用旧宇宙视觉和上一版暖色编辑式样式。保留现有内容、URL、SEO、搜索、主题切换及实验运行时。

## 视觉语言

- 冰蓝环境底，蓝紫、薄荷、少量暖黄作为流动光层。
- 深海军蓝主文字、深蓝灰正文，保证半透明背景上的稳定对比度。
- Fraunces 用于标题，Literata 用于正文，JetBrains Mono 用于编号和技术标签。
- 32–44px 大圆角容器、18–25px 内部模块圆角、胶囊导航。
- 乳白半透明材质、细白高光边缘、柔和阴影和 `backdrop-filter`。
- 多层渐变以 18–34 秒周期缓慢漂移，内容本身不漂移。
- `prefers-reduced-motion` 下关闭环境光、材质流动和呼吸动画。

## 页面结构

- 全局壳层：胶囊 Header、流动环境光、圆角 Footer、深浅主题。
- 首页：透彩 Hero、文章模块、Vibe 组合模块、非对称项目模块、实验入口和 RSS。
- 博客：圆角列表模块；详情页保持阅读进度、目录高亮、反馈与相关推荐。
- 项目：公开工程信息与工程边界保持不变，改用透彩层级。
- About、搜索、标签、归档、404：统一同一材质、颜色和排版体系。
- 实验详情：保留单 Canvas 与 Three.js，仅重做外围 UI。

## 工程边界

- 主站不得加载 `CosmicScene`、Three.js 或 GSAP。
- 实验详情保持独立 Canvas。
- 不改变 Content Collections schema 和公开内容事实。
- 不引入远程图片和额外视觉依赖。
- 保留 `/abinzhao/` base path 及所有兼容路由。

## 验收标准

- 390px、900px、1440px 无横向溢出。
- 浅色和深色模式正文对比清晰。
- Lighthouse Accessibility、Best Practices、SEO 无失败项。
- `prefers-reduced-motion` 下无持续动画。
- 主站网络请求不包含 Three.js、GSAP 或宇宙纹理资源。
- Lint、单测、构建和全部 E2E 通过。
