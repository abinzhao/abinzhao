---
title: 第四十章：检查点、幂等与外部副作用
description: 区分会话检查点、文件恢复与远端事务，用操作身份、未知状态和对账避免崩溃后重复副作用。
date: '2026-10-23'
category: 智能体工程
tags: [Checkpoint, 幂等]
series:
  order: 40
---

# 第四十章：检查点、幂等与外部副作用

Agent 点击提交之后连接断了，宿主该重试还是停止？如果请求已在远端成功，而本地结果没有落盘，再试一次可能产生两条订单或两次通知。耐久日志保存证据，检查点帮助恢复局部状态，幂等契约控制重复请求；三者不能互相替代。本章要求把“确定失败”和“结果未知”分开，不能用一次本地回滚掩盖真实外部效果。

## 概念与状态契约

检查点必须声明覆盖范围。会话检查点约束日志耐久，文件检查点保存某些路径的前后状态，工作流检查点记录哪些步骤有可重放结果。没有任何一种天然能撤销已经发出的邮件、数据库写入或浏览器提交。Exactly-once external 需要远端参与和业务身份，不能仅通过把本地 tool/result 保存一次实现。

```text
操作意图 + 稳定业务 id -> 权限确认 -> 耐久记录意图
                      -> 发送 -> 远端接受 -> 本地保存结果
发送后失联: unknown -> 查询远端/按契约重复同 id -> 对账
确定未发送: 可按预算重试；确定已成功: 复用结果，不再执行
```

教学状态可以分 planned、authorized、sent、confirmed、unknown、compensated。unknown 不是 failed 的别名：failed 表示有证据确认未完成，unknown 表示本地不能判断。取消也只停止后续等待或工作，不能保证远端取消。恢复器如果把所有未写结果的调用标为“未执行”，就会系统性制造重复外部操作。

## 自包含 Node.js 22 实验

下面模拟具有明确幂等键契约的远端，以及响应丢失后的重试。所有数据在内存，不调用真实服务。远端是教学替身，它支持同 key 同参数复用结果，同 key 不同参数拒绝；只有具有同样官方契约的真实服务才能采用该重试策略。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
const remote = new Map();
let effects = 0;
function submit(key, value, loseResponse = false) {
  const payload = JSON.stringify(value);
  if (remote.has(key)) {
    const saved = remote.get(key);
    assert.equal(saved.payload, payload, 'idempotency conflict');
    return saved.result;
  }
  const result = { receipt: `receipt-${++effects}` };
  remote.set(key, { payload, result });
  if (loseResponse) throw new Error('response lost after commit');
  return result;
}
const local = { operation: 'op-1', status: 'authorized' };
try {
  local.status = 'sent';
  submit(local.operation, { item: 'demo' }, true);
  local.status = 'confirmed';
} catch {
  local.status = 'unknown';
}
assert.equal(local.status, 'unknown');
assert.equal(effects, 1);
const result = submit(local.operation, { item: 'demo' });
local.status = 'confirmed';
assert.equal(effects, 1);
assert.equal(result.receipt, 'receipt-1');
assert.throws(() => submit(local.operation, { item: 'changed' }));
submit('op-2', { item: 'demo' });
assert.equal(effects, 2);
console.log('idempotency reconciliation: passed; no real external call');
NODE
```

换一个随机 key 再试会形成新的业务操作，实验最后一条故意证明这一点。幂等键应来自稳定操作身份，而不是每次 HTTP 尝试的 runId；同时必须限定用户、目标和参数，避免不同任务错误复用结果。远端若有保留期、重放窗口或并发限制，恢复时间超过窗口后不能继续认为同 key 安全，必须按其官方规则对账。

## 已确认的产品机制

DeepSeek Harness `0.2.1-alpha.5` 固定提交的 persistence 文档把 flush 明确为耐久屏障，恢复会追加中断事实，不重新执行工具补日志。工具管线则在执行前记录 call，在结算后记录 result。两者使执行可审计，但并没有声称所有外部服务与本地日志共享一个事务。本章的幂等远端仅是教学建议，不能冒充上游自带的通用 exactly-once 功能。

Claude Code 官方 checkpointing 文档描述会话中的文件编辑跟踪与 rewind，并明确 Bash 修改、外部修改等限制；它不是 Git 的替代，也不保证回滚任意系统副作用。文档核验于 2026-10-23，属于动态产品说明，不以公开仓库推断闭源内部实现。Summarize 改变上下文而不改变磁盘文件，restore conversation 与 restore code 也覆盖不同对象。

检查点策略必须与工具类型对应。只读检索可以通常重做，但重新检索可能得到新事实，不是原结果重放；文件编辑可以对版本作条件替换，但当前文件已被用户修改时不应覆盖；远端发送必须依据业务幂等或查询能力。把所有工具统一放进“异常就 retry”中间件，缺少副作用分类，会让正常恢复成为风险源。

## 失败案例与取舍

典型失败是 Agent 提交发布请求，收到超时后认为请求没有生效，再用新 key 提交。远端可能已经开始部署，此时产生两个流水线。安全行为是保留 unknown，查看操作状态并在得到授权的范围内继续。另一个失败是用户点击取消，界面显示“已撤销”，实际请求已经送达外部系统；准确文案应区分“停止等待”“停止后续操作”和“远端确认取消”。

文件恢复也不能盲目覆盖。检查点保存了旧内容，用户后来手动改同一个文件，恢复旧快照会删除用户工作。恢复需要预期当前版本、变更范围与冲突说明；必要时让用户选择，而不是用“回到正确状态”当授权。原教程只读，所以本章不会真的执行恢复或创建业务写入工具，任何外部写入仍需明确确认。

补偿不是时间倒流。撤销订单可能需要新的业务事件，删除通知也可能无法消除接收者已经看到的信息；补偿能失败，还可能要审批。应记录补偿操作身份、状态和结果，不把 original operation 的历史改成“从未发生”。事务 outbox 可以降低本地发送与状态记录不一致，但接收者去重仍需参与，不能借术语宣称端到端一次性保证。

验收要覆盖边界而非只看成功路径：发送前失败、远端提交后丢响应、本地结果写入失败、重复同 key、不同参数冲突、过期 key 与人工确认。测试替身必须明确承诺远端行为，不允许用永远返回成功的 mock 掩盖 unknown。报告应显示哪些状态可自动恢复，哪些必须对账，哪些只能向用户说明风险。

授权也应绑定操作参数与目标版本。如果用户确认的是测试环境发布，而恢复时目标变成生产，不能复用旧确认；如果参数不同，即使操作名称相同，也应重新校验。幂等键解决重复身份，不解决错误授权，检查点解决局部状态，不解决业务目标变化。恢复计划必须重新核对当前要求，避免机械重放一个已经不再合法的旧意图。

## 实验验收与实现边界

完整命令应证明响应丢失时状态 unknown，使用同 key 恢复不增加 effects，改变参数被拒绝，新 key 会产生第二次效果。它只验证契约模型，不证明某个实际 API 支持幂等。真实验收必须使用已授权测试系统与当前官方协议，不能为了证明功能而发送真实邮件、付款或部署。

原 1–12 章独立 Node.js 22 ESM 项目没有外部写入与文件回滚，本章不会扩大其权限。已落盘 `labs/workflow.mjs` 可验证类似状态转换，`labs/policies.mjs` 可验证授权门槛；本文不修改它们。耐久日志、单次结果重放与恢复测试即使通过，仍不得写成“所有工具具有 exactly-once external”。

## 当前检查点不能恢复的对象

2026-10-23 的 [Claude checkpointing](https://code.claude.com/docs/en/checkpointing) 明确：只有启动 turn 的 prompt 产生检查点，处理中途输入可能标为 “No code restore”；symlink 和 hard-linked 路径在代码恢复时会被跳过并警告。子 Agent 编辑一般不属于父检查点恢复范围，但前台运行的 `context: fork` Skill 有明确例外，不能笼统说“所有子 Agent 编辑都可回滚”或“全部不能回滚”。文档还说明仅恢复会话后，若下一次 prompt 前退出，恢复后的会话状态尚未随新 prompt 保存，原消息可能重新出现，文件恢复不受这项会话保存边界影响。

操作应先列出待恢复对象及检查点覆盖范围，再检查是否有用户并发编辑和已送达的外部动作。正常验收分别确认 code、conversation 与 summary 的结果；异常验收是 skipped files、过期快照、子任务未覆盖与 unknown 远端效果，不把这些对象静默标为已撤销。练习为原内存模型加入过期 idempotency key，要求进入对账而非重复发送；排错按“未被跟踪、快照不可读、当前冲突、外部结果未知”分列。上述特定产品行为不扩大原教学远端替身的承诺。

## 官方固定来源

- [DeepSeek Harness：Persistence 耐久屏障与中断恢复](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/persistence.md)。
- [DeepSeek Harness：工具执行管线](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/tool-execution-pipeline.md)。
- [Claude Code：Checkpointing 官方边界](https://code.claude.com/docs/en/checkpointing)，动态文档，核验日 2026-10-23。

上一章：[第三十九章：会话分支](./39-session-branching) · 下一章：[第四十一章：格式迁移](./41-format-migrations)
