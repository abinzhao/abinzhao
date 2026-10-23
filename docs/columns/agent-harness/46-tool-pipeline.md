---
title: 第四十六章：工具输出契约与执行管线
description: 从规范 JSON 值到模型展示和最终日志建立工具管线，保持权限拒绝不可被中间件撤销并正确结算失败。
date: '2026-10-23'
category: 智能体工程
tags: [Tool Pipeline, 输出契约]
series:
  order: 46
---

# 第四十六章：工具输出契约与执行管线

工具函数返回一个对象之后，任务还没有结束。对象可能不符合输出 schema，展示可能遗漏关键字段，后置策略也可能改写内容；最终日志必须记录真正返回给模型的结果。若这些阶段随意串在一个 try/catch 中，权限拒绝可能被下游重试绕过，执行成功却因为展示失败被重复执行。本章建立规范值、模型内容与审计结果分离的管线。

## 概念与状态契约

规范值是工具实际产出的有类型 JSON，模型内容是供下一轮推理使用的文字或图片，presentation metadata 是界面需要的结构。三者不能互相代替。`JSON.stringify` 不自动保证无损 JSON：undefined 属性会丢失，NaN 与 Infinity 会改变，BigInt 或循环结构会失败。输出边界应明确支持类型、大小与 schema，不能用 String(value) 将所有异常伪装成正常文字。

```text
call identity -> pre-execute 改写 -> monotonic guards
             -> execute 包装 -> 工具规范值 -> schema 校验/render
             -> projectContent -> post-execute -> 外层归一化
             -> finalizeContent -> 冻结最终结果 -> result 通知 -> 日志
deny: 跳过工具主体；失败: 保留错误身份，不制造成功规范值
```

Monotonic guard 的含义是拒绝不能被后续策略改成允许。可扩展 pre hook 能变更参数或路由，但变化后的目标仍须经过守卫；已经拒绝的请求不得由“重试插件”直接调用主体。审批未配置或不能得到答案时，受保护操作应 fail closed。审计必须保留最终被执行的参数与身份，不能只保存最初模型字符串后假称对应真实操作。

## 自包含 Node.js 22 实验

下面简化管线验证拒绝短路、输出类型与规范值/展示分离。schema 校验只有一个 count 字段，不是通用 JSON Schema 实现。程序只运行内存函数，没有文件或外部写操作；上游事件和 callback 名称在后文解释，不把实验函数冒充产品 API。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
let executions = 0;
const definition = {
  async execute(args) { executions++; return { count: args.count }; },
  validate(value) { return Number.isInteger(value?.count) && value.count >= 0 && Object.keys(value).length === 1; },
  render(value) { return `count=${value.count}`; }
};
async function invoke(args, guards, post = x => x) {
  const input = Object.freeze(structuredClone(args));
  if (guards.some(guard => guard(input) === 'deny')) return Object.freeze({ isError: true, code: 'DENIED' });
  try {
    const value = await definition.execute(input);
    assert.ok(definition.validate(value), 'invalid canonical output');
    const canonical = Object.freeze(structuredClone(value));
    const content = post(definition.render(canonical));
    assert.equal(typeof content, 'string');
    return Object.freeze({ isError: false, value: canonical, content });
  } catch {
    return Object.freeze({ isError: true, code: 'OUTPUT_OR_EXECUTION_ERROR' });
  }
}
const denied = await invoke({ count: 1 }, [() => 'deny', () => 'abstain']);
assert.equal(denied.code, 'DENIED');
assert.equal(executions, 0);
const accepted = await invoke({ count: 2 }, [() => 'abstain'], () => '[preview]');
assert.equal(accepted.value.count, 2);
assert.equal(accepted.content, '[preview]');
assert.equal((await invoke({ count: NaN }, [])).isError, true);
assert.ok(Object.isFrozen(accepted.value));
console.log('tool pipeline: passed');
NODE
```

输出校验失败发生在主体之后，所以不能为了得到合法输出再自动执行主体。执行可能已经产生副作用，应将失败归入输出结算并保留真实状态。展示替换也不能改变 canonical value 的业务含义；若模型只见预览，要明确截断与检索线索。程序中没有展示原始异常细节，是为了避免泄漏，但真实实现仍应提供内部可关联错误身份，方便授权排障。

## 已确认的上游机制

DeepSeek Harness `0.2.1-alpha.5` 固定提交的 ToolDefinition 要求 output schema 与 render，execute 返回规范 JSON 值。execute 接收冻结参数与执行上下文，需要响应 signal 并在拥有的工作静止后结算。注册表不能硬杀同进程代码，也不能用丢弃 promise 的方式宣称取消完成；进程型工具要由相应 provider 停止资源。

已确认的工具管线先运行 pre-execute waterfall，再运行注册的单调 guards，随后 execute 与 post-execute。projectContent 在后置策略前安装执行准备的内容，finalizeContent 在最终阶段仅变更 content，不可任意接管其他字段；最终 tools/result 是冻结结果通知，监听失败被约束。并发调度中 pre 与 post 有模型顺序，execute 可以有界并行，不能把一次回调返回顺序当作所有阶段顺序。

工具归一化也覆盖管线或结果快照失败，将其表达为 isError，而不是发送非法结构。工具延后的 additionalContext 有单独的生命周期，拒绝或替换策略如何影响它需要遵守契约；不能让模型看不到的隐藏状态直接改变下一次请求。tool/call 与 tool/result 都需形成可审计配对，取消未执行项要明确结果，而不是减少结果数来让测试看似通过。

## 失败案例与设计取舍

失败案例之一是 guard 已 deny，around middleware 捕获异常后直接重新执行工具，绕过权限。拒绝必须成为不可逆准入结果，不是可重试网络错误。另一种失败是输出 schema 期待 number，工具返回字符串，render 恰好显示正常，模型据此作计算；规范值校验应在展示之前，不能凭“文字看起来正确”跳过类型契约。

后置内容改写也可能制造虚假成功。安全插件删除错误详情之后，结果仍应保留 isError；不能把内容写成“已完成”而忽略失败身份。结果观察监听器只用于监控，不应获得修改最终 outcome 的能力，否则日志、UI 与调用者将看到不同事实。日志脱敏和模型结果裁剪的对象不同，需要说明究竟改写哪一份材料。

重试范围应按工具性质决定。只读网络查询可在有限预算内重试，但重做后的事实可能更新；写入、命令与浏览器提交需要幂等或对账。通用 retry 插件不能根据异常名称自动重复所有 execute。超时包装也必须传播取消并等待资源静止，不能先返回 result 再让主体继续写入。最终状态是执行与结算共同结果，不是 middleware 自己的成功标记。

展示层需要在可读性与完整性之间取舍。纯 JSON 对模型不一定高效，文字 render 可以突出关键事实，但必须可重放且绑定规范值。图片附件需要耐久身份和路由支持，不能使用一个已过期链接当可回放证据。对于很大结果，Spill 与有限预览应该注明缺失范围；若没有完整保存，就不能在结果元数据里报告 fullResultAvailable。

输入与输出规范应同时版本化。工具 schema 更新以后，旧日志仍需使用当时的参数解释与展示规则，不能用新 renderer 改写旧成功含义。若缺少旧规则，应标记回放能力不完整。最终观察通知可以增加监控标签，但不能改变调用者已取得的结果；同一次执行的日志、模型内容和界面状态应能通过稳定身份对齐。

## 实验验收与实现边界

完整命令应证明 deny 不调用主体，abstain 允许继续，非法 count 变成错误，展示替换不改变规范值，最终对象被冻结。继续实验可让 post 抛错，要求不重做 execute；把返回值改成循环对象，要求在无损边界拒绝；模拟取消时主体还活动，要求不提前报告清理完成。真实验收还需 JSON Schema、guard 身份保护、并发顺序与日志配对。

原 1–12 章独立 Node.js 22 ESM 项目有简单工具边界，但不是上游全部 ToolDefinition、waterfall 与规范输出注册表。扩展 labs 可验证这些小契约，本章不改实际工具实现或依赖。只有最小单元断言通过，不能声称所有插件、MCP、PTC 和浏览器工具都已经具有相同生产结算保证。

## 当前 PTC 子调用仍经过门禁

2026-10-23 对照 [DeepSeek rc.2 工具管线](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/tool-execution-pipeline.md)：保留的 `run_code` 传输及程序内序列化子调用都经过标准管线。子调用携带 parent token，记录 `tool/ptc-dispatch`；拒绝返回 binding rejection，并省去子调用的 `additionalContexts` 以保持调用/结果邻接。不能因为外层 run_code 已获批准，就让内层任何工具自由执行。

操作练习给原 invoke 增加 parent 调用身份，在允许外层但拒绝内层的案例中断言 executions 不增加。正常验收应对齐规范值、模型展示与冻结最终通知；异常验收是 post 或 snapshot 失败发生在主体之后，不重做 execute，不把“输出失败”改写成“没有产生效果”。排错记录阶段身份与主体是否启动，分别定位 pre 改写、guard 拒绝、执行错误和结算错误。若对齐审计与模型投影失败，应明确结果不完整，不能拿 renderer 的成功字样覆盖 canonical 失败。

## 官方固定来源

- [DeepSeek Harness：工具管线图与阶段职责](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/tool-execution-pipeline.md)。
- [DeepSeek Harness：ToolDefinition 实际源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/core/tools/src/index.ts)。
- [DeepSeek Harness：Tools 契约目录](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/tools.md)。

上一章：[第四十五章：PTY 与后台任务](./45-pty-background-jobs) · 下一章：[第四十七章：Code Mode 与 PTC](./47-code-mode-ptc)
