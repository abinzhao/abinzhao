---
title: 04 全栈产品
description: 把前端、API、数据库、权限和部署组合成完整产品。
---

# 04 全栈产品

<p class="content-lead">
全栈不是同时写两个项目，而是建立一条从用户操作到数据变化、异常恢复和线上观察的完整链路。
</p>

## 学习内容

这一阶段把已有知识组合起来：先完成核心 CRUD，再解决网络可靠性，最后建立运行保障。
三章不是三个无关框架项目；它们分别回答“做什么、如何可靠通信、如何持续运行”。

| 顺序 | 章节入口 | 实际产出 | 通过标准 |
| --- | --- | --- | --- |
| 1 | [持久化笔记应用](./projects/notes-app) | Node + SQLite + 原生 JS 两文件应用 | CRUD、异常提示、重启持久化 |
| 2 | [契约与可靠请求](./contracts/reliability) | 共享契约、server/client | 分页、取消、有限重试、同键去重 |
| 3 | [部署与可观察性](./delivery/deploy-observe) | 环境文件、可关闭进程、代理配置 | requestId、health、在途请求、关闭期限 |

## 前置知识与版本

会写表单、DOM 事件、Promise，能理解 Content-Type 与 HTTP 状态。
需要完成 [后端学习阶段](../backend/)的 HTTP、SQLite 章节。
涉及账号隔离时必须读 [认证章](../backend/auth/sessions)，不能凭按钮判断权限。
统一 Node 22.13+，`.mjs`、内置 fetch 与 node:sqlite；本阶段不需要框架或第三方数据库包。
SQLite 在该基线版本仍为实验 API，同步调用适合小型演示，不代表高并发方案。
浏览器需支持模块脚本与 fetch，不使用 `file://` 运行项目网页。

```sh
node --version
mkdir fullstack-labs
cd fullstack-labs
```

按章节建立独立子目录，避免同名 server.mjs、不同端口和不同数据库混淆。
本课程只要求本地运行；代理配置、环境变量与回滚清单不代表已完成真实部署。

## 学习路径

**从零完成产品**：按笔记→契约→观察顺序，每一步先验收再继续。
**已有前后端**：先写接口表与异常状态，再用契约章发现取消/重试的真实边界。
**需要多账号**：先完成认证章，迁移数据表归属，所有 API 从 session 获取 owner。
基础笔记项目没有登录、权限、用户表，不声称“自带账号系统”。
接入登录是单独练习，不是把认证 Cookie 复制到浏览器就完成。

## 用户故事到完成标准

| 用户故事 | 可观察结果 | 必须检查的异常 |
| --- | --- | --- |
| 新建笔记 | 201 后列表出现相同 id | 空标题、坏 JSON、服务停止 |
| 修改笔记 | PUT 后同 id 更新，数量不变 | 已删除 id、旧版本覆盖 |
| 删除笔记 | 204 且刷新无记录 | 重复删除、未授权删除 |
| 重启恢复 | 重启后内容仍在 | 错误数据库路径、临时磁盘 |
| 分页阅读 | 唯一稳定排序，无无效 cursor | 插删并发、越界 limit |
| 重复提交 | 同一幂等键不增加记录 | 换 payload、窗口过期、重启 |
| 退出服务 | 短在途请求完成，新连接停止 | 超过硬期限、数据库提前关闭 |

先区分需求与实验能力：未接认证的笔记无法验收“未授权删除”，需完成扩展后再验收。
前端操作禁用按钮仅防止当前页面重复点击，不保证其他标签页或网络重试不重复。

## 一条完整链路

用户输入 → 前端校验与提交状态 → API 协议检查 → 服务端字段与权限校验。
数据库约束与事务 → HTTP 响应 → 运行时契约校验 → 界面反馈 → 日志与健康检查。
任意一层失败都要有明确结果，不将网络失败误显示为空集合。
`fetch` 的 resolve 只表示收到响应，不保证 2xx；204 没有 JSON。
客户端取消只结束等待，服务端可能已完成写入。
输入非法和权限不足不重试，超时写入先查询结果，或采用持久化幂等协议。

## 可运行的验收脚本

先启动笔记章服务，把下列 `verify.mjs` 放在独立实验目录执行。
它只创建教学记录并清理自己创建的 id，不操作其他笔记。

```js [verify.mjs]
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:3005/api/notes';
const headers = {
  Origin: 'http://127.0.0.1:3005',
  'Content-Type': 'application/json',
};
const create = await fetch(base, { method: 'POST', headers,
  body: JSON.stringify({ title: 'acceptance-only', text: 'first' }) });
assert.equal(create.status, 201);
const { data: note } = await create.json();
assert.ok(Number.isSafeInteger(note.id));
try {
  const update = await fetch(`${base}/${note.id}`, { method: 'PUT', headers,
    body: JSON.stringify({ title: 'acceptance-only', text: 'changed' }) });
  assert.equal(update.status, 200);
  const read = await fetch(`${base}/${note.id}`);
  assert.equal((await read.json()).data.text, 'changed');
  const invalid = await fetch(base, { method: 'POST', headers,
    body: JSON.stringify({ title: '', text: 'x' }) });
  assert.equal(invalid.status, 422);
} finally {
  const remove = await fetch(`${base}/${note.id}`, { method: 'DELETE', headers });
  assert.equal(remove.status, 204);
  assert.equal(await remove.text(), '');
}
assert.equal((await fetch(`${base}/${note.id}`)).status, 404);
console.log('CRUD and validation passed');
```

执行 `node verify.mjs`，预期 `CRUD and validation passed`，无新增验收记录残留。
它不替代浏览器点击、离线反馈、XSS 文字展示或重启持久化测试。

## 阶段验收

完成笔记新增、修改、删除，检查状态和界面一致；停止服务时看到错误且保留输入。
重启检查数据库持久化；访问 `.db` 返回 404；恶意 HTML 显示为文字。
契约客户端在初次 503 后恢复，相同键得到相同 id，不同内容同键得到 409。
取消打印 AbortError，超时最终停止，不能无限请求。
响应 requestId 匹配日志；ready/live 有明确语义；500ms 在途请求完成再退出。
3000ms 慢请求触发两秒硬期限；记录非零退出，而不是假称“优雅成功”。
Nginx 必须单独检查配置及代理路径，本地 Node 成功不代表代理成功。

## 常见错误与标准练习

静态产物不能运行 API；数据库不跟源码覆盖；前端环境变量不能保存 secret。
“编译通过”不证明权限正确，“页面刷新正常”不证明数据落盘。
1. 执行 verify.mjs。验收：检查 CRUD 状态、204 空体与422，未删除他人数据。
2. 制作失败状态表。验收：区分无效输入、离线、服务器故障和未知写入结果。
3. 接入归属授权。验收：两个账号对同一 id 操作，非所有者不获得数据。
4. 写运行交付清单。验收：包含版本、依赖、健康、备份、回滚和日志脱敏。

## 官方来源

- [Node HTTP](https://nodejs.org/download/release/v22.13.0/docs/api/http.html)
- [Node SQLite](https://nodejs.org/download/release/v22.13.0/docs/api/sqlite.html)
- [Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)
- [HTTP 语义 RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)

下一步：[进入扩展能力](../extensions/)
