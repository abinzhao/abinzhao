<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMotionPolicy } from '../composables/use-motion-policy';
const motion = useMotionPolicy();
const amount = ref(100), angle = ref(-14), active = ref(0), flat = ref(false);
const isFlat = computed(() => flat.value || !motion.policy.value.motion);
const sha = 'e9595400b7d5239cee3413dd6a0d695f6ac30ecc';
const layers = [
  { title: '01 · 内容构建', phase: '构建时 · Node.js', file: 'docs/.vitepress/data/knowledge-build.ts', description: '读取已发布 Markdown，生成检索索引和语料。它在构建时执行，浏览器下载的是静态制品。', signal: 'Markdown → 索引与语料' },
  { title: '02 · 页面状态', phase: '浏览器 · 主线程', file: 'docs/.vitepress/theme/composables/use-assistant.ts', description: '维护 retrieving、streaming 等响应式生成状态，通过请求序号阻止过期任务更新当前 UI，并协调停止操作。', signal: '输入 → 当前任务 → 视图' },
  { title: '03 · 检索计算', phase: '浏览器 · Worker', file: 'docs/.vitepress/theme/assistant/knowledge.worker.ts', description: '检索 worker 在浏览器本机处理已构建的站点语料。它与模型推理 worker 是不同职责，问题不发送给业务后端。', signal: '查询 → 本地检索 → 引用' },
  { title: '04 · 会话存储', phase: '浏览器 · IndexedDB', file: 'docs/.vitepress/theme/assistant/storage.ts', description: '会话写入 IndexedDB，以事务完成判定成功；受阻时回退到内存并提示。此层只解释会话存储，不代表所有离线资源。', signal: '快照 → 事务提交 → 恢复' },
];
const selected = computed(() => layers[active.value]);
let drag: { x: number; y: number; angle: number; amount: number } | undefined;
function down(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || isFlat.value || event.button !== 0) return;
  drag = { x: event.clientX, y: event.clientY, angle: Number(angle.value), amount: Number(amount.value) };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (!drag) return;
  angle.value = Math.max(-25, Math.min(25, drag.angle + (event.clientX - drag.x) * .2));
  amount.value = Math.round(Math.max(0, Math.min(100, drag.amount - (event.clientY - drag.y) * .4)));
}
</script>

<template>
  <div class="source-layers">
    <div class="lab-controls">
      <label>展开 {{ amount }}%<input v-model="amount" type="range" min="0" max="100" aria-label="分层展开程度"></label>
      <label>视角<input v-model="angle" type="range" min="-25" max="25" aria-label="剖面旋转角度" :disabled="isFlat"></label>
      <button class="button button--secondary" :aria-pressed="flat" @click="flat = !flat">{{ flat ? '空间视图' : '平面视图' }}</button>
      <button class="button button--secondary" @click="amount = 0; angle = -14; active = 0">收起剖面</button>
    </div>
    <div class="layer-body">
      <div class="layer-space" :data-flat="isFlat" :style="{ '--spread': `${Number(amount) / 100}`, '--angle': `${angle}deg` }" @pointerdown="down" @pointermove="move" @pointerup="drag = undefined" @pointercancel="drag = undefined" @lostpointercapture="drag = undefined">
        <div class="layer-stack">
          <div v-for="(layer, index) in layers" :key="layer.title" class="layer-plane" :class="{ 'is-selected': active === index }" :style="{ '--layer': index }" aria-hidden="true">
            <span>{{ String(index + 1).padStart(2, '0') }}</span><strong>{{ layer.phase }}</strong><i></i><small>{{ layer.signal }}</small>
          </div>
        </div>
        <p class="layer-hint">{{ isFlat ? '平面职责视图' : '拖动调整视角与间距 · 触屏使用滑块' }}</p>
      </div>
      <div class="layer-inspector">
        <div class="layer-options" role="group" aria-label="源码层级">
          <button v-for="(layer, index) in layers" :key="layer.title" :aria-pressed="active === index" @click="active = index">{{ layer.title }}</button>
        </div>
        <section v-if="!isFlat" class="layer-detail" aria-live="polite">
          <p class="technical-label">{{ selected.phase }}</p><h2>{{ selected.title }}</h2><p>{{ selected.description }}</p>
          <a :href="`https://github.com/abinzhao/abinzhao/blob/${sha}/${selected.file}`" target="_blank" rel="noreferrer">{{ selected.file }} ↗</a>
          <p class="layer-note">源码固定到本站已验证提交 e959540；图形表达职责与运行阶段，不是实时 DOM 或 GPU 层树。</p>
        </section>
        <div v-else class="layer-accordion">
          <details v-for="layer in layers" :key="layer.title"><summary>{{ layer.title }}</summary><p>{{ layer.description }}</p><a :href="`https://github.com/abinzhao/abinzhao/blob/${sha}/${layer.file}`" target="_blank" rel="noreferrer">{{ layer.file }} ↗</a></details>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layer-body{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(250px,1fr);border-top:1px solid var(--site-border)}
.layer-space{position:relative;min-height:480px;overflow:hidden;perspective:1000px;background:radial-gradient(ellipse,var(--vp-c-brand-soft),transparent 70%)}
.layer-stack{position:absolute;inset:42% 18% auto;height:90px;transform-style:preserve-3d;transform:rotateX(48deg) rotateZ(var(--angle))}
.layer-plane{position:absolute;inset:0;padding:12px;display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-content:start;border:1px solid var(--site-border);border-radius:12px;background:var(--site-surface);box-shadow:0 12px 30px #0002;transform:translateZ(calc((1.5 - var(--layer)) * var(--spread) * 100px));transition:border-color 140ms}
.layer-plane.is-selected{border-color:var(--site-accent);box-shadow:0 0 0 2px var(--vp-c-brand-soft),0 12px 30px #0002}
.layer-plane>span{font:600 26px var(--vp-font-family-mono);color:var(--site-accent);grid-row:span 2}.layer-plane strong,.layer-plane small{font-size:13px}.layer-plane i{height:4px;background:var(--site-accent);opacity:.5;border-radius:4px}.layer-plane small{grid-column:2;color:var(--site-text-muted)}
.layer-inspector{padding:1.5rem;border-left:1px solid var(--site-border)}.layer-options{display:grid;grid-template-columns:1fr 1fr;gap:6px}.layer-options button{font-size:13px;min-height:44px;border:1px solid var(--site-border);border-radius:6px}.layer-options button[aria-pressed=true]{color:var(--site-accent);background:var(--vp-c-brand-soft);border-color:var(--site-accent)}
.layer-detail{padding-top:1.5rem}.layer-detail h2{font-size:1.35rem}.layer-detail p{font-size:15px;line-height:1.8}.layer-detail a{display:inline-flex;align-items:center;min-height:44px;color:var(--site-accent);font:13px/1.8 var(--vp-font-family-mono);overflow-wrap:anywhere}.layer-detail .layer-note{font-size:13px;color:var(--site-text-muted)}
.layer-hint{position:absolute;bottom:12px;left:0;right:0;text-align:center;font-size:13px;color:var(--site-text-muted);pointer-events:none}.layer-space:not([data-flat=true]){cursor:grab}.layer-space:not([data-flat=true]):active{cursor:grabbing}
.layer-accordion{padding-top:1rem}.layer-accordion summary{min-height:44px;cursor:pointer;font-size:14px;line-height:44px}.layer-accordion p{font-size:14px;line-height:1.8}.layer-accordion a{display:inline-flex;align-items:center;min-height:44px;font-size:13px;overflow-wrap:anywhere;color:var(--site-accent)}
.layer-space[data-flat=true]{min-height:440px}.layer-space[data-flat=true] .layer-stack{position:static;display:grid;gap:10px;transform:none;height:auto;padding:20px}.layer-space[data-flat=true] .layer-plane{position:static;transform:none;box-shadow:none;padding:14px}
@media(max-width:700px){.layer-body{grid-template-columns:1fr}.layer-space{min-height:400px}.layer-stack{inset:40% 14% auto;height:80px}.layer-plane{padding:8px;gap:4px 8px}.layer-plane>span{font-size:20px}.layer-inspector{border-left:0;border-top:1px solid var(--site-border);padding:1rem}}
</style>
