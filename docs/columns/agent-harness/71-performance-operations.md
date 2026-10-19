---
title: 第七十一章：性能、限流、资源泄漏与运维
description: 从准入、排队、执行和清理理解性能，以有界资源、重试纪律和故障恢复建立运维门槛。
date: '2026-10-17'
category: 智能体工程
tags: [性能, 运维]
series:
  order: 71
---

# 第七十一章：性能、限流、资源泄漏与运维

智能体服务的性能不只是 Token 每秒。一个任务会占用模型连接、工具进程、输出缓冲、会话写入和等待审批的资源。平均响应快却让取消后的进程不断积累，系统仍会失败。本章把优化目标落到准入、排队、执行和清理四个阶段，以有界资源和可观察终态代替单一速度指标。

## 先定义性能合同

记录任务端到端时间，同时拆分排队、首响应、模型、工具、提交与审批等待。不同任务类型不能盲目混合分位数；至少区分交互短任务与后台长任务。吞吐提高若来自跳过验证或减少安全检查，不是等价优化。比较前固定任务、模型路由、输入大小、缓存状态和完成标准，避免把条件变化误报为加速。

容量还应按多个资源限额定义。每用户活跃任务数、全局模型请求数、进程数、输出字节和对象存储增长分别有上限。单一并发限制不能防止一个任务产生巨量子进程或输出。准入拒绝应发生在分配昂贵资源之前，提供可重试的结构化结果，并避免一个租户占满全部槽位。

## 真实生命周期与资源所有权

DeepSeek Harness 固定提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa` 的 jobs 文档把状态分为 running、stopping、completed、killed、failed。producer 拥有执行资源，runtime 拥有身份、访问控制、生命周期和输出 ring。任务 ID 不是权限秘密，读取与控制依赖 owner 授权；复制会话历史也不转移 live job 所有权。

该文档明确 turn completion 不表示所有 job 都停止，settlement 记录也不独立证明资源已释放。某些结算可以晚于 turn/end，缺少结算记录仍是未完成证据。运维必须监控实际进程、句柄、订阅和写入器，而不能只数聊天中的完成事件。取消后先进入 stopping，再等待清理，必要时采用受控强制终止。

```text
准入 -> 有界排队 -> 获取资源槽 -> 执行
                           -> 停止/失败/完成
                           -> 清理确认 -> 归还资源槽
```

背压应一路传播。慢客户端消费 SSE 时，输出缓冲必须有上限；工具输出很大时应截断或 spill，但保留状态和可读取引用。队列不能隐藏等待时间，模型请求和工具请求还可能需要不同池。长任务占满交互池时，应按产品需要拆分调度，而不是无限提高全局并发。

## 自包含资源归还实验

下面的 bounded batch 只模拟一批内存任务，用计数器检查并发槽。它不是生产队列，不实现公平调度、速率窗口或进程清理。输入任务是人工夹具，不访问模型或网络，也不会创建后台进程。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
const jobs = [0, 1, 2, 3];
let cursor = 0;
let active = 0;
let peak = 0;
const results = Array(jobs.length);
async function worker() {
  while (cursor < jobs.length) {
    const index = cursor++;
    active++;
    peak = Math.max(peak, active);
    try {
      await new Promise(resolve => setTimeout(resolve, 2));
      if (jobs[index] === 1) throw new Error('injected-failure');
      results[index] = { ok: true };
    } catch (error) {
      results[index] = { ok: false, error: error.message };
    } finally {
      active--;
    }
  }
}
await Promise.all([worker(), worker()]);
assert.ok(peak <= 2);
assert.equal(active, 0);
assert.equal(results.filter(x => !x.ok).length, 1);
assert.equal(results.length, 4);
console.log(JSON.stringify({ peak, active, results }));
NODE
```

`finally` 归还计数器不等于资源真的已释放。若任务包装层超时返回，但子进程仍活着，槽位提前归还会超过真实容量。生产应等待资源拥有者确认关闭，或把仍在清理的资源纳入占用计数。不能用 Promise.race 超时就宣称底层操作取消，AbortSignal 也需要执行器配合。

## 限流与重试纪律

并发控制限制同时运行数量，速率限制约束单位时间的请求，两者不同。收到限流时应遵守服务端提示与本地总期限，采用有上限的退避及抖动。重试预算属于整个任务，不应让 SDK、网关和业务层各自重试导致乘法放大。记录每次尝试与最终结果，避免隐藏限流和费用增长。

写操作不能因为超时就自动重试。应先判断幂等性，使用服务端幂等键或查询状态；确认不了就进入待协调。鉴权失败、非法参数和硬策略拒绝通常不应当作暂时网络错误重试。熔断器限制持续故障扩散，但不能把安全策略服务不可用转换为默认允许，恢复探测也应有明确范围。

## 泄漏、恢复与运行手册

泄漏检查包括进程及子进程、PTY、文件句柄、HTTP 连接、事件订阅、计时器、对象 URL 与临时文件。正常、异常、取消和客户端断线都需覆盖，重复运行后观察资源是否回到稳定基线。内存会上下波动，不能单看一次 RSS；同时查看活跃对象计数、句柄和长期趋势，先建立证据再优化。

运行手册至少说明怎样停止接收新任务、等待已有任务、限制清理期限、导出故障证据和恢复检查点。重启后先核查未决副作用与检查点版本，不自动续做所有 running 动作。清理只能删除已确认属于本服务且无人引用的资源，不得用大范围目录删除修补磁盘增长。部署与回滚需要独立授权和可恢复流程。

性能优化应从测量到瓶颈，再做最小变化。例如上下文装配慢要看表面节点和计量成本，工具等待长要检查进程与网络，不能先换模型。缓存可能减少重复工作，也会引入修订与身份隔离问题；缓存键必须包含影响结果的条件。减少诊断数据还需保留安全审计最低要求，不能以吞吐为由关闭边界。

## 可观察验收与限制

运行实验应看到 peak 不超过二、active 最终为零，四个任务都结算且一个失败。真实压力测试还需固定任务集，记录队列、分位数、有效样本、错误、安全失败和资源高水位；取消风暴和慢客户端应单独测。没有负载实验就不能给出真实 QPS、尾延迟或容量数字。

基础项目只允许单进程会话写入，Web 在进程内拒绝并发；`labs/` 不是生产调度器，也没有远程 job 服务。本章未启动真实 PTY、容器或多 Agent 压测。上线前须验证多租户准入、强隔离、进程树清理和耐久恢复，不能把内存 worker 实验当成这些能力已实现。

## 固定来源

- [DeepSeek jobs](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/jobs.md)：状态、所有权和晚于 turn 的结算。
- [DeepSeek subprocess](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/subprocess.md)与[terminal](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/terminal.md)：真实进程清理阅读入口。
- [Node.js 22 child_process](https://nodejs.org/docs/latest-v22.x/api/child_process.html)：进程与退出语义。

上一章：[第七十章：OpenTelemetry、诊断与成本](./70-observability-cost.md)

下一章：[第七十二章：完整项目验收、生产交付与技术地图](./72-production-capstone.md)
