# ZJB.DEV「轨道实验室」Astro 全站重构设计

## 1. 目标

将现有 Next.js 个人网站一次性迁移为 Astro 静态站点，建立可持续增长的项目、博客与 Playground 内容架构，并以 `ZJB.DEV` 为品牌名、以“把复杂，做得有意思。”为主 Slogan。

视觉采用已确认的融合方向：

- 以“轨道实验室”的暖色星体、贴纸感和彩蛋交互形成品牌记忆。
- 以“光谱档案”的大字号编辑排版、网格和留白维持专业度。
- 整体约为 70% 编辑秩序、30% 实验趣味。
- 装饰集中在首页和 Playground，项目与博客内容保持清晰、克制、可阅读。

## 2. 已确认决策

| 项目 | 决策 |
|---|---|
| 站点语言 | 全站纯中文 |
| 品牌名 | `ZJB.DEV` |
| 主 Slogan | 把复杂，做得有意思。 |
| 视觉方向 | 轨道实验室 × 光谱排版 |
| 框架 | Astro SSG + TypeScript |
| 内容系统 | Astro Content Collections + Markdown/MDX |
| 3D | 原生 Three.js，按需加载 |
| 动画 | GSAP + ScrollTrigger，CSS 负责简单状态动画 |
| 样式 | Tailwind CSS + CSS 变量设计令牌 |
| 博客分类 | 技术、随笔、折腾 |
| Playground | 首批实现粒子银河、Shader 艺术、物理模拟 |
| 联系方式 | 合并到 `/about#contact` |
| 旧路由 | 保留静态兼容跳转 |
| 声音 | 不加入音效或 BGM |
| 部署 | GitHub Pages + GitHub Actions |

## 3. 现状与迁移边界

### 3.1 当前事实

- 当前仓库使用 Next.js App Router、React、MDX 和静态导出。
- 已有 5 个公开项目、1 篇公开文章、RSS、Sitemap、Robots 和 GitHub Pages 工作流。
- 已有可复用的 Three.js 星体场景、主题切换、文章目录和响应式测试。
- 当前公开资料包含姓名、GitHub、掘金、技术方向和公开仓库信息。

### 3.2 必须保留

- 已公开项目与文章正文。
- GitHub 和掘金公开入口。
- 明暗主题、系统偏好跟随和手动选择持久化。
- RSS、Sitemap、Robots、canonical 和 GitHub Pages 静态部署。
- `prefers-reduced-motion`、键盘操作、移动端降级和无横向溢出约束。

### 3.3 不迁移

- Next.js、React、`next-mdx-remote` 及其运行时边界。
- `/contact` 独立内容页。
- 旧的 `/work`、`/writing` 作为主路由。
- 未被新架构使用的旧组件、样式和测试。
- 本地路径、环境配置细节、代理执行状态和内部设计过程文件到公开 README。

### 3.4 真实性边界

- 不新增未经公开证据确认的公司、任职年份、工作年限、客户、收益、性能数据或项目截图。
- 缺少封面时使用品牌化 CSS 图形，不伪造产品界面。
- 不展示没有数据源的阅读量、点赞量、评论数或下载量。
- 邮箱、微信等未确认联系方式不进入公开页面。

## 4. 信息架构

```text
/                         首页
/about                    关于、技能、联系
/projects                 项目列表
/projects/[slug]          项目详情
/blog                     博客列表
/blog/[slug]              文章详情
/blog/archive             文章归档
/playground               实验室入口
/playground/[slug]        实验详情与交互 Demo
/tags                     标签聚合
/404                      自定义 404
```

### 4.1 旧路由兼容

静态导出不依赖服务端重定向。以下旧路径生成带 canonical 的轻量兼容页，通过 `<meta http-equiv="refresh">` 和可见链接跳转：

| 旧路径 | 新路径 |
|---|---|
| `/work` | `/projects` |
| `/work/[slug]` | `/projects/[slug]` |
| `/writing` | `/blog` |
| `/writing/[slug]` | `/blog/[slug]` |
| `/contact` | `/about#contact` |

兼容页必须提供可见说明和手动跳转链接，JavaScript 禁用时仍可导航。

## 5. Astro 架构

### 5.1 目录结构

```text
src/
├── assets/
├── components/
│   ├── global/
│   ├── home/
│   ├── projects/
│   ├── blog/
│   └── playground/
├── content/
│   ├── projects/
│   ├── blog/
│   └── playground/
├── layouts/
│   ├── BaseLayout.astro
│   ├── ContentLayout.astro
│   └── ExperimentLayout.astro
├── lib/
│   ├── content/
│   ├── seo/
│   └── theme/
├── pages/
├── scripts/
│   ├── theme.ts
│   ├── navigation.ts
│   └── transitions.ts
└── styles/
    ├── tokens.css
    ├── base.css
    ├── components.css
    └── utilities.css
```

### 5.2 渲染原则

- 默认输出静态 HTML。
- 主题切换、筛选、移动菜单优先使用小型原生脚本，不引入 React 岛屿。
- Three.js、GSAP 和实验运行时只在对应页面动态导入。
- 博客详情页不加载 Three.js、tsParticles 或 Playground 代码。
- 无 JavaScript 时，内容、导航、详情页和兼容跳转仍可使用。

### 5.3 依赖边界

- Astro 负责路由、构建、内容集合和静态输出。
- Three.js 只存在于首页 Hero 和 Playground 实验边界。
- GSAP 只在需要滚动编排的页面加载。
- tsParticles 只用于适合其能力的背景粒子，不承担粒子组字。
- 粒子组字和 Shader 使用自定义 Canvas/WebGL，实现可控的加载与降级。

## 6. 内容模型

所有集合在 `src/content.config.ts` 中使用 Zod 校验。文件名与 `slug` 必须一致，草稿不进入生产构建列表。

### 6.1 项目集合

```yaml
title: "项目名称"
slug: "project-slug"
summary: "一句话摘要"
category: "harmonyos"
tags: ["ArkTS", "ArkUI"]
year: 2026
status: "completed"
repositoryUrl: "https://github.com/..."
externalUrl: "https://..."
cover: "./cover.webp"
featured: true
order: 10
draft: false
```

约束：

- `category`：`web | backend | harmonyos | miniprogram | crossplatform | experiment`
- `status`：`completed | ongoing | archived`
- `repositoryUrl`、`externalUrl`、`cover` 可选。
- 排序先按 `featured`，再按 `order`，最后按 `year` 和标题。
- 现有项目没有可靠年份时，不为迁移强制补造年份；Schema 允许 `year` 可选。

### 6.2 博客集合

```yaml
title: "文章标题"
slug: "article-slug"
date: 2026-08-11
updatedAt: 2026-08-11
category: "技术"
subcategory: "鸿蒙开发"
tags: ["ArkTS", "Stage模型"]
cover: "./cover.webp"
summary: "一句话摘要"
draft: false
```

约束：

- 一级分类固定为 `技术 | 随笔 | 折腾`。
- 二级分类和标签为非空字符串，可随内容扩展。
- `updatedAt`、`subcategory`、`cover` 可选。
- 列表按 `date` 倒序。
- 构建时计算预计阅读时间，不写回源文件。

### 6.3 Playground 集合

```yaml
title: "粒子银河"
slug: "particle-galaxy"
description: "实验说明"
tech: ["Three.js", "GLSL", "WebGL"]
preview: "./preview.webp"
date: 2026-08-11
featured: true
githubUrl: "https://github.com/..."
draft: false
```

约束：

- `preview`、`githubUrl` 可选。
- Demo 组件由受控的 `slug → loader` 映射加载，不从 frontmatter 执行任意模块路径。
- 内容文件负责说明，实验组件负责交互，两者边界独立。

## 7. 品牌与视觉系统

### 7.1 品牌表达

- 主标：`ZJB.DEV`
- 中文身份：赵建斌 / 开发者与实验者
- 主 Slogan：把复杂，做得有意思。
- 辅助短句：项目、文章与技术实验，都从真实问题开始。
- 贴纸文案：`BUILD · BREAK · LEARN`

英文只作为品牌符号、技术名词和短标签，页面主体内容保持中文。

### 7.2 色彩

| 语义 | 深色 | 浅色 |
|---|---|---|
| 主背景 | `#080914` | `#FAFAF7` |
| 次级背景 | `#10121E` | `#F1F0EB` |
| 主文字 | `#F4F2FF` | `#171722` |
| 正文 | `#BBB7CA` | `#4B4B5A` |
| 暖色主体 | `#FF7653` | `#E95735` |
| 柠檬强调 | `#F5CF64` | `#B48100` |
| 轨道蓝紫 | `#7C6DFF` | `#5D50D8` |
| 成功/信号 | `#72E6B1` | `#167A50` |

颜色通过 CSS 语义变量管理。正文、按钮、链接和焦点状态满足 WCAG AA。

### 7.3 字体

- 展示标题：优先使用有中文覆盖的衬线字体组合，形成编辑感。
- 正文：使用可靠的中文无衬线系统字体栈，保证加载和阅读。
- 品牌、标签和代码：使用等宽系统字体栈。
- 不从不明确来源加载字体，不依赖本地专有字体。

### 7.4 布局

- 桌面内容最大宽度 `1200px`，Hero 可扩展到 `1440px`。
- 桌面采用 12 栏网格，首页允许局部越界和叠层。
- 正文最大宽度 `800px`。
- 基准圆角：卡片 `16px`，浮层和 Hero `24–28px`，按钮 `12px` 或胶囊形。
- 基准触控尺寸不小于 `44px`。

## 8. 页面设计

### 8.1 首页

页面顺序：

1. 全屏 Hero。
2. 精选项目。
3. 最新博客。
4. Playground 预览。
5. 关于与联系引导。

Hero：

- 左侧使用编辑式超大标题“把复杂，做得有意思。”
- 右侧使用暖色星体、蓝紫轨道和粒子场。
- 粒子从散乱状态汇聚出品牌标识后进入常驻场景，总时长 1–2 秒。
- 鼠标和触摸产生受限力场，不移动正文。
- 首屏底部提供关于、项目、博客、实验室四个快速入口。
- 向下滚动时，镜头轻微推进并将视觉焦点交给内容区。

### 8.2 关于页

- 轻松但可信的中文介绍。
- 技术栈按前端、后端、鸿蒙、小程序、跨端、工具分组。
- 经历时间线仅在有可靠公开资料后添加；本次不补造经历。
- 联系区域固定为 `#contact`，展示 GitHub、掘金和其他已确认入口。
- 彩蛋为低风险装饰交互，不改变导航或主要信息。

### 8.3 项目页

- 精选项目使用大卡片，普通项目使用响应式网格。
- 分类由真实 frontmatter 自动生成，不显示空分类。
- 当前项目数量不启用搜索、分页或无限滚动；达到明确阈值后再增加。
- 卡片支持鼠标倾斜，但键盘和触摸用户获得等价的边框、位移和文字状态。
- 详情页按问题、约束、职责、取舍、结果和公开链接组织真实内容。

### 8.4 博客页

- 一级分类、二级分类、标签和时间排序均来自内容集合。
- 筛选状态可写入 URL 查询参数，刷新和分享后可恢复。
- 分类或标签不足时隐藏无效筛选控件。
- 文章详情提供 TOC、代码高亮、预计阅读时间、上一篇/下一篇和标签链接。
- `/blog/archive` 按年月分组。
- 正文区域不运行粒子、视差或持续背景动画。

### 8.5 Playground

入口为实验卡片墙，预览图在可见和允许运动时播放；否则展示静态首帧。

首批实验：

1. **粒子银河**：Three.js 粒子系统、自定义点材质、鼠标/触摸引力场、缩放与暂停。
2. **Shader 艺术**：全屏片元 Shader，可调色彩、噪声尺度和时间速度，提供静态降级图。
3. **物理模拟**：轻量刚体或 Verlet 粒子模拟，支持拖拽、重置和重力开关；不引入重量级物理引擎，除非实现阶段验证必要。

详情布局：

- 桌面端说明与 Demo 分栏。
- 移动端先展示说明和控制，再展示受限高度的 Demo。
- 每个实验可独立分享，显示技术标签、控制说明、性能状态和源码入口（存在时）。

### 8.6 404

- 主题为“信号丢失 / 粒子黑洞”。
- 提供返回首页、项目、博客和实验室入口。
- reduced-motion 或 WebGL 不可用时使用静态黑洞图形。

## 9. 全局组件

| 组件 | 职责 |
|---|---|
| `SiteHeader` | 固定导航、滚动收缩、移动端全屏菜单 |
| `ThemeToggle` | 系统主题、手动切换、持久化 |
| `BrandMark` | `ZJB.DEV` 文字标与信号点 |
| `HeroScene` | 首页粒子汇聚、暖色星体与轨道 |
| `PageTransition` | View Transitions 优先，GSAP 渐变降级 |
| `Reveal` | 可复用的进入动画和 reduced-motion 降级 |
| `ProjectCard` | 项目信息与受限 3D 倾斜 |
| `BlogCard` | 文章分类、摘要、日期和标签 |
| `ExperimentCard` | 静态/动态预览、技术标签 |
| `BackToTop` | 返回顶部和受限粒子拖尾 |
| `Footer` | 社交入口、版权、技术栈短句 |

Footer 文案使用“用好奇心、Astro 和 Three.js 构建”，避免将爱心符号作为唯一语义。

## 10. 动效与性能

### 10.1 动效规则

- 主要动画只使用 `transform`、`opacity` 和 GPU 渲染属性。
- 页面转场优先使用 View Transitions API，不支持时使用短暂淡入淡出。
- GSAP ScrollTrigger 只注册当前页面需要的触发器，并在页面离开时完整清理。
- Hover 效果不承载唯一信息。
- 首屏加载动画只在首次会话展示；同一会话内路由切换不重复播放完整聚合。

### 10.2 设备分级

| 设备 | 粒子与帧率 |
|---|---|
| 桌面 | 完整粒子密度，目标 60fps，DPR 上限 1.75 |
| 平板 | 中等粒子密度，目标 45–60fps，DPR 上限 1.5 |
| 移动端 | 600–1000 粒子，目标 30fps，DPR 上限 1.5 |
| reduced-motion | 静态画面，不启动持续动画循环 |

场景离开视口、页面隐藏或标签页失焦时暂停；恢复可见后继续。初始化失败时显示 CSS/Canvas 静态品牌图。

### 10.3 加载边界

- 首屏文字和导航不等待 3D。
- Three.js 动态块不进入博客和普通项目详情包。
- 图片通过 Astro Assets 生成 WebP/AVIF、`srcset`、明确尺寸和懒加载。
- 首屏必要资源预加载，其余资源延迟加载。

## 11. SEO 与公开仓库描述

### 11.1 SEO

- 每页独立 `title`、`description`、canonical、Open Graph 和 Twitter Card。
- 首页输出 `Person` JSON-LD。
- 博客详情输出 `BlogPosting` JSON-LD。
- 项目详情输出 `CreativeWork` 或 `SoftwareSourceCode` JSON-LD。
- 自动生成 Sitemap 和 RSS。
- 标签、归档和分页页面使用稳定 canonical。
- 旧兼容页指向新路径 canonical，避免重复收录。

### 11.2 README

README 重写为公开个人主页说明：

- 品牌名、Slogan 和站点定位。
- 项目、博客、实验室三个公开入口。
- 简短技术概览和站点链接。
- 内容真实性与隐私边界说明。

README 不展示：

- 本地绝对路径。
- 环境变量明细和内部构建排障过程。
- 代理工具、执行计划、个人设备信息。
- 未确认的邮箱、微信、公司、履历和指标。

GitHub 仓库 Description 建议为：

> ZJB.DEV：赵建斌的项目、技术文章与创意代码实验室。

仓库 Topics 建议为：`personal-website`、`astro`、`threejs`、`harmonyos`、`frontend`、`creative-coding`。

## 12. 异常与降级

| 场景 | 行为 |
|---|---|
| WebGL 不可用 | 静态品牌星体，不影响内容和导航 |
| JS 禁用 | 静态内容、链接和兼容跳转可用 |
| reduced-motion | 停止粒子、视差、滚动推进和卡片位移 |
| 内容集合校验失败 | 构建失败并指出文件与字段 |
| 分类为空 | 不渲染对应筛选项 |
| 图片缺失 | 使用品牌化 CSS 图形 |
| localStorage 不可用 | 使用系统主题，不抛页面错误 |
| View Transitions 不支持 | 使用无位移淡入淡出 |
| 实验运行时失败 | 保留说明、错误状态、重试和返回入口 |

## 13. 测试与验收

### 13.1 自动化

- 内容 Schema、排序、分类、标签和上一篇/下一篇单元测试。
- 旧路由兼容页和 canonical 测试。
- 主题初始化、移动导航和筛选交互测试。
- Playground 三个实验的初始化、暂停、恢复、清理和降级测试。
- RSS、Sitemap、Robots、JSON-LD 和静态输出测试。
- Playwright 覆盖 `1440px`、`900px`、`390px`。

### 13.2 无障碍

- 键盘完整访问导航、筛选、主题切换、实验控制和返回顶部。
- 焦点状态清晰，不只依赖颜色或发光。
- 正文和控件达到 WCAG AA 对比度。
- 装饰性 Canvas、粒子和轨道从辅助技术树隐藏。
- 移动端触控目标不小于 `44px`。

### 13.3 Chrome DevTools

最终验收检查：

- 控制台无应用错误。
- 网络无意外 4xx/5xx。
- 首页 3D 动态块按需加载。
- 博客详情不加载 Three.js。
- Canvas 尺寸、DPR 和暂停逻辑正确。
- 无明显 CLS、横向溢出或主线程长任务。
- Lighthouse 性能、可访问性、最佳实践和 SEO 不出现阻断级问题。

### 13.4 完成标准

- Astro 构建产生完整 GitHub Pages 静态产物。
- 所有新主路由和旧兼容路由可访问。
- 首页品牌、项目、博客、Playground、关于和联系均使用真实内容。
- 三个 Playground 实验均可交互且有移动端/reduced-motion 降级。
- README 与仓库描述不暴露本地或未确认信息。
- 自动化测试、Lint、构建、E2E 和浏览器验收全部通过。

## 14. 实施顺序

1. Astro 基础工程、Tailwind、测试和 GitHub Pages。
2. 内容集合 Schema 与现有项目/文章迁移。
3. 全局布局、主题、导航、Footer、SEO。
4. 首页 Hero 与视觉系统。
5. 项目列表、详情和旧 `/work` 兼容。
6. 博客列表、详情、归档、标签、RSS 和旧 `/writing` 兼容。
7. Playground 框架与三个实验。
8. About 联系区、旧 `/contact` 兼容和 404。
9. 动效、响应式、无障碍和性能收敛。
10. README、仓库公开描述建议、静态产物与 Chrome DevTools 验收。

每一步都必须保持可构建，并使用测试先行保护内容真实性、路由兼容和降级行为。
