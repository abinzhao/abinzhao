---
title: '第25章：MCP Host、Client 与 Server'
description: 以连接所有权、命名与授权数据流解释 MCP 三方架构，区分协议互通、宿主适配和实际执行隔离。
date: '2026-10-17'
category: 智能体工程
tags: [MCP, Host, Client, Server]
series:
  order: 25
---

# 第25章：MCP Host、Client 与 Server

MCP 让智能体宿主连接外部工具和资源，但它不负责把模型的所有请求变成安全操作。理解架构时，要把承载模型的 Host、管理协议通信的 Client，以及提供能力的 Server 分开。连接成功只证明通信链路建立，不证明用户已经批准服务器的所有行为。

本章以 MCP `2026-07-28` 官方规范为协议基线，旧版握手留到第二十七章比较。DeepSeek 参考代码固定为 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`、`0.2.1-alpha.5`。原教学项目没有 MCP 连接，下面内存实验也不冒充完整 MCP 客户端。

## 25.1 三方各自拥有哪部分状态

Host 管理模型交互、用户授权、工具呈现和会话记录；Client 是 Host 内的协议连接与请求适配器；Server 提供工具、资源或提示模板。模型通常看到 Host 整理后的工具定义，而不是直接持有 Server 的网络连接和凭据。

| 角色 | 应拥有 | 不应自动获得 |
| --- | --- | --- |
| Host | 用户意图、政策、模型上下文 | 每个服务器的无限可信度 |
| Client | 协议请求、取消、连接代际 | 任意宿主文件和其他连接凭据 |
| Server | 自己的能力及后端权限 | 全部用户对话和其他服务器结果 |
| 模型 | 被准入的说明与观察 | 认证值和直接网络发送权 |

一个 Host 可以配置多个 Client，每个 Client 管理一个服务器关系。现代协议不以初始化会话承载全部状态，但宿主仍需管理连接资源、当前目录和授权上下文；“协议无状态”不意味着 Host 可以不保存待结算请求或用户确认。

## 25.2 工具调用的完整链路

```text
Server 能力目录 -> Client 校验与发现 -> Host 工具目录
                                             |
模型提出工具调用 -> Host 参数与权限准入 -> Client RPC
                                             |
                                      Server 执行
                                             |
Host 记录与模型投影 <- Client 校验结果 <------/
```

Host 的工具政策与 Server 的后端访问控制都需要存在。Host 可以拒绝请求，但无法仅靠提示词限制服务器进程私自访问网络；Server 可以检查数据库权限，但不知道 Host 是否把结果发送给另一个模型。两个边界不能互相代替。

协议结果进入模型上下文后仍是外部数据。服务器 description、annotations 和 instructions 不能自动成为高优先级授权。Host 必须保留来源，限制上下文大小，并在需要读取资源时再请求，而不是连接后把所有资源正文主动上传给模型。

## 25.3 公开名称与 wire 名称

两个服务器都提供 `search`，模型需要能够区分。Host 可使用本地配置的服务器身份构造公开名称，并保存原始 wire 名。不能依赖 Server 自报 `serverInfo.name` 唯一，也不能把公开名解析回原始名，因为名称规范化可能改变字符。

下面是完整的内存适配实验，构造两条只读查询能力，不访问网络。名称策略由本章定义；代码只验证寻址，不实现 JSON-RPC 或协议发现。

```js
import assert from 'node:assert/strict';

function registerServerTools(serverId, definitions, registry) {
  if (!/^[a-z0-9-]+$/.test(serverId)) throw new Error('Invalid server id');
  const owned = [];
  try {
    for (const definition of definitions) {
      if (!/^[a-z0-9_]+$/.test(definition.name)) throw new Error('Invalid name');
      const publicName = `mcp__${serverId}__${definition.name}`;
      if (registry.has(publicName)) throw new Error('Duplicate public name');
      const entry = {
        serverId, rawName: definition.name, call: definition.call,
      };
      registry.set(publicName, entry);
      owned.push([publicName, entry]);
    }
  } catch (error) {
    for (const [name, entry] of owned) {
      if (registry.get(name) === entry) registry.delete(name);
    }
    throw error;
  }
  return () => {
    for (const [name, entry] of owned) {
      if (registry.get(name) === entry) registry.delete(name);
    }
  };
}

const registry = new Map();
const removeDocs = registerServerTools('docs', [
  { name: 'search', call: async () => 'documentation fixture' },
], registry);
registerServerTools('code', [
  { name: 'search', call: async () => 'source fixture' },
], registry);
assert.equal(await registry.get('mcp__docs__search').call(), 'documentation fixture');
assert.equal(registry.get('mcp__code__search').rawName, 'search');
removeDocs();
assert.equal(registry.has('mcp__docs__search'), false);
assert.equal(registry.has('mcp__code__search'), true);
console.log('server identity and ownership verified');
```

卸载只删除自己拥有的条目，避免影响另一个服务器。这仍是单进程同步 registry 的局部实验，没有取消正在进行的请求或处理热重载；异步资源生命周期需要更强的关闭屏障。

## 25.4 DeepSeek 桥接不是共享万能服务

固定版本每个 `dsh-mcp-client` 配置行管理一个服务器，不提供通用 `ctx.mcp` 服务。它把发现的工具注册到 `ctx.tools`，公共名使用配置的 `serverName`，而 `tools/call` 发送原始名称。资源由独立的 `ctx.mcpResources` 共享服务按调用 scope 选择连接。

同一 registration scope 里的服务器名必须唯一，不同 agent scope 可以复用。公开名称需要满足模型工具名限制；该实现发生有损替换或截断时追加身份摘要，避免不同 wire 名被压成相同字符串。这个命名算法是宿主适配策略，不是 MCP 强制前缀。

Server 没有 tools 能力并不意味着连接无效，它可能只提供资源或说明。Host 应按声明的能力选择请求，不能连接后无条件发送所有发现方法。现代版本的能力取得与逐请求元数据见第二十七章，不能套用旧初始化返回值。

## 25.5 失败案例：本地进程就是可信服务

stdio Server 在本机运行，通常拥有进程用户权限。若 Host 用 `npx -y` 临时获取浮动版本并传入全部环境变量，风险来自包执行和凭据继承，不会因为通信是本地管道而消失。需要固定来源与版本、最小环境、明确安装许可和实际进程隔离。

远端 Server 则涉及网络目的地和 OAuth 授权。工具描述写“只读”不能证明没有副作用；annotations 是服务器声明，只有经过信任与政策判断才能作为辅助信息。Host 的批准还应绑定最终参数，不能仅批准“这个服务器看起来可信”。

连接失败时不能改用另一个同名服务器继续执行。这样既改变工具语义，也可能改变数据接收方。恢复应关联原配置身份；需要替代服务时重新做能力、权限、预算和出域准入。

## 25.6 实验与可观察验收

运行上述代码，应看到两个 `search` 共存，卸载 docs 后 code 不受影响。把第二个服务器也命名为 docs，应因重名拒绝；故意制造一次批量注册中途冲突，确认已经登记的本次条目被撤回，不留下半个新目录。

真实 MCP 验收还需检查发现、调用、错误、取消与卸载，不只截图工具列表。应记录本地服务器身份、raw 名、RPC 标识和工具执行结果，禁止记录认证值。本文没有实际启动 Server，也未测试远端认证或进程隔离。

## 25.7 固定来源

协议依据 [MCP 2026-07-28 specification](https://modelcontextprotocol.io/specification/2026-07-28)与[工具规范](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)。DeepSeek 依据[子系统](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/mcp.md)、[连接配置与边界](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/mcp/mcp-client/README.md)和[工具适配源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/mcp/mcp-client/src/tools.ts)。

厂商宿主示例可读 [Claude Code MCP](https://code.claude.com/docs/en/mcp)，2026-10-17 核验。它支持哪些传输与 UI 是产品事实，不应反推为协议要求或本地教学项目已实现能力。

---

上一篇：[第24章：Hooks、中间件与 Mods 的执行边界](./24-hooks-mods.md) · 下一篇：[第26章：MCP 工具、资源与提示模板](./26-mcp-tools-resources.md)
