# 站点维护说明

## 常用命令

```bash
pnpm install
pnpm dev
pnpm test
pnpm typecheck
pnpm build
pnpm sync:github
```

本地开发地址默认为 `http://localhost:5173/`。

## 修改个人信息

编辑根目录的 `site.config.ts`：

- `owner.name`：真实姓名
- `owner.nickname`：昵称
- `owner.role`：角色说明
- `owner.headline`：首页主张
- `owner.description`：首页简介
- `socials`：CSDN、掘金、GitHub、Gitee

外部渠道的 `url` 为空时，首页会显示“待配置”，不会生成无效链接。

## 修改导航

编辑 `site.config.ts` 中的 `navigation`。
教程侧边栏由 `docs/.vitepress/data/tutorials.ts` 的章节数据生成。

## 修改教程路线

首页学习路线：

```text
docs/.vitepress/data/tutorials.ts
```

教程正文：

```text
docs/tutorials/
```

新增阶段时：

1. 在 `tutorials.ts` 添加阶段。
2. 在 `docs/tutorials/` 创建对应目录和 `index.md`。
3. 在 `tutorials.ts` 的 `tutorialGroups` 添加章节；侧边栏、目录筛选和首页搜索自动使用同一份数据。
4. 运行测试和构建。

详情按实际主题目录拆分，例如 `frontend-basics/javascript/`、`backend/database/` 和 `extensions/electron/`。每章保留前置知识、运行步骤、完整代码、机制与边界、效果验证、故障排查及练习验收。

代码高亮由 VitePress/Shiki 在构建时生成，支持双主题、行号、重点行、差异和代码组。首页预览来自 `docs/.vitepress/data/lesson-code.data.ts`，随阶段切换；不要改成手工着色的 HTML。

可视化组件：

- `ConceptFlow.vue`：内容流程图。
- `VisualPlayground.vue`：渐变、Canvas 粒子、缓动、Grid 参数演示。
- `FrameBudget.vue`：帧预算图，示意数据必须明确标注。
- `DocEffects.vue`：阅读进度、进入动画、全局动态开关。

动态开关在本机保存；所有持续动画须响应该开关与系统减少动态设置。Canvas 和 WebGL 离开视口或页面后应停止并释放资源。

## 修改项目

精选顺序和中文文案：

```text
docs/.vitepress/data/projects.ts
```

GitHub 用户名和允许同步的仓库：

```text
site.config.ts
```

重新获取 GitHub 数据：

```bash
pnpm sync:github
```

脚本会更新：

```text
docs/.vitepress/data/generated/github-projects.json
```

不要手工编辑这个生成文件。没有 `GITHUB_TOKEN` 也能读取公开仓库；CI 中可以通过环境变量提供令牌提高请求额度。

## 修改实验室

实验分类和条目：

```text
docs/.vitepress/data/labs.ts
```

首页实验区域：

```text
docs/.vitepress/theme/components/LabShowcase.vue
```

粒子 AI 光场：

```text
docs/.vitepress/theme/components/ParticleField.vue
```

实验详情组件：

```text
docs/.vitepress/theme/components/ParticleFieldDemo.vue
```

## 修改深浅主题

全站颜色、排版、布局和响应式规则：

```text
docs/.vitepress/theme/styles/base.css
docs/.vitepress/theme/styles/content.css
docs/.vitepress/theme/styles/tutorials.css
```

主题选择逻辑：

```text
docs/.vitepress/theme/components/ThemeToggle.vue
docs/.vitepress/theme/utils/theme.ts
```

主题支持 `system`、`light` 和 `dark`，用户选择保存在浏览器本地。

## 修改搜索内容

首页统一搜索索引（包括章级标题、简介与主题）：

```text
docs/.vitepress/data/search-content.ts
```

正文顶部使用 VitePress 本地全文搜索，生产索引由构建生成。

搜索排序逻辑：

```text
docs/.vitepress/theme/utils/search.ts
```

## 发布前检查

```bash
pnpm sync:github
pnpm test
pnpm typecheck
pnpm build
```

随后检查：

- 首页深色与浅色主题
- `390px` 手机宽度是否有横向滚动
- 教程侧边栏和上下章导航
- 搜索空结果
- WebGL 降级和减少动态模式
- CSDN、掘金、GitHub、Gitee 链接
