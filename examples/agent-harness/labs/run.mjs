import { mkdtemp, mkdir, writeFile, readFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverSkills, loadSkill } from './skills.mjs';
import { createApprovalGate } from './policies.mjs';
import { packContext } from './context.mjs';
import { runWorkflow } from './workflow.mjs';
import { summarizeRuns } from './eval.mjs';

const root = await mkdtemp(join(tmpdir(), 'harness-labs-'));
try {
  await mkdir(join(root, 'skills', 'inspect'), { recursive: true });
  await writeFile(join(root, 'skills', 'inspect', 'SKILL.md'),
    '---\nname: inspect\ndescription: Inspect a local fixture\n---\nRead the fixture and report its boundary.');
  const catalog = await discoverSkills([{ source: 'project', path: join(root, 'skills') }]);
  const skill = await loadSkill(catalog, 'project/inspect');

  const gate = createApprovalGate({ denyEffects: ['network', 'delete'] });
  const action = { tool: 'shell', cwd: root, argv: ['git', 'status'], effects: ['read'] };
  const ticket = gate.approve(action);
  let changedActionRejected = false;
  try { gate.consume(ticket, { ...action, argv: ['git', 'push'] }); }
  catch { changedActionRejected = true; }
  gate.consume(ticket, action);

  const packed = packContext([
    { id: 'rule', text: 'local only', group: 'rule', source: 'instruction', required: true, priority: 100 },
    { id: 'call', text: 'read', group: 'tool-1', source: 'assistant', priority: 5 },
    { id: 'result', text: 'fixture', group: 'tool-1', source: 'tool', priority: 5 },
    { id: 'goal', text: 'report', group: 'goal', source: 'user', priority: 10 },
  ], { limit: 4, reserve: 1, measure: () => 1 });

  const snapshot = join(root, 'checkpoint.json');
  const checkpoint = async (state) => {
    await writeFile(`${snapshot}.tmp`, JSON.stringify(state));
    await rename(`${snapshot}.tmp`, snapshot);
  };
  let executedSteps = 0;
  const tasks = [
    { id: 'inspect', revision: '1', depends: [], replaySafe: true, run: async () => {
      executedSteps++; return (await readFile(join(root, 'skills', 'inspect', 'SKILL.md'), 'utf8')).length;
    } },
    { id: 'report', revision: '1', depends: ['inspect'], replaySafe: true, run: async (results) => {
      executedSteps++; return { bytes: results.inspect };
    } },
  ];
  await runWorkflow({ tasks, maxSteps: 1, checkpoint });
  const state = JSON.parse(await readFile(snapshot, 'utf8'));
  const resumed = await runWorkflow({ tasks, state, maxSteps: 1, checkpoint });

  // 人工标注的夹具只验证统计，不表示模型实测成功率。
  const evaluation = summarizeRuns([
    { taskId: 'fixture-a', passed: true, safe: true, durationMs: 100, cost: 0 },
    { taskId: 'fixture-b', passed: false, safe: false, durationMs: 200, cost: 0 },
    { taskId: 'fixture-c', passed: null, safe: null, durationMs: null, cost: null },
  ]);
  console.log(JSON.stringify({
    kind: 'deterministic-mechanism-labs',
    skills: { metadataCount: catalog.length, bodyLoaded: skill.body.length > 0 },
    approvals: { changedActionRejected },
    context: { selected: packed.blocks.map((block) => block.id), dropped: packed.dropped,
      pairPreserved: packed.dropped.includes('call') && packed.dropped.includes('result') },
    workflow: { status: resumed.status, executedSteps },
    evaluation,
  }, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
