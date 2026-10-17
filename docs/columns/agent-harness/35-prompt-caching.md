---
title: 第三十五章：稳定前缀与 Prompt Cache
description: 从请求序列和供应商 usage 理解前缀缓存，避免把缓存命中误认为语义记忆或上下文容量扩展。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, Prompt Cache, 请求优化]
series:
  order: 35
---

# 第三十五章：稳定前缀与 Prompt Cache

连续几轮问题共享同一项目规则和历史，重复计算这些前缀通常没有价值。但“模型似乎记得上次输入”不等于服务器已经缓存命中。Prompt Cache 复用的是供应商支持的请求前缀计算，不是按意思检索知识，也不是代替会话持久化。本章从请求材料的稳定性出发，要求优化可被 usage 证实，正确性不依赖缓存永久存在。

## 概念与真实机制

语义相同不代表缓存相同。交换工具 schema 顺序、修改一个空格、把当前时间插到系统提示开头，都可能改变前缀；具体命中还取决于供应商的缓存单元、最小长度、生命周期和模型能力。宿主侧哈希只能识别自己构造的材料是否一致，不能证明供应商已经保存对应 KV，也不能用一次较快响应推断命中。

DeepSeek API 官方缓存说明提供 `prompt_cache_hit_tokens` 与 `prompt_cache_miss_tokens`，并说明缓存为 best-effort，输出仍重新生成。核验时文档描述完整匹配已经持久化的 cache prefix unit；这些供应商规则属于动态文档，不能推广成所有 OpenAI 兼容服务的通用行为。兼容 messages 格式不意味着兼容缓存字段，更不意味着本机 Ollama 必然支持相同计量。

DeepSeek Harness `0.2.1-alpha.5` 的装配契约把动态 `PromptContext` 与稳定 `PromptSection` 分开。运行上下文在当前历史后以快照出现，仅在改变或被压缩移除后重新记录。系统提示如何更新还取决于准备调用声明的 in-history 能力；不支持的路由与新 request series 需要重新协调表面。缓存优化必须服从真实路由能力，而不是强行将 system message 放到任意位置。

## 数据流与状态契约

```text
稳定规则 + 稳定工具定义 + 已结算历史 -> 确定性前缀
当前目录/新观察/用户输入             -> 动态尾部
完整请求 -> 供应商匹配缓存单元 -> 新生成输出 -> usage
本地材料相同 != 已缓存；缓存命中 != 输出相同；缓存失效 != 任务失败
```

教学建议稳定前缀使用确定排序、明确版本和一致序列化，动态事实放在其实际被观察的请求边界。不要为了命中缓存延迟必要事实，尤其是权限收紧、工具卸载、工作区变化或用户的新约束。旧信息越稳定不代表越正确；缓存安全的目标是让不变材料保持不变，让变化材料及时变化，不能追求最大命中率而故意向模型提供过期能力。

缓存命中输入仍占上下文窗口，不能从预算使用量里删除。它可能影响成本与首 token 延迟，但具体价格应来自请求当时的官方计费资料，不能把旧价格长期写进教程。记录实际 usage 时还要保留 provider、model、请求版本与字段是否缺失；缺少字段表示未知，不等于零命中，也不应填入本地估算作为真实计费数字。

## 自包含 Node.js 22 实验

下面只是本地前缀身份实验，不发送模型请求。它用固定序列生成摘要，演示把动态时间放到前缀会破坏身份，以及同一前缀配不同尾部仍能保持相同本地签名。摘要不是服务商 cache key，程序输出的 passed 也不是任何真实缓存命中证据。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
function signature(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function assemble({ rules, tools, runtime, prompt }) {
  const ordered = structuredClone(tools).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const prefix = [{ role: 'system', content: rules }, { tools: ordered }];
  return { prefixId: signature(prefix), body: [...prefix, { runtime }, { role: 'user', content: prompt }] };
}
const tools = [{ name: 'read', version: 1 }, { name: 'list', version: 1 }];
const a = assemble({ rules: 'Read only', tools, runtime: { revision: 1 }, prompt: 'A' });
const b = assemble({ rules: 'Read only', tools: [...tools].reverse(), runtime: { revision: 2 }, prompt: 'B' });
assert.equal(a.prefixId, b.prefixId);
assert.notEqual(signature(a.body), signature(b.body));
const changed = assemble({ rules: 'Read only at 10:01', tools, runtime: {}, prompt: 'B' });
assert.notEqual(a.prefixId, changed.prefixId);
function usageEvidence(usage) {
  if (!Number.isInteger(usage?.prompt_cache_hit_tokens) || !Number.isInteger(usage?.prompt_cache_miss_tokens)) return 'unknown';
  assert.ok(usage.prompt_cache_hit_tokens >= 0 && usage.prompt_cache_miss_tokens >= 0);
  return 'reported';
}
assert.equal(usageEvidence({}), 'unknown');
assert.equal(usageEvidence({ prompt_cache_hit_tokens: 64, prompt_cache_miss_tokens: 8 }), 'reported');
console.log('prefix identity: passed; provider cache not measured');
NODE
```

代码里的 tools 包装不是真实 provider wire format，它仅用来表示稳定能力材料；实际发送必须通过已核对的适配器。usage 中两个整数也是测试夹具，不代表真实请求结果。对接某个供应商时，要保留原始字段并做类型校验，不能因为同名字段出现就假定它覆盖全部输入或与另一个供应商的 cache_read 语义完全一致。

## 失败案例与取舍

失败案例之一是每次把随机 runId 加入第一条系统提示，然后抱怨长规则无法命中。runId 可以进入审计信封或动态尾部，未必需要影响模型稳定前缀。另一种失败是为节省缓存成本，不更新“这个工具已被禁用”的事实，模型仍尝试调用；执行器虽然应拒绝，但无谓请求和错误计划已经发生。正确性必须先于缓存优化。

更严重的误解是把缓存当长期记忆：用户开新会话后不再发送项目规则，却希望服务商自动从旧缓存补齐。缓存只匹配当前请求提供的材料，不负责发现缺失的语义知识。持久化历史、记忆检索和权限检查仍需宿主负责。缓存过期、模型切换或节点调度变化，不应造成业务状态丢失，更不能触发未经确认的自动重复外部操作。

测量优化时应比较相同任务类型的请求序列，记录实际命中、总输入、首 token 延迟和完成质量。只有稳定前缀身份相同而供应商报告命中，才有相应证据；响应更快可能来自排队、网络、输出更短或模型路由变化。应保留无缓存基线，但不在未经授权的情况下上传真实敏感项目内容做性能测试。

缓存审计还要避免把请求摘要用于记录敏感材料。摘要适合比较身份，原始文本只在已有授权与保留策略下保存；服务商是否跨项目共享缓存、缓存在哪个区域保存，不能从本地哈希推断。没有相应官方证据时，应明确这些实现细节未知。正确请求应在缓存完全不可用时仍然成立，命中只是优化，不成为业务继续运行的前提。

## 实验验收与实现边界

完整命令应输出本地身份通过且“provider cache not measured”。交换工具顺序不改变签名，改变规则必须改变签名，缺少 usage 不得显示零。继续实验可改变工具版本，要求签名变化；只改变 runtime，要求前缀保持不变且完整请求变化。验收目标是确定性装配与未知值处理，不是缓存命中率。

原 1–12 章连接本地兼容模型，未实现 DeepSeek API 缓存控制或计费对账。扩展 `labs/context.mjs` 与 `labs/eval.mjs` 已落盘，`npm run labs` 使用实际汇总脚本；此处不建立新的网络 API，也不修改实验脚本。生产场景还需要真实 provider 文档、授权后的 usage 采样及隐私边界，才能报告性能收益。

## 官方固定来源

- [DeepSeek Harness：缓存安全的动态上下文](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/system-prompt.md)，固定上游提交与版本边界。
- [DeepSeek Harness：系统更新与请求系列](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md)，核对适配器能力决定的行为。
- [DeepSeek API：Context Caching](https://api-docs.deepseek.com/guides/kv_cache)，动态官方供应商说明，核验日 2026-10-17，不作为其他模型的计价规则。

上一章：[第三十四章：上下文压缩](./34-context-compaction) · 下一章：[第三十六章：检索与长期记忆](./36-retrieval-memory)
