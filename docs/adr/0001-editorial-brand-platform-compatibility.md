# ADR 0001: 以现有 Astro 生产基线承载编辑式品牌重构

- 状态：接受
- 责任：仓库维护者；本地质量门禁负责验证
- 决策类型：可逆的视觉与内容架构决策

## 决策问题

如何把个人站重构为“前端 + 鸿蒙 + AI”的温暖编辑式博客，同时保持现有公开内容、URL、构建与 GitHub Pages 部署可靠？

## 目标与约束

| 项目 | 说明 |
| --- | --- |
| 品牌 | 首页明确表达“在鸿蒙上，用前端的方式，把 AI 变成应用。” |
| 阅读 | 主站优先服务文章、项目和短动态，不让 3D 背景竞争注意力 |
| 真实性 | 不补写未经公开资料验证的履历、项目成果、时间线、订阅数据或项目坑点 |
| 兼容性 | 保留 `/blog/`、`/projects/`、`/playground/` 等公开路径与 GitHub Pages `/abinzhao/` base |
| 性能 | Three.js 只在实验详情页加载；主站不加载全局 WebGL 场景 |
| 可访问性 | 键盘、reduced-motion、无 JavaScript 和高对比度场景保持可用 |

## 决策

保留 Astro 7、原生 Content Collections、MDX、Tailwind CSS 4、GitHub Pages 和现有 URL。视觉层切换为 OKLCH 暖色设计令牌、纸张纹理、编辑式排版与克制的 View Transitions；Three.js 仅保留在实验详情页。新增 Vibe 内容集合、阅读进度、相关推荐和 Pagefind 静态搜索。

## 系统边界

| 上下文 | 模型与责任 | 上游 | 下游 | 关系与转换 |
| --- | --- | --- | --- | --- |
| 内容 | blog、vibes、projects 的类型安全 Frontmatter | 仓库 Markdown/MDX | 页面、RSS、搜索 | 共享内核；构建时静态读取 |
| 展示 | Astro 页面、组件、设计令牌 | 内容上下文 | 浏览器 HTML/CSS | conformist；只消费公开字段 |
| 交互 | 主题、导航、阅读进度、筛选、搜索 | 展示 DOM | 浏览器状态 | progressive enhancement；失败时保留静态内容 |
| 实验 | Three.js / Canvas 实验运行时 | playground 内容 | 独立 Canvas | separate ways；不进入主站关键渲染路径 |
| 发布 | Astro build、Pagefind、GitHub Pages | 构建产物 | 公开站点 | customer/supplier；`/abinzhao/` 路径不可破坏 |

## 备选方案

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| 降级到 Astro 5 + Velite | 拒绝 | 现有 Astro 7 内容集合已类型安全并通过测试，迁移没有当前收益 |
| 迁移 Cloudflare Pages | 拒绝 | 当前 GitHub Pages 已稳定上线，迁移会扩大部署与域名风险 |
| 保留全站 Three.js，只换颜色 | 拒绝 | 与“温暖、克制、内容优先”的设计目标冲突，并增加主站脚本成本 |
| 在现有基线上增量重构 | 接受 | 改动可验证、URL 可兼容、回滚成本最低 |

## 后果

| 正向 | 负向 |
| --- | --- |
| 首页更快表达技术定位，文章阅读不再被动态背景干扰 | 主站不再展示全局宇宙视觉 |
| 保留当前部署、内容和测试投资 | Vibe、订阅与评论仍需要持续维护真实内容和外部配置 |
| Three.js 从主站关键路径移除 | 新增 Pagefind 构建步骤 |

## 运行时依赖与降级

- Pagefind 由构建产物生成；搜索脚本加载失败时，页面保留文章与标签导航。
- 字体作为本地 npm 资源打包；失败时回退到系统衬线、无衬线和等宽字体。
- Giscus 只在仓库 Discussion 配置可验证时启用；否则不输出不可工作的评论容器。
- Three.js 只由实验页动态加载；失败时使用现有静态 fallback。

## 架构适应度函数

| 属性 | 规则 | 来源 | 频率 | 失败响应 | 检查路径 |
| --- | --- | --- | --- | --- | --- |
| 主站依赖方向 | 首页、文章、项目、关于页不加载 Three.js chunk | Playwright 网络记录 | 每次交付 | 阻断发布 | `tests/e2e/editorial-brand.spec.ts` |
| URL 兼容 | 既有公开路径返回成功或明确重定向 | Playwright | 每次交付 | 阻断发布 | `tests/e2e/smoke.spec.ts` |
| 内容真实性 | 新页面只引用仓库中已确认字段 | 内容 schema 与代码审阅 | 每次内容变更 | 删除或标记待确认 | `src/content.config.ts` |
| 可访问性 | Lighthouse Accessibility 无失败项 | Chrome DevTools | 发布前 | 阻断发布 | 生产 preview |
| 性能 | 主站无全局 WebGL，构建无 chunk 警告 | 构建日志与网络记录 | 每次交付 | 阻断发布 | `npm run build` |

## 风险

| 风险 | 可能性 | 影响 | 缓解 | 记录 |
| --- | --- | --- | --- | --- |
| 视觉切换破坏旧 E2E 假设 | 高 | 中 | 先更新行为验收，再删除纯视觉耦合断言 | Playwright 输出 |
| 搜索 base 路径错误 | 中 | 高 | 使用 `withBase()` 并在生产 preview 验证 | 网络记录 |
| 内容不足导致页面空洞 | 中 | 中 | 使用真实公开内容，空状态明确说明，不补造数据 | 内容集合 |
| 外部评论不可配置 | 中 | 低 | 配置不可验证时不启用 Giscus | GitHub 检查 |

## 重新评估触发器

当内容规模使原生 Content Collections 的构建时间或 schema 维护成为已测量瓶颈，或部署需要边缘函数时，重新评估 Velite 与 Cloudflare。当前回退成本为恢复上一提交的展示层，内容文件与公开路径不需要迁移。
