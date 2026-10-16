---
title: 面向个人开发者的静态站点
description: 基于本站 VitePress 1.6.4 工具链，设计 Markdown 与 YAML 内容契约、可复现构建、SEO 和版本一致的离线检索语料。
date: "2026-10-17"
category: 工程化
tags: [VitePress, GitHub Pages, Markdown, SEO, 离线语料]
featured: true
---

# 面向个人开发者的静态站点

个人博客的基础问题通常不是如何搭建更多服务，而是如何让内容、链接、构建与发布长期一致。文章正文更新了，卡片摘要可能还停留在旧版本；站点能在首页打开，文章直接访问却返回错误；离线页面看起来正常，助手引用的语料却来自另一轮构建。这些问题都可能发生在没有业务服务端的静态站上。

静态架构减少了运行时责任，但没有消除工程责任。本文以本站实际源码为依据，讨论怎样把 VitePress、Markdown、YAML、GitHub Pages 和离线检索组织成可检查的发布链。目标是内容站，而不是需要账户、交易和强一致写入的业务应用；这些动态能力不应被硬塞进构建流程。

## 先确认工具链的事实来源

本站当前安装版本是 VitePress `1.6.4`、Vue `3.5.44`，本次撰写使用的运行环境为 Node `22.22.0`、pnpm `10.20.0`。其中 `package.json` 的 `packageManager` 声明为 `pnpm@10.20.0`，Vue 使用精确版本；Node 的 `engines` 则是 `>=22.0.0`，并没有精确锁定到本次运行版本。

区分这些事实很重要：依赖范围、锁文件解析版本、实际安装版本和当前进程版本不是一回事。VitePress 声明中的 `^1.6.4` 允许范围内更新，但已有锁文件解析到了 `1.6.4`。换机器时仅看声明范围，不能推断得到相同依赖图。

在仓库根目录可以执行以下只读核对命令：

```bash
node --version
pnpm --version
node --input-type=module -e \
  "import fs from 'node:fs'; for (const n of ['vitepress','vue']) console.log(n, JSON.parse(fs.readFileSync('node_modules/'+n+'/package.json','utf8')).version)"
```

对应当前环境，预期版本分别为 `v22.22.0`、`10.20.0`，以及 `vitepress 1.6.4`、`vue 3.5.44`。这是版本检查，不是兼容性或构建成功证明。

首次准备依赖应使用 `pnpm install --frozen-lockfile`，避免发布流程顺手更新锁文件。若安装失败，应明确是依赖声明与锁文件不一致、注册源不可用，还是运行版本不符，不能删除锁文件“让构建继续”。精确运行环境和锁文件是可复现的前提，但不同操作系统、可选依赖和构建插件仍可能造成差异。

## 内容源与展示数据只有一个真相源

本站博客文章位于 `docs/blog/`，专题文章位于 `docs/columns/`；页面组合配置使用 `docs/content/config/` 下的 YAML。`docs/.vitepress/data/content.ts` 在构建阶段读取 Markdown frontmatter，生成文章列表、分类、标签和专题导航，不要求维护另一份手写文章卡片数组。

这比复制标题、日期和链接到多个文件更稳健。内容源只负责描述内容，展示层负责排序、筛选和布局。新文章的路径决定 URL，frontmatter 决定标题与分类，索引从同一份文件提取。日期相同时，本站还使用标题排序作为确定的次级规则，避免文件系统遍历顺序影响输出。

一个文章契约可以写成：

```yaml
---
title: 面向个人开发者的静态站点
description: 解释内容契约、构建发布与离线语料的一致性。
date: "2026-10-17"
category: 工程化
tags: [VitePress, Markdown, SEO]
featured: true
---
```

日期加引号可避免 YAML 解析器将它隐式转换为日期对象。布尔字段应使用真正的 `true` 或 `false`，不是 `"false"` 字符串。标签必须是字符串数组，不能把一串逗号分隔文本当成数组。描述是可复用的摘要，不应混入发布步骤或未经验证的性能宣传。

本站内容加载器已经校验标题、有效日期、标签、类别、描述和标志类型，并将草稿从公开索引中排除；配置中的 `srcExclude` 还承担页面发布排除职责。仅从卡片列表移除草稿并不能保护正文，因为构建器仍可能生成可以直接访问的 HTML。这里需要分别确认“不可发现”和“没有发布”。

Markdown 和 YAML 也不是天然安全的普通文字。VitePress 支持在 Markdown 中使用 Vue 能力；不可信贡献者若能提交可执行组件或脚本，风险超过错别字审核。开放投稿应限定允许的语法，并审查构建环境权限。

## 一个可运行的内容契约检查器

下面的 `audit-content.mjs` 在已有 `gray-matter` 依赖的项目根目录运行，接收要检查的 Markdown 路径。不修改内容，也不生成索引；它是针对博客文章的独立检查器，不适用于仅提供栏目元数据的专题首页。

```javascript
import { readFile } from 'node:fs/promises';
import matter from 'gray-matter';

const files = process.argv.slice(2);
if (!files.length) throw new Error('provide Markdown paths');

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const { data, content } = matter(source);
  const fail = (message) => {
    throw new Error(`${file}: ${message}`);
  };
  for (const key of ['title', 'description', 'category']) {
    if (typeof data[key] !== 'string' || !data[key].trim()) {
      fail(`${key} must be a non-empty string`);
    }
  }
  const date = data.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    fail('date must be a quoted YYYY-MM-DD string');
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date) {
    fail('date must exist in the calendar');
  }
  if (!Array.isArray(data.tags) || data.tags.length === 0 ||
      data.tags.some((tag) => typeof tag !== 'string' || !tag.trim())) {
    fail('tags must contain non-empty strings');
  }
  if ('featured' in data && typeof data.featured !== 'boolean') {
    fail('featured must be boolean');
  }
  if ('draft' in data) fail('published article must omit draft');
  const withoutCode = content.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  const han = (withoutCode.match(/\p{Script=Han}/gu) ?? []).length;
  console.log(`${file}: metadata ok; prose Han=${han}`);
}
```

执行：

```bash
node audit-content.mjs docs/blog/vitepress-static-site.md
```

预期输出该路径、`metadata ok` 和实际汉字计数；若日期是 `2026-02-30`，则拒绝而不是将它自动归一为三月。计数仅用于发现意外空文，不是文章质量分数。这个简化检查器按三反引号剔除代码；需要支持完整 Markdown 语法时，应使用解析器 token，而不是继续堆叠正则。

源码中的项目校验比教学检查器更了解站点的发布模型，后者不能替代前者。它的价值是把契约变成可独立运行的输入输出，避免内容问题一直拖到完整打包阶段才暴露。

## 构建阶段处理内容，客户端处理交互

VitePress 使用服务端渲染生成 HTML，再在浏览器中接管交互。数据加载器读取文件、解析配置和生成语料，应留在构建侧；筛选、阅读进度和用户会话应留在客户端。不能在通用模块的顶层直接读取 `window` 或浏览器存储，因为同一模块可能被构建进程执行。

本站文章页面在挂载后注册滚动与窗口监听，并在卸载时清理；构建时不需要等待浏览器交互才得到正文。这个分界保证文章内容能够作为静态 HTML 输出，同时保留目录、阅读进度和助手入口等增强能力。

内容数据加载器使用 `.data.ts` 约定返回可序列化产物，不把文件句柄、类实例或运行中的数据库连接带到客户端。构建读取失败应该中止并指明源文件，而不是静默返回空内容，让缺少文章的站点被当成成功发布。

一个需要注意的细节是标题展示。本站自定义文章页已经使用 frontmatter 渲染标题区，正文也保留文章主标题，因此语料构建会识别并跳过重复的正文标题，避免重复索引。视觉层与索引层的去重职责不同，不能为了去重就随意删掉所有一级标题或改变文章路径。

## GitHub Pages 的路径是一份部署契约

本站配置默认 `base` 为 `/abinzhao/`，站点源为 `https://abinzhao.github.io`。这是仓库项目站点的典型路径形态，不是域名根目录部署。图片、脚本、站内链接、检索 Worker 和离线资源都必须遵守同一个前缀。

假设文章源为 `blog/vitepress-static-site.md`，当前规范 URL 是：

```text
https://abinzhao.github.io/abinzhao/blog/vitepress-static-site.html
```

如果静态产物发布到了项目路径，却把资源写成 `/assets/...`，浏览器会向域名根目录请求，首页部分文字可能仍能显示，而样式、模型入口或检索资源失效。自定义主题中的站内链接应按 VitePress 的 `withBase` 等约定处理，不能只修导航链接就认定路径完整。

当前项目脚本是：

```bash
pnpm check
pnpm build
pnpm preview --host 127.0.0.1 --port 4173
```

构建默认输出到 `docs/.vitepress/dist`。预览后应直接访问文章 URL、专题 URL 和不存在的路径，而不仅从首页点击一次。Node 类型检查通过不代表资源前缀正确；开发服务器访问成功也不代表静态发布产物正确。

GitHub Pages 部署还涉及站点来源设置、工作流权限和产物上传，见 [VitePress 官方部署指南](https://vitepress.dev/guide/deploy)。文章中的命令用于本地检查，不代表远端部署已经执行。发布应上传同一次构建的完整产物，而不是从不同目录拼接“最新 HTML”和“旧 assets”。

## SEO 从可抓取正文与规范链接开始

本站 `config.mts` 设置中文语言、站点标题与描述，并在 `transformPageData` 中为页面生成 canonical、Open Graph URL、标题和描述；同时配置 sitemap，在构建结束后生成 robots 文件。文章的 description 是这一链路的输入，不只是卡片下面的一行文案。

这些标签应与实际部署路径一致。canonical 漏掉 `/abinzhao/`，等于告诉搜索引擎另一个不存在或错误的地址才是规范页面。开发或预览路径不应混入正式 sitemap；404 页面也应避免进入正常索引。

但元标签不是排名保证。应检查 HTML 源码中是否已有正文、链接和描述，文章标题是否明确，内部链接是否可达，以及重命名后是否保留迁移策略。已发布文章的 slug 是公共契约，不能因为优化标题就同时随意更改文件名。

结构化数据可以进一步描述文章，但只能使用真实日期、作者和页面内容。没有实测的评分、没有发生的发布记录、没有来源的阅读数，都不应写进 JSON-LD。本站当前配置能确认的是上述元标签与 sitemap 链路，不应把尚未实现的结构化数据也写成已有能力。

## 离线语料是第二份发布产物

本站知识构建从同一批已发布 Markdown 生成检索索引和回答语料。索引保存可搜索字段及来源元数据，语料保存可展示文本；二者通过内容版本关联。这样检索命中的是某个明确文章、章节和代码块，而不是没有出处的一串字符串。

`knowledge-build.ts` 按语义块解析段落、列表、引用、表格和代码。当前索引先把同篇文章的搜索字段合并，召回文章后再在完整语料中选择相关段落和代码；来源锚点仍属于原来的语义块。这样降低长文的重复索引成本，同时保留全文检索。代码正文保留用于展示，搜索主要使用提取的标识符，而不是把所有代码字符赋予与文章正文相同的权重。标题和标签也不在每个段落重复加权，减少重复元数据对相关性的干扰。

内容增长会改变检索排序，因此“生成语料成功”不足以证明搜索质量稳定。新增静态站长文时，不应为了强调技术栈反复堆砌其他教程的关键词。例如，询问 DOM 事件或浏览器渲染的用户，应优先命中相应教程，而不是被一篇笼统介绍工具链的文章吸走。

验证可以保留已有查询集合，对比新增内容前后的 Top-K 来源；同时检查新文章能被自身主题查询召回，引用锚点存在，代码块语言与正文保留正确。不需要为了新文章让回归测试降低命中标准，更不能手写固定答案代替检索。

## 缓存更新不能制造混合版本

当前离线构建逻辑会枚举产物，按文件内容与 base 计算版本，生成资源清单和 Service Worker。Worker 安装阶段缓存清单资源；任一资源失败时删除该轮缓存并使安装失败。激活阶段清理同一前缀的旧缓存，并提供资源完整性查询。

这体现了一个合理原则：不把部分缓存宣称为完整离线包。但它不意味着安装过程具有数据库式的跨资源原子性，也不证明模型权重已经在同一缓存内。本站助手的模型缓存和页面资源缓存是不同对象。

浏览器旧标签页可能继续运行旧脚本，新 Worker 又可能已经接管请求，因此完整的升级策略还应检查旧运行时与新语料的版本兼容。在读取索引与语料时核对版本，必要时要求刷新；不能只用“清掉旧缓存”解释所有升级问题。

清理操作也应限定缓存前缀，避免删除同源其他应用的资源。项目站点共享域名时，这一点尤其重要。离线测试应包含缓存不完整、更新失败、旧标签页继续运行和浏览器存储被清理等情况，而不是只检查断网后首页仍然出现。

## 回滚的是发布包，而不是某个页面

静态站出问题时，恢复旧 Markdown 后重新构建，不一定得到当时发布的字节：依赖、配置、语料解析逻辑和构建环境可能已经变化。更可靠的恢复对象是经过验证的完整发布包，并记录对应源码版本、锁文件和运行环境。

页面、客户端代码、检索索引与离线清单应一起回滚。只恢复文章 HTML，会让页面展示与助手证据分离；只恢复索引，又可能让引用指向已不存在的锚点。缓存是否接受回滚版本也应检查，不能假定内容哈希发生变化就等于每个旧标签页都已更新。

链接迁移则是另一项责任。优化标题可以保留原文件名；确实需要重命名时，应检查专题导航、相关文章、公开引用和搜索索引中的旧地址。静态托管没有业务路由器替作者自动保存所有历史链接，发布前应明确旧 URL 的处理方式。

## 建立小而明确的验收链

文章修改先检查 frontmatter 与 Markdown，再构建，最后验证实际产物。若工作区同时存在主题与助手改动，可以复制内容和配置到临时目录、复用已安装依赖，在隔离快照中构建，避免构建生成文件混入当前修改范围。

检查顺序应是：内容契约成立，页面能够预渲染，规范链接与 base 一致，文章直接访问成功，离线语料版本相同，既有查询仍命中预期来源。性能指标要另行测量，不应从“纯静态”推导出任意设备都快速。

本文给出了当前源码依据和可执行检查方式，没有宣称 GitHub Pages 发布、搜索引擎收录或全设备离线验证已经完成。对个人内容站来说，长期可维护的关键是让每次内容变化都能沿着同一条链得到确认，而不是不断增加看似专业、却无人负责验证的工具。

## 官方参考

- [VitePress：部署](https://vitepress.dev/guide/deploy)，核对产物目录与 GitHub Pages 的部署条件。
- [VitePress：构建时数据加载](https://vitepress.dev/guide/data-loading)，理解内容索引的构建侧边界。
- [VitePress：SSR 兼容](https://vitepress.dev/guide/ssr-compat)，核对浏览器 API 的使用位置。
- [VitePress：站点配置](https://vitepress.dev/reference/site-config)，核对 base、head、sitemap 与页面处理钩子。
- [pnpm：安装命令](https://pnpm.io/cli/install)，核对 `--frozen-lockfile` 的行为。
- [Google：规范 URL](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)，理解 canonical 的作用与限制。
- [MDN：Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)，核对安装、激活与缓存生命周期。
