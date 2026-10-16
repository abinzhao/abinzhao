# 全站空间压缩与本地 AI 增强 · 技术方案（plan）

## 技术决策摘要

- **仓库归属**：`abinzhao`，当前 Git 根目录已现场核实；下文统一使用 `code/abinzhao/` 逻辑路径。
- **前端栈**：VitePress 1.6.4、Vue 3.5、TypeScript 5.9、原生 HTML 控件、`@lucide/vue`。
- **组件库裁决**：项目没有 `components.json` 或第三方 UI 组件库；继续复用现有 Vue 组件、原生 `<dialog>`、按钮样式与 Lucide 图标，不引入新 UI 组件库。
- **本地问答**：采用“构建期章节索引 + 浏览器全文检索 + 确定性意图/上下文/置信度管线”，不运行任何大模型。
- **Markdown 解析**：复用 VitePress 官方 `createMarkdownRenderer()` 与其 token 流，保证章节锚点、重复标题去重和站点渲染一致，不新增 Markdown 解析依赖。
- **全文检索**：将 VitePress 已使用的传递依赖 `minisearch@7.2.0` 提升为项目直接依赖；MIT 许可，运行时仅在问答页按需加载。
- **浏览器回归**：新增 `@playwright/test` 作为开发依赖，仅用于布局、交互和网络边界测试，不进入生产包。
- **数据边界**：问答只消费 44 篇已发布文章；5 个列表或专题索引 Markdown 不作为事实语料。

## 灰度方案

### 需求级前端灰度

| 控制方 | 灰度 key | 默认策略 | 确认来源 | 覆盖 Feature | 说明 |
|---|---|---|---|---|---|
| 无需灰度 | 不适用 | 静态站一次性替换 | 用户回复“全部按推荐” | 全部 Feature | 不保留旧模型请求路径，不新增 localStorage 开关或远程 feature flag；异常通过 Git 回滚 |

### 例外 Feature

无。测试和文档与对应功能同步发布，不建立独立控制入口。

### 子应用落地约束

| 子应用 / 端 | 统一判断入口 | 覆盖 Feature | 仓库现有习惯依据 |
|---|---|---|---|
| VitePress 静态站 / 桌面与移动 Web | 无 | 全部 | 当前站点无灰度基础设施，所有页面由同一静态构建产物发布 |

## 组件与依赖裁决

| 类型 | 裁决 | 影响 |
|---|---|---|
| 紧凑页面栏 | 新建 `CompactPageHeader.vue` | 仅供博客、专题索引、项目页复用，避免三份标题 DOM 和响应式规则继续分叉 |
| 问答历史 | 新建 `ChatSessionList.vue` | 桌面侧栏和移动 `<dialog>` 共用同一列表与事件协议 |
| 快捷动作 | 新建 `ChatQuickActions.vue` | 统一承载五类问答动作、随机探索和 15 分钟学习任务 |
| 结构化回答 | 新建 `ChatAnswer.vue` | 按回答块渲染证据、步骤、对比和澄清项，不使用 `v-html` |
| 文章问答入口 | 新建 `ArticleAskMenu.vue` | 阅读头部复用一个紧凑菜单，避免增加说明卡片 |
| 全文检索 | 直接依赖 `minisearch@^7.2.0` | 当前已由 VitePress传递安装；提升为直接依赖后才能从业务代码稳定导入 |
| Markdown 解析 | 复用 VitePress `createMarkdownRenderer()` | 无新增依赖；仅在构建期运行 |
| E2E | 开发依赖 `@playwright/test` | 只用于 Chromium 桌面/移动回归与网络断言，不增加生产体积 |

## 需求梳理

### [Story 1] 全站顶部空间压缩

## Feature 1.1: 压缩全局导航占用（仓库: abinzhao）

### 变更摘要

将全局导航统一为 56px 视觉高度，保持 44px 触控目标、完整一级导航和移动折叠菜单。落点覆盖全站。

### 涉及文件

| 文件 | 改动 | 原因 |
|---|---|---|
| `code/abinzhao/docs/.vitepress/theme/components/SiteHeader.vue` | 为菜单按钮增加 `aria-controls`，移动导航增加稳定 `id`，在 header 范围监听 Escape | 补齐折叠菜单的键盘与语义关系 |
| `code/abinzhao/docs/.vitepress/theme/styles/tokens.css` | 新增 `--site-nav-height: 56px`、`--site-touch-target: 44px`、`--site-page-top: 28px`、`--site-anchor-offset: 88px` | 统一导航、页顶和锚点密度基线 |
| `code/abinzhao/docs/.vitepress/theme/styles/base.css` | 设置全局 `scroll-padding-top` | 防止 sticky 导航遮挡深链接标题 |
| `code/abinzhao/docs/.vitepress/theme/styles/site.css` | 收紧 frame、品牌图标、导航间距和移动菜单间距 | 降低顶部占用且不缩小触控目标 |
| `code/abinzhao/tests/e2e/layout-density.e2e.ts` | 增加多视口导航高度、溢出和菜单键盘测试 | 将视觉目标转成可观察断言 |

### 接口与状态

- 接口：无。
- 状态：沿用 `mobileMenuOpen` 和现有主题状态，不新增持久状态。

### 灰度归属

- **归属**：无需灰度。
- **说明**：纯静态导航 DOM 与 CSS 调整，用户已确认一次性替换。
- **接入点**：无。

### 组件

- 引用：`SiteHeader.vue`、`ThemeToggle.vue`、现有主导航配置。
- 新建：无。

### 样式规范

- 桌面与移动 `.site-header__frame` 高度均为 56px。
- 可交互元素最小尺寸统一使用 `--site-touch-target: 44px`。
- `>1100px` 展示完整导航；`<=1100px` 使用折叠菜单；`<=640px` 保持两列移动菜单。
- 桌面 frame 水平内边距 16px，移动端 12px。
- 阅读进度条保持 `z-index: 60`，导航保持 `z-index: 40`。

### 交互与边界

1. Tab 顺序保持品牌、一级导航、GitHub、主题、菜单按钮。
2. Escape 在移动菜单内部任意焦点位置关闭菜单并把焦点还给菜单按钮。
3. 路由变化继续自动关闭菜单。
4. 不改变链接、主题状态和 `aria-current` 判定。
5. 1440、1100、800、390px 宽度下导航不超过 56px，`scrollWidth === innerWidth`。

---

## Feature 1.2: 将列表页大标题区收敛为紧凑页面栏（仓库: abinzhao）

### 变更摘要

博客、专题教程和开源项目统一使用紧凑页面栏，使筛选与真实内容提前进入首屏。

### 涉及文件

| 文件 | 改动 | 原因 |
|---|---|---|
| `code/abinzhao/docs/.vitepress/theme/components/CompactPageHeader.vue` | 新建 `eyebrow`、`title`、`description`、`stats` props 与上下文链接 slot | 统一三类列表页的标题语义和密度 |
| `code/abinzhao/docs/.vitepress/theme/pages/BlogIndexPage.vue` | 用紧凑页面栏替换现有 `listing-header` | 消除重复 DOM 并前移筛选区 |
| `code/abinzhao/docs/.vitepress/theme/pages/ColumnsIndexPage.vue` | 用紧凑页面栏替换现有 `listing-header` | 与博客页共享页面身份结构 |
| `code/abinzhao/docs/.vitepress/theme/pages/ProjectsPage.vue` | 用紧凑页面栏替换现有 `listing-header` | 保留项目统计并降低顶部高度 |
| `code/abinzhao/docs/.vitepress/theme/styles/site.css` | 新增 `.compact-page-header`，收紧筛选区和列表前距 | 落实桌面与移动密度指标 |
| `code/abinzhao/tests/e2e/layout-density.e2e.ts` | 增加首卡坐标、唯一 `h1` 和筛选功能断言 | 防止后续标题区重新膨胀 |

### 接口与状态

- 接口：无。
- 状态：分类、查询、项目分类状态保持现状。

### 灰度归属

- **归属**：无需灰度。
- **说明**：共享组件只统一现有静态结构，不改变列表数据和筛选模型。
- **接入点**：无。

### 组件

- 引用：现有筛选按钮、搜索框、Lucide 图标。
- 新建：`CompactPageHeader.vue`。

### 样式规范

- 桌面标题 30px，移动标题 28px，字距保持 0。
- 标题与统计在桌面同一基线；说明和上下文入口位于第二行。
- `<=640px` 隐藏补充说明，只保留标题、主统计和上下文入口。
- 页栏底部间距 12px；筛选区垂直内边距由 18px 收紧为 12px。
- 按钮和搜索框继续保持 44px 高。

### 交互与边界

1. `stats` 中只有标记 `mobilePrimary` 的统计在移动端显示。
2. 三个页面各保留唯一可见 `h1`。
3. 不改变分类、搜索、排序和项目外链行为。
4. 1440×900 下博客首卡顶部 `y <= 300px`。
5. 390×844 下博客首卡顶部 `y <= 400px`。

---

## Feature 1.3: 压缩专题详情与文章阅读头部（仓库: abinzhao）

### 变更摘要

合并文章元数据和专题统计，降低阅读正文及章节目录前的纵向层级。落点为专题详情与全部文章页。

### 涉及文件

| 文件 | 改动 | 原因 |
|---|---|---|
| `code/abinzhao/docs/.vitepress/theme/pages/ColumnPage.vue` | 合并状态/章节元数据，章节目录紧随头部 | 让真实学习内容提前出现 |
| `code/abinzhao/docs/.vitepress/theme/pages/ArticlePage.vue` | 将分类、日期、系列、标签合并为紧凑元数据行，移除重复技术标签行 | 降低标题区高度 |
| `code/abinzhao/docs/.vitepress/theme/styles/base.css` | 使用统一锚点偏移 | 深链接不被 sticky 导航遮挡 |
| `code/abinzhao/docs/.vitepress/theme/styles/site.css` | 收紧面包屑、阅读头部、专题头部和正文前距 | 达成正文坐标目标 |
| `code/abinzhao/tests/e2e/layout-density.e2e.ts` | 增加正文坐标、深链接和重复 `h1` 断言 | 固化阅读体验 |

### 接口与状态

- 接口：无。
- 状态：保留阅读进度、目录标题和当前章节状态。

### 灰度归属

- **归属**：无需灰度。
- **说明**：只调整静态阅读布局及滚动偏移，不改变内容源与路由协议。
- **接入点**：无。

### 组件

- 引用：`ArticlePage.vue`、`ColumnPage.vue`、VitePress `Content`。
- 新建：无；文章与专题语义不同，不建立强制共享头部组件。

### 样式规范

- 文章面包屑底部间距 8px。
- 文章标题桌面上限 36px，移动端 29px。
- 摘要桌面最多两行，移动端最多一行；完整文本仍在 DOM 中。
- 阅读头部底部间距 16px。
- 专题状态、章节数、阅读顺序合并为单行元数据，删除重复状态统计。
- 正文 `h2/h3` 使用 `scroll-margin-top: var(--site-anchor-offset)`；目录激活偏移统一为 88px。

### 交互与边界

1. 保留面包屑、文章目录、上一篇/下一篇和专题章节链接。
2. 保留 `.reading-prose h1 { display: none }`，正文不重复显示 Markdown H1。
3. 长标题自然换行，不使用固定高度截断。
4. 1440×900 下文章正文顶部 `y <= 320px`。
5. 390×844 下文章正文顶部 `y <= 380px`。

---

## Feature 1.4: 首页、关于页和异常页按内容属性做最小压缩（仓库: abinzhao）

### 变更摘要

保留首页品牌 Hero 与关于资料卡的内容职责，仅压缩顶部和模块间距；404 页同步降低无效留白。

### 涉及文件

| 文件 | 改动 | 原因 |
|---|---|---|
| `code/abinzhao/docs/.vitepress/theme/styles/site.css` | 收紧首页 Hero、关于资料卡、后续区块和 404 间距 | 在不改内容顺序的前提下提高首屏密度 |
| `code/abinzhao/tests/e2e/layout-density.e2e.ts` | 增加模块露出、CTA 遮挡和横向溢出断言 | 验证首屏与悬浮入口关系 |

### 接口与状态

- 接口：无。
- 状态：无新增状态。

### 灰度归属

- **归属**：无需灰度。
- **说明**：仅收紧既有页面 CSS，内容和导航不变化。
- **接入点**：无。

### 组件

- 引用：`HomePage.vue`、`AboutPage.vue`、`Layout.vue` 现有 DOM。
- 新建：无。

### 样式规范

- 首页 Hero 桌面内边距 `28px 0 24px`，移动端 `20px 0 24px`。
- 状态行底部 12px，简介块底部 14px，说明与行动区使用 10px/16px 节奏。
- 关于资料卡桌面顶部 28px、内边距 24px；移动端顶部/内边距均 20px。
- 关于 bio 垂直内边距 16px，后续模块间距 36px。
- 404 垂直内边距桌面 56px、移动 40px。

### 交互与边界

1. 不改变首页、关于页的内容顺序、链接和按钮语义。
2. 移动 CTA 自然换行并保持 44px 触控高度。
3. 1440×900 首页同时显示主要行动区和模块索引起始位置。
4. 390px 下首页 CTA 不与悬浮问答入口相交。

---

### [Story 2] 完全本地的知识问答引擎

## Feature 2.1: 建立章节级本地知识语料（仓库: abinzhao）

### 变更摘要

构建期把 44 篇已发布文章解析为带真实章节锚点的知识块，并将索引元数据与正文语料拆分输出。

### 涉及文件

| 文件 | 改动 | 原因 |
|---|---|---|
| `code/abinzhao/docs/.vitepress/data/content.ts` | 导出统一的已发布文章源加载器，公开数据继续只返回轻量 `ContentIndex` | 让页面索引与知识语料共用草稿过滤、路由和元数据真相源 |
| `code/abinzhao/docs/.vitepress/data/knowledge.ts` | 新增纯共享类型、tokenizer 和 MiniSearch 配置 | 构建端与浏览器使用同一数据契约 |
| `code/abinzhao/docs/.vitepress/data/knowledge-build.ts` | 新增 Markdown token 解析、知识切块、阅读时长和构建缓存 | 将 Node/VitePress 构建逻辑隔离出客户端 |
| `code/abinzhao/docs/.vitepress/data/knowledge-index.data.ts` | 新增索引 data loader | 输出序列化索引与轻量元数据 |
| `code/abinzhao/docs/.vitepress/data/knowledge-corpus.data.ts` | 新增正文 data loader | 正文仅在首次有效查询时加载 |
| `code/abinzhao/tests/content-index.test.ts` | 验证公开索引不泄漏 Markdown 正文或本地路径 | 保持现有页面包轻量 |
| `code/abinzhao/tests/knowledge-corpus.test.ts` | 新增草稿过滤、锚点、节点切块、代码降权和阅读时长测试 | 保证语料可信可跳转 |

### 接口与状态

- 接口：无网络接口。
- 构建数据：

```ts
interface KnowledgeBlock {
  id: string;
  documentId: string;
  href: string;
  articleTitle: string;
  description?: string;
  column?: string;
  sectionTitle?: string;
  anchor?: string;
  kind: 'summary' | 'paragraph' | 'list' | 'blockquote' | 'code';
  publishedAt: string;
  seriesOrder?: number;
  readingMinutes: number;
  tags: string[];
  text: string;
  codeTerms: string[];
}

interface KnowledgeIndexArtifact {
  version: 1;
  index: AsPlainObject;
  metadata: Record<string, Omit<KnowledgeBlock, 'text' | 'codeTerms'>>;
}

interface KnowledgeCorpusArtifact {
  version: 1;
  blocks: Record<string, Pick<KnowledgeBlock, 'text' | 'codeTerms'>>;
}
```

### 灰度归属

- **归属**：无需灰度。
- **说明**：静态构建数据只供新本地问答使用，无线上数据迁移。
- **接入点**：无。

### 组件

- 引用：VitePress `createMarkdownRenderer()`、现有 `gray-matter`、统一文章源加载器。
- 新建：无 UI 组件。

### 样式规范

不适用。

### 交互与边界

1. `knowledge-build.ts` 对 `matter.content` 执行 `md.parse(content, env)`，从 `heading_open.attrGet('id')` 读取 VitePress 真实锚点。
2. 按完整 paragraph、list、blockquote、fence 节点聚合，不从节点中间截断。
3. 与 frontmatter 标题相同的 H1 不重复建块。
4. fenced code 只提取技术标识符到 `codeTerms`，不作为主要事实回答。
5. HTML、组件属性、脚本和样式节点不进入回答正文。
6. 两个 data loader 复用模块级构建 Promise，单次构建只扫描和解析一遍 Markdown。
7. 草稿、无标题或无发布日期的文件不进入知识语料。

---

## Feature 2.2: 提升中英文混合检索与排序精准度（仓库: abinzhao）

### 变更摘要

使用 MiniSearch 构建本地全文索引，加入中英文 token、字段权重、受控同义词、短语加权和结果多样性重排。

### 涉及文件

| 文件 | 改动 | 原因 |
|---|---|---|
| `code/abinzhao/package.json` | 直接声明 `minisearch@^7.2.0` | pnpm 严格依赖下业务代码不能稳定导入传递依赖 |
| `code/abinzhao/pnpm-lock.yaml` | 由 pnpm 更新 importer | 锁定可复现依赖图 |
| `code/abinzhao/docs/.vitepress/data/knowledge.ts` | 定义中英文 tokenizer、字段配置、停用词和稳定同义词 | 构建与查询共享规则 |
| `code/abinzhao/docs/.vitepress/data/knowledge-build.ts` | 构建 MiniSearch 并保存 `toJSON()` | 避免浏览器首次查询现场建索引 |
| `code/abinzhao/docs/.vitepress/theme/composables/knowledge-search.ts` | 新增异步加载、查询扩展、重排、去重和检索置信度 | 把搜索职责从页面和回答逻辑中分离 |
| `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue` | 动态加载索引；首次有效查询再加载正文 | 不影响其他页面首包 |
| `code/abinzhao/tests/fixtures/knowledge-eval.ts` | 新增固定查询、预期来源和站外问题 | 支撑可重复指标 |
| `code/abinzhao/tests/knowledge-search.test.ts` | 新增排序、同义词、模糊匹配、去重、Recall/MRR 和性能测试 | 验证精准度目标 |
| `code/abinzhao/tests/site-build.test.ts` | 验证索引/正文独立分包及 gzip 体积 | 防止正文进入公共 bundle |

### 接口与状态

- 接口：同源静态模块动态导入，不发起跨域数据请求。
- 状态：

```ts
type KnowledgeLoadState = 'idle' | 'loading-index' | 'ready' | 'loading-corpus' | 'error';
```

### 灰度归属

- **归属**：无需灰度。
- **说明**：用户已确认直接替换旧检索，索引随静态站发布。
- **接入点**：无。

### 组件

- 引用：`MiniSearch.loadJSONAsync()`。
- 新建：无 UI 组件。

### 样式规范

不适用。

### 交互与边界

1. 字段权重固定为：文章标题 8、章节标题 6、标签 5、摘要 3、正文 1、代码标识符 0.25。
2. 中文连续文本生成二元 token；英文技术词和 `C++`、`box-sizing`、`AbortController` 等标识符保持完整。
3. 英文长度至少 5 时启用 `fuzzy: 0.2`；前缀匹配只作用于英文技术词。
4. 同义词只在查询期扩展，扩展词权重为原词 0.65；完整短语命中追加 25%。
5. 先取 40 个候选，再按短语、字段和词项覆盖率重排；Top-8 中同一文章最多两个块，同一章节只保留最高分块。
6. 检索置信度固定为 `0.5 × raw/(raw + 8×queryTerms) + 0.4 × termCoverage + 0.1 × phraseMatch`。
7. 空查询、仅停用词或无有效 token 直接返回空结果。
8. 固定评测集要求 Top-3 Recall `>=85%`、MRR `>=0.75`；首次 P95 `<=150ms`，热查询 P95 `<=50ms`。

---

## Feature 2.3: 本地意图识别与结构化回答（仓库: abinzhao）

### 变更摘要

新增六类确定性意图分类和证据块回答器，回答只由固定模板、站内标题、标签和原文摘录组成。

### 涉及文件

| 文件 | 改动 | 原因 |
|---|---|---|
| `code/abinzhao/docs/.vitepress/theme/composables/local-assistant.ts` | 新增规范化、意图分类、实体提取和结构化回答 | 集中本地助手核心规则 |
| `code/abinzhao/docs/.vitepress/theme/components/ChatAnswer.vue` | 按 paragraph/list/comparison/steps/clarification 块渲染 | 不解析任意 Markdown，不使用 `v-html` |
| `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue` | 调用统一 `answerQuestion()` 并保存结构化结果 | 页面只负责交互编排 |
| `code/abinzhao/tests/fixtures/chat-corpus.ts` | 新增固定章节、冲突证据和来源夹具 | 保持测试独立于实时内容变化 |
| `code/abinzhao/tests/local-assistant.test.ts` | 新增六类意图和证据约束测试 | 验证分类准确率与可追溯性 |

### 接口与状态

```ts
type ChatIntent =
  | 'lookup'
  | 'explain'
  | 'compare'
  | 'learning-path'
  | 'troubleshoot'
  | 'summarize';

interface EvidenceItem {
  text: string;
  sourceIds: string[];
}

interface AnswerBlock {
  kind: 'paragraph' | 'list' | 'comparison' | 'steps' | 'clarification';
  heading?: string;
  items: EvidenceItem[];
}

interface StructuredReply {
  intent: ChatIntent;
  confidence: ConfidenceResult;
  blocks: AnswerBlock[];
  sources: EvidenceSource[];
  nextContext: ChatContext;
  clarification?: string[];
}
```

### 灰度归属

- **归属**：无需灰度。
- **说明**：本地回答器直接替代固定资料列表和模型分支。
- **接入点**：无。

### 组件

- 引用：`knowledge-search.ts`、现有来源链接样式。
- 新建：`ChatAnswer.vue`。

### 样式规范

- 回答块使用无卡片的纵向排版；标题使用紧凑小标题。
- 比较结果使用稳定双列，390px 下改为逐项上下排列。
- 来源链接保持 44px 触控高度和站内路径。

### 交互与边界

1. 输入执行 NFKC、小写化、空白合并和标点标准化。
2. UI 快捷动作拥有最高意图优先级。
3. 规则计分：compare `+5`，summarize/learning-path/troubleshoot `+4`，explain `+3`，lookup `+2`。
4. 同分优先级固定为 `compare > summarize > learning-path > troubleshoot > explain > lookup`。
5. 实体从文章标题、章节标题、标签和受控同义词中做最长匹配。
6. lookup 输出标题、命中字段和摘录；explain 输出定义/关键点/场景；compare 输出双方有证据的共同维度；learning-path 按 `seriesOrder`；troubleshoot 使用原文步骤；summarize 使用章节标题和每章首个事实句。
7. 每个事实项至少绑定一个证据 ID，引用文本必须是知识块原文子串。
8. 来源只接受实际索引中 `/blog/`、`/columns/` 开头的地址。

---

## Feature 2.4: 支持多轮追问的上下文承接（仓库: abinzhao）

### 变更摘要

每个会话保存最近有效意图、实体、来源与范围，对代词、继续词、双实体和显式换题做确定性解析。

### 涉及文件

| 文件 | 改动 | 原因 |
|---|---|---|
| `code/abinzhao/docs/.vitepress/theme/composables/local-assistant.ts` | 新增 `resolveContext()` 和 `nextContext` 规则 | 支持追问且避免跨会话污染 |
| `code/abinzhao/docs/.vitepress/theme/composables/chat.ts` | 会话消息保存 `ChatContext` 与结构化回答 | 刷新后恢复合法上下文 |
| `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue` | 发送时传入当前会话上下文，新会话清空上下文 | 完成 UI 到本地引擎的数据流 |
| `code/abinzhao/tests/local-assistant.test.ts` | 增加代词、前后者、继续、换题和会话隔离测试 | 验证上下文准确率 |

### 接口与状态

```ts
interface ChatContext {
  intent: ChatIntent;
  entities: string[];
  sourceIds: string[];
  scope: KnowledgeScope;
  pendingClarification?: string[];
}
```

数据流固定为：

```text
当前问题 + 最近有效 ChatContext
  -> classifyIntent
  -> extractEntities
  -> resolveContext
  -> search
  -> buildReply
  -> nextContext
```

### 灰度归属

- **归属**：无需灰度。
- **说明**：上下文只写入新版本地会话，不影响站点其他状态。
- **接入点**：无。

### 组件

- 引用：`local-assistant.ts`、会话存储。
- 新建：无。

### 样式规范

不适用。

### 交互与边界

1. “它、这个、该内容”只在上一轮有单一实体时继承。
2. “前者、后者”只在上一轮恰有两个有序实体时解析。
3. 上一轮有两个实体且本轮使用单数代词时停止检索，返回两个澄清选项。
4. “继续、展开、再详细点”继承上一轮意图、实体、范围和来源。
5. 本轮出现新实体且无代词/继续词时清空旧实体和来源权重。
6. “那它和 Grid 有什么区别”固定解析为上一轮 `CSS 布局` 与新实体 `Grid` 的 compare 意图。
7. 只有成功回答更新最近有效上下文；澄清、失败和资料不足不覆盖它。
8. 新会话始终使用空上下文。

---

## Feature 2.5: 建立低置信度与冲突处理（仓库: abinzhao）

### 变更摘要

把检索置信度、证据槽位覆盖和意图完整度合成为三级门控，资料不足时停止硬答。

### 涉及文件

| 文件 | 改动 | 原因 |
|---|---|---|
| `code/abinzhao/docs/.vitepress/theme/composables/local-assistant.ts` | 新增置信度、槽位覆盖和冲突检测 | 控制回答/澄清/无答案分支 |
| `code/abinzhao/docs/.vitepress/theme/components/ChatAnswer.vue` | 展示可信状态、冲突证据和澄清项 | 向用户明确回答边界 |
| `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue` | 映射 complete/insufficient/error 状态 | 保持 live region 语义稳定 |
| `code/abinzhao/tests/local-assistant.test.ts` | 增加阈值、冲突和站外无答案集 | 验证错误硬答率 |

### 接口与状态

```ts
type ConfidenceLevel = 'high' | 'medium' | 'insufficient';

interface ConfidenceResult {
  level: ConfidenceLevel;
  score: number;
  reasons: string[];
}
```

总体置信度固定为：

```text
0.5 × retrievalConfidence
+ 0.3 × evidenceCoverage
+ 0.2 × intentCompleteness
```

### 灰度归属

- **归属**：无需灰度。
- **说明**：门控属于本地回答器内部质量约束。
- **接入点**：无。

### 组件

- 引用：`ChatAnswer.vue`。
- 新建：无。

### 样式规范

- 可信状态使用文本与图标共同表达，不只依赖颜色。
- 冲突来源按原文顺序并列，不放入嵌套卡片。

### 交互与边界

1. high：分数 `>=0.72`、完整度为 1、来源合法且无冲突。
2. medium：分数 `[0.45, 0.72)`；歧义和证据冲突强制降为 medium。
3. insufficient：分数 `<0.45`、无来源、来源非法或没有可引用文本。
4. 冲突只检测同一实体/维度中的明确相反极性，例如“支持/不支持”“可以/不能”“应/不应”。
5. 冲突命中后并列原句，不合并为单一结论。
6. 20 条站外问题最多允许一条错误硬答，错误硬答率 `<=5%`。

---

## Feature 2.6: 移除全部模型服务配置与网络推理路径（仓库: abinzhao）

### 变更摘要

删除模型模式、设置弹窗、端点、密钥、Fetch/SSE 和停止生成逻辑，问答运行时只读取同源静态资源。

### 涉及文件

| 文件 | 改动 | 原因 |
|---|---|---|
| `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue` | 删除模型状态、设置弹窗、请求和流式控制 | 彻底移除服务配置入口 |
| `code/abinzhao/docs/.vitepress/theme/composables/chat.ts` | 删除 `normalizeModelEndpoint()`、`readCompletionStream()` 和模型模式 | 保留会话/迁移职责 |
| `code/abinzhao/docs/.vitepress/theme/styles/chat.css` | 删除 `.model-dialog` 和双模式样式 | 清理无效 UI |
| `code/abinzhao/tests/chat.test.ts` | 删除端点/SSE 测试，改为本地会话与回答协议测试 | 测试与合法行为同步 |
| `code/abinzhao/tests/no-cloud.test.ts` | 新增问答运行时代码静态扫描 | 防止远程模型路径回流 |

### 接口与状态

- 接口：无后端接口。
- 允许请求：VitePress 同源 HTML、JS、CSS、字体和本地知识分包。
- 禁止请求：问答运行时跨域 XHR、Fetch、WebSocket、EventSource。

### 灰度归属

- **归属**：无需灰度。
- **说明**：旧模型路径违反用户硬约束，不保留回退实现。
- **接入点**：无。

### 组件

- 引用：本地问答管线。
- 删除：模型设置 dialog 和模式切换组。

### 样式规范

- 删除模型弹窗选择器和模式双轨视觉。
- 顶部空间改由本地状态与来源范围使用。

### 交互与边界

1. `no-cloud.test.ts` 只扫描问答运行时代码和配置文档，不扫描讲解 Fetch/WebSocket 的教学文章。
2. 禁止出现模型端点输入、访问密钥、`chat/completions`、Ollama、远程 provider 配置。
3. GitHub 外链是用户导航，不属于 AI 数据请求。
4. 旧模型回答迁移后只作为本地历史展示，不参与新回答事实证据。

---

### [Story 3] 本地问答工作区与实用交互

## Feature 3.1: 问答页直接进入全高工作区（仓库: abinzhao）

### 变更摘要

移除独立问答标题横幅，将标题、本地状态、范围、历史、新会话和导出收进工作区工具栏；对话线程成为唯一滚动区。

### 涉及文件

| 文件 | 改动 | 原因 |
|---|---|---|
| `code/abinzhao/docs/.vitepress/theme/Layout.vue` | `ChatPage` 改为异步组件；chat 页增加 shell class并隐藏 Footer/AiLauncher | 隔离问答代码并消除重复入口 |
| `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue` | 重组为工具栏、桌面历史、线程、composer 和移动历史 dialog | 工作区直接进入可用状态 |
| `code/abinzhao/docs/.vitepress/theme/components/ChatSessionList.vue` | 新建统一会话列表 | 桌面侧栏和移动 dialog 复用同一行为 |
| `code/abinzhao/docs/.vitepress/theme/styles/chat.css` | 建立剩余视口高度、单滚动、safe-area 和移动 dialog | 保证移动首屏输入可见 |
| `code/abinzhao/tests/e2e/local-chat.e2e.ts` | 增加工作区坐标、输入可见、历史 dialog 和焦点测试 | 验证截图中的核心问题 |

### 接口与状态

```ts
type IndexStatus = 'idle' | 'loading' | 'ready' | 'error';
type AnswerStatus = 'idle' | 'searching' | 'complete' | 'insufficient' | 'error';
```

页面状态增加 `historyOpen`、`historyTrigger`、`indexStatus`、`answerStatus`。

### 灰度归属

- **归属**：无需灰度。
- **说明**：问答页一次性替换为本地工作区。
- **接入点**：无。

### 组件

- 引用：现有按钮、图标按钮、消息、复制、导出、来源链接。
- 新建：`ChatSessionList.vue`。

### 样式规范

- 工作区高度使用 `100dvh` 减去导航与固定间距，并提供 `100svh` 兼容值。
- 桌面保留 220px 会话侧栏。
- 移动历史使用原生 `<dialog>` 模态抽屉，不保留横向会话条。
- composer 位于工作区底部，并加入 `env(safe-area-inset-bottom)`。
- 当前问答页不渲染右下角悬浮入口和全局 Footer。

### 交互与边界

1. 1440×900 工作区顶部 `y <=100px`，composer 完整可见。
2. 390×844 工作区顶部 `y <=80px`，composer 完整可见。
3. 只有 `.chat-thread` 滚动，页面不产生无意义双滚动。
4. 移动历史 dialog 支持 Escape、遮罩关闭、选择后关闭和焦点恢复。
5. `role="log"`、`aria-busy` 和常驻 live region 表达检索状态。

---

## Feature 3.2: 增加本地实用能力与探索玩法（仓库: abinzhao）

### 变更摘要

加入找资料、总结、对比、学习路线、排查清单、随机探索和 15 分钟学习任务，全部复用本地回答管线。

### 涉及文件

| 文件 | 改动 | 原因 |
|---|---|---|
| `code/abinzhao/docs/.vitepress/theme/components/ChatQuickActions.vue` | 新建快捷动作菜单和来源范围 segmented control | 提供紧凑、可扫读的本地能力入口 |
| `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue` | 保存当前动作与范围，统一调用本地回答管线 | 避免每种玩法独立实现 |
| `code/abinzhao/docs/.vitepress/theme/composables/local-assistant.ts` | 增加随机主题和学习任务纯函数 | 保证动作可测试、可复现 |
| `code/abinzhao/docs/.vitepress/theme/styles/chat.css` | 快捷动作、范围控制和移动菜单样式 | 不增加大说明区 |
| `code/abinzhao/tests/local-assistant.test.ts` | 增加全部动作的成功路径和边界测试 | 防止死按钮 |
| `code/abinzhao/tests/e2e/local-chat.e2e.ts` | 逐项触发快捷动作 | 验证 UI 闭环 |

### 接口与状态

```ts
type QuickAction =
  | 'lookup'
  | 'summarize'
  | 'compare'
  | 'learning-path'
  | 'troubleshoot'
  | 'random-topic'
  | 'study-task';

type KnowledgeScope = 'site' | 'blog' | 'columns' | 'article';
```

### 灰度归属

- **归属**：无需灰度。
- **说明**：所有动作由同一本地引擎处理，不增加外部能力。
- **接入点**：无。

### 组件

- 引用：`ChatAnswer.vue`、本地知识元数据。
- 新建：`ChatQuickActions.vue`。

### 样式规范

- 来源范围使用 segmented control。
- 快捷动作使用图标菜单；常用动作不显示成长段说明。
- 所有控件最小 44px，390px 下菜单文本不溢出。

### 交互与边界

1. 选择动作只改变下一次回答策略，不清空输入。
2. 随机探索只从已发布标题和标签中抽取，随机源作为参数注入以便测试。
3. 15 分钟任务按 `seriesOrder`、`readingMinutes` 和当前主题选择 1 至 3 个步骤，总时长不超过 18 分钟。
4. 总结在没有 article scope 时先请求选择来源，不进行无范围总结。
5. 对比缺少第二实体时返回澄清项。
6. 每个动作支持复制、导出和打开来源。

---

## Feature 3.3: 增加“围绕本文问”入口（仓库: abinzhao）

### 变更摘要

在文章头部增加紧凑问答菜单，通过公开 URL 参数把当前文章范围和动作带入问答页。

### 涉及文件

| 文件 | 改动 | 原因 |
|---|---|---|
| `code/abinzhao/docs/.vitepress/theme/components/ArticleAskMenu.vue` | 新建“围绕本文问”、总结、要点、路线菜单 | 提供文章上下文入口且不增加卡片 |
| `code/abinzhao/docs/.vitepress/theme/pages/ArticlePage.vue` | 在阅读头部操作区挂载菜单 | 保持入口靠近文章身份信息 |
| `code/abinzhao/docs/.vitepress/theme/composables/article-context.ts` | 新增 chat URL 生成和公开文章参数校验 | 集中 base path 与安全校验 |
| `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue` | 读取并验证 `article`/`action`，初始化范围与动作 | 完成跨页面上下文 |
| `code/abinzhao/docs/.vitepress/theme/styles/site.css` | 文章操作区和移动图标模式 | 不增加头部高度 |
| `code/abinzhao/tests/article-context.test.ts` | 增加博客/专题/非法 href/base path 测试 | 防止任意 URL 注入 |
| `code/abinzhao/tests/e2e/local-chat.e2e.ts` | 覆盖文章跳转、自动动作和返回滚动 | 验证主路径 |

### 接口与状态

URL 协议固定为：

```text
/chat/?article=%2Fblog%2Flocal-first-agent.html&action=ask
```

- `action` 只接受 `ask | summary | key-points | learning-path`。
- `article` 必须精确命中知识元数据中的已发布 `.html` href。

### 灰度归属

- **归属**：无需灰度。
- **说明**：只传公开文章标识和受控动作，不改变文章数据。
- **接入点**：无。

### 组件

- 引用：文章头部、Lucide 问答/列表/路线图标。
- 新建：`ArticleAskMenu.vue`。

### 样式规范

- 桌面显示图标与“问答本文”文本。
- 移动显示 44px 图标按钮，使用 `aria-label` 和原生 title 提示。
- 菜单不使用嵌套卡片。

### 交互与边界

1. `ask` 只初始化 article scope 并聚焦输入框。
2. `summary`、`key-points`、`learning-path` 在索引准备完成后自动执行一次。
3. URL 不携带问题、会话 ID、正文或历史上下文。
4. 非法参数回退到全站范围并显示“限定来源已失效”。
5. 浏览器返回恢复原文章 URL 和原生滚动历史。

---

## Feature 3.4: 升级本地会话模型并保护旧数据（仓库: abinzhao）

### 变更摘要

把无版本数组升级为 v2 envelope，幂等迁移 `abin-conversations-v1`，保留旧模型记录但不把旧回答用于新证据。

### 涉及文件

| 文件 | 改动 | 原因 |
|---|---|---|
| `code/abinzhao/docs/.vitepress/theme/composables/chat.ts` | 定义 v2 类型、校验、迁移、容量裁剪和序列化 | 把持久化逻辑从页面中抽离 |
| `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue` | 恢复 active session、范围、上下文和迁移提示 | 页面只消费合法状态 |
| `code/abinzhao/tests/chat-storage.test.ts` | 新增无损、幂等、坏记录、外链、容量和写入失败测试 | 保护用户本地数据 |

### 接口与状态

新 key 固定为 `abin-conversations-v2`，旧 key `abin-conversations-v1` 永久只读保留：

```ts
interface ConversationEnvelopeV2 {
  version: 2;
  migration: {
    v1Completed: true;
    completedAt: number;
  };
  activeConversationId: string | null;
  conversations: ConversationV2[];
}
```

### 灰度归属

- **归属**：无需灰度。
- **说明**：v2 写入成功后成为唯一读源；旧 key 保留只读备份。
- **接入点**：无。

### 组件

- 引用：`ChatSessionList.vue`。
- 新建：无。

### 样式规范

- 旧模型会话在列表与消息头显示“旧版记录”文本标签。
- 标签不使用警告色，不暗示数据异常。

### 交互与边界

1. 有合法且迁移完成的 v2 时只读 v2，不再读取 v1。
2. v2 不存在时读取 v1，最多 30 会话、每会话最近 100 条合法消息。
3. 保留消息内容、顺序、时间和标题；`streaming` 转为 `stopped`。
4. 原 `mode: model` 标记 `legacyRecord: true`。
5. 旧会话续问时从最近合法用户问题恢复主题，范围默认全站，新回答只调用本地引擎。
6. 来源最多 8 个，且必须精确命中知识元数据中的站内地址。
7. v2 成功写入后才标记迁移完成；失败时保留内存会话并显示存储警告。
8. 不修改、不删除 v1 key 和站点其他 localStorage 数据。

---

## Feature 3.5: 保持可访问性、离线性与性能边界（仓库: abinzhao）

### 变更摘要

隔离问答代码和知识资源，补齐 live region、焦点管理、离线行为、触控尺寸与 reduced-motion。

### 涉及文件

| 文件 | 改动 | 原因 |
|---|---|---|
| `code/abinzhao/docs/.vitepress/theme/Layout.vue` | 异步加载 ChatPage，chat 页设置独立 shell | 防止问答代码进入所有页面首包 |
| `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue` | 索引/正文分阶段导入、焦点和状态语义 | 首次加载与异常可感知 |
| `code/abinzhao/docs/.vitepress/theme/components/ChatSessionList.vue` | dialog 焦点恢复与键盘行为 | 移动历史可访问 |
| `code/abinzhao/docs/.vitepress/theme/styles/chat.css` | safe-area、44px 控件、reduced-motion、无横向溢出 | 覆盖移动与辅助设置 |
| `code/abinzhao/docs/.vitepress/theme/styles/site.css` | chat shell 与全局入口互斥 | 防止悬浮入口遮挡 composer |
| `code/abinzhao/tests/site-build.test.ts` | 检查独立分包、gzip 预算和基础路径 | 防止性能回归 |
| `code/abinzhao/tests/e2e/local-chat.e2e.ts` | 增加离线、键盘、live region 和跨域网络断言 | 验证运行时边界 |

### 接口与状态

- 索引：进入问答页后加载。
- 正文：首次有效查询后加载。
- 缓存：模块加载完成后驻留当前页面内存；浏览器 HTTP 缓存按静态站默认策略工作。

### 灰度归属

- **归属**：无需灰度。
- **说明**：性能与可访问性是全部问答能力的发布门槛。
- **接入点**：无。

### 组件

- 引用：全局 reduced-motion 规则、原生 `<dialog>`、ARIA live region。
- 新建：无。

### 样式规范

- 所有主要控件不小于 44×44px。
- 390px 宽度 `scrollWidth === innerWidth`。
- reduced-motion 下关闭加载位移动画，只保留状态文本。

### 交互与边界

1. live region 常驻 DOM；错误使用 `role="alert"`；线程使用 `role="log"` 和 `aria-busy`。
2. 键盘可完成新建、历史选择、范围切换、提问、来源打开、复制和导出。
3. 索引 gzip 后不超过 250KB；正文为独立分包。
4. 首页、博客、文章等非问答页面的初始 bundle 不包含正文语料。
5. 索引和正文已加载后切换离线，提问、追问、复制、导出和历史读取继续可用。
6. 提问全流程跨域数据请求数量为 0。

---

### [Story 4] 文档、测试与验收闭环

## Feature 4.1: 建立本地问答评测与布局回归测试（仓库: abinzhao）

### 变更摘要

在现有 Vitest 基础上增加知识评测，并引入 Playwright 固化桌面/移动布局、问答主路径和无跨域请求约束。

### 涉及文件

| 文件 | 改动 | 原因 |
|---|---|---|
| `code/abinzhao/package.json` | 增加 `@playwright/test`、`test:e2e`、`verify` 脚本 | 提供可重复的浏览器验收入口 |
| `code/abinzhao/pnpm-lock.yaml` | 由 pnpm 更新 | 锁定测试依赖 |
| `code/abinzhao/playwright.config.ts` | 新增 Chromium、webServer、baseURL 和截图策略 | 统一本地与 CI 运行 |
| `code/abinzhao/.gitignore` | 忽略 `playwright-report/`、`test-results/` | 避免测试产物污染 |
| `code/abinzhao/tests/fixtures/knowledge-eval.ts` | 固定检索评测集 | 计算 Recall/MRR |
| `code/abinzhao/tests/fixtures/chat-corpus.ts` | 固定意图、上下文、冲突和站外语料 | 计算分类和硬答率 |
| `code/abinzhao/tests/knowledge-corpus.test.ts` | 语料构建测试 | 覆盖草稿、锚点、代码降权 |
| `code/abinzhao/tests/knowledge-search.test.ts` | 搜索指标与性能测试 | 覆盖中英文、同义词、模糊匹配 |
| `code/abinzhao/tests/local-assistant.test.ts` | 意图、上下文、证据和置信度测试 | 覆盖本地智能主逻辑 |
| `code/abinzhao/tests/chat-storage.test.ts` | v2 迁移测试 | 保护旧会话 |
| `code/abinzhao/tests/no-cloud.test.ts` | 远程模型路径扫描 | 约束运行时能力边界 |
| `code/abinzhao/tests/chat.test.ts` | 删除云端模型测试，保留通用会话协议 | 适配合法行为变化 |
| `code/abinzhao/tests/article-context.test.ts` | 文章问答 URL 测试 | 验证公开参数 |
| `code/abinzhao/tests/site-build.test.ts` | 分包、体积和静态构建测试 | 验证发布产物 |
| `code/abinzhao/tests/e2e/layout-density.e2e.ts` | 新增布局坐标与响应式回归 | 覆盖全站顶部压缩 |
| `code/abinzhao/tests/e2e/local-chat.e2e.ts` | 新增本地问答、离线、键盘和网络回归 | 覆盖核心工作流 |
| `code/abinzhao/.github/workflows/deploy-pages.yml` | 部署前执行 check、unit、Chromium E2E | 阻止不满足验收标准的站点发布 |

### 接口与状态

- 接口：无产品接口。
- 测试命令：

```sh
pnpm check
pnpm test
pnpm test:e2e
pnpm build
pnpm verify
```

`verify` 串行执行类型检查、Vitest、Playwright 和最终构建。

### 灰度归属

- **归属**：无需灰度。
- **说明**：验证任务是发布门禁，不单独控制。
- **接入点**：无。

### 组件

- 引用：Vitest、Playwright Chromium。
- 新建：无产品组件。

### 样式规范

不适用。

### 交互与边界

1. 每个实现任务先补失败用例，再完成实现并回归，遵循 RED-GREEN-REFACTOR。
2. 意图固定 12 条，每类两条；分类准确率 `>=90%`。
3. 上下文固定 8 条，至少 7 条正确。
4. 站外无答案固定 20 条，错误硬答不超过 1 条。
5. 每个事实项绑定证据，引用文本是原文子串。
6. E2E 使用 1440×900 和 390×844 两组视口。
7. E2E 监听请求，问答交互期间数据请求的 origin 必须等于站点 origin。
8. CI 安装 Chromium 后运行 E2E；浏览器二进制不提交仓库。

---

## Feature 4.2: 更新用户说明与隐私边界（仓库: abinzhao）

### 变更摘要

把产品说明统一为完全本地的站内知识助手，删除模型端点、访问密钥、Ollama 和云端对话说明。

### 涉及文件

| 文件 | 改动 | 原因 |
|---|---|---|
| `code/abinzhao/README.md` | 重写“智能问答”能力、隐私和限制 | 项目说明与实现一致 |
| `code/abinzhao/docs/chat/index.md` | 更新页面 description | 搜索摘要与实际页面一致 |
| `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue` | 使用“完全本地 · 内容不上传”等已确认文案 | 在产品内明确边界 |
| `code/abinzhao/docs/.vitepress/theme/components/SiteFooter.vue` | 核对并保留“会话保存在本机”说明 | 与 v2 持久化一致 |
| `code/abinzhao/tests/no-cloud.test.ts` | 扫描运行配置文档中的过时服务文案 | 防止文档回退 |

### 接口与状态

- 接口：无。
- 文案边界：明确答案来自站内已发布文章，不提供互联网搜索、开放式生成或跨设备同步。

### 灰度归属

- **归属**：无需灰度。
- **说明**：文档必须与实际行为同步发布。
- **接入点**：无。

### 组件

- 引用：现有页脚与页面元数据。
- 新建：无。

### 样式规范

不适用。

### 交互与边界

1. 不修改用户已有的未跟踪交付压缩包和历史验证文档。
2. README 和页面不再指导用户配置模型、密钥、端点或 CORS。
3. 保留“会话只在当前浏览器”与“无法跨设备同步”的限制。

---

## 后端接口支持

无。

本方案禁止新增后端代理、模型网关、Embedding、远程搜索、账号、数据库和遥测接口。全部数据来自随静态站点发布的同源资源和浏览器本地存储。

## 手工操作与交付清单

无外部平台、域名、后端或模型服务配置。

实施阶段仅需以下本地/CI 工程动作：

| # | 交付项 | 类别 | 在哪做 / 怎么做 | 依赖 / 风险 |
|---|---|---|---|---|
| M1 | 更新直接依赖与锁文件 | 工程依赖 | 使用 pnpm 添加 `minisearch@^7.2.0` 和 `@playwright/test`，不得手工编辑锁文件 | MiniSearch 进入问答异步包；Playwright 仅开发依赖 |
| M2 | 安装 Chromium 测试运行时 | 测试环境 | 本地与 CI 执行 `pnpm exec playwright install --with-deps chromium` | 浏览器二进制不提交仓库 |
| M3 | 浏览器人工复核 | 交付验收 | 在 1440×900、390×844 对首页、博客、专题、项目、文章、关于、问答逐页截图核对 | Safari/Firefox 不在本轮自动化覆盖内，列为剩余兼容风险 |

## 方案分叉扫描

- 未裁决实现分支：0
- 未裁决复用分支：0
- 未裁决范围分支：0
- 未裁决灰度项：0
- 未裁决后端依赖：0
