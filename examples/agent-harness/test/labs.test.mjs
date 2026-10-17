import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// 动态加载使尚未实现的实验报告为契约断言失败。
const load = async (name) => {
  const module = await import(`../labs/${name}.mjs`).catch((error) => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  });
  assert.ok(Object.keys(module).length, `${name} lab must expose its implementation`);
  return module;
};

test('skill discovery loads metadata first and rejects ambiguous unqualified names', async () => {
  const { discoverSkills, loadSkill } = await load('skills');
  const root = await mkdtemp(join(tmpdir(), 'harness-skills-'));
  try {
    for (const source of ['project', 'personal']) {
      await mkdir(join(root, source, 'review'), { recursive: true });
      await writeFile(join(root, source, 'review', 'SKILL.md'),
        '---\nname: review\ndescription: Review a change\n---\n\nPrivate body for later loading.');
    }
    const catalog = await discoverSkills([
      { source: 'project', path: join(root, 'project') },
      { source: 'personal', path: join(root, 'personal') },
    ]);
    assert.equal(catalog.length, 2);
    assert.equal(JSON.stringify(catalog).includes('Private body'), false);
    await assert.rejects(loadSkill(catalog, 'review'), /ambiguous/);
    const skill = await loadSkill(catalog, 'project/review');
    assert.match(skill.body, /Private body/);
    assert.equal(skill.source, 'project');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('skill loading rejects changes since discovery and escaped symlinks', async () => {
  const { discoverSkills, loadSkill } = await load('skills');
  const root = await mkdtemp(join(tmpdir(), 'harness-skills-boundary-'));
  try {
    const folder = join(root, 'skills');
    await mkdir(join(folder, 'safe'), { recursive: true });
    const file = join(folder, 'safe', 'SKILL.md');
    await writeFile(file, '---\nname: safe\ndescription: Read a fixture\n---\nbody');
    const catalog = await discoverSkills([{ source: 'project', path: folder }]);
    await writeFile(file, '---\nname: safe\ndescription: Changed\n---\nnew body');
    await assert.rejects(loadSkill(catalog, 'safe'), /changed/);
    await mkdir(join(root, 'outside'));
    await symlink(join(root, 'outside'), join(folder, 'escape'));
    await assert.rejects(discoverSkills([{ source: 'project', path: folder }]), /symlink/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('approval is bound to exact action, expires, and is consumed once', async () => {
  const { createApprovalGate } = await load('policies');
  let now = 100;
  const gate = createApprovalGate({ now: () => now, ttlMs: 50 });
  const action = { tool: 'shell', cwd: '/workspace', argv: ['git', 'status'], effects: ['read'] };
  const ticket = gate.approve(action);
  assert.throws(() => gate.consume(ticket, { ...action, argv: ['git', 'push'] }), /binding/);
  gate.consume(ticket, action);
  assert.throws(() => gate.consume(ticket, action), /unknown|consumed/);
  const expired = gate.approve(action);
  now = 151;
  assert.throws(() => gate.consume(expired, action), /expired/);
});

test('hard policy denial cannot be overridden by approval', async () => {
  const { createApprovalGate } = await load('policies');
  const gate = createApprovalGate({ denyEffects: ['network', 'delete'] });
  assert.throws(() => gate.approve({
    tool: 'http', cwd: '/workspace', argv: [], effects: ['network'],
  }), /denied/);
  assert.throws(() => gate.approve({
    tool: 'shell', cwd: '/workspace', argv: ['rm'], effects: ['invented'],
  }), /effect/);
});

test('approval rejects undeclared action fields rather than omitting them from its binding', async () => {
  const { createApprovalGate } = await load('policies');
  assert.throws(() => createApprovalGate().approve({
    tool: 'shell', cwd: '/workspace', argv: ['git', 'status'], effects: ['read'],
    env: { MODE: 'different' },
  }), /field/);
});

test('context packing preserves whole tool groups and reserves output', async () => {
  const { packContext } = await load('context');
  const blocks = [
    { id: 'rule', text: 'rules', required: true, priority: 100, source: 'instruction', group: 'rule' },
    { id: 'call', text: 'call', priority: 5, source: 'assistant', group: 'tool-1' },
    { id: 'result', text: 'result', priority: 5, source: 'tool', group: 'tool-1' },
    { id: 'goal', text: 'goal', priority: 10, source: 'user', group: 'goal' },
  ];
  const packed = packContext(blocks, { limit: 4, reserve: 1, measure: () => 1 });
  assert.deepEqual(packed.blocks.map((block) => block.id), ['rule', 'goal']);
  assert.deepEqual(packed.dropped, ['call', 'result']);
  assert.equal(packed.used, 2);
});

test('context packing fails when mandatory facts cannot fit', async () => {
  const { packContext } = await load('context');
  assert.throws(() => packContext([
    { id: 'rule', text: 'rules', required: true, priority: 1, source: 'instruction', group: 'rule' },
  ], { limit: 2, reserve: 1, measure: () => 2 }), /mandatory/);
  assert.throws(() => packContext([
    { id: 'x', text: 'x', source: 'external-as-system', group: 'x', priority: 1 },
  ], { limit: 10, reserve: 1, measure: () => 1 }), /source/);
});

test('workflow resumes completed dependencies without repeating their side effects', async () => {
  const { runWorkflow } = await load('workflow');
  const calls = [];
  const tasks = [
    { id: 'read', revision: '1', depends: [], replaySafe: true, run: async () => { calls.push('read'); return 2; } },
    { id: 'sum', revision: '1', depends: ['read'], replaySafe: true, run: async (results) => {
      calls.push('sum'); return results.read + 3;
    } },
  ];
  const first = await runWorkflow({ tasks, maxSteps: 1 });
  assert.equal(first.status, 'budget');
  const second = await runWorkflow({ tasks, state: first.state, maxSteps: 1 });
  assert.equal(second.status, 'completed');
  assert.equal(second.state.tasks.sum.result, 5);
  assert.deepEqual(calls, ['read', 'sum']);
});

test('workflow records an interrupted unsafe action as ambiguous on resume', async () => {
  const { runWorkflow } = await load('workflow');
  const tasks = [{
    id: 'send', revision: '1', depends: [], replaySafe: false,
    run: async () => { throw new Error('connection lost after send'); },
  }];
  const first = await runWorkflow({ tasks });
  assert.equal(first.status, 'failed');
  const resumed = await runWorkflow({ tasks, state: first.state });
  assert.equal(resumed.status, 'blocked');
  assert.match(resumed.reason, /ambiguous/);
});

test('workflow rejects cycles and stale checkpoint definitions before execution', async () => {
  const { runWorkflow } = await load('workflow');
  let invoked = false;
  const run = async () => { invoked = true; return null; };
  await assert.rejects(runWorkflow({ tasks: [
    { id: 'a', revision: '1', depends: ['b'], replaySafe: true, run },
    { id: 'b', revision: '1', depends: ['a'], replaySafe: true, run },
  ] }), /cycle/);
  assert.equal(invoked, false);
  const first = await runWorkflow({ tasks: [{ id: 'a', revision: '1', depends: [], replaySafe: true, run }] });
  await assert.rejects(runWorkflow({
    tasks: [{ id: 'a', revision: '2', depends: [], replaySafe: true, run }],
    state: first.state,
  }), /definition/);
});

test('workflow rejects object-prototype task identifiers', async () => {
  const { runWorkflow } = await load('workflow');
  await assert.rejects(runWorkflow({ tasks: [
    { id: '__proto__', revision: '1', depends: [], replaySafe: true, run: async () => 1 },
  ] }), /task/);
});

test('workflow refuses inconsistent completed dependencies from a corrupted checkpoint', async () => {
  const { runWorkflow } = await load('workflow');
  const tasks = [
    { id: 'a', revision: '1', depends: [], replaySafe: true, run: async () => 1 },
    { id: 'b', revision: '1', depends: ['a'], replaySafe: true, run: async () => 2 },
  ];
  const completed = await runWorkflow({ tasks });
  delete completed.state.tasks.a;
  await assert.rejects(runWorkflow({ tasks, state: completed.state }), /checkpoint|Checkpoint/);
});

test('workflow rejects present but invalid records instead of repeating unsafe actions', async () => {
  const { runWorkflow } = await load('workflow');
  let called = 0;
  const tasks = [{ id: 'send', revision: '1', depends: [], replaySafe: false, run: async () => ++called }];
  const report = await runWorkflow({ tasks });
  for (const invalid of [null, false, 0, '']) {
    const state = structuredClone(report.state);
    state.tasks.send = invalid;
    await assert.rejects(runWorkflow({ tasks, state }), /checkpoint|Checkpoint/);
  }
  assert.equal(called, 1);
});

test('workflow cancellation during checkpoint prevents the action from starting', async () => {
  const { runWorkflow } = await load('workflow');
  let called = false;
  const controller = new AbortController();
  const report = await runWorkflow({
    tasks: [{ id: 'send', revision: '1', depends: [], replaySafe: false, run: async () => { called = true; return 1; } }],
    signal: controller.signal,
    checkpoint: async () => controller.abort(),
  });
  assert.equal(report.status, 'cancelled');
  assert.equal(called, false);
});

test('approval captures its hard policy instead of retaining mutable caller configuration', async () => {
  const { createApprovalGate } = await load('policies');
  const denyEffects = ['network'];
  const gate = createApprovalGate({ denyEffects });
  denyEffects.length = 0;
  assert.throws(() => gate.approve({
    tool: 'http', cwd: '/workspace', argv: [], effects: ['network'],
  }), /denied/);
});

test('workflow does not execute before its running checkpoint is accepted', async () => {
  const { runWorkflow } = await load('workflow');
  let called = false;
  await assert.rejects(runWorkflow({
    tasks: [{ id: 'a', revision: '1', depends: [], replaySafe: true, run: async () => { called = true; return 1; } }],
    checkpoint: async () => { throw new Error('disk full'); },
  }), /disk full/);
  assert.equal(called, false);
});

test('cancelled workflow stops before choosing its next task', async () => {
  const { runWorkflow } = await load('workflow');
  const controller = new AbortController();
  controller.abort();
  let called = false;
  const report = await runWorkflow({
    tasks: [{ id: 'a', revision: '1', depends: [], replaySafe: true, run: async () => { called = true; return 1; } }],
    signal: controller.signal,
  });
  assert.equal(report.status, 'cancelled');
  assert.equal(called, false);
});

test('evaluation keeps missing outcomes visible and uses a paired comparison', async () => {
  const { summarizeRuns, comparePaired } = await load('eval');
  const report = summarizeRuns([
    { taskId: 'a', passed: true, safe: true, durationMs: 100, cost: 0.1 },
    { taskId: 'b', passed: false, safe: false, durationMs: 200, cost: 0.2 },
    { taskId: 'c', passed: null, safe: null, durationMs: null, cost: null },
  ]);
  assert.equal(report.successRate, 1 / 3);
  assert.equal(report.missing, 1);
  assert.equal(report.unsafe, 1);
  assert.equal(report.durationSamples, 2);
  const comparison = comparePaired(
    [{ taskId: 'a', passed: false }, { taskId: 'b', passed: true }],
    [{ taskId: 'a', passed: true }, { taskId: 'b', passed: true }],
  );
  assert.equal(comparison.improved, 1);
  assert.equal(comparison.regressed, 0);
  assert.throws(() => comparePaired([{ taskId: 'a', passed: true }], []), /paired/);
});

test('lab command runs five deterministic experiments without a model service', () => {
  const execution = spawnSync(process.execPath, ['labs/run.mjs'], {
    cwd: new URL('../', import.meta.url), encoding: 'utf8',
  });
  assert.equal(execution.status, 0, execution.stderr);
  const report = JSON.parse(execution.stdout);
  assert.equal(report.kind, 'deterministic-mechanism-labs');
  assert.equal(report.skills.bodyLoaded, true);
  assert.equal(report.approvals.changedActionRejected, true);
  assert.equal(report.context.pairPreserved, true);
  assert.equal(report.workflow.status, 'completed');
  assert.equal(report.workflow.executedSteps, 2);
  assert.equal(report.evaluation.missing, 1);
});
