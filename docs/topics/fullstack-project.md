---
title: 完成一个 Node.js 全栈应用
description: 从前端请求到 HTTP API、数据库与鉴权，建立完整可验证的任务应用。
type: topic
comments: true
---

# 完成一个 Node.js 全栈应用

把一个浏览器任务界面接到 Node.js 服务，再为它添加持久化与访问控制。先跑通匿名本地 API，再引入数据库和会话；每一步验证边界，避免把网络、数据库和身份问题一起调试。

完整代码入口：[带会话与 PostgreSQL 的任务应用](../tutorials/node-fullstack/task-app.html)。该章提供同一任务模型的 SQL、Node API、浏览器页面和真实集成测试，先完成前三章实验，再按它组装应用。

## 目标与架构

最终产物包含任务列表、创建、状态修改和服务端错误反馈。数据库保存任务；需要多用户时，所有查询按当前会话中的用户范围执行。前端传入的用户 ID 不能作为授权依据。

```text
浏览器（表单与状态）
    │ HTTP / JSON
    ▼
Node.js API（校验 → 身份 → 权限 → 业务）
    │ 参数化查询 / 事务
    ▼
PostgreSQL（约束与持久化）
```

这个专题的生产运行部分描述上线条件；本地教学示例不等同于已具备公网运行的全部保障。

## 阶段一：约定请求与响应

前置阅读：[Node 环境](../tutorials/nodejs/environment.html)、[浏览器网络](../tutorials/browser/network.html)、[TypeScript 数据边界](../tutorials/typescript/boundaries.html)。

按 [HTTP API 与联调](../tutorials/node-fullstack/http.html) 建立服务。约定方法、路径、请求体和错误结构。先用命令行请求验证 API，再连接前端，区分服务行为与浏览器同源限制。

验收：合法请求成功；空标题、非法 JSON、超大请求体和不存在的路径返回一致的错误。一次请求完成后能观察到 HTTP 状态、响应体和服务日志，不把所有失败都转换成 `200`。

## 阶段二：持久化与一致性

阅读 [数据库与事务](../tutorials/node-fullstack/database.html)，完成库存事务实验后，使用[任务应用实战](../tutorials/node-fullstack/task-app.html)中的 `app_users` 与 `tasks` 表。设计主键、非空、长度和归属字段；SQL 使用参数化查询。业务必须同时更新多张表时，用同一连接包裹事务，并在所有分支释放连接。

验收：重启 API 后数据仍存在；参数中的引号不会改变查询结构；事务中途失败时没有半完成的数据；并发修改时约束仍成立。迁移操作先在本地练习，真实数据库变更需要对应环境授权。

## 阶段三：连接前端并处理失败

先使用[任务应用实战](../tutorials/node-fullstack/task-app.html)中的浏览器表单连到真实 API，再按 [React 应用](../tutorials/react/applications.html) 或 [Vue 应用](../tutorials/vue/applications.html)将界面迁移为组件。请求函数检查 `response.ok`，区分网络失败与业务错误。提交期间禁用重复提交；查询切换时取消旧请求或拒绝旧结果覆盖新状态。

验收：断开服务、返回非 JSON 错误、切换筛选和重复点击时，页面状态仍然明确。生产应用优先通过同一站点的反向代理访问 `/api`，开发代理不能代替生产代理。

## 阶段四：身份、测试与运行

阅读 [鉴权与生产运行](../tutorials/node-fullstack/production.html)。密码使用适合密码的派生函数；会话随机标识通过受保护的 cookie 传递。cookie 自动随请求发送时，写操作还要考虑 CSRF。CORS 只是浏览器读取限制，不替代认证和授权。

验收：未登录请求被拒绝；用户不能读写其他用户的任务；退出后会话失效；数据库故障产生受控错误；进程收到停止信号时先停止接受新请求，再释放资源。测试要覆盖拒绝路径，不能只覆盖成功请求。

## 完成检查

- 前端、API 和数据库的契约可检查。
- 数据校验、认证与资源归属分别有明确边界。
- 非法输入、服务中断和并发写入有验证结果。
- 凭据通过运行配置传入，不出现在浏览器构建产物。
- 健康检查、日志、备份、恢复和停止流程有文档。

回到 [教程总览](../tutorials/) 补齐各阶段依赖。
