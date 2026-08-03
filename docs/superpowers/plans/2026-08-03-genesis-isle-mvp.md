# 创世孤岛创世版本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 30 天内交付一个可本地运行、可保存、可重放且能稳定演化 100 个世界年的“创世孤岛”首版，让用户观察文明自主发展并通过五类低频神迹产生可追溯影响。

**Architecture:** 使用 pnpm workspace 管理浏览器观察端、本地模型网关和领域包；确定性模拟运行于 Web Worker，React 只消费快照，PixiJS 负责像素地图。世界真相、文明知识和人物记忆严格分层；规则引擎独占客观状态写权限，AI 仅通过结构化行动提案参与决策，所有模型输出进入事件日志后才可用于重放。

**Tech Stack:** Node.js 22、pnpm 10、TypeScript、React、Vite、PixiJS、Zustand、Dexie/IndexedDB、Fastify、Zod、Vitest、Playwright、ESLint、Prettier

---

## 1. 已确认的实施决策

- 产品形态：本地优先的单机数字文明实验，不实现账号、多人和云同步。
- 模型接入：OpenAI 兼容接口，由本地 Fastify 网关读取密钥并代理请求。
- 存档方式：浏览器 IndexedDB 保存快照、事件、AI 决策和神迹；支持 JSON 导入导出。
- 模拟方式：固定步长、种子随机数、事件溯源；高倍速时批量推进但不改变规则顺序。
- AI 降级：接口不可用、预算耗尽或输出无效时，使用确定性策略候选和模板叙事，世界继续运行。
- 素材方式：AI 生成基础像素素材，人工统一轮廓、锚点、调色板和动画帧；每项素材记录生成提示词与修整信息。
- 首版异质分支：实现“修真宗门”作为验收路径；底层仍使用通用灵质、知识和制度模型，禁止写死必然出现。
- 安全边界：浏览器永不保存模型密钥；网关只绑定 `127.0.0.1`，默认不接受局域网访问。

## 2. 预算与降级策略

### 2.1 单世界预算

- 100 个世界年最多发起 1,000 次模型请求。
- 单次请求最多 1,500 输入 token、400 输出 token。
- 单次 100 年演化硬上限为 1,000,000 输入 token 与 250,000 输出 token。
- 默认名义成本上限为 5 美元；实际价格由 `MODEL_INPUT_USD_PER_MILLION` 和 `MODEL_OUTPUT_USD_PER_MILLION` 配置。
- 同一群体常规决策至少间隔 90 个世界日；只有历史级事件可提前触发关键人物决策。
- `100x` 模式聚合日常叙事，不为日常生产、出生、死亡和移动调用模型。

### 2.2 熔断顺序

1. 达到单分钟请求上限时延后 AI 决策，不延后规则 tick。
2. 达到 token 或成本上限时切换为确定性离线策略。
3. 连续三次网络错误后熔断 60 秒。
4. 连续两次结构校验失败后记录拒绝事件，并使用同输入的离线提案。
5. 回放模式永远读取已记录输出，不访问模型网关。

## 3. 项目目录与职责

```text
genesis-isle/
├── apps/
│   ├── web/                         # React 观察端与 PixiJS 地图
│   │   ├── src/app/                 # 应用装配、路由和全局布局
│   │   ├── src/features/world/      # 时间控制、地图和选择状态
│   │   ├── src/features/civilization/
│   │   ├── src/features/figures/
│   │   ├── src/features/anomalies/
│   │   ├── src/features/history/
│   │   ├── src/features/miracles/
│   │   ├── src/features/causality/
│   │   ├── src/worker/              # 模拟 Worker 通信
│   │   └── public/assets/pixel/     # 经人工修整的正式像素素材
│   └── gateway/                     # 仅本地监听的模型代理和预算控制
├── packages/
│   ├── domain/                      # 实体、标识、事件和命令契约
│   ├── simulation/                  # 确定性世界生成与规则引擎
│   ├── agents/                      # 群体/人物提案、离线策略与 AI 编排
│   ├── persistence/                 # IndexedDB、导入导出和重放
│   └── reporting/                   # 文明史报告生成
├── assets/
│   ├── prompts/                     # 素材生成提示词与来源记录
│   ├── raw/                         # 未修整生成结果，不直接用于产品
│   └── palette/                     # 主调色板与像素规范
├── e2e/                             # Playwright 关键路径
├── scripts/                         # 100 年模拟、素材校验和报告校验
├── docs/architecture/               # 数据契约、AI 边界和素材规范
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

## 4. 里程碑与时间盒

| 时间 | 交付物 | 退出条件 |
| --- | --- | --- |
| 第 1-3 天 | 工程骨架与领域契约 | 全仓类型检查、单测和 lint 可运行 |
| 第 4-9 天 | 确定性世界与基础模拟 | 同种子 10 年结果哈希一致 |
| 第 10-14 天 | 群体、人物、知识、灵质与分裂 | 离线模式可自然产生完整因果链 |
| 第 15-18 天 | 模型网关、预算和决策记录 | 模型失败不损坏世界，可无网络继续 |
| 第 19-22 天 | IndexedDB、存档和重放 | 导出再导入后状态与事件哈希一致 |
| 第 23-27 天 | PixiJS 地图、面板、神迹和历史 | 核心观察与干预路径可用 |
| 第 28-30 天 | 100 年稳定性、报告与打磨 | 自动验收套件通过，视觉资产无占位项 |

### Task 1：建立 workspace 与质量基线

**Files:**
- Create: `genesis-isle/package.json`
- Create: `genesis-isle/pnpm-workspace.yaml`
- Create: `genesis-isle/tsconfig.base.json`
- Create: `genesis-isle/eslint.config.js`
- Create: `genesis-isle/vitest.workspace.ts`
- Create: `genesis-isle/apps/web/package.json`
- Create: `genesis-isle/apps/gateway/package.json`
- Create: `genesis-isle/packages/domain/package.json`
- Create: `genesis-isle/packages/simulation/package.json`
- Create: `genesis-isle/packages/agents/package.json`
- Create: `genesis-isle/packages/persistence/package.json`
- Create: `genesis-isle/packages/reporting/package.json`

- [ ] **Step 1：创建根工作区清单**

```json
{
  "name": "genesis-isle",
  "private": true,
  "packageManager": "pnpm@10",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "pnpm --parallel --filter @genesis-isle/web --filter @genesis-isle/gateway dev",
    "build": "pnpm -r build",
    "test": "vitest run --workspace vitest.workspace.ts",
    "test:watch": "vitest --workspace vitest.workspace.ts",
    "typecheck": "pnpm -r typecheck",
    "lint": "eslint .",
    "verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  },
  "devDependencies": {
    "@eslint/js": "^9",
    "@playwright/test": "^1",
    "eslint": "^9",
    "prettier": "^3",
    "tsx": "^4",
    "typescript": "^5",
    "typescript-eslint": "^8",
    "vitest": "^3"
  }
}
```

- [ ] **Step 2：声明工作区**

```yaml
packages:
  - apps/*
  - packages/*
```

- [ ] **Step 3：创建严格 TypeScript 基线**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "WebWorker"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 4：创建各包清单与统一脚本**

每个 workspace 包均设置 `"private": true`、`"type": "module"` 和下列脚本：

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

包名与依赖必须按下表配置：

| 包路径 | `name` | 运行依赖 | 开发依赖 |
| --- | --- | --- | --- |
| `apps/web` | `@genesis-isle/web` | `@genesis-isle/domain`、`@genesis-isle/persistence`、`pixi.js`、`react`、`react-dom`、`zustand` | `@testing-library/jest-dom`、`@testing-library/react`、`@testing-library/user-event`、`@types/react`、`@types/react-dom`、`@vitejs/plugin-react`、`jsdom`、`vite` |
| `apps/gateway` | `@genesis-isle/gateway` | `@fastify/cors`、`fastify`、`zod` | 无 |
| `packages/domain` | `@genesis-isle/domain` | 无 | 无 |
| `packages/simulation` | `@genesis-isle/simulation` | `@genesis-isle/domain` | 无 |
| `packages/agents` | `@genesis-isle/agents` | `@genesis-isle/domain`、`zod` | 无 |
| `packages/persistence` | `@genesis-isle/persistence` | `@genesis-isle/domain`、`@genesis-isle/simulation`、`dexie`、`zod` | `fake-indexeddb` |
| `packages/reporting` | `@genesis-isle/reporting` | `@genesis-isle/domain` | 无 |

内部依赖统一使用 `"workspace:*"`。每个包的 `tsconfig.json` 继承根 `tsconfig.base.json`，并包含 `src/**/*.ts`；Web 包额外包含 `src/**/*.tsx`。

- [ ] **Step 5：创建 Vitest workspace**

```ts
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'apps/*/vitest.config.ts',
  'packages/*/vitest.config.ts'
]);
```

Web 测试环境设为 `jsdom`，其余包使用 `node`。持久化测试在 setup 文件中导入 `fake-indexeddb/auto`。

- [ ] **Step 6：安装依赖并验证空工作区**

Run:

```bash
cd genesis-isle
pnpm install
pnpm typecheck
pnpm test --passWithNoTests
```

Expected: 三条命令退出码均为 `0`，生成并提交 `pnpm-lock.yaml`。

- [ ] **Step 7：提交工程骨架**

```bash
git add genesis-isle
git commit -m "chore: scaffold Genesis Isle workspace"
```

### Task 2：定义领域标识、世界状态和事件契约

**Files:**
- Create: `genesis-isle/packages/domain/src/ids.ts`
- Create: `genesis-isle/packages/domain/src/world.ts`
- Create: `genesis-isle/packages/domain/src/events.ts`
- Create: `genesis-isle/packages/domain/src/actions.ts`
- Create: `genesis-isle/packages/domain/src/index.ts`
- Test: `genesis-isle/packages/domain/src/world.test.ts`

- [ ] **Step 1：先写世界状态契约测试**

```ts
import { describe, expect, it } from 'vitest';
import { createWorldId, type WorldState } from './index';

describe('WorldState', () => {
  it('区分世界真相、文明知识和人物记忆', () => {
    const state: WorldState = {
      id: createWorldId('world-1'),
      seed: 'island-alpha',
      tick: 0,
      day: 0,
      speed: 1,
      status: 'paused',
      regions: {},
      civilizations: {},
      populations: {},
      groupAgents: {},
      keyFigures: {},
      truth: { etherFields: {}, resources: {} },
      civilizationKnowledge: {},
      figureMemories: {},
      institutions: {},
      anomalies: {},
      miracles: {},
      events: [],
      causalLinks: [],
      aiDecisions: []
    };

    expect(state.truth).not.toBe(state.civilizationKnowledge);
    expect(state.civilizationKnowledge).not.toBe(state.figureMemories);
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run:

```bash
pnpm --filter @genesis-isle/domain test
```

Expected: FAIL，提示 `./index` 或导出类型不存在。

- [ ] **Step 3：实现品牌标识和核心联合类型**

```ts
export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };
export type WorldId = Brand<string, 'WorldId'>;
export type RegionId = Brand<string, 'RegionId'>;
export type CivilizationId = Brand<string, 'CivilizationId'>;
export type FigureId = Brand<string, 'FigureId'>;
export type EventId = Brand<string, 'EventId'>;

export const createWorldId = (value: string) => value as WorldId;
export const createRegionId = (value: string) => value as RegionId;
export const createCivilizationId = (value: string) => value as CivilizationId;
export const createFigureId = (value: string) => value as FigureId;
export const createEventId = (value: string) => value as EventId;
```

- [ ] **Step 4：实现 `WorldState` 及其组成类型**

`world.ts` 必须完整定义 `Region`、`Population`、`Civilization`、`GroupAgent`、`KeyFigure`、`Institution`、`Anomaly`、`Miracle`、`KnowledgeRecord`、`MemoryRecord`、`WorldTruth` 和 `AiDecisionRecord`。所有客观数值只能位于 `WorldState` 或其实体中，AI 提案不得复用这些可写类型。

- [ ] **Step 5：实现只描述意图的行动协议**

```ts
export type ActionKind =
  | 'gather'
  | 'migrate'
  | 'research'
  | 'establish_institution'
  | 'negotiate'
  | 'conflict'
  | 'practice_ether';

export interface ActionProposal {
  readonly actorId: string;
  readonly goal: string;
  readonly evidenceIds: readonly string[];
  readonly candidates: readonly ActionKind[];
  readonly selected: ActionKind;
  readonly reason: string;
  readonly requestedResources: Readonly<Record<string, number>>;
  readonly expectedOutcome: string;
}
```

- [ ] **Step 6：运行领域测试与类型检查**

Run:

```bash
pnpm --filter @genesis-isle/domain test
pnpm --filter @genesis-isle/domain typecheck
```

Expected: PASS，TypeScript 无错误。

- [ ] **Step 7：提交领域契约**

```bash
git add genesis-isle/packages/domain
git commit -m "feat: define Genesis Isle domain contracts"
```

### Task 3：实现确定性随机数与世界生成

**Files:**
- Create: `genesis-isle/packages/simulation/src/random.ts`
- Create: `genesis-isle/packages/simulation/src/generation/create-world.ts`
- Create: `genesis-isle/packages/simulation/src/generation/regions.ts`
- Test: `genesis-isle/packages/simulation/src/generation/create-world.test.ts`

- [ ] **Step 1：写同种子复现测试**

```ts
import { describe, expect, it } from 'vitest';
import { createInitialWorld } from './create-world';

describe('createInitialWorld', () => {
  it('同一世界种子生成完全相同的初始状态', () => {
    expect(createInitialWorld('island-alpha')).toEqual(createInitialWorld('island-alpha'));
  });

  it('生成七类区域、80 至 120 人和三名初始关键人物', () => {
    const world = createInitialWorld('island-alpha');
    expect(Object.keys(world.regions)).toHaveLength(7);
    expect(Object.values(world.populations)[0]?.total).toBeGreaterThanOrEqual(80);
    expect(Object.values(world.populations)[0]?.total).toBeLessThanOrEqual(120);
    expect(Object.keys(world.keyFigures)).toHaveLength(3);
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run:

```bash
pnpm --filter @genesis-isle/simulation test -- create-world.test.ts
```

Expected: FAIL，提示 `createInitialWorld` 不存在。

- [ ] **Step 3：实现无平台依赖的种子随机数**

使用 `xmur3` 生成 32 位种子、`mulberry32` 生成 `[0, 1)` 随机数。禁止调用 `Math.random()`；ESLint 增加 `no-restricted-properties` 规则阻止模拟包使用它。

- [ ] **Step 4：实现七类区域模板**

固定区域键为 `north_forest`、`east_reef`、`south_wetland`、`west_hills`、`central_lake`、`volcanic_ruins`、`forbidden_cave`。种子只决定资源量、风险、灵质浓度和邻接成本，不改变区域类别。

- [ ] **Step 5：实现初始人口与人物**

生成一个原始文明、一个群体 Agent，以及职业分别为 `elder`、`explorer`、`rememberer` 的三名关键人物。人格值范围统一为 `0..1`，关系和记忆引用必须指向已存在实体。

- [ ] **Step 6：验证确定性**

Run:

```bash
pnpm --filter @genesis-isle/simulation test -- create-world.test.ts
pnpm lint
```

Expected: PASS，模拟包中搜索 `Math.random` 无结果。

- [ ] **Step 7：提交世界生成器**

```bash
git add genesis-isle/packages/simulation genesis-isle/eslint.config.js
git commit -m "feat: add deterministic island generation"
```

### Task 4：实现固定顺序 tick 与基础生态规则

**Files:**
- Create: `genesis-isle/packages/simulation/src/engine/simulate-tick.ts`
- Create: `genesis-isle/packages/simulation/src/rules/resources.ts`
- Create: `genesis-isle/packages/simulation/src/rules/population.ts`
- Create: `genesis-isle/packages/simulation/src/rules/disease.ts`
- Create: `genesis-isle/packages/simulation/src/rules/migration.ts`
- Test: `genesis-isle/packages/simulation/src/engine/simulate-tick.test.ts`

- [ ] **Step 1：写规则顺序和守恒测试**

```ts
it('按环境、人口、压力、决策、结算、知识、事件、因果顺序执行', () => {
  const trace: string[] = [];
  simulateTick(createInitialWorld('order-test'), {
    trace: (stage) => trace.push(stage),
    decisionSource: createOfflineDecisionSource()
  });
  expect(trace).toEqual([
    'environment',
    'population',
    'pressure',
    'group_decisions',
    'figure_actions',
    'resolution',
    'knowledge',
    'events',
    'causality'
  ]);
});

it('资源不会降为负数', () => {
  const result = simulateDays(createInitialWorld('scarcity-test'), 3650);
  expect(Object.values(result.truth.resources).every((amount) => amount >= 0)).toBe(true);
});
```

- [ ] **Step 2：运行测试确认失败**

Run:

```bash
pnpm --filter @genesis-isle/simulation test -- simulate-tick.test.ts
```

Expected: FAIL，提示模拟函数不存在。

- [ ] **Step 3：实现每日资源与季节更新**

资源变化使用 `next = clamp(0, capacity, current + regeneration - extraction - loss)`；每 90 天切换季节，季节系数只读取世界种子生成的气候参数。

- [ ] **Step 4：实现人口统计更新**

按年龄桶计算出生、衰老、自然死亡、饥饿死亡和疾病死亡。普通人口保持统计实体，不创建逐人对象。

- [ ] **Step 5：实现疾病与迁徙**

疾病采用确定性 SIR 简化模型；迁徙条件由食物压力、安全压力、距离成本和目标区域吸引力共同计算。每次迁徙生成包含来源、目标、人数和原因的领域事件。

- [ ] **Step 6：实现不可变 tick 管线**

`simulateTick` 返回新 `WorldState` 和本 tick 新事件，不修改输入对象。每个 stage 只接收其需要的数据，并由统一 reducer 合并结果。

- [ ] **Step 7：执行 10 年快速测试**

Run:

```bash
pnpm --filter @genesis-isle/simulation test
pnpm --filter @genesis-isle/simulation exec tsx ../../scripts/simulate.ts --seed smoke --years 10 --offline
```

Expected: 退出码为 `0`；资源均非负；人口、事件数和最终哈希被打印。

- [ ] **Step 8：提交基础规则**

```bash
git add genesis-isle/packages/simulation genesis-isle/scripts/simulate.ts
git commit -m "feat: implement deterministic simulation ticks"
```

### Task 5：实现知识、记忆、异常和隐藏灵质

**Files:**
- Create: `genesis-isle/packages/simulation/src/rules/ether.ts`
- Create: `genesis-isle/packages/simulation/src/rules/anomalies.ts`
- Create: `genesis-isle/packages/simulation/src/rules/knowledge.ts`
- Test: `genesis-isle/packages/simulation/src/rules/ether.test.ts`

- [ ] **Step 1：写信息隔离测试**

```ts
it('公开快照不泄露灵质浓度', () => {
  const world = createInitialWorld('ether-hidden');
  const snapshot = createPublicSnapshot(world);
  expect(JSON.stringify(snapshot)).not.toContain('etherConcentration');
});

it('异常只提供可观察证据', () => {
  const world = forceEtherExposure(createInitialWorld('ether-event'));
  const next = simulateDays(world, 30);
  const anomaly = Object.values(next.anomalies)[0];
  expect(anomaly?.observations.length).toBeGreaterThan(0);
  expect(anomaly).not.toHaveProperty('trueCause');
});
```

- [ ] **Step 2：运行测试确认失败**

Run:

```bash
pnpm --filter @genesis-isle/simulation test -- ether.test.ts
```

Expected: FAIL，提示公开快照或灵质规则不存在。

- [ ] **Step 3：实现灵质客观规则**

灵质只位于 `WorldTruth.etherFields`。效果由区域浓度、暴露时长、生物适应性、材料共振、承载上限和精神稳定度计算，输出只能是身体、材料或生态状态变化。

- [ ] **Step 4：实现异常观察**

支持 `plant_potency`、`animal_cognition`、`shared_dream`、`recovery`、`material_resonance`、`ecological_shift` 六类首版异常。异常记录只包含时间、地点、目击者、现象和重复次数。

- [ ] **Step 5：实现三层知识传播**

客观事件先进入世界日志；人物亲历产生记忆；群体通过口述、制度或文字形成文明知识。传播时应用可信度衰减和解释偏差，禁止将世界真相对象直接复制到文明知识。

- [ ] **Step 6：运行隔离和传播测试**

Run:

```bash
pnpm --filter @genesis-isle/simulation test -- ether.test.ts
pnpm --filter @genesis-isle/simulation test -- knowledge.test.ts
```

Expected: PASS，公开快照和 AI 输入中均无灵质真实数值。

- [ ] **Step 7：提交未知自然层**

```bash
git add genesis-isle/packages/simulation
git commit -m "feat: add hidden ether and knowledge layers"
```

### Task 6：实现离线群体与关键人物决策

**Files:**
- Create: `genesis-isle/packages/agents/src/context.ts`
- Create: `genesis-isle/packages/agents/src/offline/group-policy.ts`
- Create: `genesis-isle/packages/agents/src/offline/figure-policy.ts`
- Create: `genesis-isle/packages/agents/src/validate-proposal.ts`
- Test: `genesis-isle/packages/agents/src/offline/figure-policy.test.ts`

- [ ] **Step 1：写混合驱动与资源拒绝测试**

```ts
it('同一人物在相同上下文中给出相同提案', () => {
  const context = createFigureContext('figure-seed');
  expect(proposeFigureAction(context)).toEqual(proposeFigureAction(context));
});

it('拒绝资源不足的行动', () => {
  const result = validateProposal(
    { ...createProposal(), requestedResources: { food: 9999 } },
    createExecutionContext({ food: 10 })
  );
  expect(result).toEqual({ accepted: false, reason: 'insufficient_resources' });
});
```

- [ ] **Step 2：运行测试确认失败**

Run:

```bash
pnpm --filter @genesis-isle/agents test
```

Expected: FAIL，提示离线策略不存在。

- [ ] **Step 3：构建最小决策上下文**

AI 和离线策略只接收主体、人格、职业、目标、可见记忆、关系摘要、文明知识、社会压力和可用资源摘要。上下文不包含隐藏灵质和其他文明未公开知识。

- [ ] **Step 4：实现可解释评分**

候选行动评分使用命名加权项相加，不使用不可解释的单一乘法。结果必须返回每项得分和最终理由，以便历史面板解释。

- [ ] **Step 5：实现规则校验器**

依次校验主体存在、行动在候选集中、证据可见、资源足够、距离可达、固定物理层允许。拒绝结果写入 `proposal_rejected` 事件，但不改变客观状态。

- [ ] **Step 6：运行测试**

Run:

```bash
pnpm --filter @genesis-isle/agents test
pnpm --filter @genesis-isle/agents typecheck
```

Expected: PASS。

- [ ] **Step 7：提交离线决策**

```bash
git add genesis-isle/packages/agents
git commit -m "feat: add deterministic agent policies"
```

### Task 7：实现 OpenAI 兼容网关、结构校验和预算熔断

**Files:**
- Create: `genesis-isle/apps/gateway/src/config.ts`
- Create: `genesis-isle/apps/gateway/src/server.ts`
- Create: `genesis-isle/apps/gateway/src/model-client.ts`
- Create: `genesis-isle/apps/gateway/src/budget.ts`
- Create: `genesis-isle/apps/gateway/src/routes/decide.ts`
- Create: `genesis-isle/apps/gateway/.env.example`
- Test: `genesis-isle/apps/gateway/src/routes/decide.test.ts`

- [ ] **Step 1：写网关安全与预算测试**

```ts
it('默认只监听本机地址', () => {
  expect(loadConfig(validEnv()).host).toBe('127.0.0.1');
});

it('预算耗尽时不调用模型', async () => {
  const model = vi.fn();
  const response = await requestDecision({
    budget: exhaustedBudget(),
    model,
    context: validDecisionContext()
  });
  expect(response.mode).toBe('offline_required');
  expect(model).not.toHaveBeenCalled();
});
```

- [ ] **Step 2：运行测试确认失败**

Run:

```bash
pnpm --filter @genesis-isle/gateway test
```

Expected: FAIL，提示配置与预算模块不存在。

- [ ] **Step 3：定义环境变量**

```dotenv
MODEL_BASE_URL=https://provider.example/v1
MODEL_API_KEY=replace-with-local-secret
MODEL_NAME=replace-with-compatible-model
MODEL_INPUT_USD_PER_MILLION=0
MODEL_OUTPUT_USD_PER_MILLION=0
MODEL_RUN_BUDGET_USD=5
MODEL_MAX_REQUESTS_PER_100_YEARS=1000
MODEL_MAX_INPUT_TOKENS=1000000
MODEL_MAX_OUTPUT_TOKENS=250000
GATEWAY_PORT=4318
```

`.env.example` 不得包含真实密钥；浏览器构建变量不得包含 `MODEL_API_KEY`。

- [ ] **Step 4：实现兼容请求**

网关向 `${MODEL_BASE_URL}/chat/completions` 发送 `model`、`messages`、`temperature: 0.2` 和 token 上限。系统提示明确禁止修改客观数值，要求只返回一个 JSON 对象。响应文本经 `JSON.parse` 和 Zod 校验后才能返回浏览器。

- [ ] **Step 5：实现预算账本与熔断**

按世界运行 ID 记录请求数、输入 token、输出 token、估算费用、连续失败和熔断截止时间。任一硬上限触发时返回 HTTP `429` 和稳定错误码 `MODEL_BUDGET_EXHAUSTED`。

- [ ] **Step 6：实现本地跨域白名单**

仅允许 `http://127.0.0.1:5173` 和 `http://localhost:5173`。服务启动日志只打印模型名和 Base URL，不打印密钥、完整提示词或人物隐私上下文。

- [ ] **Step 7：运行网关测试**

Run:

```bash
pnpm --filter @genesis-isle/gateway test
pnpm --filter @genesis-isle/gateway typecheck
```

Expected: PASS；测试使用 mock HTTP，不访问真实模型。

- [ ] **Step 8：提交模型网关**

```bash
git add genesis-isle/apps/gateway
git commit -m "feat: add budgeted local model gateway"
```

### Task 8：接入 AI 决策调度、记录与离线回退

**Files:**
- Create: `genesis-isle/packages/agents/src/ai/client.ts`
- Create: `genesis-isle/packages/agents/src/ai/scheduler.ts`
- Create: `genesis-isle/packages/agents/src/decision-source.ts`
- Test: `genesis-isle/packages/agents/src/decision-source.test.ts`

- [ ] **Step 1：写失败降级和回放测试**

```ts
it('模型不可用时返回确定性离线提案', async () => {
  const source = createDecisionSource({
    remote: async () => { throw new Error('network'); },
    offline: proposeFigureAction
  });
  const result = await source.decide(createFigureContext('fallback'));
  expect(result.mode).toBe('offline');
  expect(result.proposal.actorId).toBeTruthy();
});

it('已有决策记录时不访问远端', async () => {
  const remote = vi.fn();
  const source = createReplayDecisionSource([recordedDecision()], remote);
  await source.decide(recordedDecision().context);
  expect(remote).not.toHaveBeenCalled();
});
```

- [ ] **Step 2：运行测试确认失败**

Run:

```bash
pnpm --filter @genesis-isle/agents test -- decision-source.test.ts
```

Expected: FAIL。

- [ ] **Step 3：实现稳定决策键**

决策键由 `worldId + tick + actorId + decisionKind + contextHash` 组成。记录包含原始模型文本、解析提案、校验结果、token 用量、模型名和模式 `remote|offline|replay`。

- [ ] **Step 4：实现稀疏调度**

群体常规决策间隔至少 90 世界日；关键人物只在历史事件、目标阻塞或关系突变时触发。高倍速将同一主体同一季度内的低价值触发合并成一个上下文。

- [ ] **Step 5：实现降级链**

远端失败后先重试一次；仍失败则调用离线策略。输出校验失败时不修补客观字段，而是记录拒绝并使用离线提案。

- [ ] **Step 6：运行测试并提交**

Run:

```bash
pnpm --filter @genesis-isle/agents test
pnpm --filter @genesis-isle/agents typecheck
git add genesis-isle/packages/agents
git commit -m "feat: orchestrate recorded AI decisions"
```

Expected: 测试通过，新提交只包含 agents 包。

### Task 9：实现制度、文明分裂和修真分支涌现

**Files:**
- Create: `genesis-isle/packages/simulation/src/rules/institutions.ts`
- Create: `genesis-isle/packages/simulation/src/rules/discoveries.ts`
- Create: `genesis-isle/packages/simulation/src/rules/civilization-split.ts`
- Create: `genesis-isle/packages/simulation/src/rules/diplomacy.ts`
- Create: `genesis-isle/packages/simulation/src/rules/collapse.ts`
- Create: `genesis-isle/packages/simulation/src/rules/heterodox-paths.ts`
- Test: `genesis-isle/packages/simulation/src/rules/heterodox-paths.test.ts`

- [ ] **Step 1：写“不能单次解锁”测试**

```ts
it('单次异常或神迹不能直接建立修真宗门', () => {
  const world = withSingleEtherAnomaly(createInitialWorld('no-instant-path'));
  const next = simulateDays(world, 30);
  expect(Object.values(next.institutions).some((item) => item.kind === 'cultivation_sect')).toBe(false);
});

it('满足发现、实践、失败、传承和投入后允许制度化', () => {
  const world = withHeterodoxHistory(createInitialWorld('earned-path'));
  const next = simulateDays(world, 365);
  expect(Object.values(next.institutions).some((item) => item.kind === 'cultivation_sect')).toBe(true);
});
```

- [ ] **Step 2：运行测试确认失败**

Run:

```bash
pnpm --filter @genesis-isle/simulation test -- heterodox-paths.test.ts
```

Expected: FAIL。

- [ ] **Step 3：实现制度成熟度**

制度成熟度由成员数、资源投入、知识可信度、传承稳定性和社会支持构成。制度只提供生产、传播、稳定和风险修正，不直接授予成果。

- [ ] **Step 4：实现非线性发现与社会制度**

农业、文字、成文规则、医疗和测量方法均由“可见问题 + 已有知识 + 可用材料 + 人物行动 + 多次验证”形成。`discoveries.ts` 只声明发现条件图，不提供按时代顺序排列的科技树；未满足证据和资源条件时，规则引擎拒绝完成发现。

- [ ] **Step 5：实现文明分裂**

当地理隔离、资源冲突、制度分歧或信仰分歧持续越过阈值时，生成新文明并按人口、知识、资源和人物关系拆分。分裂必须产生历史事件和因果链接。

- [ ] **Step 6：实现外交、冲突与抽象结算**

文明关系包含信任、贸易依赖、领土争议和历史伤害。联盟、贸易与战争必须来自双方行动提案；冲突结果由人口、供给、地形、组织和士气规则结算，AI 不得指定胜负。

- [ ] **Step 7：实现崩溃、遗迹与恢复**

文明人口归零或制度承载能力崩溃时进入 `collapsed`，但地图建筑、知识碎片、污染和事件保留为遗迹。后续文明可发现遗迹并形成带来源事件的新知识，禁止删除旧文明历史。

- [ ] **Step 8：实现修真路径状态机**

状态依次为 `unobserved -> observed -> hypothesized -> practiced -> reproducible -> institutionalized`。每次跃迁要求独立事件证据；实践可能失败并产生身体、精神或资源代价。

- [ ] **Step 9：运行涌现测试**

Run:

```bash
pnpm --filter @genesis-isle/simulation test -- heterodox-paths.test.ts
pnpm --filter @genesis-isle/simulation exec tsx ../../scripts/simulate.ts --seed heterodox-acceptance --years 100 --offline
```

Expected: 固定验收种子能在不直接注入文明结果的前提下形成至少一个制度化修真宗门，并输出完整证据事件 ID。

- [ ] **Step 10：提交文明演化规则**

```bash
git add genesis-isle/packages/simulation
git commit -m "feat: add civilization splits and heterodox emergence"
```

### Task 10：实现五类神迹、冷却与因果涟漪

**Files:**
- Create: `genesis-isle/packages/simulation/src/commands/apply-miracle.ts`
- Create: `genesis-isle/packages/simulation/src/rules/causality.ts`
- Test: `genesis-isle/packages/simulation/src/commands/apply-miracle.test.ts`

- [ ] **Step 1：写神迹限制测试**

```ts
it('支持五类首版神迹', () => {
  expect(MIRACLE_KINDS).toEqual([
    'starfall',
    'fertile_rain',
    'plague_mist',
    'dream_symbol',
    'receding_path'
  ]);
});

it('冷却期间拒绝连续神迹', () => {
  const first = applyMiracle(createInitialWorld('miracle'), starfallCommand());
  const second = applyMiracle(first.world, fertileRainCommand());
  expect(second.accepted).toBe(false);
  expect(second.reason).toBe('miracle_cooldown');
});
```

- [ ] **Step 2：运行测试确认失败**

Run:

```bash
pnpm --filter @genesis-isle/simulation test -- apply-miracle.test.ts
```

Expected: FAIL。

- [ ] **Step 3：实现命令与即时客观效果**

每类神迹只修改其允许的环境输入：星坠投放晶体与地貌扰动，丰饶雨提升短期再生，瘟雾创建疾病源，梦中符号创建人物记忆输入，退潮之路改变可达地形。不得直接创建制度、知识成果或领袖。

- [ ] **Step 4：实现时代额度与依赖代价**

按文明时代限制神迹次数，保存冷却截止 tick、外部干预强度和文明依赖风险。拒绝命令也记录审计事件，但不建立创世因果根。

- [ ] **Step 5：实现因果边**

因果边类型为 `proven`、`strong_association`、`civilization_interpretation`。`proven` 必须来自规则输入依赖；文明主观解释不得在 UI 中显示为客观因果。

- [ ] **Step 6：运行测试并提交**

Run:

```bash
pnpm --filter @genesis-isle/simulation test
git add genesis-isle/packages/simulation
git commit -m "feat: add miracles and causal ripple tracking"
```

Expected: PASS。

### Task 11：实现 IndexedDB 存档、导入导出和确定性重放

**Files:**
- Create: `genesis-isle/packages/persistence/src/database.ts`
- Create: `genesis-isle/packages/persistence/src/world-repository.ts`
- Create: `genesis-isle/packages/persistence/src/export-world.ts`
- Create: `genesis-isle/packages/persistence/src/replay-world.ts`
- Test: `genesis-isle/packages/persistence/src/replay-world.test.ts`

- [ ] **Step 1：写往返与回放哈希测试**

```ts
it('导出再导入后保留完整状态和决策记录', async () => {
  const original = simulateDays(createInitialWorld('roundtrip'), 365);
  const archive = exportWorld(original);
  const restored = importWorld(archive);
  expect(hashWorld(restored)).toBe(hashWorld(original));
  expect(restored.aiDecisions).toEqual(original.aiDecisions);
});

it('重放不会调用模型并得到相同规则结果', async () => {
  const run = recordedTenYearRun();
  const replayed = await replayWorld(run.archive, { remoteDecision: forbiddenRemoteCall });
  expect(replayed.finalHash).toBe(run.finalHash);
});
```

- [ ] **Step 2：运行测试确认失败**

Run:

```bash
pnpm --filter @genesis-isle/persistence test
```

Expected: FAIL。

- [ ] **Step 3：定义 Dexie 表**

数据库包含 `worlds`、`snapshots`、`events`、`decisions`、`miracles` 五张表。每 30 世界日保存增量快照，每 365 世界日保存完整快照；事件和决策只追加不覆盖。

- [ ] **Step 4：定义存档格式**

顶层字段为 `schemaVersion`、`exportedAt`、`world`、`snapshots`、`events`、`decisions`、`miracles` 和 `finalHash`。导入前使用 Zod 校验版本与引用完整性，失败时不写入数据库。

- [ ] **Step 5：实现重放**

从最近完整快照开始，按 tick 和序号应用事件；遇到决策点读取稳定决策键对应的记录。最终哈希不包含真实时间戳和 UI 选择状态。

- [ ] **Step 6：运行 fake-indexeddb 测试**

Run:

```bash
pnpm --filter @genesis-isle/persistence test
pnpm --filter @genesis-isle/persistence typecheck
```

Expected: PASS。

- [ ] **Step 7：提交持久化**

```bash
git add genesis-isle/packages/persistence
git commit -m "feat: add local saves and deterministic replay"
```

### Task 12：建立 React 应用、模拟 Worker 和时间控制

**Files:**
- Create: `genesis-isle/apps/web/src/main.tsx`
- Create: `genesis-isle/apps/web/src/app/App.tsx`
- Create: `genesis-isle/apps/web/src/worker/simulation.worker.ts`
- Create: `genesis-isle/apps/web/src/worker/client.ts`
- Create: `genesis-isle/apps/web/src/features/world/world-store.ts`
- Create: `genesis-isle/apps/web/src/features/world/TimeControls.tsx`
- Test: `genesis-isle/apps/web/src/features/world/TimeControls.test.tsx`

- [ ] **Step 1：写时间控制测试**

```tsx
it('支持暂停、1x、10x 和 100x', async () => {
  render(<TimeControls />);
  for (const label of ['暂停', '1x', '10x', '100x']) {
    expect(screen.getByRole('button', { name: label })).toBeVisible();
  }
  await userEvent.click(screen.getByRole('button', { name: '100x' }));
  expect(useWorldStore.getState().speed).toBe(100);
});
```

- [ ] **Step 2：运行测试确认失败**

Run:

```bash
pnpm --filter @genesis-isle/web test -- TimeControls.test.tsx
```

Expected: FAIL。

- [ ] **Step 3：实现 Worker 协议**

主线程命令为 `initialize`、`play`、`pause`、`setSpeed`、`applyMiracle`、`save`、`load`。Worker 事件为 `snapshot`、`historicalEvent`、`decisionRequested`、`saveCompleted`、`error`。

- [ ] **Step 4：实现速度调度**

`1x` 每秒推进 1 世界日；`10x` 每秒批量推进 10 日；`100x` 每秒批量推进 100 日。批处理内部仍逐日执行固定规则，UI 每 100 毫秒最多接收一次公开快照。

- [ ] **Step 5：实现关键事件提示**

首次定居、农业、文字、成文规则、瘟疫、分裂、战争、联盟、异常、可重复灵质实践、异质分支和文明崩溃进入高优先级提示队列。用户设置为“关键事件自动暂停”时，Worker 在完成当前 tick 后暂停，避免半完成状态。

- [ ] **Step 6：实现 Zustand 观察状态**

Store 只保存公开快照、选中对象、时间速度、关键提示和网关状态。完整世界真相保留在 Worker 与持久化层，避免 UI 意外泄漏灵质。

- [ ] **Step 7：运行组件和 Worker 测试**

Run:

```bash
pnpm --filter @genesis-isle/web test
pnpm --filter @genesis-isle/web typecheck
```

Expected: PASS。

- [ ] **Step 8：提交观察端骨架**

```bash
git add genesis-isle/apps/web
git commit -m "feat: add simulation worker and time controls"
```

### Task 13：建立像素素材规范与资源管线

**Files:**
- Create: `genesis-isle/docs/architecture/pixel-art-guide.md`
- Create: `genesis-isle/assets/palette/genesis-isle.gpl`
- Create: `genesis-isle/assets/prompts/manifest.json`
- Create: `genesis-isle/scripts/validate-assets.ts`
- Create: `genesis-isle/apps/web/src/features/world/assets.ts`
- Test: `genesis-isle/scripts/validate-assets.test.ts`

- [ ] **Step 1：写素材清单校验测试**

```ts
it('所有运行时素材都有来源、尺寸、锚点和调色板记录', () => {
  const result = validateAssetManifest(loadFixtureManifest());
  expect(result.errors).toEqual([]);
});
```

- [ ] **Step 2：定义视觉规范**

规范固定：

- 地块基础网格 `32x32`
- 关键人物基础帧 `16x24`
- 建筑占地为 `32` 的整数倍
- 最近邻缩放，禁止运行时平滑
- 单张素材最多使用 32 个主色
- 动画统一 8 FPS 或 12 FPS
- 锚点使用归一化 `0..1`
- 高灵质区域不得使用直接发光色块揭示真实浓度

- [ ] **Step 3：定义生成与修整记录**

`manifest.json` 每项包含 `id`、`purpose`、`prompt`、`generator`、`generatedAt`、`rawPath`、`finalPath`、`width`、`height`、`anchor`、`paletteVersion`、`humanEdits` 和 `licenseReview`。

- [ ] **Step 4：生成并人工修整最小正式素材集**

开发获批后生成七类地貌、四季覆盖、三类初始人物、营地到城镇建筑、五类神迹、天气和异常效果。人工修整必须消除混合像素密度、错误透视、边缘半透明和动画抖动；未通过校验的素材不得复制到 `public/assets/pixel/`。

- [ ] **Step 5：实现自动校验**

脚本检查文件存在、尺寸符合网格、透明边缘、清单完整、运行时素材无遗漏，以及 `raw/` 文件未被应用代码引用。

- [ ] **Step 6：运行素材校验**

Run:

```bash
pnpm exec tsx scripts/validate-assets.ts
```

Expected: 输出每类素材数量，错误数为 `0`。

- [ ] **Step 7：提交素材规范和首批正式素材**

```bash
git add genesis-isle/docs/architecture/pixel-art-guide.md genesis-isle/assets genesis-isle/scripts/validate-assets.ts genesis-isle/apps/web/public/assets/pixel genesis-isle/apps/web/src/features/world/assets.ts
git commit -m "feat: add curated pixel asset pipeline"
```

### Task 14：实现 PixiJS 世界地图与公开状态渲染

**Files:**
- Create: `genesis-isle/apps/web/src/features/world/WorldCanvas.tsx`
- Create: `genesis-isle/apps/web/src/features/world/pixi/create-scene.ts`
- Create: `genesis-isle/apps/web/src/features/world/pixi/render-terrain.ts`
- Create: `genesis-isle/apps/web/src/features/world/pixi/render-settlements.ts`
- Create: `genesis-isle/apps/web/src/features/world/pixi/render-effects.ts`
- Test: `genesis-isle/apps/web/src/features/world/WorldCanvas.test.tsx`

- [ ] **Step 1：写地图交互测试**

```tsx
it('支持键盘聚焦、缩放、平移和区域选择', async () => {
  render(<WorldCanvas snapshot={publicSnapshotFixture()} />);
  const canvas = screen.getByLabelText('创世孤岛世界地图');
  expect(canvas).toHaveAttribute('tabindex', '0');
  await userEvent.keyboard('+');
  expect(useWorldStore.getState().camera.zoom).toBeGreaterThan(1);
});
```

- [ ] **Step 2：运行测试确认失败**

Run:

```bash
pnpm --filter @genesis-isle/web test -- WorldCanvas.test.tsx
```

Expected: FAIL。

- [ ] **Step 3：实现分层场景**

场景层顺序固定为地貌、资源活动、道路与建筑、人口密度、关键人物、天气、神迹与事件标记。普通人口只显示活动密度；关键人物显示独立标记和轨迹。

- [ ] **Step 4：实现昼夜、季节和天气表现**

渲染层从公开气候快照读取昼夜、季节、降雨、风暴、雾和火山活动。视觉效果不反向修改模拟；天气动画关闭或降级时，文本状态与图标仍完整表达当前环境。

- [ ] **Step 5：实现相机和选择**

支持滚轮缩放、拖动平移、键盘 `+/-` 缩放、方向键平移、`Enter` 选择焦点对象和 `Escape` 清除选择。选中区域只改变 UI 描边，不暴露隐藏数值。

- [ ] **Step 6：实现高速降噪**

`100x` 时暂停装饰性粒子和逐单位移动插值，只保留天气摘要、历史事件、神迹和文明边界变化。

- [ ] **Step 7：运行测试和构建**

Run:

```bash
pnpm --filter @genesis-isle/web test
pnpm --filter @genesis-isle/web build
```

Expected: PASS，生产构建无资源缺失。

- [ ] **Step 8：提交世界地图**

```bash
git add genesis-isle/apps/web
git commit -m "feat: render the living pixel island"
```

### Task 15：实现文明、人物、异常、历史和神迹界面

**Files:**
- Create: `genesis-isle/apps/web/src/app/GameLayout.tsx`
- Create: `genesis-isle/apps/web/src/features/civilization/CivilizationPanel.tsx`
- Create: `genesis-isle/apps/web/src/features/figures/FigurePanel.tsx`
- Create: `genesis-isle/apps/web/src/features/anomalies/AnomalyPanel.tsx`
- Create: `genesis-isle/apps/web/src/features/history/HistoryTimeline.tsx`
- Create: `genesis-isle/apps/web/src/features/miracles/MiracleToolbar.tsx`
- Create: `genesis-isle/apps/web/src/features/causality/CausalRippleView.tsx`
- Create: `genesis-isle/apps/web/src/app/game.css`
- Test: `genesis-isle/apps/web/src/app/GameLayout.test.tsx`

- [ ] **Step 1：写主布局信息完整性测试**

```tsx
it('同时提供时间、地图、文明、上下文、历史和神迹区域', () => {
  render(<GameLayout />);
  for (const name of ['时间控制', '世界地图', '文明概览', '对象详情', '历史时间轴', '神迹工具栏']) {
    expect(screen.getByRole('region', { name })).toBeVisible();
  }
});
```

- [ ] **Step 2：运行测试确认失败**

Run:

```bash
pnpm --filter @genesis-isle/web test -- GameLayout.test.tsx
```

Expected: FAIL。

- [ ] **Step 3：实现响应式主布局**

桌面端采用顶部时间、左侧文明、中央地图、右侧上下文、底部历史；宽度小于 `900px` 时左右面板变为可切换抽屉，地图保持主要视野。

- [ ] **Step 4：实现上下文面板**

文明面板显示人口结构、供需、制度、信仰、知识、压力和外交；人物面板显示人格、职业、目标、可见记忆、关系和历史影响；异常面板显示观察、目击者、文明解释与可信度。

- [ ] **Step 5：实现神迹交互**

工具栏展示冷却、时代剩余次数和外部干预风险。投放前需要选择区域或人物并二次确认；界面只描述直接作用，不承诺长期结果。

- [ ] **Step 6：实现因果涟漪视图**

以历史事件为根，分栏显示直接规则因果、强关联和文明解释。每个节点可跳转到对应时间和对象；三类边同时使用线型、图标和文字，不能只靠颜色。

- [ ] **Step 7：运行可访问性组件测试**

Run:

```bash
pnpm --filter @genesis-isle/web test
pnpm --filter @genesis-isle/web typecheck
```

Expected: PASS；所有主要区域、按钮和事件图节点具有可访问名称。

- [ ] **Step 8：提交核心 UI**

```bash
git add genesis-isle/apps/web
git commit -m "feat: add civilization observation interface"
```

### Task 16：实现文明史报告导出

**Files:**
- Create: `genesis-isle/packages/reporting/src/create-history-report.ts`
- Create: `genesis-isle/packages/reporting/src/render-markdown.ts`
- Create: `genesis-isle/packages/reporting/src/index.ts`
- Test: `genesis-isle/packages/reporting/src/create-history-report.test.ts`

- [ ] **Step 1：写报告内容测试**

```ts
it('报告包含种子、兴衰、人物、制度、神迹、异常和因果链', () => {
  const report = createHistoryReport(historyFixture());
  expect(report.seed).toBe('report-seed');
  expect(report.sections.map((section) => section.kind)).toEqual(expect.arrayContaining([
    'civilizations',
    'figures',
    'institutions',
    'miracles',
    'anomalies',
    'causal_chains'
  ]));
});
```

- [ ] **Step 2：运行测试确认失败**

Run:

```bash
pnpm --filter @genesis-isle/reporting test
```

Expected: FAIL。

- [ ] **Step 3：实现结构化报告**

报告只引用已存在的实体 ID 和事件 ID。每段叙事必须保留 `sourceEventIds`，没有来源的模型文本不得进入报告。

- [ ] **Step 4：实现 Markdown 与 JSON 导出**

JSON 用于机器分析；Markdown 用于阅读。两种格式均包含世界种子、运行年数、最终状态哈希和生成时间。

- [ ] **Step 5：运行报告测试并提交**

Run:

```bash
pnpm --filter @genesis-isle/reporting test
git add genesis-isle/packages/reporting
git commit -m "feat: export causal civilization histories"
```

Expected: PASS。

### Task 17：完成 100 年稳定性、性能和端到端验收

**Files:**
- Create: `genesis-isle/scripts/acceptance-100-years.ts`
- Create: `genesis-isle/e2e/world-observation.spec.ts`
- Create: `genesis-isle/e2e/save-replay.spec.ts`
- Create: `genesis-isle/playwright.config.ts`
- Create: `genesis-isle/docs/architecture/acceptance-report.md`

- [ ] **Step 1：实现 100 年验收脚本**

脚本使用三个固定种子：

- `baseline-survival`：验证资源、人口、疾病和迁徙长期稳定。
- `civilization-split`：验证至少一次可追溯文明分裂。
- `heterodox-acceptance`：验证修真分支完整涌现链。

每个种子运行两次并比较最终哈希，断言无负资源、无悬空引用、事件 tick 单调、AI 调用不超预算、存档可导入。

- [ ] **Step 2：运行离线 100 年验收**

Run:

```bash
pnpm exec tsx scripts/acceptance-100-years.ts --offline
```

Expected:

```text
baseline-survival: PASS deterministic=true
civilization-split: PASS deterministic=true
heterodox-acceptance: PASS deterministic=true
budget: PASS remoteCalls=0
```

- [ ] **Step 3：写观察与神迹 E2E**

```ts
test('用户可观察世界、投放神迹并追踪后果', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '10x' }).click();
  await expect(page.getByRole('region', { name: '历史时间轴' })).toContainText('第');
  await page.getByRole('button', { name: '星坠' }).click();
  await page.getByLabel('中央湖泊').click();
  await page.getByRole('button', { name: '确认投放' }).click();
  await expect(page.getByRole('region', { name: '历史时间轴' })).toContainText('星坠');
  await page.getByRole('button', { name: '查看因果涟漪' }).click();
  await expect(page.getByRole('region', { name: '因果涟漪' })).toBeVisible();
});
```

- [ ] **Step 4：写存档重放 E2E**

创建世界并运行一年，导出存档，刷新页面后导入，断言年份、人口、事件数和最终哈希一致；测试期间拦截网关并断言重放阶段没有网络请求。

- [ ] **Step 5：运行完整 E2E**

Run:

```bash
pnpm exec playwright install chromium
pnpm exec playwright test
```

Expected: 所有测试通过，并保留失败时截图与 trace。

- [ ] **Step 6：验证性能**

在 Chromium 中运行 `100x` 10 分钟：

- 主线程长任务 `>50ms` 每分钟少于 5 次。
- UI 快照刷新不超过每秒 10 次。
- Worker 内存无持续线性增长。
- 10 分钟内无未处理 Promise rejection。
- 保存操作不阻塞地图交互超过 100ms。

- [ ] **Step 7：完成验收报告**

`acceptance-report.md` 记录提交号、Node/pnpm 版本、三个种子哈希、100 年运行耗时、模型调用预算、E2E 结果、性能结果和仍存在的非阻断限制。

- [ ] **Step 8：运行全仓验证**

Run:

```bash
pnpm verify
pnpm exec tsx scripts/validate-assets.ts
pnpm exec tsx scripts/acceptance-100-years.ts --offline
pnpm exec playwright test
git diff --check
```

Expected: 所有命令退出码为 `0`，`git diff --check` 无输出。

- [ ] **Step 9：提交验收套件**

```bash
git add genesis-isle/e2e genesis-isle/scripts genesis-isle/playwright.config.ts genesis-isle/docs/architecture/acceptance-report.md
git commit -m "test: verify one hundred years of evolution"
```

## 5. 最终规格覆盖矩阵

| 设计要求 | 实施任务 |
| --- | --- |
| 七类区域、种子复现 | Task 3 |
| 资源、人口、疾病、迁徙 | Task 4 |
| 世界真相、文明知识、人物记忆 | Task 2、Task 5 |
| 群体与关键人物混合决策 | Task 6、Task 8 |
| OpenAI 兼容模型与预算 | Task 7、Task 8 |
| 隐藏灵质与异常推断 | Task 5 |
| 制度、文明分裂、修真涌现 | Task 9 |
| 五类低频神迹 | Task 10 |
| 因果涟漪 | Task 10、Task 15 |
| 实时、三档速度、暂停 | Task 12 |
| 本地存档与确定性重放 | Task 11 |
| 完整像素素材与地图 | Task 13、Task 14 |
| 文明、人物、异常、历史面板 | Task 15 |
| 文明史报告 | Task 16 |
| 100 年稳定运行 | Task 17 |

## 6. 开发开始前的最终门禁

执行 Task 1 前必须同时满足：

1. 用户批准本实施计划。
2. 用户明确回复“批准进入开发”。
3. 本机已安装 Node.js 22 与 pnpm 10。
4. 开发真实模型路径时，用户在本地 `.env` 中配置 OpenAI 兼容接口；未配置时仅运行离线策略。
5. 正式素材生成前，先以一张地貌、一名人物和一个神迹效果验证像素规范，再批量生成。

在获得明确开发批准之前，本计划仅作为执行依据，不创建 `genesis-isle/` 工程，不调用图片生成，不写实现代码。
