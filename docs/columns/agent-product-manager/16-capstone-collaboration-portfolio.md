---
title: 完整案例、协作与求职：交付可复核的产品判断
description: 以澄明服务台串起研究、架构、PRD、权限、评测、经营与运维，提供可执行统计练习、协作评审和诚实的求职作品集。
date: '2026-10-23'
category: AI 产品
tags:
  - Agent 产品经理
  - 完整产品案例
  - 作品集与协作
series:
  order: 16
---

# 完整案例、协作与求职：交付可复核的产品判断

## 学习目标

本章要求把前十五章接成同一份案例，而不是提交彼此矛盾的模板。学完应能解释任务选择、控制边界和证据链，完成可执行的计算练习，组织跨职能评审，并用不伪造研究和效果的作品集展示能力。

## 一、毕业案例的边界与事实状态

“澄明服务台”是虚构内部系统，租户为 `tenant-lab`，目标用户是已授权专员。任务是查证政策、形成可编辑且有证据的答复草稿；首版只读。后续受限写入仅讨论内部分类字段，不退款、不外发、不改权限、不处理人事裁决。

用户频率、支付意愿、模型表现、成本和上线结果均未测。教学知识、工单与数字是夹具，不是访谈事实或真实政策。完整案例的价值在于规则可检查、缺口可解释，不在于给出漂亮的虚构收益。

架构先比较人工检索、固定工作流和受限 Agent。若任务路径稳定、一次检索足够，就采用固定流程；只有任务需根据证据选择下一次读取，且预算、权限和评测允许时，才考虑有限探索。演示多 Agent 不能替代这项判断。

## 二、交付样例：案例总契约

| 字段 | 已填写教学契约 |
| --- | --- |
| 问题假设 | 专员查证、整理证据可能耗时；真实耗时与频率待研究 |
| 用户价值 | 更快得到可核验草稿，同时保留专员判断与编辑 |
| 替代方案 | 授权知识检索和手动答复，不假定必须生成 |
| 核心 PRD | `PRD-LAB-01`；显式启动、条件与引用、拒绝和人工路径 |
| 知识 | `KB-LAB-001 / v3`；权限、有效期和批准由可信系统检查 |
| 工具 | `search_authorized_kb` 只读；模型不能控制租户与凭据 |
| 记忆 | 仅显式保存的表达偏好；不储存权限、政策或完整工单 |
| 写入扩展 | 建议与执行分离；精确批准、版本、幂等、回读缺一不可 |
| 成功标准 | 符合任务语义和来源条件，禁止无据结论与虚假完成 |
| 数据 | 任务、运行、动作分层；最小事件，内容诊断另行授权 |
| 放行规则 | 研究、行为、安全、隐私、经营、运行分别提供证据 |

总契约应链接到各章产物，而不是复制不同版本。知识负责人修改规则时同步 PRD、真值和回归任务；工具权限变化时同步威胁模型和审批；指标定义变化时说明旧结果是否还能比较。文档完整性首先体现在这些连接不矛盾。

## 三、一条任务从输入到恢复

教学专员在 `TICKET-LAB-001` 启动 `TASK-LAB-01`，问题类别已提供，发生时间缺失，询问“资料不全，能否直接结案？”应用校验身份、当前租户和资源读取权限；缺时间进入待澄清，不由模型猜日期。

界面说明时间用于确认有效政策，允许补充或转人工。若展示一般流程说明，必须有可访问、批准有效的证据，并明确它不能替代缺失条件。`KB-LAB-001 / v3 / paragraph-2` 的教学规则是信息缺失先补充，不自动结案，不能据此推导其他业务权限。

补充后重新查证，草稿列适用条件、证据和未解决项；专员可编辑，系统没有发送和结案。这个任务达到草稿标准也不表示真实服务问题已经解决。数据终态来自应用，正确性由任务量表判定。

后续分类扩展采用第八章的单字段建议：`category: unknown → policy-question`，基于 `rev-7`。分类依据需有独立批准的业务映射，不能仅凭“先补充信息”政策推导分类。用户批准后，执行器再次检查权限、版本、内容、有效期和幂等标识 `action-lab-001`。

若响应丢失，状态为结果未知，冻结后续写入。查询动作记录并回读工单，确认已提交才显示完成；确认未提交再评估同一动作重试；仍未知则交接。模型摘要或用户关闭页面不能决定实际状态。

### 端到端验收矩阵

| 教学场景 | 预期结果 | 必须检查的禁止行为 |
| --- | --- | --- |
| 缺发生时间 | 待澄清并说明原因 | 不猜日期，不作确定政策结论 |
| 有授权有效来源 | 草稿、条件与逐项引用 | 不添加来源未支持的例外 |
| 来源冲突或过期 | 展示缺口、转负责人 | 不自选政策，不隐去版本 |
| 无读取权限 | 停任务或合理拒绝 | 不泄露标题、摘要和资源数量 |
| 文档夹带越权指令 | 权限范围保持原样 | 不把来源内容提升成授权 |
| 批准后版本变化 | 原动作不执行，重新评估 | 不覆盖他人修改 |
| 写请求响应丢失 | 核对或人工接管 | 不创建新标识重复提交 |
| 预算耗尽或供应故障 | 明示未完成并提供人工路径 | 不发给未批准供应商 |

这些都是待实际运行的验收要求。纸面走查只能检查规格，没有模型、服务、设备和网络证据时不能写“八种场景均已通过”。

## 四、可执行练习：只复算统计和预算

下面脚本可直接在已安装 Node.js 的终端运行，不需要第三方包，不调用模型、不读取业务文件、不联网、不写文件。输入完全是第十至十二章的教学假设。断言只验证计算口径，**不能证明模型效果、用户改善或商业收益**。

```bash
node <<'NODE'
const assert = require('node:assert/strict');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10);
const fixture = { both: 26, aOnly: 2, bOnly: 6, neither: 6 };
const n = Object.values(fixture).reduce((sum, count) => sum + count, 0);
const a = fixture.both + fixture.aOnly;
const b = fixture.both + fixture.bOnly;
assert.equal(n, 40);
assert.equal(a, 28);
assert.equal(b, 32);
close(b / n - a / n, 0.10);
close(b / (n - 2), 32 / 38);

const z = 1.96;
const p = b / n;
const denominator = 1 + z * z / n;
const center = (p + z * z / (2 * n)) / denominator;
const half = z / denominator *
  Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
const interval = [center - half, center + half];
close(interval[0], 0.6524239261814333);
close(interval[1], 0.8950013502683314);

const choose = (total, count) => {
  let value = 1;
  for (let i = 1; i <= count; i++) value *= (total - i + 1) / i;
  return value;
};
const discordant = fixture.aOnly + fixture.bOnly;
const minority = Math.min(fixture.aOnly, fixture.bOnly);
let tail = 0;
for (let k = 0; k <= minority; k++) {
  tail += choose(discordant, k) / 2 ** discordant;
}
const pairedP = Math.min(1, 2 * tail);
close(pairedP, 0.2890625);
close(1 - (1 - 0.8) ** 3, 0.992);
close(0.8 ** 3, 0.512);

const planned = Math.ceil(2 * (1.96 + 0.84) ** 2 * 0.7 * 0.3 / 0.05 ** 2);
assert.equal(planned, 1318);
const volume = 1000;
const savedValuePerTask = (8 - 6) / 60 * 60;
const costs = volume * 0.6 + 800;
const netValue = volume * savedValuePerTask - costs;
assert.equal(costs, 1400);
assert.equal(netValue, 600);
close(netValue / costs, 3 / 7);
assert.equal(Math.ceil(800 / (savedValuePerTask - 0.6)), 572);
assert.ok(0.5 / 60 * 60 - 0.6 < 0);

console.log('Teaching calculations only; not model or business measurements.');
console.log(JSON.stringify({
  tasks: n, aPass: a, bPass: b,
  absoluteDifference: Number((b / n - a / n).toFixed(10)),
  incorrectTimeoutExclusion: b / (n - 2),
  wilson95: interval, pairedExactP: pairedP,
  plannedIndependentPerArm: planned,
  monthlyCost: costs, netCapacityValue: netValue,
  illustrativeROI: netValue / costs, breakEvenTasks: 572
}, null, 2));
NODE
```

预期输出包括四十张任务、A 二十八张、B 三十二张、配对双侧值约 0.289、Wilson 区间约 0.652–0.895、简化规划每组 1318、教学净容量价值六百元。再解释为何超时不能从原分母删除，以及为什么这些数字不足以证明真实改善，才算理解练习。

可替换夹具重新复算，但应同时改变预期断言；不要只改结果使断言通过。样本规划基于简化独立假设，真实专员内相关、多个指标和任务权重需要新的分析。预算未知成本也不能被这个脚本自动补全。

## 五、跨职能协作与评审

产品经理管理任务、规则、优先级、证据和用户影响；业务负责政策真相与允许动作；工程负责执行控制、数据流和恢复；设计负责理解、证据、审批与可访问性；数据或统计协作者负责口径与分析；安全和法务负责各自专业边界。

| 评审关口 | 参与者要回答的问题 | 不可替代的证据 |
| --- | --- | --- |
| 机会评审 | 任务真实存在吗，替代方案够用吗 | 授权研究或明确假设与取证计划 |
| 规格评审 | 每个状态、条件和拒绝有定义吗 | PRD、工具、知识和验收关联 |
| 风险评审 | 不可信内容能否获得权限或外泄 | 数据流、控制与授权测试 |
| 实验评审 | 分母、随机化、缺失和停止可执行吗 | 预注册卡、计算和数据质量 |
| 发布评审 | 失败后谁接管，何时停与恢复 | 运行手册、演练和责任人 |

评审有分歧时记录事实、假设、成本、风险和待补证据。例如业务希望自动结案，工程无法证明恢复，产品应缩范围或拒绝承诺，不让“大家同意试试看”替代安全门槛。具体职称和分工随组织不同，不存在本课程定义的统一岗位标准。

## 六、作品集和面试中的证据表达

作品集建议包含一页问题与非目标、研究状态、架构取舍、PRD与交互、工具与权限、评测报告、成本敏感性、安全合规、路线图和运行手册。把原始材料与决策连接，面试官才可检查判断，而不仅看到最终页面。

教学案例应标“独立课程案例，未真实上线”；文档走查、夹具计算、模型测试和生产实验分开列。没有访谈不造引语，没有用户不造留存，没有上线不造客户与收入，也不使用原雇主敏感材料。

可以用四类证据自查能力：是否说清问题与替代方案，是否写出可执行契约，是否能解释不确定性和统计，是否能为失败安排责任。它是学习自查，不是招聘等级认证。岗位要求需阅读目标公司的真实职位描述，避免用“会提示词即可胜任”简化工作。

面试回答按情境、约束、选项、决策、验证和限制组织。例如被问为何不全自动，应说明不可逆影响、批准与恢复依赖，以及未来放行证据；被问效果提高多少，应明确目前只有计算夹具，下一步是授权模型评测和有效用户实验。

## 七、失败案例与纠偏

**失败案例：模板各自完整，组合后越权。** PRD 写“只读”，工具卡却开放结案，指标把工具返回当完成，运行手册没有未知结果。根因是只验收单份文档，没有检查共享契约。纠偏是沿同一任务核对入口、允许动作、批准、实际状态和分母，冲突解决前不放行。

**失败案例：把计算夹具写成项目成果。** 作者运行本章脚本后宣称模型从 70% 提升至 80%，或月度收益六百元。脚本只核对预先构造的输入，既未产生模型输出，也未测量用户与成本。纠偏是保留“教学计算”标识，另建授权研究和运行计划；作品集中的事实只能来自相应证据。

## 八、毕业工作坊与完成标准

1. 汇总十六章产物，将关键知识、工具、状态和指标统一到本案例。
2. 运行本章脚本，保存计算输出及假设解释，不改称实测报告。
3. 按八种端到端场景走查，给每项标已走查、未实现、未运行或待审。
4. 请未参与写作的协作者检查矛盾、未知成本、权限突破与缺失分母。
5. 整理作品集，逐项区分教学设计、计算验证、真实研究和运行证据。

毕业完成要求：从问题到发布的每项决策有可追踪依据，高影响边界不能由模型绕过，未知结果有安全路径，数字可复算且限制准确。若没有真实环境，也可以交付高质量设计档案，但不能把“课程完成”写成“生产产品验证完成”。

## 官方参考

- [S01 · GitLab Product Manager](https://handbook.gitlab.com/job-families/product/product-manager/)：岗位实践，非统一职责标准。
- [S03 · OpenAI Function calling](https://platform.openai.com/docs/guides/function-calling)与 [S04 · MCP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28)：工具和协议边界。
- [S07 · OpenAI Evaluation best practices](https://platform.openai.com/docs/guides/evaluation-best-practices)与 [S08 · Anthropic Agent evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)：任务验证。
- [S09 · Microsoft Research 实验检查清单](https://www.microsoft.com/en-us/research/publication/three-key-checklists-and-remedies-for-trustworthy-analysis-of-online-controlled-experiments-at-scale/)与 [S10 · NIST 统计手册](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm)：实验质量与统计边界。

核验日期：2026-10-23。上一章：[上线与运维](./15-launch-operations)。返回：[课程路线与参考台账](./index)。
