# 个人网站真实内容与 GitHub Pages 发布设计

## 目标

使用公开可验证资料补充个人网站内容，并将站点迁移到 `abinzhao/abinzhao.github.io`，通过 GitHub Actions 发布到 `https://abinzhao.github.io`。

## 证据范围

| 内容 | 证据来源 | 可公开结论 |
|---|---|---|
| 专业方向 | `abinzhao/abinzhao` README | HarmonyOS、ArkTS、ArkUI、前端工程化、开发者工具、AI Agent |
| 项目列表 | GitHub 仓库元数据与 README | `harmony-next-blog`、`cps`、`scio-design`、`scioPro`、`code-cnalysis` 的公开定位、技术方向和仓库链接 |
| 联系入口 | 现有知识库首页和 GitHub Profile | GitHub、掘金主页 |
| 站点地址 | GitHub Pages API | `https://abinzhao.github.io` |

不公开或不推断公司、工作年限、证书、邮箱、团队规模、业务结果、性能收益和个人职责细节。

## 内容方案

### 项目

为 5 个公开仓库建立项目内容：

1. `harmony-next-blog`：HarmonyOS Next、ArkTS 与 ArkUI 学习笔记和教程。
2. `cps`：基于 Node.js 的命令行图片压缩工具。
3. `scio-design`：多包管理、工程规范和效能组件实践。
4. `scioPro`：React 组件、Hooks 和工具函数 Monorepo。
5. `code-cnalysis`：前端代码调用分析、评分、告警和依赖治理工具。

项目详情只陈述 README 明确提供的用途、能力和使用方式。未披露的约束、验证结果和个人职责明确标注为“公开仓库未披露”。

### 关于页

补充以下已验证能力：

- HarmonyOS、ArkTS、ArkUI。
- TypeScript、React、Node.js。
- CLI、Monorepo 与前端工程化。
- AI Agent 产品化与智能开发工作流。

### 联系页

公开以下入口：

- GitHub：`https://github.com/abinzhao`
- 掘金：`https://juejin.cn/user/2849548342403454`

不展示示例邮箱。联系表单继续保持禁用，直到真实服务和隐私策略确认。

## 发布结构

- Next.js 使用 `output: "export"` 生成 `out/` 静态站点。
- `NEXT_PUBLIC_SITE_URL` 设置为 `https://abinzhao.github.io`。
- `.env.local` 用于本地验证，不提交。
- `.env.example` 记录环境变量名称和生产值。
- GitHub Actions 构建并部署 `out/` 到 Pages。
- 目标仓库从 legacy Pages 切换为 GitHub Actions 发布。

## 替换边界

当前 VitePress 知识库由新个人网站替换。旧源码和内容保留在 Git 历史中，不迁移到新站；旧 `/web/*`、`/harmony-next/*` 等路径将失效。

## 验收标准

- 首页展示真实项目，不再显示项目空状态。
- 项目详情可访问，并链接到对应 GitHub 仓库。
- 关于页和联系页仅包含已验证信息。
- `NEXT_PUBLIC_SITE_URL` 正确影响 metadata、RSS 和 sitemap。
- `npm run lint`、`npm test`、`npm run build`、`npm run test:e2e` 全部通过。
- `out/` 包含首页、项目详情、RSS、robots 和 sitemap。
- 本地静态服务器能够完整浏览导出产物。
- 代码推送到 `abinzhao/abinzhao.github.io` 独立分支并创建 Draft PR。
