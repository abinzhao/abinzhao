---
title: 第四十一章：会话格式、版本迁移与数据生命周期
description: 将物理 framing、逻辑版本与事件语义分开，以不可变原件、相邻迁移和只读预检保护会话历史。
date: '2026-10-17'
category: 智能体工程
tags: [格式迁移, 数据生命周期]
series:
  order: 41
---

# 第四十一章：会话格式、版本迁移与数据生命周期

升级应用之后打不开旧会话，问题可能不在模型。事件字段改变、压缩封装改变、插件投影消失，都可能使历史被误读。危险的修复是自动删掉未知字段或重写原文件，表面上能打开，实际上来源和工具身份已损坏。本章建立版本化读取与相邻迁移契约，要求未来版本被明确拒绝，旧原件保持可核对。

## 概念与数据流

物理格式描述文件命名、JSONL framing、压缩与发布方式；逻辑格式描述事件 envelope、字段与语义；模型表面由当前逻辑事件投影得到。把文件解压成功不等于逻辑事件有效，JSON.parse 成功也不等于工具配对正确。迁移必须同时保持身份、顺序和来源引用，不能只做字段重命名后宣布兼容。

```text
发现规范 generation -> 读取物理 header -> 判断版本
旧版本 -> 解码 -> vN 到 vN+1 -> 连续迁移 -> 校验当前逻辑事件
read open: 返回内存结果，不发布新文件
write open: 校验最终编码 -> 排他发布 successor -> 原件不变
未来版本或中间损坏: 拒绝，不猜测、不覆盖
```

相邻迁移让每个变化有独立责任：一个迁移只负责 vN 到 vN+1，多个步骤按固定顺序组合。直接把所有历史版本都转到 latest 虽然看似省事，却很难覆盖中间语义差异，也容易让新字段默认值掩盖原始未知状态。迁移结果应经过与正常读取相同的 replay 校验，不允许迁移器随意生成不符合会话不变量的新记录。

## 自包含 Node.js 22 实验

下面完整程序演示不可变旧文档与相邻升级，不写文件、不迁移真实用户数据。版本零和一是教学格式，与上游具体历史格式不同。read 模式仅返回内存视图，write 模式用 generations Map 模拟排他发布，不能据此宣称实现文件系统原子性。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
const old = { version: 0, events: [{ seq: 0, kind: 'user', body: 'hello' }] };
const original = JSON.stringify(old);
const migrations = new Map([
  [0, doc => ({ version: 1, events: doc.events.map(({ body, ...x }) => ({ ...x, text: body })) })],
  [1, doc => ({ version: 2, events: doc.events.map(x => ({ ...x, source: 'legacy' })) })]
]);
const generations = new Map([[0, structuredClone(old)]]);
function open(doc, access) {
  assert.ok(['read', 'write'].includes(access));
  assert.ok(Number.isInteger(doc.version) && doc.version >= 0 && doc.version <= 2, 'unsupported format');
  let view = structuredClone(doc);
  while (view.version < 2) {
    const step = migrations.get(view.version);
    assert.ok(step, 'missing adjacent migration');
    const next = step(view);
    assert.equal(next.version, view.version + 1);
    view = next;
  }
  for (const [i, event] of view.events.entries()) {
    assert.equal(event.seq, i);
    assert.equal(typeof event.text, 'string');
  }
  if (access === 'write' && doc.version !== 2) {
    assert.ok(!generations.has(2), 'successor already published');
    generations.set(2, structuredClone(view));
  }
  return view;
}
assert.equal(open(old, 'read').version, 2);
assert.equal(generations.size, 1);
open(old, 'write');
assert.equal(generations.size, 2);
assert.equal(JSON.stringify(old), original);
assert.throws(() => open(old, 'write'));
assert.throws(() => open({ version: 3, events: [] }, 'read'));
console.log('adjacent migration: passed; file publication not tested');
NODE
```

真实后端选择 generation 时应只接纳规范命名，比较数值版本，不按字符串字典顺序选择；例如 v10 与 v2 字符顺序不同。发布前还需验证编码后再读出的事件等价，处理中途崩溃与并发发布。原件保持不变意味着可以事后核对迁移错误，而不是证明迁移本身一定正确。此实验只验证教学不变量，不覆盖压缩、磁盘耐久和未知插件类型。

## 已确认的上游机制

DeepSeek Harness `0.2.1-alpha.5` 固定提交的架构说明消费者只使用当前逻辑格式，stat/list 扫描规范 generation 并可翻译历史 header，不加载全部事件也不发布 successor。open 读取同一最高 generation，拒绝未来版本，组合静态相邻迁移；read 只在内存得到当前结果，write 才排他发布最终 successor，原始 committed generation 不重命名、不替换、不删除。

上游明确区分普通未封闭 turn 的恢复与迁移。迁移只处理限定的已发布历史问题；一般中断尾部由 handle 消费者恢复，而不是迁移器随意删除事件。JSONL v0 与后续 versioned 文件名有规范差异，压缩 framing 由 provider 负责，逻辑相邻转换由迁移包负责。不能在业务工具里写一个“尝试所有文件名”的兼容层取代这些责任。

persistence-catalog 提供已声明耐久事件及类型指纹。类型指纹反映结构变化，注释或无害字段顺序变化不应误判为语义迁移；反过来，结构未变也可能发生业务语义改变，需要明确变更记录。外部插件事件不属于仓库内完整清单，读者不能由目录覆盖充分推断任意第三方版本都兼容。未知是否允许忽略必须有显式协议，而不是 catch 后跳过。

## 失败案例与生命周期取舍

失败案例之一是给历史事件新增 `success: true` 默认值，所有旧中断工具都被迁移成成功。旧格式没有结果证据时，应该保留未知或通过明确恢复事件表达，不能制造事实。另一个失败是迁移器重排 seq，使引用与 Fork inherited count 指向别的记录。字段变化需要引用坐标一起验证，不能只比较迁移后消息数量。

数据清理也是协议问题。会话、附件、Spill、索引、反馈和文件检查点可能有不同保留期，删除一个目录不等于全部个人数据都被清理；保留索引又可能泄露已删除正文。反过来，仍被分支引用的 Spill 提前失效，会破坏可回放性。应先建立引用与所有权清单，再定义归档、过期和删除策略，并在授权范围内实施，不通过本教程自动批量删除。

迁移失败应提供可操作诊断：源版本、目标版本、失败步骤和原件位置，但不能输出密钥或完整敏感正文。读取未来格式时不应“尽力打开”后让用户继续写入，旧版本可能根本理解不了新的权限或事件语义。停止写入保留原件，比生成一个貌似正常但已失真的会话更可靠；兼容性策略必须写进发布和回滚计划。

生产生命周期还需要区分备份、归档和恢复测试。备份存在不等于可恢复，压缩包可解开不等于逻辑 replay 可通过。应在隔离目录校验样本、统计损坏与缺失依赖，不直接覆盖运行目录。历史模型请求的凭据应使用引用或去敏资料，备份不能成为保存 Token 的理由，导出时同样需要权限与内容范围限制。

## 实验验收与实现边界

命令应证明 read 不发布，write 只发布一次，旧对象保持原样，未来版本与重复发布被拒绝。继续实验可删除某个相邻迁移步骤，要求明确失败；给旧事件制造 seq 缺口，要求最终校验拒绝。真实验收还需压缩尾部、generation 选择、跨进程排他、插件未知事件和源文件保留检查，不能把内存 Map 的通过当作文件发布完成。

原 1–12 章是独立 Node.js 22 ESM、单进程只读项目，没有上游全版本迁移与数据清理。现有 labs 可以运行确定性格式契约，本章不手工改生成 schema、锁文件或真实会话。任何实际批量迁移、删除、备份上传都需要独立授权与可恢复方案，文稿中的实验不构成外部写操作授权。

## 官方固定来源

- [DeepSeek Harness：会话 generation 与迁移架构](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md)。
- [DeepSeek Harness：物理读取与 handle 边界](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/persistence.md)。
- [DeepSeek Harness：事件指纹与目录](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/persistence-catalog.md)。

上一章：[第四十章：检查点与副作用](./40-checkpoints-side-effects) · 下一章：[第四十二章：输入并发](./42-input-concurrency)
