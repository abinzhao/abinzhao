---
title: 把 GitHub 项目接入个人站
description: 使用构建时同步与人工配置组合项目数据。
---

# 把 GitHub 项目接入个人站

<p class="content-lead">
项目数据需要保持更新，但首页又不能变成仓库列表。最终采用“GitHub 提供事实数据，本地配置负责内容表达”的组合。
</p>

## 目标

- 自动获取语言、星标、更新时间和仓库地址。
- 人工决定哪些项目展示、如何排序和怎样写中文说明。
- 不把 GitHub Token 发送到浏览器。
- GitHub 暂时不可用时仍能完成静态构建。

## 数据流

```text
site.config.ts
  → sync-github.mts
  → GitHub REST API
  → generated/github-projects.json
  → projects.ts 人工覆盖
  → 首页与项目列表
```

## 配置优先级

GitHub 返回客观数据：

```ts
{
  name,
  language,
  stars,
  updatedAt,
  htmlUrl
}
```

本地配置覆盖表达内容：

```ts
{
  repo: 'cps',
  title: '命令行图片压缩工具',
  description: '用 Node.js 完成可发布的 CLI。',
  category: '开源工具',
  featured: true
}
```

## 失败处理

同步脚本是独立命令，不在每次本地构建时强制执行。项目会提交最近一次生成的 JSON 作为缓存，因此 GitHub API 限流或离线不会让站点完全失效。

## 验证

```bash
pnpm sync:github
pnpm test
pnpm build
```

同步后检查生成数据数量、精选顺序和人工文案是否保持不变。
