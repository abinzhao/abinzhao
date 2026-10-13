---
title: 05 扩展能力
description: 从完整可运行实例学习 MV3、Electron、Three.js、Shader 与本地 AI 检索和流式协议。
---

# 05 扩展能力

<p class="content-lead">
完成 JavaScript、异步与 Node 基础后，选择浏览器扩展、桌面应用、图形或 AI 分支。
先运行完整例子，再验证异常和安全边界；教程站点本身保持纯静态。
</p>

## 学习顺序

推荐先走浏览器分支，理解短生命周期与有限权限，再学 Electron 的系统能力边界。
图形与 AI 分支可独立选择，但都要掌握异步、模块和资源清理。

```text [推荐路径]
JavaScript / DOM / Promise / Node 基础
  → MV3 Popup → 消息与存储 → 发布验收
  → Electron IPC → 文件与窗口 → 安全加固 → 打包验收
  → Three 场景 → GLSL Shader
  → 流式协议 → 本地检索与 RAG 评测
```

## 浏览器插件

| 顺序 | 章节 | 可观察成果 |
| --- | --- | --- |
| 1 | [Manifest V3 与最小 Popup](./browser/manifest) | 无额外权限的计数器，关闭重开归零 |
| 2 | [消息、存储与 Service Worker 恢复](./browser/messaging-storage) | 网页标题经验证消息持久化，后台停止后可恢复 |
| 3 | [发布、权限与检查脚本](./browser/release) | 白名单 ZIP、负例拒绝、隐私披露与商店验收步骤 |

## Electron 桌面应用

| 顺序 | 章节 | 可观察成果 |
| --- | --- | --- |
| 1 | [进程隔离与窄接口 IPC](./electron/process-ipc) | 页面无 Node，只能通过 bridge 查询版本 |
| 2 | [用户授权文件与多窗口](./electron/files-windows) | 主进程 dialog 选择文本，每窗口独立授权 |
| 3 | [导航、IPC 与输入安全](./electron/security) | 固定资源协议、准确 URL 白名单、穿越与超限拒绝 |
| 4 | [打包、签名与更新边界](./electron/packaging) | 独立目录包与安装包，区分未签名和可信分发 |

安全应在发布之前完成；打包章节使用 IPC 例子讲制品结构，不替代安全章节的生产加固。

## 图形与 Shader

| 顺序 | 章节 | 可观察成果 |
| --- | --- | --- |
| 1 | [Three.js 场景与资源释放](./graphics/three) | 立方体旋转，resize 不变形，DPR 受限，RAF 可释放 |
| 2 | [GLSL 与 ShaderMaterial](./graphics/shaders) | 完整 vertex/fragment 波纹，时间与颜色 uniform 更新 |

## AI 应用

| 顺序 | 章节 | 可观察成果 |
| --- | --- | --- |
| 1 | [本地 Mock SSE 与 NDJSON](./ai/streaming) | UTF-8 分片读取、协议分帧、取消与明确完成 |
| 2 | [本地检索与 RAG 评测](./ai/local-rag) | Node 内置分块、TF-IDF、来源与预算、可运行评测 |

流式篇不调用真实模型；检索篇不生成答案，也不将词频向量称为模型 Embedding。
真实模型和工具接入需要独立可信服务、用户授权与权限控制，不能在静态页面保存 API key。

## 创意编程与特效

| 顺序 | 章节 | 可观察成果 |
| --- | --- | --- |
| 1 | [渐变、流光与玻璃质感](./visuals/gradients) | 完整可暂停的 CSS 光场与清晰前景 |
| 2 | [Canvas 粒子与连线](./visuals/particles) | 按时间更新位置、高 DPI 适配和距离连线 |
| 3 | [滚动、视差与进入动画](./visuals/scroll) | 阅读进度、Observer 进入与无脚本回退 |
| 4 | [交互特效演练场](./visuals/playground) | 实时参数、缓动对比、WebGL 光场与帧预算图 |

每种效果都提供实现原理、完整代码和性能边界；动效不能遮挡正文，减少动态模式下仍可读。

## 实验约定

- 浏览器扩展通过 `chrome://extensions` 加载，不是打开 HTML 就完成安装。
- Node 示例使用 Node 22+；Python 仅用于消息篇的独立静态网页服务。
- Electron 与 Vite 依赖仅安装到独立实验目录，锁定实际版本，不修改教程主站。
- 每章都有运行命令、预期输出、常见故障、验收练习和官方资料；先验收最小例子再扩展。
- 发布、推送、签名凭据、更新托管和外部模型调用都不是自动执行的教程步骤。

验收应记录版本、平台、输入、输出、失败状态和清理结果。语法或构建通过不能代替浏览器/GPU/桌面运行验证。
延伸展示：[技术实验室](../../lab/)；返回：[教程总览](../)。
