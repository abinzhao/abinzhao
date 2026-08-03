# GitHub 个人主页专业化改版设计

## 目标

将 `abinzhao` 的 GitHub 主页统一为专业、具有辨识度的开发者形象，突出以下方向：

- HarmonyOS / ArkTS / ArkUI
- TypeScript / React / Node.js 前端工程化
- 开发者工具
- AI Agent 产品实践

本次改版采用“深色科技 + 视觉优先”方向，同时永久删除用户明确指定的四个仓库。

## 账号定位

个人品牌统一为：

> HarmonyOS Engineer / Frontend Tool Builder / AI Agent Explorer

GitHub bio 调整为：

> HarmonyOS / ArkTS Engineer | Frontend Tool Builder | Building AI-powered developer products

博客地址设置为：

> https://abinzhao.github.io

不添加未经确认的公司、所在地、邮箱或其他社交账号。

## 视觉方向

主页采用深色科技风格：

- 深空蓝和黑灰作为主色
- 蓝色、绿色、紫色作为技术强调色
- 顶部使用终端式 `$ whoami` 语义
- 使用渐变标题图片或兼容 GitHub Markdown 的动态文字图片
- 控制徽章密度，保留清晰留白
- 中英文混排：英文负责身份表达，中文负责具体项目说明

所有视觉能力必须兼容 GitHub README，不引入脚本、内嵌样式表或 GitHub 无法稳定渲染的交互代码。

## README 信息结构

### 1. Hero

展示：

- `ABIN_`
- 专业身份
- HarmonyOS、开发者工具和 AI Agent 三个核心方向
- GitHub、博客和访问量入口

### 2. Capability

使用统一深色风格的 `shields.io` 徽章展示：

- HarmonyOS
- ArkTS
- ArkUI
- TypeScript
- React
- Node.js
- JavaScript
- Python
- AI Agent

徽章仅表达核心能力，不添加未实际使用的技术。

### 3. Selected Work

只展示以下公开核心项目：

- `harmony-next-blog`
- `cps`
- `scio-design`
- `scioPro`
- `code-cnalysis`

每个项目必须同时说明：

- 项目解决的问题
- 主要技术或实践方向
- 仓库链接

暂不修改 `code-cnalysis` 仓库名，避免破坏已有链接。

### 4. GitHub Signal

视觉优先，加入以下动态卡片：

- GitHub Stats
- Top Languages
- Contribution Streak
- Activity Graph
- Profile Views

候选服务：

- `github-readme-stats`
- `streak-stats`
- `github-readme-activity-graph`
- `komarev`
- `shields.io`

卡片统一采用深色和蓝紫强调色。动态卡片只作为增强内容；若第三方服务短暂不可用，静态简介、能力说明和项目链接仍应保持完整。

### 5. Current Focus

展示当前持续投入方向：

- HarmonyOS 原生应用开发
- ArkTS / ArkUI 工程实践
- AI Agent 产品化
- 开发者工具链

### 6. Connect

仅展示：

- GitHub
- 个人博客

## 仓库删除范围

永久删除以下仓库：

- `abinzhao/LocationStory-code`
- `abinzhao/hm-admin-node`
- `abinzhao/hm-admin-app`
- `abinzhao/qiankun`

删除规则：

1. 执行前逐个读取仓库身份、可见性和 URL。
2. 只删除上述四个精确名称的仓库。
3. 不删除任何本地目录。
4. 不修改或删除其他远端仓库。
5. 执行后逐个验证仓库查询结果为 `Not Found`。

仓库删除不可逆，除非用户另有备份。

## 账号与仓库整理

本次实施包含：

- 更新 GitHub bio
- 设置博客地址
- 更新 Profile README
- 检查核心项目链接
- 验证动态卡片 URL
- 删除四个指定仓库

本次实施不包含：

- 修改未经确认的账号资料
- 重命名现有仓库
- 修改核心项目源码
- 删除本地仓库或文件
- 自动置顶仓库之外的网页设置

如果 GitHub API 或 CLI 无法管理置顶仓库，则记录为后续手动操作，不通过非稳定方案绕过。

## 响应式与兼容性

- 不使用固定宽度导致移动端横向溢出。
- 动态卡片允许在窄屏自然换行。
- 所有关键内容必须有文字版本，不能只依赖图片表达。
- 图片使用 HTTPS 地址。
- README 不使用 GitHub 会过滤的脚本或不受支持 HTML。

## 实施顺序

1. 记录当前 Profile README、账号资料和目标仓库状态。
2. 更新本地 Profile README。
3. 检查 Markdown、链接和动态图片 URL。
4. 提交并推送 Profile README。
5. 更新 GitHub bio 和博客地址。
6. 再次核对四个目标仓库。
7. 永久删除四个目标仓库。
8. 验证 Profile、账号资料、核心项目链接和删除结果。

将不可逆删除安排在主页改版成功之后，避免前序步骤失败时已经损失仓库。

## 验收标准

- GitHub Profile README 能正常渲染。
- 主页符合深色科技方向。
- 核心能力和项目在首屏后能够快速扫描。
- 所有核心项目链接有效。
- 动态卡片 URL 可访问。
- 移动端不会因固定并排布局产生明显溢出。
- bio 和博客地址更新成功。
- 四个指定仓库均无法再通过 GitHub 查询。
- 其他仓库未被删除或改动。

## 风险与处理

### 第三方动态卡片不可用

动态卡片可能受服务限流、部署状态或网络影响。README 的文字内容必须独立完整，不把关键身份或项目说明放在动态图片中。

### 仓库删除不可恢复

执行前逐个核对仓库完整名称。删除请求必须使用精确的 `owner/repo`，执行后立即验证。

### GitHub Token 权限不足

删除仓库通常需要 `delete_repo` 权限。如果当前认证缺少权限，停止删除流程并明确报告，不尝试交互式绕过授权。

### 置顶仓库无法自动配置

如果现有 GitHub API 或 CLI 不支持可靠修改置顶仓库，则不执行该项，只输出推荐置顶顺序。
