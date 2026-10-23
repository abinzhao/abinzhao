---
title: 第三十八章：耐久存储、写锁与崩溃恢复
description: 将内存可见、append 确认与 flush 耐久屏障分开，用单写者所有权和完整前缀恢复避免伪成功。
date: '2026-10-23'
category: 智能体工程
tags: [Durability, 崩溃恢复]
series:
  order: 38
---

# 第三十八章：耐久存储、写锁与崩溃恢复

把会话写进 JSONL 文件，不等于已经得到可靠恢复。缓冲写入可能尚未进入耐久介质，两个进程可能同时追加，最后一条记录也可能被截断。更危险的是把日志修复当作重新执行工具。本章要求读者分别描述何时对本进程可见、何时承诺崩溃后存在、谁拥有写入权，以及证据不完整时怎样停止猜测。

## 概念与状态契约

append 表示接受一批有序事件，flush 表示承诺之前确认的追加已经耐久；close 则负责最终清空与释放所有权。具体后端可以让 append 本身耐久，但不能因此让公共契约依赖隐藏实现。写入 API 返回成功前必须定义成功层级，调用者不能把 UI 收到事件、内存数组更新、磁盘文件可读与断电恢复混为一个状态。

```text
事件产生 -> 有界写后队列 -> append 接受 -> 本实例读取可见
                                 -> flush -> 崩溃恢复承诺
write handle -> 独占所有权 -> 最终 drain -> close -> 释放
重启 -> 验证物理完整前缀 -> 校验逻辑事件 -> 补中断结束事实
```

一个会话只有一个活跃写者，才能维持连续 seq 和 turn 状态。内存 mutex 只保护当前进程，跨进程所有权需要后端 lease 或操作系统锁与明确恢复规则。锁文件存在不一定表示持有者活着，锁文件不存在也不一定证明没有竞争。若无法验证所有权，安全结果是拒绝写入，而不是覆盖日志或删除一个看起来陈旧的文件。

## 自包含 Node.js 22 实验

以下内存模型验证确认与耐久屏障的区别，不使用真实磁盘，也不声称能测试断电。它模拟 append 已可见但未 flush 的进程丢失，并验证写者排他与 seq 连续。实验状态只存在当前 Node 进程，所有“恢复”都由明确数组快照模拟。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
const backend = { visible: [], durable: [], owner: null };
function openWrite(owner) {
  assert.equal(backend.owner, null, 'already owned');
  backend.owner = owner;
  let closed = false;
  const check = () => { assert.ok(!closed); assert.equal(backend.owner, owner); };
  return {
    append(batch) {
      check();
      const next = backend.visible.length;
      for (const [i, event] of batch.entries()) assert.equal(event.seq, next + i);
      backend.visible.push(...structuredClone(batch));
    },
    flush() { check(); backend.durable = structuredClone(backend.visible); },
    close() {
      if (closed) return;
      check(); backend.durable = structuredClone(backend.visible);
      backend.owner = null; closed = true;
    }
  };
}
let handle = openWrite('a');
assert.throws(() => openWrite('b'));
handle.append([{ seq: 0, type: 'turn/start' }]);
assert.equal(backend.visible.length, 1);
assert.equal(backend.durable.length, 0);
handle.flush();
handle.append([{ seq: 1, type: 'tool/call' }]);
const oldHandle = handle;
backend.visible = structuredClone(backend.durable);
backend.owner = null;
handle = openWrite('restart');
assert.throws(() => oldHandle.append([{ seq: 1, type: 'stale-writer' }]));
assert.equal(backend.visible.length, 1);
assert.throws(() => handle.append([{ seq: 2, type: 'gap' }]));
handle.append([{ seq: 1, type: 'turn/interrupted' }]);
handle.close(); handle.close();
assert.equal(backend.durable.length, 2);
console.log('durability barrier model: passed; disk durability not tested');
NODE
```

真实后端还需保证失败批次不会部分污染逻辑可见状态，处理写入中断、空间不足、压缩帧截断与关闭失败。本实验先校验整个批次再追加，避免第二项错误却留下第一项的内存半提交；这个设计细节也适用于实际 API。若后端允许部分物理记录出现，必须按明确完整前缀规则恢复，而不是把部分写入当整批确认。

## 已确认的上游机制

DeepSeek Harness `0.2.1-alpha.5` 固定提交的 `SessionPersistence` 通过 `SessionHandle` 访问日志，handle 携带 read/write 权限与单写者所有权。append 返回保证同一后端实例的可见性，flush 才明确承诺耐久；close 幂等且不可取消。新建空会话可以延迟物理创建，直到 append 或 flush；因此进程里已注册，不等于其他进程已经能列出。

上游同步 session/event 会进入有界 write-behind 窗口，显式 session/flush 排空等待并暴露后台写入错误。失败后台批次保留顺序，自动路径暂停，之后显式 flush 重试而不是静默丢弃。计时窗口只约束主动等待，不是磁盘延迟上限；事件循环繁忙、系统 I/O 阻塞仍需作为运行风险监控，不能从配置毫秒数推出最大恢复损失。

已确认的崩溃处理不会整段删除未结束 turn。物理后端返回有效连续前缀，恢复消费者在持有写 handle 时追加缺失工具错误、step/end 与 interrupted turn/end；只读观察者可在内存做同样平衡而不写回。完整已耐久事件应被保留，只有未完成物理尾部按后端规则处理。普通 JSON 行与 Zstandard 帧的完整性判断不同，不能复用一套随意字符串裁剪。

## 失败案例与恢复取舍

假设工具已经向外部系统发出请求，日志 append 尚未 flush 就崩溃。恢复日志里可能只有调用，没有结果；这不能证明工具没执行。耐久日志最多保存可确认事实，不自动提供 external exactly-once。恢复器应该把结果标为未知，查询外部状态或要求人工对账，不能为了补一条成功事件再次发送同一请求。

另一个失败是解析 JSONL 时遇到任意错误便忽略该行继续。中间记录损坏与末尾未完成不是一回事；跳过中间 seq 会让后续事实失去合法前缀，工具配对与迁移都可能错位。应报告格式或完整性错误，保留原件并停止写入。恢复过程也不得通过重编号所有事件“修好”缺口，因为来源引用与分支继承依赖原始身份。

清理和关闭同样有风险。取消用户任务可以取消模型请求，但存储资源释放不能随同一个已取消 signal 被跳过；最终 drain 失败必须报告，而不是只把界面显示为 cancelled。所有权丢失后继续写入会造成两个真相源，应停止新工作。观察者看到旧前缀可能是并发读取的合法结果，是否保证最新需要 API 明确约定，不能自行把旧数据判为丢失。

存储验收还应记录失败发生在确认前还是确认后。确认前拒绝的批次不能被调用者当作已耐久；确认后读取仍看不到承诺前缀，则属于后端契约违例。不同存储实例的观察保证可能不同，不能把同一实例的读取新鲜度扩展到所有进程。恢复报告应逐项列出已恢复、已平衡和无法判断的状态，让继续执行依据明确事实而非日志长度。

## 实验验收与实现边界

命令应证明 append 后 visible 增长、durable 未增长，flush 后出现耐久模型快照，模拟重启只保留屏障前内容。第二写者、seq 缺口必须拒绝，close 两次应安全。真实耐久验收需要子进程崩溃、实际文件系统、跨进程争抢、尾部损坏与 flush 故障注入；本实验没有替代这些测试，也不对操作系统或设备断电行为作保证。

原 1–12 章 `local-harness-tutorial` 明确为单进程只读助手，不能因为已有会话文件就声称实现跨进程锁或全部上游 handle 语义。已落盘的扩展 labs 可承接确定性状态实验，本章只新增文稿。生产耐久性仍取决于选用后端、文件系统与部署条件，而外部副作用的幂等与对账将在第四十章单独处理。

## 当前恢复与写者失效验收

2026-10-23 对照 [DeepSeek rc.2 Persistence](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/persistence.md)，append/flush 后的读取新鲜度承诺覆盖同一 backend instance 上所有随后开始的 read，不只原写 handle；它不自动扩展到跨实例的实时可见。write-behind 是有界批处理，不是批处理窗口结束就保证磁盘耐久，真正的屏障仍是已成功结算的 flush。

上述代码现在同时验证旧 writer 在重启后不能继续追加。真实 lease 需要独立 fencing 身份，不能在 owner 名称重复时复活旧 handle。正常验收应区分接受、可见和耐久前缀；异常验收包括 flush 拒绝、关闭期间取消、写者失效和后台批次保留顺序。练习使批次第二项 seq 错误，断言第一项也没有部分进入 visible；排错将所有权错误、格式损坏与存储 I/O 分列，不把重试工具作为日志修复步骤。

## 官方固定来源

- [DeepSeek Harness：Persistence 与恢复](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/persistence.md)，核对 handle、flush、write-behind 和 interrupted 恢复。
- [DeepSeek Harness：耐久事件目录](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/persistence-catalog.md)。
- [Node.js 22：FileHandle.sync](https://nodejs.org/docs/latest-v22.x/api/fs.html#filehandlesync)，操作系统同步 API 不等于整个业务事务。

上一章：[第三十七章：事件与请求回放](./37-event-surface) · 下一章：[第三十九章：会话分支](./39-session-branching)
