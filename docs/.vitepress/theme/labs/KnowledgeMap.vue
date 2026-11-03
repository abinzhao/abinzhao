<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { withBase } from 'vitepress';
import { data as graph } from '../../data/graph.data';
import { graphNeighborhood, hitNode, type GraphPoint } from '../../../../examples/site-labs/knowledge-graph';
import { useMotionPolicy } from '../composables/use-motion-policy';

const motion = useMotionPolicy();
const root = ref<HTMLElement>(), canvas = ref<HTMLCanvasElement>();
const center = ref('column:agent-harness'), selected = ref(center.value), query = ref('');
const global = ref(false), zoom = ref(100), panX = ref(0), panY = ref(0);
const state = ref('idle'), message = ref('');
const local = computed(() => global.value ? graph : graphNeighborhood(graph, center.value));
const current = computed(() => graph.nodes.find((node) => node.id === selected.value));
const results = computed(() => query.value.trim() ? graph.nodes.filter((node) => node.title.toLowerCase().includes(query.value.trim().toLowerCase())).slice(0, 30) : []);
const labels = { article: '文章', column: '专题', experiment: '实验' };
const edgeLabels = { contains: '专题包含', prerequisite: '明确先修 → 后续文章', demo: '文章对应实验' };
const relations = computed(() => local.value.edges.filter((edge) => edge.from === selected.value || edge.to === selected.value));
let points: GraphPoint[] = [], screenPoints: GraphPoint[] = [];
let worker: Worker | undefined, release: (() => void) | undefined, timeout: ReturnType<typeof setTimeout> | undefined;
let resize: ResizeObserver | undefined, theme: MutationObserver | undefined, visibility: IntersectionObserver | undefined;
let frame = 0, generation = 0, disposed = false;
function stop() {
  generation++; worker?.terminate(); worker = undefined; release?.(); release = undefined; clearTimeout(timeout);
  if (state.value === 'loading') { state.value = 'idle'; message.value = '布局已暂停，列表仍可阅读；可重新计算。'; }
}
function compute() {
  stop();
  points = []; screenPoints = []; schedule();
  const lease = motion.gate.acquire(stop);
  if (!lease) { message.value = '本地助手正在计算，可先使用内容列表。'; return; }
  release = lease;
  const ticket = generation;
  state.value = 'loading'; message.value = '正在计算布局…';
  try {
    worker = new Worker(new URL('./lab-graph.worker.ts', import.meta.url), { type: 'module' });
    const fail = () => { if (ticket !== generation) return; stop(); state.value = 'error'; message.value = '图形布局不可用，可使用下方同一份内容列表，或重试。'; };
    worker.onerror = fail;
    worker.onmessage = (event: MessageEvent<GraphPoint[]>) => {
      if (ticket !== generation || disposed) return;
      points = event.data; state.value = 'ready'; message.value = ''; stop(); schedule();
    };
    timeout = setTimeout(fail, 5000);
    worker.postMessage({ graph: local.value, root: center.value });
  } catch { stop(); state.value = 'error'; message.value = '当前浏览器无法创建 Worker，可使用内容列表。'; }
}
function schedule() { if (!disposed && !frame) frame = requestAnimationFrame(() => { frame = 0; draw(); }); }
function draw() {
  const element = canvas.value;
  const context = element?.getContext('2d');
  if (!element || !context || !motion.visible.value) return;
  const width = element.clientWidth, height = element.clientHeight, dpr = Math.min(devicePixelRatio || 1, 1.5);
  element.width = Math.round(width * dpr); element.height = Math.round(height * dpr);
  context.scale(dpr, dpr);
  const style = getComputedStyle(element);
  const color = (name: string) => style.getPropertyValue(name).trim();
  const accent = color('--site-accent'), muted = color('--site-text-muted'), surface = color('--site-surface');
  const boundX = Math.max(150, ...points.map((point) => Math.abs(point.x))), boundY = Math.max(150, ...points.map((point) => Math.abs(point.y)));
  const scale = Math.min((width - 70) / (boundX * 2), (height - 70) / (boundY * 2)) * Number(zoom.value) / 100;
  screenPoints = points.map((point) => ({ ...point, x: width / 2 + point.x * scale + panX.value, y: height / 2 + point.y * scale + panY.value }));
  const byId = new Map(screenPoints.map((point) => [point.id, point]));
  for (const edge of local.value.edges) {
    const a = byId.get(edge.from), b = byId.get(edge.to);
    if (!a || !b) continue;
    const active = edge.from === selected.value || edge.to === selected.value;
    context.strokeStyle = active ? accent : color('--site-border');
    context.lineWidth = active ? 2 : 1;
    context.setLineDash(edge.kind === 'contains' ? [] : edge.kind === 'demo' ? [2, 5] : [7, 4]);
    context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
    if (edge.kind === 'prerequisite') {
      const angle = Math.atan2(b.y - a.y, b.x - a.x), x = b.x - Math.cos(angle) * 22, y = b.y - Math.sin(angle) * 22;
      context.beginPath(); context.moveTo(x - Math.cos(angle - .5) * 9, y - Math.sin(angle - .5) * 9); context.lineTo(x, y); context.lineTo(x - Math.cos(angle + .5) * 9, y - Math.sin(angle + .5) * 9); context.stroke();
    }
  }
  context.setLineDash([]);
  context.font = '13px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle';
  for (const point of screenPoints) {
    const active = point.id === selected.value;
    context.fillStyle = active ? accent : surface; context.strokeStyle = active ? accent : muted; context.lineWidth = active ? 2 : 1;
    context.beginPath(); context.arc(point.x, point.y, active ? 20 : global.value ? 9 : 15, 0, Math.PI * 2); context.fill(); context.stroke();
    if (!global.value || active) {
      context.fillStyle = active ? color('--site-bg') : color('--site-text');
      context.fillText(String(local.value.nodes.findIndex((node) => node.id === point.id) + 1), point.x, point.y);
    }
  }
}
function pick(event: MouseEvent) {
  const bounds = canvas.value!.getBoundingClientRect();
  const id = hitNode(screenPoints, event.clientX - bounds.left, event.clientY - bounds.top);
  if (!id) return;
  selected.value = id;
  void nextTick(() => Array.from(root.value?.querySelectorAll<HTMLButtonElement>('[data-node]') ?? []).find((button) => button.dataset.node === id)?.focus({ preventScroll: true }));
}
function expand(id = selected.value) {
  center.value = id; selected.value = id; query.value = ''; global.value = false; zoom.value = 100; panX.value = panY.value = 0;
  void nextTick(compute);
}
watch([selected, zoom, panX, panY], schedule);
watch(motion.visible, (visible) => { if (!visible) stop(); else schedule(); });
onMounted(() => {
  const id = new URL(location.href).searchParams.get('node');
  if (id && graph.nodes.some((node) => node.id === id)) center.value = selected.value = id;
  resize = new ResizeObserver(schedule); if (canvas.value) resize.observe(canvas.value);
  theme = new MutationObserver(schedule); theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  visibility = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) stop(); }); if (root.value) visibility.observe(root.value);
  compute();
});
onBeforeUnmount(() => { disposed = true; stop(); cancelAnimationFrame(frame); resize?.disconnect(); theme?.disconnect(); visibility?.disconnect(); });
</script>

<template>
  <div ref="root" class="knowledge-map" :data-layout="state">
    <div class="lab-controls">
      <label>查找内容<input v-model="query" type="search" aria-label="查找图谱内容" placeholder="文章、专题、实验"></label>
      <button class="button button--secondary" @click="global = !global; compute()">{{ global ? '返回局部' : '查看全局图' }}</button>
      <button class="button button--secondary" @click="expand('column:agent-harness')">重置图谱</button>
      <button v-if="state !== 'ready'" class="button" @click="compute">重新计算</button>
    </div>
    <div v-if="query.trim()" class="graph-search">
      <p v-if="!results.length" role="status">没有匹配内容。</p>
      <button v-for="node in results" :key="node.id" @click="expand(node.id)">{{ node.title }} <span>{{ labels[node.kind] }}</span></button>
    </div>
    <div class="graph-body">
      <div class="graph-visual">
        <canvas ref="canvas" role="img" :aria-label="`知识图谱，选中${current?.title}。相同节点及链接列在下方。`" @click="pick"></canvas>
        <div class="lab-controls graph-view">
          <label>缩放 {{ zoom }}%<input v-model="zoom" type="range" min="60" max="180" aria-label="图谱缩放"></label>
          <button aria-label="图谱向左平移" @click="panX -= 40">←</button><button aria-label="图谱向右平移" @click="panX += 40">→</button>
          <button aria-label="图谱向上平移" @click="panY -= 40">↑</button><button aria-label="图谱向下平移" @click="panY += 40">↓</button>
        </div>
        <div class="graph-selection">
          <span class="technical-label">{{ current ? labels[current.kind] : '选择节点' }} · {{ local.nodes.length }} 个节点</span>
          <h2>{{ current?.title }}</h2>
          <div class="lab-controls"><a v-if="current" class="button button--primary" :href="withBase(current.href)">阅读内容 ↗</a><button class="button button--secondary" @click="expand()">展开此节点</button></div>
          <p v-if="!relations.length">尚未声明关联，可直接阅读内容。</p>
          <p v-else>{{ [...new Set(relations.map(edge => edgeLabels[edge.kind]))].join(' · ') }}</p>
          <details v-if="relations.length" class="graph-relations"><summary>查看 {{ relations.length }} 条具体关系</summary>
            <p v-for="edge in relations" :key="`${edge.kind}:${edge.from}:${edge.to}`">
              {{ edge.kind === 'contains' ? (edge.from === selected ? '包含文章' : '所属专题') : edge.kind === 'prerequisite' ? (edge.from === selected ? '后续学习' : '需要先读') : '对应实验 / 文章' }}：
              <a :href="withBase(graph.nodes.find(node => node.id === (edge.from === selected ? edge.to : edge.from))!.href)">{{ graph.nodes.find(node => node.id === (edge.from === selected ? edge.to : edge.from))!.title }}</a>
            </p>
          </details>
          <p class="graph-legend">实线：专题包含 · 虚线箭头：先修 → 后续 · 点线：对应实验。滚轮保持页面滚动。</p>
        </div>
      </div>
      <ol class="graph-links" aria-label="图谱节点与阅读链接">
        <li v-for="(node, index) in local.nodes" :key="node.id">
          <span>{{ String(index + 1).padStart(2, '0') }}</span>
          <button :data-node="node.id" :aria-pressed="selected === node.id" @click="selected = node.id" @focus="selected = node.id">{{ node.title }}</button>
          <a :href="withBase(node.href)" :aria-label="`阅读：${node.title}`">↗</a>
        </li>
      </ol>
    </div>
    <p v-if="message" class="lab-status" role="status">{{ message }}</p>
  </div>
</template>

<style scoped>
.graph-body{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(230px,1fr);border-top:1px solid var(--site-border)}
.graph-visual{min-width:0}.graph-visual canvas{display:block;width:100%;height:400px;background:radial-gradient(ellipse,var(--vp-c-brand-soft),transparent 68%);cursor:crosshair}
.graph-selection{padding:1.5rem;border-top:1px solid var(--site-border)}.graph-selection h2{font-size:1.25rem;line-height:1.6;margin:.5rem 0}.graph-selection p{font-size:13px;color:var(--site-text-muted);line-height:1.8}.graph-selection .lab-controls{padding:0;border:0}
.graph-links{list-style:none;padding:0;margin:0;border-left:1px solid var(--site-border);max-height:650px;overflow:auto;overscroll-behavior:contain}
.graph-links li{display:flex;align-items:center;border-bottom:1px solid var(--site-border);padding:4px 8px;gap:6px}.graph-links li>span{font:13px var(--vp-font-family-mono);color:var(--site-text-muted)}
.graph-links button{flex:1;min-width:0;min-height:44px;text-align:left;font-size:13px;line-height:1.7;padding:8px;border-radius:6px}.graph-links button[aria-pressed=true]{background:var(--vp-c-brand-soft);color:var(--site-accent)}
.graph-links a,.graph-view button{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;color:var(--site-accent)}
.graph-search{padding:1rem;max-height:250px;overflow:auto}.graph-search button{display:block;min-height:44px;text-align:left;font-size:14px}.graph-search span{font-size:13px;color:var(--site-text-muted);margin-left:1rem}
.graph-relations summary{min-height:44px;display:flex;align-items:center;font-size:13px;cursor:pointer;color:var(--site-accent)}.graph-relations a{color:var(--site-accent)}
@media(max-width:700px){.graph-body{grid-template-columns:1fr}.graph-links{border-left:0;border-top:1px solid var(--site-border);max-height:330px}.graph-visual canvas{height:320px}.graph-selection{padding:1rem}}
</style>
