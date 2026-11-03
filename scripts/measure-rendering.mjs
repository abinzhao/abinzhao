import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir, cpus, platform, release } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/** 依赖 agent-browser CLI；使用当前生产页面的 WAAPI 实例，交替隔离采样而不改写实现。 */
const session = process.argv[2] ?? 'rendering-sample';
const url = process.argv[3] ?? 'http://127.0.0.1:5202/abinzhao/labs/rendering.html';
const traceDirectory = await mkdtemp(join(tmpdir(), 'abinzhao-rendering-traces-'));
const output = resolve(process.argv[4] ?? join(traceDirectory, 'summary.json'));
function browser(...args) {
  const data = JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 }));
  if (!data.success) throw new Error(JSON.stringify(data.error));
  return data.data;
}
const evaluate = (source) => browser('eval', '-b', Buffer.from(source).toString('base64')).result;
browser('set', 'viewport', '1440', '900');
browser('open', url);
browser('find', 'role', 'button', 'click', '--name', '运行实验', '--exact');
browser('find', 'role', 'button', 'click', '--name', '播放对照', '--exact');
const browserInfo = evaluate(`({ua:navigator.userAgent,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],theme:document.documentElement.dataset.theme})`);
const samples = [];
for (let iteration = 1; iteration <= 3; iteration++) {
  for (const mode of ['idle', 'width', 'transform']) {
    const tracePath = join(traceDirectory, `${iteration}-${mode}.json`);
    browser('profiler', 'start', '--categories', 'devtools.timeline,blink.user_timing,toplevel');
    let observation;
    try {
      observation = evaluate(`(async () => {
        const root = document.querySelector('.pipeline-demo');
        root.scrollIntoView({block:'center',behavior:'instant'});
        const animations = root.getAnimations({subtree:true});
        if (animations.length !== 2) throw new Error('Expected the two real comparison animations');
        animations.forEach(animation => { animation.pause(); animation.currentTime = 0; });
        const selected = document.querySelector('[data-comparison="${mode}"]');
        selected?.getAnimations().forEach(animation => animation.play());
        await new Promise(resolve => setTimeout(resolve, 500));
        performance.mark('lab-sample-start');
        await new Promise(resolve => setTimeout(resolve, 5000));
        performance.mark('lab-sample-end');
        const elapsed = performance.measure('lab-sample-duration', 'lab-sample-start', 'lab-sample-end').duration;
        animations.forEach(animation => animation.pause());
        return { elapsedMs: elapsed, mode: '${mode}' };
      })()`);
    } finally { browser('profiler', 'stop', tracePath); }
    const bytes = await readFile(tracePath);
    const { traceEvents } = JSON.parse(bytes);
    const start = traceEvents.find((event) => event.name === 'lab-sample-start');
    const end = traceEvents.find((event) => event.name === 'lab-sample-end');
    if (!start || !end) throw new Error('Trace missing measurement boundaries');
    const events = traceEvents.filter((event) => event.pid === start.pid && event.tid === start.tid && event.ts >= start.ts && event.ts < end.ts && event.ph === 'X');
    const metrics = {};
    for (const name of ['Layout', 'Paint', 'UpdateLayoutTree']) {
      const matching = events.filter((event) => event.name === name);
      metrics[name] = { count: matching.length, totalMs: Number((matching.reduce((sum, event) => sum + (event.dur ?? 0), 0) / 1000).toFixed(3)) };
    }
    samples.push({ iteration, ...observation, metrics, traceSha256: createHash('sha256').update(bytes).digest('hex') });
    console.log(`${iteration} ${mode}: ${JSON.stringify(metrics)}`);
  }
}
const result = {
  measuredAt: new Date().toISOString(), url: new URL(url).pathname,
  browser: browserInfo, host: { platform: platform(), release: release(), cpu: cpus()[0].model },
  conditions: '生产构建、暖页面；1440×900、DPR 1；无网络/CPU 降速；每种状态独立运行5秒，前置500ms预热，交替3轮；仅统计采样主线程的完整事件。',
  limitations: '短时单机微基准；事件耗时不可相加解释为总帧耗时。未记录现场 INP、真实手机帧率或 GPU 执行时间。',
  sourceSha256: createHash('sha256').update(await readFile(new URL('../docs/.vitepress/theme/labs/RenderingPipeline.vue', import.meta.url))).digest('hex'),
  samples,
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(result, null, 2) + '\n');
console.log(`Summary: ${output}\nRaw traces: ${traceDirectory}`);
