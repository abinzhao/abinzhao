# 全站空间压缩与本地 AI 增强 · 实施计划（implementation）

> 由 write-plan Stage 3 生成。实施中完成一项勾一项。每个 Feature 均按 RED-GREEN-REFACTOR 执行：先补该 Feature 的失败用例，再实现，最后运行最小相关测试。

## 执行原则

- 只修改 `code/abinzhao/` 中 plan.md 列出的文件，不处理 `.DS_Store`、`deliverables/` 等既有未跟踪内容。
- `pnpm-lock.yaml` 只允许由 pnpm 命令生成。
- 所有问答事实文本必须来自站内知识块，不允许添加无来源生成分支。
- 任一阶段完成后先运行最小测试；全部阶段完成后运行 `pnpm verify` 与最终浏览器截图复核。
- 本需求无后端、数据库、云端模型和远程配置依赖。

## 执行顺序

### 阶段 0: 基线与依赖准备

- [x] 确认 `pnpm check`、`pnpm test`、`pnpm build` 基线通过
- [x] 使用 pnpm 添加 `@playwright/test`
- [x] 使用 pnpm 添加 `minisearch@^7.2.0`
- [x] 安装 Playwright Chromium 运行时

### 阶段 1: 首批基础能力（可并行 ✅）

- [x] Feature 1.1: 压缩全局导航占用
- [x] Feature 2.1: 建立章节级本地知识语料

### 阶段 2: 列表密度与检索排序（可并行 ✅）

- [x] Feature 1.2: 将列表页大标题区收敛为紧凑页面栏（依赖 Feature 1.1）
- [x] Feature 2.2: 提升中英文混合检索与排序精准度（依赖 Feature 2.1）

### 阶段 3: 阅读头部与意图管线（可并行 ✅）

- [x] Feature 1.3: 压缩专题详情与文章阅读头部（依赖 Feature 1.2）
- [x] Feature 2.3: 本地意图识别与结构化回答（依赖 Feature 2.2）

### 阶段 4: 其他页面密度与上下文（可并行 ✅）

- [x] Feature 1.4: 首页、关于页和异常页按内容属性做最小压缩（依赖 Feature 1.3）
- [x] Feature 2.4: 支持多轮追问的上下文承接（依赖 Feature 2.3）

### 阶段 5: 回答可信度

- [x] Feature 2.5: 建立低置信度与冲突处理（依赖 Feature 2.4）

### 阶段 6: 移除云端模型路径

- [x] Feature 2.6: 移除全部模型服务配置与网络推理路径（依赖 Feature 2.5）

### 阶段 7: 会话数据迁移

- [x] Feature 3.4: 升级本地会话模型并保护旧数据（依赖 Feature 2.1、Feature 2.6）

### 阶段 8: 全高问答工作区

- [x] Feature 3.1: 问答页直接进入全高工作区（依赖 Feature 1.1、Feature 2.6、Feature 3.4）

### 阶段 9: 本地快捷能力

- [x] Feature 3.2: 增加本地实用能力与探索玩法（依赖 Feature 2.5、Feature 3.1）

### 阶段 10: 文章上下文入口

- [x] Feature 3.3: 增加“围绕本文问”入口（依赖 Feature 1.3、Feature 2.1、Feature 3.2）

### 阶段 11: 可访问性与性能收口

- [x] Feature 3.5: 保持可访问性、离线性与性能边界（依赖 Feature 2.2、Feature 3.1、Feature 3.2、Feature 3.3）

### 阶段 12: 自动化验收与 CI 门禁

- [x] Feature 4.1: 建立本地问答评测与布局回归测试（依赖 Feature 1.4、Feature 2.6、Feature 3.5）

### 阶段 13: 文档同步

- [x] Feature 4.2: 更新用户说明与隐私边界（依赖 Feature 2.6、Feature 3.5、Feature 4.1）

### 阶段 14: 最终验证

- [x] 运行 `pnpm verify`
- [x] 在 1440×900 与 390×844 逐页截图并核对坐标、重叠、溢出、输入框和来源链接
- [x] 检查最终 Diff，无云端模型残留、调试代码、意外删除和无关格式变化

## 依赖关系图

```text
Feature 1.1 -> Feature 1.2 -> Feature 1.3 -> Feature 1.4 -----------+
      |                         |                                   |
      |                         +---------------> Feature 3.3       |
      |                                             ^               |
      +---------------------> Feature 3.1 -> Feature 3.2 -----------+
                                    ^              |                |
                                    |              +-> Feature 3.3  |
                                    |                               v
Feature 2.1 -> Feature 2.2 -> Feature 2.3 -> Feature 2.4 -> Feature 2.5
      |             |                                          |
      |             |                                          v
      |             +-------------------------------> Feature 3.5
      |                                                        ^
      +-> Feature 3.4 -> Feature 3.1                           |
                              ^                                 |
Feature 2.5 -> Feature 2.6 ----+                                 |
      |                         |                                 |
      +-------------------------+---------------------------------+

Feature 1.4 + Feature 2.6 + Feature 3.5
  -> Feature 4.1
  -> Feature 4.2
```

## 任务详情

### Feature 1.1: 压缩全局导航占用

- **类型**: 前端
- **仓库**: abinzhao
- **文件**:
  - `code/abinzhao/docs/.vitepress/theme/components/SiteHeader.vue`
  - `code/abinzhao/docs/.vitepress/theme/styles/tokens.css`
  - `code/abinzhao/docs/.vitepress/theme/styles/base.css`
  - `code/abinzhao/docs/.vitepress/theme/styles/site.css`
  - `code/abinzhao/tests/e2e/layout-density.e2e.ts`
- **依赖**: 无
- **灰度归属**: 无需灰度（用户确认静态站一次性替换）
- **可并行**: ✅，可与 Feature 2.1 并行
- **预计工时**: 1.5h
- **验证**:
  - 导航高度与 44px 触控目标失败用例
  - 移动菜单 Escape、路由关闭与焦点恢复
  - 1440/1100/800/390px 横向溢出
- **状态**: ✅ 已完成（2026-10-16）

### Feature 1.2: 将列表页大标题区收敛为紧凑页面栏

- **类型**: 前端
- **仓库**: abinzhao
- **文件**:
  - `code/abinzhao/docs/.vitepress/theme/components/CompactPageHeader.vue`
  - `code/abinzhao/docs/.vitepress/theme/pages/BlogIndexPage.vue`
  - `code/abinzhao/docs/.vitepress/theme/pages/ColumnsIndexPage.vue`
  - `code/abinzhao/docs/.vitepress/theme/pages/ProjectsPage.vue`
  - `code/abinzhao/docs/.vitepress/theme/styles/site.css`
  - `code/abinzhao/tests/e2e/layout-density.e2e.ts`
- **依赖**: Feature 1.1
- **灰度归属**: 无需灰度（静态页面结构统一）
- **可并行**: ✅，可与 Feature 2.2 并行
- **预计工时**: 2h
- **验证**:
  - 三页面唯一可见 `h1`
  - 博客首卡坐标 `y<=300/400`
  - 分类、搜索和项目跳转回归
- **状态**: ✅ 已完成（2026-10-16）

### Feature 1.3: 压缩专题详情与文章阅读头部

- **类型**: 前端
- **仓库**: abinzhao
- **文件**:
  - `code/abinzhao/docs/.vitepress/theme/pages/ColumnPage.vue`
  - `code/abinzhao/docs/.vitepress/theme/pages/ArticlePage.vue`
  - `code/abinzhao/docs/.vitepress/theme/styles/base.css`
  - `code/abinzhao/docs/.vitepress/theme/styles/site.css`
  - `code/abinzhao/tests/e2e/layout-density.e2e.ts`
- **依赖**: Feature 1.2
- **灰度归属**: 无需灰度（静态阅读布局调整）
- **可并行**: ✅，可与 Feature 2.3 并行
- **预计工时**: 2h
- **验证**:
  - 正文坐标 `y<=320/380`
  - 深链接不被导航遮挡
  - 目录激活与上一篇/下一篇回归
- **状态**: ✅ 已完成（2026-10-16）

### Feature 1.4: 首页、关于页和异常页按内容属性做最小压缩

- **类型**: 前端
- **仓库**: abinzhao
- **文件**:
  - `code/abinzhao/docs/.vitepress/theme/styles/site.css`
  - `code/abinzhao/tests/e2e/layout-density.e2e.ts`
- **依赖**: Feature 1.3
- **灰度归属**: 无需灰度（仅调整既有 CSS）
- **可并行**: ✅，可与 Feature 2.4 并行
- **预计工时**: 0.75h
- **验证**:
  - 首页首屏露出模块索引
  - 390px CTA 与悬浮入口不相交
  - 关于页和 404 无横向溢出
- **状态**: ✅ 已完成（2026-10-16）

### Feature 2.1: 建立章节级本地知识语料

- **类型**: 前端构建数据
- **仓库**: abinzhao
- **文件**:
  - `code/abinzhao/docs/.vitepress/data/content.ts`
  - `code/abinzhao/docs/.vitepress/data/knowledge.ts`
  - `code/abinzhao/docs/.vitepress/data/knowledge-build.ts`
  - `code/abinzhao/docs/.vitepress/data/knowledge-index.data.ts`
  - `code/abinzhao/docs/.vitepress/data/knowledge-corpus.data.ts`
  - `code/abinzhao/tests/content-index.test.ts`
  - `code/abinzhao/tests/knowledge-corpus.test.ts`
- **依赖**: 无
- **灰度归属**: 无需灰度（静态构建数据）
- **可并行**: ✅，可与 Feature 1.1 并行
- **预计工时**: 4h
- **验证**:
  - 先写草稿过滤、锚点、重复标题和代码降权失败用例
  - 44 篇已发布文章进入语料
  - 每个知识块链接到真实文章或章节
  - 公共 `ContentIndex` 不包含正文和本地文件路径
- **状态**: ✅ 已完成（2026-10-16）

### Feature 2.2: 提升中英文混合检索与排序精准度

- **类型**: 前端搜索
- **仓库**: abinzhao
- **文件**:
  - `code/abinzhao/package.json`
  - `code/abinzhao/pnpm-lock.yaml`
  - `code/abinzhao/docs/.vitepress/data/knowledge.ts`
  - `code/abinzhao/docs/.vitepress/data/knowledge-build.ts`
  - `code/abinzhao/docs/.vitepress/theme/composables/knowledge-search.ts`
  - `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue`
  - `code/abinzhao/tests/fixtures/knowledge-eval.ts`
  - `code/abinzhao/tests/knowledge-search.test.ts`
  - `code/abinzhao/tests/site-build.test.ts`
- **依赖**: Feature 2.1
- **灰度归属**: 无需灰度（本地检索直接替换）
- **可并行**: ✅，可与 Feature 1.2 并行
- **预计工时**: 4h
- **验证**:
  - Top-3 Recall `>=85%`
  - MRR `>=0.75`
  - 首次查询 P95 `<=150ms`
  - 热查询 P95 `<=50ms`
  - 索引/正文独立分包
- **状态**: ✅ 已完成（2026-10-16）

### Feature 2.3: 本地意图识别与结构化回答

- **类型**: 前端本地问答
- **仓库**: abinzhao
- **文件**:
  - `code/abinzhao/docs/.vitepress/theme/composables/local-assistant.ts`
  - `code/abinzhao/docs/.vitepress/theme/components/ChatAnswer.vue`
  - `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue`
  - `code/abinzhao/tests/fixtures/chat-corpus.ts`
  - `code/abinzhao/tests/local-assistant.test.ts`
- **依赖**: Feature 2.2
- **灰度归属**: 无需灰度（本地回答器直接替换）
- **可并行**: ✅，可与 Feature 1.3 并行
- **预计工时**: 3.5h
- **验证**:
  - 六类意图每类至少两条
  - 分类准确率 `>=90%`
  - 每个事实项有合法证据 ID
  - 引用文本为知识块原文子串
  - 不使用 `v-html`
- **状态**: ✅ 已完成（2026-10-16）

### Feature 2.4: 支持多轮追问的上下文承接

- **类型**: 前端本地问答
- **仓库**: abinzhao
- **文件**:
  - `code/abinzhao/docs/.vitepress/theme/composables/local-assistant.ts`
  - `code/abinzhao/docs/.vitepress/theme/composables/chat.ts`
  - `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue`
  - `code/abinzhao/tests/local-assistant.test.ts`
- **依赖**: Feature 2.3
- **灰度归属**: 无需灰度（会话内本地状态）
- **可并行**: ✅，可与 Feature 1.4 并行
- **预计工时**: 2.5h
- **验证**:
  - 固定 8 条上下文用例至少 7 条正确
  - `CSS 布局 -> 那它和 Grid` 正确解析
  - 澄清/失败/资料不足不覆盖有效上下文
  - 新会话严格隔离
- **状态**: ✅ 已完成（2026-10-16）

### Feature 2.5: 建立低置信度与冲突处理

- **类型**: 前端本地问答
- **仓库**: abinzhao
- **文件**:
  - `code/abinzhao/docs/.vitepress/theme/composables/local-assistant.ts`
  - `code/abinzhao/docs/.vitepress/theme/components/ChatAnswer.vue`
  - `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue`
  - `code/abinzhao/tests/local-assistant.test.ts`
- **依赖**: Feature 2.4
- **灰度归属**: 无需灰度（回答质量门控）
- **可并行**: ❌，与前后任务共享本地回答核心文件
- **预计工时**: 2h
- **验证**:
  - high/medium/insufficient 阈值
  - 冲突证据强制降级
  - 20 条站外问题最多一条错误硬答
  - 非法来源被丢弃
- **状态**: ✅ 已完成（2026-10-16）

### Feature 2.6: 移除全部模型服务配置与网络推理路径

- **类型**: 前端
- **仓库**: abinzhao
- **文件**:
  - `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue`
  - `code/abinzhao/docs/.vitepress/theme/composables/chat.ts`
  - `code/abinzhao/docs/.vitepress/theme/styles/chat.css`
  - `code/abinzhao/tests/chat.test.ts`
  - `code/abinzhao/tests/no-cloud.test.ts`
- **依赖**: Feature 2.5
- **灰度归属**: 无需灰度（旧模型路径违反硬约束）
- **可并行**: ❌，统一清理问答运行时
- **预计工时**: 1.5h
- **验证**:
  - 先写 no-cloud 失败扫描
  - 问答运行时无端点、密钥、模型名、Fetch/SSE/WebSocket/EventSource
  - GitHub 外链仍正常
  - 旧模型回答只展示不作为证据
- **状态**: ✅ 已完成（2026-10-16）

### Feature 3.1: 问答页直接进入全高工作区

- **类型**: 前端 UI
- **仓库**: abinzhao
- **文件**:
  - `code/abinzhao/docs/.vitepress/theme/Layout.vue`
  - `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue`
  - `code/abinzhao/docs/.vitepress/theme/components/ChatSessionList.vue`
  - `code/abinzhao/docs/.vitepress/theme/styles/chat.css`
  - `code/abinzhao/tests/e2e/local-chat.e2e.ts`
- **依赖**: Feature 1.1、Feature 2.6、Feature 3.4
- **灰度归属**: 无需灰度（问答页一次性替换）
- **可并行**: ❌，依赖问答状态和迁移结构稳定
- **预计工时**: 4h
- **验证**:
  - 工作区坐标 `y<=100/80`
  - composer 两视口完整可见
  - 线程单滚动
  - 移动历史 dialog Escape/遮罩/焦点恢复
  - chat 页无重复 Footer/AiLauncher
- **状态**: ✅ 已完成（2026-10-16）

### Feature 3.2: 增加本地实用能力与探索玩法

- **类型**: 前端 UI / 本地逻辑
- **仓库**: abinzhao
- **文件**:
  - `code/abinzhao/docs/.vitepress/theme/components/ChatQuickActions.vue`
  - `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue`
  - `code/abinzhao/docs/.vitepress/theme/composables/local-assistant.ts`
  - `code/abinzhao/docs/.vitepress/theme/styles/chat.css`
  - `code/abinzhao/tests/local-assistant.test.ts`
  - `code/abinzhao/tests/e2e/local-chat.e2e.ts`
- **依赖**: Feature 2.5、Feature 3.1
- **灰度归属**: 无需灰度（统一复用本地管线）
- **可并行**: ❌，共享 ChatPage 和回答器
- **预计工时**: 3h
- **验证**:
  - 七类动作全部闭环
  - 动作切换不清空输入
  - 随机主题仅来自已发布内容
  - 学习任务总时长不超过 18 分钟
  - 每个结果可复制、导出和打开来源
- **状态**: ✅ 已完成（2026-10-16）

### Feature 3.3: 增加“围绕本文问”入口

- **类型**: 前端
- **仓库**: abinzhao
- **文件**:
  - `code/abinzhao/docs/.vitepress/theme/components/ArticleAskMenu.vue`
  - `code/abinzhao/docs/.vitepress/theme/pages/ArticlePage.vue`
  - `code/abinzhao/docs/.vitepress/theme/composables/article-context.ts`
  - `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue`
  - `code/abinzhao/docs/.vitepress/theme/styles/site.css`
  - `code/abinzhao/tests/article-context.test.ts`
  - `code/abinzhao/tests/e2e/local-chat.e2e.ts`
- **依赖**: Feature 1.3、Feature 2.1、Feature 3.2
- **灰度归属**: 无需灰度（公开文章参数）
- **可并行**: ❌，共享文章头部和 ChatPage
- **预计工时**: 2h
- **验证**:
  - ask/summary/key-points/learning-path 参数
  - 非法 article/action 回退
  - 当前文章来源优先
  - 浏览器返回恢复阅读位置
- **状态**: ✅ 已完成（2026-10-16）

### Feature 3.4: 升级本地会话模型并保护旧数据

- **类型**: 前端状态
- **仓库**: abinzhao
- **文件**:
  - `code/abinzhao/docs/.vitepress/theme/composables/chat.ts`
  - `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue`
  - `code/abinzhao/tests/chat-storage.test.ts`
- **依赖**: Feature 2.1、Feature 2.6
- **灰度归属**: 无需灰度（v2 成为唯一读源，v1 只读保留）
- **可并行**: ❌，需在工作区重构前稳定会话协议
- **预计工时**: 3h
- **验证**:
  - v1→v2 无损与幂等
  - model 会话标记旧版记录
  - 坏 JSON/坏记录/外链/超限按条过滤
  - 写入失败不修改 v1
- **状态**: ✅ 已完成（2026-10-16）

### Feature 3.5: 保持可访问性、离线性与性能边界

- **类型**: 前端质量
- **仓库**: abinzhao
- **文件**:
  - `code/abinzhao/docs/.vitepress/theme/Layout.vue`
  - `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue`
  - `code/abinzhao/docs/.vitepress/theme/components/ChatSessionList.vue`
  - `code/abinzhao/docs/.vitepress/theme/styles/chat.css`
  - `code/abinzhao/docs/.vitepress/theme/styles/site.css`
  - `code/abinzhao/tests/site-build.test.ts`
  - `code/abinzhao/tests/e2e/local-chat.e2e.ts`
- **依赖**: Feature 2.2、Feature 3.1、Feature 3.2、Feature 3.3
- **灰度归属**: 无需灰度（发布质量门槛）
- **可并行**: ❌，在完整工作流上收口
- **预计工时**: 2.5h
- **验证**:
  - 索引 gzip `<=250KB`
  - 正文独立分包
  - 非问答页首包不含正文
  - 已加载后离线可继续问答
  - 跨域数据请求为 0
  - 键盘、live region、reduced-motion、44px 控件
- **状态**: ✅ 已完成（2026-10-16）

### Feature 4.1: 建立本地问答评测与布局回归测试

- **类型**: 测试与 CI
- **仓库**: abinzhao
- **文件**:
  - `code/abinzhao/package.json`
  - `code/abinzhao/pnpm-lock.yaml`
  - `code/abinzhao/playwright.config.ts`
  - `code/abinzhao/.gitignore`
  - `code/abinzhao/tests/fixtures/knowledge-eval.ts`
  - `code/abinzhao/tests/fixtures/chat-corpus.ts`
  - `code/abinzhao/tests/knowledge-corpus.test.ts`
  - `code/abinzhao/tests/knowledge-search.test.ts`
  - `code/abinzhao/tests/local-assistant.test.ts`
  - `code/abinzhao/tests/chat-storage.test.ts`
  - `code/abinzhao/tests/no-cloud.test.ts`
  - `code/abinzhao/tests/chat.test.ts`
  - `code/abinzhao/tests/article-context.test.ts`
  - `code/abinzhao/tests/site-build.test.ts`
  - `code/abinzhao/tests/e2e/layout-density.e2e.ts`
  - `code/abinzhao/tests/e2e/local-chat.e2e.ts`
  - `code/abinzhao/.github/workflows/deploy-pages.yml`
- **依赖**: Feature 1.4、Feature 2.6、Feature 3.5
- **灰度归属**: 无需灰度（发布门禁）
- **可并行**: ❌，最终汇总各 Feature 已先落地的测试
- **预计工时**: 6h
- **验证**:
  - `pnpm check`
  - `pnpm test`
  - `pnpm test:e2e`
  - `pnpm build`
  - `pnpm verify`
  - CI 同步通过
- **状态**: ✅ 已完成（2026-10-16）

### Feature 4.2: 更新用户说明与隐私边界

- **类型**: 文档
- **仓库**: abinzhao
- **文件**:
  - `code/abinzhao/README.md`
  - `code/abinzhao/docs/chat/index.md`
  - `code/abinzhao/docs/.vitepress/theme/pages/ChatPage.vue`
  - `code/abinzhao/docs/.vitepress/theme/components/SiteFooter.vue`
  - `code/abinzhao/tests/no-cloud.test.ts`
- **依赖**: Feature 2.6、Feature 3.5、Feature 4.1
- **灰度归属**: 无需灰度（文档同步发布）
- **可并行**: ❌，以最终实现为事实来源
- **预计工时**: 0.75h
- **验证**:
  - 文档无模型、端点、密钥、Ollama、CORS 配置说明
  - 页面明确“完全本地 · 内容不上传”
  - 能力限制与实现一致
- **状态**: ✅ 已完成（2026-10-16）

## 工时汇总

| 模块 | 预计工时 |
|---|---:|
| 全站顶部空间压缩 | 6.25h |
| 本地知识语料、检索与回答引擎 | 17.5h |
| 问答工作区、交互与迁移 | 14.5h |
| 自动化测试、CI 与文档 | 6.75h |
| **合计** | **45h** |

## 完成标准

- 17 个 Feature 全部完成并勾选。
- `pnpm verify` 与 `pnpm build` 通过。
- 1440×900、390×844 的坐标和溢出断言通过。
- Top-3 Recall、MRR、意图、上下文、错误硬答率达到 plan.md 阈值。
- 问答运行时没有任何跨域数据请求或模型配置入口。
- v1 会话无损、幂等迁移到 v2，旧 key 保持只读。
- 最终 Diff 只包含本方案列出的源码、测试、依赖和文档文件。
