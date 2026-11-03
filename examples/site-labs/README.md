# 站点实验的同源示例

本目录是生产实验直接导入的源码，不是另写的伪演示。Vue 集成层位于 `docs/.vitepress/theme/labs/`，公共布局与导航逻辑位于 `theme/composables/`；教程位于 `docs/blog/` 和全栈第 12 章。

## 本地运行

从站点下载的 `site-labs.zip` 是同版本完整站点源码，解压进入 `abinzhao`：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

要求 Node.js 22+、pnpm 10.20.0。访问 `http://127.0.0.1:5201/abinzhao/labs/`。全部重实验由用户点击运行，浏览页面不下载模型或启动 GPU。

```sh
pnpm check
pnpm exec vitest run tests/particle-model.test.ts tests/code-morph.test.ts tests/knowledge-graph.test.ts tests/execution-trace.test.ts tests/timeline-data.test.ts
pnpm exec playwright test tests/e2e/labs-interactions.e2e.ts tests/e2e/data-labs.e2e.ts tests/e2e/gpu-labs.e2e.ts tests/e2e/lab-reading.e2e.ts
pnpm build
```

Playwright 首次使用可能需要 `pnpm exec playwright install chromium`。WebGPU 取决于浏览器、驱动与安全上下文；Canvas2D 降级测试不等于真实 GPU 性能验证。

## 源码对应

| 实验 | 核心文件 | 集成入口 |
| --- | --- | --- |
| E01 粒子场 | `particle-model.ts`、`particle*.wgsl` | `labs/GpuExperiment.vue`、`particle-gpu.ts` |
| E02 代码演化 | `progress-*.css` | `labs/CodeMorph.vue`、`data/code-tokens.ts` |
| E03 渲染管线 | Vue 内原生 WAAPI 对照 | `labs/RenderingPipeline.vue` |
| E04 知识图谱 | `knowledge-graph.ts` | `labs/KnowledgeMap.vue`、`lab-graph.worker.ts` |
| E05 空间剖面 | 固定提交的四层映射 | `labs/SourceLayers.vue` |
| E06 页面过渡 | 路由钩子与共享快照 | `composables/use-page-transition.ts`、`use-shared-transition.ts` |
| E09 光谱材质 | `spectral.frag` | `labs/spectral-renderer.ts` |
| E10 空间重排 | FLIP、指针变换 | `composables/use-flip.ts`、`components/ProjectsExplorer.vue` |
| E11 执行轨迹 | `execution.ts` | `labs/ExecutionTrace.vue`、`data/trace-source.ts` |
| E12 作品时间线 | `docs/content/config/about.yml` | `components/WorkTimeline.vue`、`data/timeline.ts` |

集成入口默认相对 `docs/.vitepress/theme/`，`data/` 默认相对 `docs/.vitepress/`。

## 版本与完整性

`pnpm build` 先运行 `scripts/package-site-source.mjs`。下载包保留原始源码和锁文件，排除生成目录、依赖、隐藏杂项及草稿。包内 `SOURCE-MANIFEST.json` 含文件哈希、集合摘要和提交 ref；本地构建的 ref 为 `working-tree`，Actions 构建才记录实际完整 SHA。公开 `site-labs-manifest.json` 还提供归档 SHA256 和字节数。

对照包外 SHA256 可检查下载完整性；内容摘要能证明两个包文件集合一致，不能替代供应链签名。不要用未提交工作树的基线 SHA 冒充当前演示的提交身份。
