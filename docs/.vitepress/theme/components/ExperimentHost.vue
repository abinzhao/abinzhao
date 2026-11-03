<script setup lang="ts">
import { markRaw, onBeforeUnmount, ref, shallowRef, watch, type Component } from 'vue';
import type { ExperimentId } from '../../data/labs';
import LabPreview from './LabPreview.vue';
const props = defineProps<{ id: ExperimentId; compact?: boolean; title?: string }>();
const loaders: Partial<Record<ExperimentId, () => Promise<{ default: Component }>>> = {
  'code-morph': () => import('../labs/CodeMorph.vue'),
  rendering: () => import('../labs/RenderingPipeline.vue'),
  'project-layout': () => import('./ProjectsExplorer.vue'),
  'page-transition': () => import('../labs/PageTransition.vue'),
  particles: () => import('../labs/GpuExperiment.vue'),
  spectral: () => import('../labs/GpuExperiment.vue'),
  'knowledge-graph': () => import('../labs/KnowledgeMap.vue'),
  layers: () => import('../labs/SourceLayers.vue'),
  execution: () => import('../labs/ExecutionTrace.vue'),
  timeline: () => import('../labs/TimelineExperiment.vue'),
};
const component = shallowRef<Component>();
const status = ref('');
const loading = ref(false);
let generation = 0;
function stop() { generation++; component.value = undefined; loading.value = false; status.value = ''; }
async function start() {
  const load = loaders[props.id];
  if (!load) return;
  const ticket = ++generation;
  loading.value = true;
  status.value = '正在加载实验…';
  try {
    const module = await load();
    if (ticket !== generation) return;
    component.value = markRaw(module.default);
    status.value = '';
  } catch { if (ticket === generation) status.value = '实验加载失败，请重试。静态说明和导航仍可使用。'; }
  finally { if (ticket === generation) loading.value = false; }
}
watch(() => props.id, stop);
onBeforeUnmount(stop);
</script>

<template>
  <div class="experiment-host">
    <template v-if="!component">
      <div v-if="!compact" class="experiment-preview" :data-shared-preview="id"><LabPreview :id="id" /></div>
      <div v-if="loaders[id]" class="lab-controls"><button class="button button--primary" :disabled="loading" @click="start">{{ loading ? '正在加载…' : status ? '重试实验' : compact ? `展开实验：${title}` : '运行实验' }}</button><span>点击后加载，关闭后释放。</span><button v-if="loading" class="button button--secondary" @click="stop">取消</button></div>
    </template>
    <template v-else><component :is="component" v-bind="id === 'particles' || id === 'spectral' ? { kind: id } : {}" /><div class="lab-controls"><button class="button button--secondary" @click="stop">{{ compact ? '收起实验' : '关闭实验' }}</button></div></template>
    <p v-if="status" class="lab-status" role="status">{{ status }}</p>
  </div>
</template>

<style scoped>
.experiment-preview{height:clamp(220px,35vw,380px)}
.lab-controls>span{font-size:13px;color:var(--site-text-muted)}
.experiment-host :deep(.projects-explorer){padding:1rem}
</style>
