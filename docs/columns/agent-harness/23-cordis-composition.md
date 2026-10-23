---
title: '第23章：Cordis 服务、事件与配置组合'
description: 从服务依赖、可逆注册和事件调度理解 Cordis，再用原项目 scope 实验验证生命周期并标出简化边界。
date: '2026-10-23'
category: 智能体工程
tags: [Cordis, 服务组合, 生命周期]
series:
  order: 23
---

# 第23章：Cordis 服务、事件与配置组合

当工具、模型、技能和会话都能替换，最大的风险往往不是接口太少，而是它们偷偷依赖加载顺序和全局状态。Cordis 把服务发现、依赖、事件和资源所有权纳入一个组合框架。理解它时，应先问“谁注册、谁使用、谁清理”，再看配置语法。

DeepSeek 在参考版本中使用仓库内 vendored Cordis。原教程的 `createScope()` 仅借鉴可逆 effect 思想，不是 Cordis 实现，也没有 `inject`、事件模式、热重载或 scope 链。两个系统共享设计原则，但 API 与运行能力不能互换。

## 23.1 服务依赖不是手工调用顺序

服务在 context 上声明稳定名字，consumer 从 context 获取契约，而不是直接导入某个具体 provider。插件通过 `inject` 声明所需服务，框架在依赖可用时激活。这样替换 provider 不必修改全部 consumer，也能让缺依赖成为可诊断状态。

不过，同一个名字不等于同一个契约。两个插件都声明 `ctx.tools`，仍需保证 schema、取消和结果形状一致。命名解决寻址，类型与运行验证解决行为。把一个不兼容对象塞进同名槽位，不能靠插件框架自动修复。

注册还应带生命周期所有权。监听器、工具、提示段与 provider 都属于某个激活实例；实例卸载时撤回自己的贡献。不能用一个全局 `delete(name)` 让旧实例的迟到清理删除新实例，否则重载过程中会出现幽灵服务或错误覆盖。

## 23.2 调度模式属于公共契约

| Cordis 模式 | 等待语义 | 适合表达 |
| --- | --- | --- |
| `emit` | 不等待，观察顺序按注册 | 通知，不作为完成门 |
| `parallel` | 等待并行监听 | 独立准备或收尾 |
| `serial` | 等待顺序监听 | 明确的串行生命周期 |
| `waterfall` | 以 around 链委派，返回值传播 | 拦截和政策组合 |
| `bail` | 同步直到有监听返回决定 | 单一选择 |

这个表来自固定版本 primer，不把 JavaScript Promise 与事件名字混为一谈。文档把 waterfall 标作不由调度器等待，并不表示监听返回的 Promise 没有意义；调用者仍需遵守该事件声明的返回契约。`next()` 是委派给后续链，不是自动循环所有监听。

观察事件不能作为执行审批。若核心不等待 `emit`，审批监听异步弹窗时，工具可能已经执行；应该把门放在可阻断且被调用方等待的决策边界。反过来，把日志监听放进强制串行门，也可能使一个慢日志服务阻塞全部工具。

## 23.3 组合后的真实数据流

```text
profile -> 有序 bundle 与补丁 -> loader 配置行
                                    |
                            inject 依赖满足
                                    |
                        插件激活 -> 服务 / 事件 / effect
                                    |
                       consumer 调用契约 -> provider
                                    |
                        卸载 -> 撤回注册并等待资源清理
```

DeepSeek profile 叠加 bundle、profile 补丁、home 补丁和命令行覆盖；补丁命中配置行后替换整份 config，不能未经核对假设深层对象逐字段合并。配置应在激活边界解析和验证，最终运行树才是实际事实。

`!!js` 表达式属于该 loader 的配置机制，不是普通 YAML 的安全数据。允许表达式意味着配置可以访问运行 context；使用者需要像审查代码一样审查可信配置。外部市场说明或工具返回的文本不能直接成为表达式配置。

## 23.4 用原源码验证最小所有权

下面代码从示例根运行，导入现有 `src/scope.mjs`，不新增依赖、不请求模型。它验证挂载失败回滚和反向清理，而不是演示 Cordis 的完整功能。

```sh
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { createScope } from './src/scope.mjs';

const scope = createScope();
const events = [];
await scope.mount(async (ctx) => {
  ctx.provide('reader', { read: () => 'fixture' });
  ctx.onDispose(() => events.push('reader disposed'));
});
await assert.rejects(scope.mount(async (ctx) => {
  ctx.provide('temporary', { value: 1 });
  ctx.onDispose(() => events.push('failed mount cleaned'));
  throw new Error('activation failed');
}), /activation failed/);
assert.throws(() => scope.get('temporary'), /Unknown service/);
await scope.mount(async (ctx) => {
  assert.equal(ctx.get('reader').read(), 'fixture');
  ctx.onDispose(() => events.push('consumer disposed'));
});
await scope.dispose();
assert.deepEqual(events, [
  'failed mount cleaned', 'consumer disposed', 'reader disposed',
]);
await scope.dispose();
assert.equal(events.length, 3);
assert.throws(() => scope.get('reader'), /Unknown service/);
console.log('scope ownership verified');
JS
```

consumer 后挂载、先清理，可以在 teardown 时仍访问其依赖。挂载失败只撤回该次登记的 effect，不破坏已经存在的 reader。重复 dispose 不再次执行清理，避免重复关闭句柄或重复删除状态。

这个 scope 没有依赖等待：consumer 若先挂载，会立即找不到 reader。它也没有服务动态替换或并发挂载隔离。示例源码中的共享 Map 与简化数组不能被描述成热重载安全容器，尤其不能同时 mount 与 dispose 后假设所有竞争已解决。

## 23.5 失败案例：注册清了，异步工作没停

一个插件卸载时删除工具名，却没有取消正在执行的远程请求。请求稍后完成，再向已关闭会话注入结果。这里的清理缺少静止屏障：不仅要请求取消，还要等待插件拥有的工作全部结算，之后才允许卸载完成。

另一种失败是服务 provider 变更，而 consumer 仍缓存旧对象。获取服务的方法与生命周期要一致：要么依赖变更重新激活 consumer，要么方法在操作边界解析当前服务，不能一半动态、一半静态。工具执行还应绑定调用开始时的身份，避免处理中途被切成另一个执行器。

配置层也会引发误判。开发者改了底层 bundle，但上层补丁替换了整个 config，实际运行没有使用新值。排查应查看最终组合树和来源，而不是反复编辑 provider 默认值。DeepSeek 支持 `dsh --profile web --dump-config` 查看运行组合，这属于上游命令，不存在于本地教学 CLI。

## 23.6 实验与可观察验收

运行上述代码，应按指定顺序得到三项清理记录，失败挂载的服务不存在，重复清理无新增记录。把 consumer 放在 reader 之前，应出现缺服务错误，证明教学 scope 并未实现 Cordis 的注入等待。

在上游隔离测试组合中，进一步验证依赖出现与消失、注册重名、卸载期间请求、监听抛错和事件取消。每种事件必须按其 mode 验收：观察监听失败是否能阻断动作，需要看事件契约，不能用所有监听统一吞错。

原示例根运行 `npm test` 可回归第二章生命周期；`npm run labs` 则验证新增独立机制，不把两套运行器误当完整 Cordis 应用。这里未安装 Cordis，也未实现 loader、HMR、作用域层合并或动态服务注入。

## 23.7 固定来源

DeepSeek 根包 `0.2.1-alpha.5` 的[Cordis primer](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/cordis-primer.md)、[架构配置层](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md)及[scope 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/scope.md)是本文契约依据。具体服务配置可对照[配置目录](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/config-catalog.md)。

这些链接固定到同一提交，不使用其他 Cordis 版本文档解释本版本行为。教学源码直接位于下载包 `src/scope.mjs`，只验证本文声明的最小所有权子集。

## 23.8 组合契约的当前升级路径

2026-10-23 对照 [DeepSeek RC.2 清单](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/package.json)，上游仍需按自己的依赖与 loader 契约验收。若采用发布包而非 vendored 快照，先核对服务类型、事件 mode 与配置替换规则，不能用“Cordis 同名”推导版本兼容。

练习：在独立组合中模拟依赖消失、旧实例迟到清理和异步请求期间卸载。正常卸载应等待拥有的工作结算并移除自己的注册；旧 disposer 不得删除新实例的同名服务。若服务名存在却调用旧对象，检查 consumer 是否缓存了旧 provider；若配置未更新，检查最终组合来源和整体替换层，不从默认值猜测实际配置。

---

上一篇：[第22章：插件格式、市场与版本分发](./22-plugin-packaging.md) · 下一篇：[第24章：Hooks、中间件与 Mods 的执行边界](./24-hooks-mods.md)
