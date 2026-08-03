# GitHub 个人主页专业化改版实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `abinzhao` 的 GitHub 主页改造成深色科技风格的专业开发者主页，更新账号资料，并精确删除四个指定仓库。

**Architecture:** 主页以单一 `README.md` 承载静态身份、技术能力和项目入口，并通过 HTTPS 图片服务增强统计视觉。线上修改按可恢复程度排序：先完成并验证 README，再更新账号资料，最后执行不可逆仓库删除。

**Tech Stack:** GitHub Profile README、Markdown、GitHub HTML 子集、shields.io、github-readme-stats、streak-stats、github-readme-activity-graph、GitHub CLI、GitHub REST API

---

## 文件结构

- 修改：`README.md`，负责个人身份、能力、精选项目、动态统计、当前方向和联系入口。
- 保留：`docs/superpowers/specs/2026-08-03-github-profile-optimization-design.md`，记录已批准设计。
- 创建：`docs/superpowers/plans/2026-08-03-github-profile-optimization.md`，记录本实施计划。
- 不跟踪：`.superpowers/`，仅为本地可视化对比临时产物。

### Task 1：建立实施前基线

**Files:**
- Inspect: `README.md`

- [ ] **Step 1：记录当前分支与工作区**

Run:

```bash
git status --short --branch
git log --oneline --decorate -3
```

Expected:

- 当前分支为 `master`
- `.superpowers/` 可以保持未跟踪
- 除计划提交外不存在未知代码改动

- [ ] **Step 2：记录账号资料和仓库清单**

Run:

```bash
gh api user --jq '{login,name,bio,blog,public_repos}'
gh repo list abinzhao --limit 100 --json nameWithOwner,visibility --jq 'sort_by(.nameWithOwner)'
```

Expected:

- 登录账号为 `abinzhao`
- bio 仍为旧值或尚未更新
- 仓库清单包含四个待删除目标

- [ ] **Step 3：逐个验证删除目标**

Run:

```bash
for repo in LocationStory-code hm-admin-node hm-admin-app qiankun; do
  gh repo view "abinzhao/$repo" --json nameWithOwner,visibility,url
done
```

Expected:

- 仅返回 `abinzhao/LocationStory-code`
- 仅返回 `abinzhao/hm-admin-node`
- 仅返回 `abinzhao/hm-admin-app`
- 仅返回 `abinzhao/qiankun`

### Task 2：实现深色科技 Profile README

**Files:**
- Modify: `README.md`

- [ ] **Step 1：用批准的主页内容替换 README**

将 `README.md` 替换为以下完整内容：

```markdown
<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=700&size=30&pause=1000&color=58A6FF&center=true&vCenter=true&width=680&lines=%24+whoami;ABIN_+%7C+HarmonyOS+Engineer;Frontend+Tool+Builder;AI+Agent+Explorer" alt="Typing introduction" />

### HarmonyOS Engineer / Frontend Tool Builder / AI Agent Explorer

构建可靠的 HarmonyOS 应用、前端工程工具与 AI 驱动的开发者产品。

[![Profile Views](https://komarev.com/ghpvc/?username=abinzhao&style=for-the-badge&color=0e75b6)](https://github.com/abinzhao)
[![GitHub](https://img.shields.io/badge/GitHub-abinzhao-181717?style=for-the-badge&logo=github)](https://github.com/abinzhao)
[![Blog](https://img.shields.io/badge/Blog-abinzhao.github.io-58A6FF?style=for-the-badge&logo=githubpages&logoColor=white)](https://abinzhao.github.io)

</div>

## `$ focus`

- HarmonyOS 原生应用与 ArkTS / ArkUI 工程实践
- TypeScript、React、Node.js 前端工程化
- CLI、Monorepo 与开发者效率工具
- AI Agent 产品化与智能开发工作流

## `$ stack --core`

<p>
  <img src="https://img.shields.io/badge/HarmonyOS-000000?style=for-the-badge&logo=huawei&logoColor=white" alt="HarmonyOS" />
  <img src="https://img.shields.io/badge/ArkTS-6C5CE7?style=for-the-badge" alt="ArkTS" />
  <img src="https://img.shields.io/badge/ArkUI-0984E3?style=for-the-badge" alt="ArkUI" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=000000" alt="JavaScript" />
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/AI_Agent-111827?style=for-the-badge&logo=openai&logoColor=58A6FF" alt="AI Agent" />
</p>

## `$ ls selected-work`

| Project | What it delivers | Focus |
| --- | --- | --- |
| [harmony-next-blog](https://github.com/abinzhao/harmony-next-blog) | HarmonyOS Next 学习笔记与实践教程 | HarmonyOS · ArkTS |
| [cps](https://github.com/abinzhao/cps) | 基于 Node.js 的命令行图片压缩工具 | TypeScript · CLI |
| [scio-design](https://github.com/abinzhao/scio-design) | 多包管理、工程规范与效能组件实践 | Monorepo · Tooling |
| [scioPro](https://github.com/abinzhao/scioPro) | React 组件、Hooks 和工具函数多包仓库 | React · Libraries |
| [code-cnalysis](https://github.com/abinzhao/code-cnalysis) | 面向代码理解与分析场景的工具实践 | JavaScript · Analysis |

## `$ github --signal`

<div align="center">
  <img height="165" src="https://github-readme-stats.vercel.app/api?username=abinzhao&show_icons=true&theme=github_dark&hide_border=true&rank_icon=github" alt="GitHub stats" />
  <img height="165" src="https://github-readme-stats.vercel.app/api/top-langs/?username=abinzhao&layout=compact&theme=github_dark&hide_border=true" alt="Top languages" />
</div>

<div align="center">
  <img src="https://streak-stats.demolab.com?user=abinzhao&theme=github-dark-blue&hide_border=true" alt="GitHub contribution streak" />
</div>

<div align="center">
  <img src="https://github-readme-activity-graph.vercel.app/graph?username=abinzhao&theme=github-compact&hide_border=true&area=true" alt="GitHub activity graph" />
</div>

## `$ connect`

- Blog: [abinzhao.github.io](https://abinzhao.github.io)
- GitHub: [github.com/abinzhao](https://github.com/abinzhao)

<div align="center">
  <sub>Build deliberately. Document clearly. Ship continuously.</sub>
</div>
```

- [ ] **Step 2：检查 Markdown 中的关键结构**

Run:

```bash
rg -n 'whoami|stack --core|selected-work|github --signal|connect' README.md
rg -n 'LocationStory-code|hm-admin-node|hm-admin-app|qiankun' README.md
```

Expected:

- 第一条命令匹配五个主页区块
- 第二条命令无输出

- [ ] **Step 3：检查核心项目链接**

Run:

```bash
for repo in harmony-next-blog cps scio-design scioPro code-cnalysis; do
  gh repo view "abinzhao/$repo" --json nameWithOwner,url >/dev/null
done
```

Expected: 命令退出码为 `0`。

- [ ] **Step 4：检查动态图片 URL**

Run:

```bash
for url in \
  'https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=700&size=30&pause=1000&color=58A6FF&center=true&vCenter=true&width=680&lines=%24+whoami;ABIN_+%7C+HarmonyOS+Engineer;Frontend+Tool+Builder;AI+Agent+Explorer' \
  'https://github-readme-stats.vercel.app/api?username=abinzhao&show_icons=true&theme=github_dark&hide_border=true&rank_icon=github' \
  'https://streak-stats.demolab.com?user=abinzhao&theme=github-dark-blue&hide_border=true' \
  'https://github-readme-activity-graph.vercel.app/graph?username=abinzhao&theme=github-compact&hide_border=true&area=true'; do
  curl -L --fail --silent --show-error --max-time 20 --output /dev/null "$url"
done
```

Expected: 命令退出码为 `0`。若单个第三方服务临时失败，记录服务和 HTTP 错误，不阻断静态内容提交。

- [ ] **Step 5：检查 diff**

Run:

```bash
git diff --check
git diff -- README.md
```

Expected:

- `git diff --check` 无输出
- diff 只包含批准的 README 改版

- [ ] **Step 6：提交 README**

Run:

```bash
git add README.md
git commit -m "feat: redesign GitHub profile"
```

Expected: 新提交仅包含 `README.md`。

### Task 3：推送并验证主页

**Files:**
- Verify: `README.md`

- [ ] **Step 1：推送设计文档、计划和 README 提交**

Run:

```bash
git push origin master
```

Expected: `master -> master` 成功，远端包含本地新增提交。

- [ ] **Step 2：验证远端 README**

Run:

```bash
gh api repos/abinzhao/abinzhao/readme --jq '{name,path,size,html_url}'
gh api repos/abinzhao/abinzhao/contents/README.md --jq -r '.content' | base64 --decode | rg 'ABIN_|github --signal|selected-work'
```

Expected:

- README 路径为 `README.md`
- 远端内容包含 `ABIN_`、`github --signal` 和 `selected-work`

- [ ] **Step 3：确认本地与远端同步**

Run:

```bash
git status --short --branch
```

Expected: `master...origin/master`，除 `.superpowers/` 外无未提交改动。

### Task 4：更新账号公开资料

**Files:**
- None

- [ ] **Step 1：更新 bio 与博客地址**

Run:

```bash
gh api --method PATCH user \
  -f bio='HarmonyOS / ArkTS Engineer | Frontend Tool Builder | Building AI-powered developer products' \
  -f blog='https://abinzhao.github.io'
```

Expected: API 返回更新后的用户对象。

- [ ] **Step 2：验证账号资料**

Run:

```bash
gh api user --jq '{login,bio,blog}'
```

Expected:

```json
{
  "bio": "HarmonyOS / ArkTS Engineer | Frontend Tool Builder | Building AI-powered developer products",
  "blog": "https://abinzhao.github.io",
  "login": "abinzhao"
}
```

### Task 5：永久删除指定仓库

**Files:**
- None

- [ ] **Step 1：确认当前认证具备删除权限**

Run:

```bash
gh auth status
```

Expected: 活跃账号为 `abinzhao`。如果输出未包含可删除仓库所需权限，先尝试删除第一个目标；若 API 返回权限错误，立即停止，不继续其他删除。

- [ ] **Step 2：删除 `LocationStory-code`**

Run:

```bash
gh repo delete abinzhao/LocationStory-code --yes
```

Expected: 命令退出码为 `0`。

- [ ] **Step 3：删除 `hm-admin-node`**

Run:

```bash
gh repo delete abinzhao/hm-admin-node --yes
```

Expected: 命令退出码为 `0`。

- [ ] **Step 4：删除 `hm-admin-app`**

Run:

```bash
gh repo delete abinzhao/hm-admin-app --yes
```

Expected: 命令退出码为 `0`。

- [ ] **Step 5：删除 `qiankun`**

Run:

```bash
gh repo delete abinzhao/qiankun --yes
```

Expected: 命令退出码为 `0`。

- [ ] **Step 6：验证四个仓库均不存在**

Run:

```bash
for repo in LocationStory-code hm-admin-node hm-admin-app qiankun; do
  if gh repo view "abinzhao/$repo" >/dev/null 2>&1; then
    echo "STILL_EXISTS: abinzhao/$repo"
  else
    echo "NOT_FOUND: abinzhao/$repo"
  fi
done
```

Expected:

```text
NOT_FOUND: abinzhao/LocationStory-code
NOT_FOUND: abinzhao/hm-admin-node
NOT_FOUND: abinzhao/hm-admin-app
NOT_FOUND: abinzhao/qiankun
```

### Task 6：最终回归检查

**Files:**
- Verify: `README.md`

- [ ] **Step 1：检查核心仓库未受影响**

Run:

```bash
for repo in abinzhao harmony-next-blog cps scio-design scioPro code-cnalysis; do
  gh repo view "abinzhao/$repo" --json nameWithOwner,url >/dev/null
done
```

Expected: 命令退出码为 `0`。

- [ ] **Step 2：检查最终账号状态**

Run:

```bash
gh api user --jq '{login,bio,blog,public_repos}'
gh repo list abinzhao --limit 100 --json nameWithOwner,visibility --jq 'sort_by(.nameWithOwner)'
```

Expected:

- bio 和博客地址为新值
- 四个删除目标不在列表中
- Profile 和五个核心项目仍存在

- [ ] **Step 3：记录推荐置顶顺序**

GitHub CLI 没有稳定的置顶仓库写入接口，不执行非官方绕过。最终交付中记录以下手动置顶顺序：

1. `harmony-next-blog`
2. `cps`
3. `scio-design`
4. `scioPro`
5. `code-cnalysis`

- [ ] **Step 4：检查本地最终状态**

Run:

```bash
git status --short --branch
git log --oneline --decorate -5
```

Expected:

- 本地 `master` 与 `origin/master` 同步
- `.superpowers/` 是唯一允许保留的未跟踪目录
- 提交历史包含设计、计划和主页改版提交
