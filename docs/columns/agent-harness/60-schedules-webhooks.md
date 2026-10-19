---
title: 第 60 章：定时任务、Webhook 与 Channels
description: 将定时和外部消息转换成受控输入，区分验签、去重、持久投递与模型执行完成。
date: '2026-10-17'
category: 智能体工程
tags: [Webhook, 定时任务]
series:
  order: 60
---

# 第 60 章：定时任务、Webhook 与 Channels

## 60.1 外部事件只提供输入

定时任务在指定时刻生成输入，Webhook 从外部服务接收事件，Channels 将消息送入运行中的会话。它们都可能启动或影响 Agent，但接收到事件不表示可以直接执行其中的指令。签名证明请求体来自持有共享秘密的一方，不证明正文符合业务授权，也不证明用户批准了后续部署、文件修改或凭据使用。

入口应把身份、来源、规则版本、事件标识和接收时间与内容分开。可信规则决定哪些事件进入哪个工作区、哪个会话与哪组权限，事件 payload 不能自选管理员 preset。运输成功、inbox 接纳、模型处理和业务完成是不同阶段，HTTP 202 或 messageId 都不能被解释成任务成功。

原第 1–12 章是本地单进程只读助手，没有公网 webhook、后台定时服务或 Channels。独立 labs 同样不发网络请求、不启动模型，也没有实现定时投递。本章只提供离线验签和重放实验，不开放监听端口、不配置外部机器人，也不以真实凭据测试入口。

## 60.2 定时规则必须显式表达时间

DeepSeek 固定 Schedule 是 Host 管理的提醒，记录绑定原 Session，投递普通 follow-up，不等待模型完成。它支持显式绝对时刻、固定间隔以及带时区的日历规则；固定间隔不是每天同一当地时刻。日光节约时间变化、系统时钟回拨与错过触发都需要明确语义，不能靠进程默认时区猜测用户意图。

固定源码对 recurring catch-up 只送最新已到期 occurrence，不把全部错过提醒累积补发；删除任务也不删除已经排队的消息。配置状态、下一次时刻、已保存投递 receipt 与模型执行结果应分别展示。定时任务的 create、update 和实际 delivery 也有队列与存储边界，修改旧快照可能冲突，不能覆盖新目标时刻。

| 回执或状态 | 可以证明什么 | 不能证明什么 |
| --- | --- | --- |
| HTTP 202 | 入口已接纳到定义的阶段 | 工作已完成或耐久保存 |
| inbox messageId | 输入被接纳 | 模型已经处理 |
| schedule receipt | 一次投递得到确认 | 外部动作成功 |
| 验签通过 | 原始请求体完整且来源可验证 | 新鲜、未重放、业务授权 |

## 60.3 自包含的离线验签与重放实验

GitHub 使用原始请求体计算 HMAC-SHA256，不能先解析 JSON 再重新序列化后验签，因为空白和编码变化也会改变摘要。下面的 Node.js 22 代码不使用 HTTP，只对明确的教学密钥字符串和固定字节计算签名；该字符串不是实际凭据。去重是单进程示意，不是 DeepSeek webhook 内置能力。

```js
import assert from 'node:assert/strict';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const fixtureKey = 'DEMO_ONLY_NOT_A_REAL_WEBHOOK_SECRET';
const body = Buffer.from('{"action":"opened","number":7}', 'utf8');
const signed = `sha256=${createHmac('sha256', fixtureKey).update(body).digest('hex')}`;
const seen = new Set();
function receive(raw, signature) {
  if (!Buffer.isBuffer(raw) || raw.length > 8192) return 'INVALID_BODY';
  if (typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature)) {
    return 'INVALID_SIGNATURE';
  }
  const expected = createHmac('sha256', fixtureKey).update(raw).digest();
  const supplied = Buffer.from(signature.slice(7), 'hex');
  if (!timingSafeEqual(expected, supplied)) return 'INVALID_SIGNATURE';
  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { return 'INVALID_JSON'; }
  if (event.action !== 'opened' || !Number.isSafeInteger(event.number) ||
      event.number < 1) return 'IGNORED_EVENT';
  const digest = createHash('sha256').update(raw).digest('hex');
  const key = JSON.stringify(['configured-source', 'rule-v1', digest]);
  if (seen.has(key)) return 'REPLAY_BLOCKED';
  seen.add(key);
  return 'ADMITTED';
}
assert.equal(receive(body, signed), 'ADMITTED');
assert.equal(receive(body, signed), 'REPLAY_BLOCKED');
assert.equal(receive(Buffer.from('{"action":"closed","number":7}'), signed), 'INVALID_SIGNATURE');
assert.equal(receive(body, 'sha256=bad'), 'INVALID_SIGNATURE');
console.log('raw-body signature and replay checks passed');
```

示例按原始内容摘要抑制完全相同的已签名 payload，因此会把真正相同的合法事件也判为重复；这是教学取舍，不是通用事件去重方案。生产需要将可信来源、业务事件身份、rule revision 和 payload 摘要绑定，并规定同标识不同内容的冲突行为。去重记录、任务入队与后续执行应有持久事务或明确协调策略，不能只是先写 Set 再启动任务。

GitHub 的请求体 HMAC 不覆盖任意运输 header。单靠请求者传来的 delivery ID 不能替代内容验证与业务幂等；重投通常保留相同 `X-GitHub-Delivery`，但有效签名仍可以被重放。若上游协议没有签名时间戳，接收端自报 receivedAt 不能证明消息新鲜，必须依赖可信去重、允许窗口和业务状态判断，不伪造时间保证。

## 60.4 真实失败案例：已接纳不代表可重放恢复

DeepSeek 固定 Webhook runtime 明确是 fire-and-forget：provider 验证请求，trusted rule 返回可选 Session 请求，runtime dispatch 先返回，后续规则各自执行。它不保存 delivery 状态，不内置 queue、retry、dedup、crash replay 或 completion result。重复投递可能创建重复 Session，进程丢失也不能靠 202 重建未完成工作。

固定 GitHub adapter 验证 untouched JSON body，随后立即返回 202。若宿主在入内存 dispatch 后退出，调用方已收到成功运输回执，但业务处理未必完成。反过来，同一 payload 重投又可能启动第二个 Session。正确交付应写清采用何种持久接纳与业务幂等，而不是把运输协议的成功映射为 Agent 完成。

固定 Schedule 还有跨存储窗口：inbox 已保存而 task receipt 未保存时崩溃，之后可能重复 delivery。这再次说明定时提醒不能承诺 exactly-once。通知文本可以带稳定 occurrence 身份，业务适配器可以提供幂等查询；但任何外部写操作仍需自己的授权和结果协调，不由提醒机制自动保证。

## 60.5 Channels 的产品边界

所核验的 Claude Code 官方 Channels 页面将其标为 research preview，要求 claude.ai 登录，Console 和 API key 登录不支持；Team 与 Enterprise 还需组织明确启用。事件只在会话打开时进入，配置为普通 MCP server 并不自动获得推送资格。这些边界不能推导成通用后台持久队列或离线自动恢复功能。

频道的发送者 allowlist 是入口授权，不表示每段消息都可信。获准联系人也可能转发恶意内容；若启用 permission relay，能够回复者还可能获得批准工具的权力，必须单独评估。具体插件平台与新版功能未核验时不写事实，更不能为了无人值守方便默认绕过所有权限提示。

## 60.6 实验与可观察验收

1. 运行离线示例，确认第一次接纳、第二次重放拒绝、正文篡改和格式错误分别通过。
2. 保留签名却改变 JSON 空白，确认验签失败；检验的是原始字节，不是解析后内容等价。
3. 重建一个新的 seen 集合，观察相同 payload 再次接纳，以此确认内存去重不耐久，不能写成恢复保证。
4. 设计真实入口时分别验收签名缺失、body 超限、未知 action、重复投递、同 ID 不同内容和进程退出窗口。
5. 定时测试明确时区、错过触发与时钟回拨；Channels 测试先确认登录方式、组织允许和运行会话，不假设跨版本支持。

完成标准是来源验证先于处理，授权不由 payload 扩大，回执分层且重放语义明确。离线代码只证明算法分支，不验证公网 TLS、真实厂商登录、耐久队列或业务副作用；本章不部署入口、不创建外部 schedule，也不推送任何消息。

## 60.7 官方来源与边界

DeepSeek Harness 固定 `0.2.1-alpha.5`、提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`；动态产品页面核验于 2026-10-17，预览特性不作为稳定契约。

- [固定 Schedule 与投递窗口](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/schedule.md)
- [固定 Webhook fire-and-forget 边界](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/webhook.md)
- [GitHub 原始请求体验签](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [GitHub 重放与重投标识](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
- [Claude Code Channels 预览](https://code.claude.com/docs/en/channels)

上一章：[第 59 章：长任务、Goal 与跨窗口交接](./59-long-running-goals)

下一章：[第 61 章：Harness SDK 与可编程宿主](./61-harness-sdk)
