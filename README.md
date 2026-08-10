# 赵建斌个人网站

基于 Next.js App Router 构建的个人品牌网站，展示公开项目、技术文章、个人介绍和联系方式。站点使用静态导出，并通过 GitHub Actions 部署到 GitHub Pages。

## 本地开发

```bash
npm ci
cp .env.example .env.local
npm run dev
```

默认访问地址为 `http://localhost:3000`。

## 环境变量

```env
NEXT_PUBLIC_SITE_URL=https://abinzhao.github.io
```

该变量用于生成站点 Metadata、RSS、Sitemap 和 Robots 中的绝对地址。本地私有配置写入 `.env.local`，不要提交该文件。

## 验证

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

`npm run build` 会将静态站点导出到 `out/`。`npm run start` 使用本地静态服务器预览该目录。

## 发布

推送到 `master` 后，`.github/workflows/deploy-pages.yml` 会执行检查、构建静态站点，并部署 `out/` 到 GitHub Pages。
