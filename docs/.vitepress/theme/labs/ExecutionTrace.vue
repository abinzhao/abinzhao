<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import source from '../../../../examples/site-labs/execution.ts?raw';
import { runCancellation, type TraceEvent, type TraceKind } from '../../../../examples/site-labs/execution';
import { traceLines } from '../../data/trace-source';
import { useMotionPolicy } from '../composables/use-motion-policy';
const motion = useMotionPolicy();
const count = ref(5), factor = ref(2), cancelAfter = ref(0), breakpoint = ref('');
const events = ref<TraceEvent[]>([]), cursor = ref(0), running = ref(false), done = ref(false), error = ref(''), copied = ref(false);
const root = ref<HTMLElement>(), code = ref<HTMLElement>();
const current = computed(() => events.value[cursor.value]);
const lines = source.split('\n'), locations = traceLines(source);
const names: Record<TraceKind, string> = { start: '开始处理', value: '累加结果', abort: '发出取消请求', cancelled: '已取消', done: '处理完成' };
let controller: AbortController | undefined, iterator: ReturnType<typeof runCancellation> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined, release: (() => void) | undefined, observer: IntersectionObserver | undefined;
let generation = 0, advancing = false;
function pause() { clearTimeout(timer); running.value = false; release?.(); release = undefined; }
function reset() {
  generation++; pause(); controller?.abort(); void iterator?.return(); iterator = undefined; controller = undefined;
  events.value = []; cursor.value = 0; done.value = false; advancing = false; error.value = ''; copied.value = false;
}
async function step() {
  if (advancing) return;
  if (cursor.value < events.value.length - 1) { cursor.value++; return; }
  if (done.value) { pause(); return; }
  const ticket = generation;
  advancing = true;
  try {
    if (!iterator) { controller = new AbortController(); iterator = runCancellation({ count: Number(count.value), factor: Number(factor.value), cancelAfter: Number(cancelAfter.value) }, controller.signal); }
    const event = await iterator.next();
    if (ticket !== generation) return;
    if (event.done) { done.value = true; pause(); return; }
    events.value.push(event.value); cursor.value = events.value.length - 1;
    if (['done', 'cancelled'].includes(event.value.kind)) {
      done.value = true; await iterator.return(); pause();
    } else if (event.value.kind === breakpoint.value) pause();
  } catch (cause) { if (ticket === generation) { error.value = (cause as Error).message; done.value = true; pause(); } }
  finally { if (ticket === generation) advancing = false; }
}
async function tick() {
  const ticket = generation;
  await step();
  if (ticket === generation && running.value) timer = setTimeout(() => { void tick(); }, 240);
}
function play() {
  if (!motion.policy.value.motion) return;
  pause();
  const lease = motion.gate.acquire(pause);
  if (!lease) { error.value = '本地助手正在计算，可先逐步查看示例。'; return; }
  release = lease; running.value = true; void tick();
}
async function copy() {
  try { await navigator.clipboard.writeText(source); copied.value = true; }
  catch { error.value = '复制不可用，可选择下方源码手动复制。'; }
}
watch([count, factor, cancelAfter], reset);
watch(current, () => {
  void nextTick(() => {
    const container = code.value, line = container?.querySelector<HTMLElement>('[data-current=true]');
    if (container && line) container.scrollTop += line.getBoundingClientRect().top - container.getBoundingClientRect().top - container.clientHeight / 2;
  });
});
watch([motion.policy, motion.visible], ([policy, visible]) => { if (!policy.motion || !visible) pause(); });
onMounted(() => { observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) pause(); }); if (root.value) observer.observe(root.value); });
onBeforeUnmount(() => { reset(); observer?.disconnect(); });
</script>

<template>
  <div ref="root" class="execution-trace">
    <div class="lab-controls">
      <label>处理数量<input v-model="count" type="number" min="1" max="100" aria-label="处理数量"></label>
      <label>倍率<input v-model="factor" type="number" min="1" max="10" aria-label="计算倍率"></label>
      <label>取消位置<input v-model="cancelAfter" type="number" min="0" :max="count" aria-label="处理几项后取消，0 表示不取消"></label>
      <label>断点<select v-model="breakpoint" aria-label="执行断点"><option value="">无断点</option><option value="value">每次累加</option><option value="abort">发出取消</option></select></label>
    </div>
    <div class="lab-controls">
      <button class="button button--primary" :disabled="done && cursor === events.length - 1" @click="pause(); step()">下一步</button>
      <button v-if="!running" class="button" :disabled="!motion.policy.value.motion || (done && cursor === events.length - 1)" @click="play">运行到结束</button>
      <button v-else class="button" @click="pause">暂停执行</button>
      <button class="button button--secondary" @click="reset">重置</button>
      <button class="button button--secondary" @click="copy">{{ copied ? '已复制' : '复制示例源码' }}</button>
    </div>
    <div class="trace-body">
      <pre ref="code" class="trace-source" tabindex="0" aria-label="实际执行源码"><code><span v-for="(line, index) in lines" :key="index" :data-current="current && locations[current.kind] === index + 1"><i aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</i>{{ line }}
</span></code></pre>
      <div class="trace-inspector">
        <div v-if="current" class="trace-current" role="status">
          <p class="technical-label">事件 {{ cursor + 1 }} · 源码 L{{ locations[current.kind] }}</p>
          <h2>{{ names[current.kind] }}</h2>
          <div class="trace-flow" aria-hidden="true"><span :class="{ active: !current.aborted }">控制器</span><b>→</b><span :class="{ active: current.kind === 'value' }">循环</span><b>→</b><span :class="{ active: current.kind === 'done' }">结果</span></div>
          <pre>index = {{ current.index }}
value = {{ current.value }}
total = {{ current.total }}
aborted = {{ current.aborted }}</pre>
        </div>
        <p v-else>点击「下一步」开始执行。取消位置为 0 时处理全部输入。</p>
        <label v-if="events.length" class="trace-replay">回看事件 {{ cursor + 1 }} / {{ events.length }}<input v-model.number="cursor" type="range" min="0" :max="events.length - 1" aria-label="回看已执行步骤" @input="pause"></label>
        <ol class="trace-events" aria-label="已发生的执行事件"><li v-for="(event, index) in events" :key="index"><button :aria-current="cursor === index ? 'step' : undefined" @click="pause(); cursor = index">{{ index + 1 }} · {{ names[event.kind] }} · total {{ event.total }}</button></li></ol>
      </div>
    </div>
    <p v-if="error" class="lab-status" role="alert">{{ error }}</p>
    <p class="lab-status">真实生成器在每次 next() 才继续执行，回看使用已记录快照。固定输入最多 100 项，最多 103 条事件；没有执行任意代码。减少动态时可逐步操作。</p>
  </div>
</template>

<style scoped>
.trace-body{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(260px,1fr);border-top:1px solid var(--site-border)}
.trace-source{margin:0;padding:16px 0;overflow:auto;max-height:480px;font:13px/1.8 var(--vp-font-family-mono);tab-size:2;background:var(--site-bg)}
.trace-source code{display:block;min-width:max-content}.trace-source span{display:block;padding-right:16px;height:1.8em;white-space:pre}.trace-source span[data-current=true]{background:var(--vp-c-brand-soft);box-shadow:inset 3px 0 var(--site-accent)}.trace-source i{display:inline-block;width:3rem;text-align:center;font-style:normal;color:var(--site-text-muted);user-select:none}
.trace-inspector{min-width:0;padding:1.5rem;border-left:1px solid var(--site-border)}.trace-inspector p{font-size:14px;line-height:1.8}.trace-current h2{font-size:1.3rem;margin:.5rem 0}.trace-current pre{font:14px/1.8 var(--vp-font-family-mono)}
.trace-flow{display:flex;gap:8px;align-items:center;font-size:13px;padding:12px 0}.trace-flow span{padding:8px;border:1px solid var(--site-border);border-radius:6px}.trace-flow .active{border-color:var(--site-accent);color:var(--site-accent);background:var(--vp-c-brand-soft)}
.trace-replay{display:flex;flex-direction:column;font-size:13px;color:var(--site-text-muted)}.trace-replay input{min-height:44px;width:100%;accent-color:var(--site-accent)}
.trace-events{list-style:none;margin:0;padding:0;max-height:150px;overflow:auto}.trace-events button{min-height:44px;padding:8px;width:100%;text-align:left;font-size:13px;border-bottom:1px solid var(--site-border)}.trace-events button[aria-current=step]{color:var(--site-accent);background:var(--vp-c-brand-soft)}
.lab-controls input[type=number]{width:90px}
@media(max-width:700px){.trace-body{grid-template-columns:1fr}.trace-source{max-height:320px}.trace-inspector{border-left:0;border-top:1px solid var(--site-border);padding:1rem}}
</style>
