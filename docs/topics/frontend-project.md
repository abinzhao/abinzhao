---
title: 从零建立现代前端工程
description: 用 Vite、TypeScript 与组件框架建立可测试、可构建、可发布的前端应用。
type: topic
comments: true
---

# 从零建立现代前端工程

目标是得到一个运行在浏览器中的应用，并让另一位开发者能够从干净目录安装、检查和构建它。先选择 React 或 Vue 一条实现路径，避免在同一应用里同时学习两种组件系统。

## 最终成果

一个包含列表、表单、加载和错误反馈的任务应用；有明确的 TypeScript 类型、自动化测试、生产构建和静态部署路径。数据可以先放在内存中；需要持久化 API 时继续进入 [Node.js 全栈专题](./fullstack-project.html)。

```text
Git 仓库 → Node 环境 → Vite / TypeScript
                             ↓
                     React 或 Vue 应用
                             ↓
                 测试 + 类型检查 + Lint
                             ↓
                     dist 静态产物
```

## 阶段一：建立可复现的基础

先读 [Git 工作模型](../tutorials/git-basics.html)、[Node 环境管理](../tutorials/nodejs/environment.html) 和 [Vite 工具链](../tutorials/modern-frontend/toolchain.html)。创建目录、记录运行时版本、提交依赖锁文件，把安装方式固定为 `npm ci`。

验收：换一个空目录获取代码后，执行安装和开发命令即可打开页面；不依赖作者机器上的全局包。README 要写明运行时要求、安装、启动和检查命令。

## 阶段二：实现界面与数据流

补齐 [HTML 表单](../tutorials/html/forms.html)、[CSS 布局](../tutorials/css/layouts.html)、[JavaScript 异步](../tutorials/javascript/async.html) 和 [TypeScript 边界](../tutorials/typescript/boundaries.html)。

选择 [React 应用实践](../tutorials/react/applications.html) 或 [Vue 应用实践](../tutorials/vue/applications.html)。实现创建任务、过滤列表、修改状态和错误反馈。让状态只有一个明确来源，不同时保存可以计算得到的列表和计数。

验收：空列表、非法输入、提交中和失败时都有明确反馈；键盘可以完成创建和筛选；390px 宽度没有页面横向溢出。接口返回的数据要在进入状态之前校验。

## 阶段三：建立质量门禁

阅读 [类型、Lint 与测试](../tutorials/modern-frontend/quality.html)。把检查命令写进 package scripts：静态类型检查、代码规则和行为测试分别回答不同问题。测试集中覆盖输入校验、状态转换和请求失败，避免只检查实现细节。

验收：改错一个核心状态转换时，测试能失败；修正后通过。干净安装执行全部检查得到相同结果。UI 仍需要浏览器检查，类型正确并不能证明交互正确。

## 阶段四：验证生产产物

阅读 [构建与持续交付](../tutorials/modern-frontend/delivery.html)。先本地构建并预览，再配置 CI。应用部署在子目录时，核对 `base`、路由方式和静态资源路径。

验收：直接打开深层 URL、刷新、懒加载和错误页面都符合托管平台能力；构建产物不包含服务端凭据。上线后检查生产网络请求，开发服务器正常不能替代生产验收。

## 完成检查

- 新机器可以通过锁文件复现安装。
- 列表、表单、异常和键盘路径可操作。
- 类型、Lint、核心行为测试和生产构建通过。
- 静态站点的子路径、刷新和资源请求正确。
- README 说明了边界、命令和部署方式。

继续阅读 [Node.js 全栈专题](./fullstack-project.html)，把这个界面接入服务端。
