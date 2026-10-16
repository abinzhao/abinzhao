<script setup lang="ts">
import { Sparkles } from '@lucide/vue';
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useData } from 'vitepress';
import { ASSISTANT_MODELS, type AssistantModelId } from '../assistant/model-config';
import { useAssistantRuntime } from '../assistant/runtime-context';
import { clearModelCache, inspectModelCache, selectedModelLocation, type ModelCacheReport } from '../assistant/model-cache';
import { prepareOfflineSite } from '../assistant/offline-client';

const runtime = useAssistantRuntime();
const { site } = useData();
const state = shallowRef(runtime.snapshot);
const unsubscribe = runtime.subscribe((snapshot) => { state.value = snapshot; });
const selected = ref<AssistantModelId>(state.value.modelId ?? ASSISTANT_MODELS[0].id);
const dialog = ref<HTMLDialogElement>();
const trigger = ref<HTMLButtonElement>();
const notice = ref('');
const cacheBusy = ref(false);
const cacheReport = ref<ModelCacheReport>();
const storageInfo = ref('');
const offlineNotice = ref('');
watch(selected, () => { cacheReport.value = undefined; notice.value = ''; });
const status = computed(() => {
  if (state.value.modelState === 'checking') return '正在检测 GPU…';
  if (state.value.modelState === 'loading') return '正在下载与初始化本地模型…';
  if (state.value.modelState === 'unloading') return '正在释放模型…';
  if (state.value.modelState === 'ready') return '本地模型已就绪';
  if (state.value.modelState === 'unsupported') return state.value.capabilities?.reason;
  if (state.value.modelState === 'error') return state.value.error;
  return '尚未加载模型，可直接使用本地资料检索。';
});
async function load(): Promise<void> {
  notice.value = '';
  try {
    await runtime.initialize(selected.value);
    if (runtime.snapshot.modelState === 'ready') await checkCache();
  }
  catch (error) { if ((error as Error).name !== 'AbortError') notice.value = '加载失败。可重新加载，或继续使用本地检索。'; }
}
async function unload(): Promise<void> {
  try { await runtime.unload(); }
  catch { notice.value = '释放未完成，请关闭页面后重试。会话记录会保留。'; }
}
async function checkCache(): Promise<void> {
  cacheBusy.value = true;
  notice.value = '';
  try {
    cacheReport.value = await inspectModelCache(await selectedModelLocation(selected.value), window.caches);
    const estimate = await navigator.storage?.estimate();
    storageInfo.value = estimate?.quota ? `当前同源已用约 ${Math.round((estimate.usage ?? 0) / 1024 / 1024)} MB，配额约 ${Math.round(estimate.quota / 1024 / 1024)} MB。` : '浏览器未提供存储估算。';
  } catch { notice.value = '缓存核查失败，无法确认离线模型是否完整。'; }
  finally { cacheBusy.value = false; }
}
async function clearCache(): Promise<void> {
  cacheBusy.value = true;
  notice.value = '';
  try {
    if (state.value.modelState === 'ready' && state.value.modelId === selected.value) await runtime.unload();
    await clearModelCache(await selectedModelLocation(selected.value), window.caches);
    cacheReport.value = undefined;
    notice.value = '所选模型缓存已清除。会话记录和站点离线资产保留。';
  } catch { notice.value = '缓存清理未完成，请重新核查后重试。'; }
  finally { cacheBusy.value = false; }
}
async function prepareOffline(): Promise<void> {
  cacheBusy.value = true;
  offlineNotice.value = '正在下载与核查站点离线资产…';
  try {
    const report = await prepareOfflineSite(site.value.base);
    offlineNotice.value = report.complete ? (report.waiting ? '新版本已缓存。关闭此站点的所有标签页后重新打开以启用。' : '站点离线资产已完整缓存。离线生成还需完整模型缓存和可用 GPU。') : '站点缓存不完整，请保持联网后重试。';
  } catch (error) { offlineNotice.value = error instanceof Error ? error.message : '离线准备失败，请重试。'; }
  finally { cacheBusy.value = false; }
}
async function persist(): Promise<void> {
  cacheBusy.value = true;
  try { notice.value = await navigator.storage?.persist?.() ? '浏览器已允许持久存储，仍建议导出重要会话。' : '浏览器未允许持久存储；仍可使用缓存，但可能被回收。'; }
  catch { notice.value = '当前浏览器无法申请持久存储。'; }
  finally { cacheBusy.value = false; }
}
onBeforeUnmount(unsubscribe);
</script>

<template>
  <button ref="trigger" class="icon-button" type="button" aria-label="配置本地模型" @click="dialog?.showModal()">
    <Sparkles :size="18" aria-hidden="true" />
  </button>
  <dialog ref="dialog" class="model-setup" aria-labelledby="model-setup-title" @close="trigger?.focus()" @click="(event) => { if (event.target === dialog) dialog?.close(); }">
    <header>
      <h2 id="model-setup-title">本地模型</h2>
      <button class="icon-button" type="button" aria-label="关闭模型配置" @click="dialog?.close()">×</button>
    </header>
    <p>模型在当前浏览器推理。首次加载会下载公开模型文件；问题、文章上下文和历史不上传。</p>
    <p>当前模型仍可能遗漏引用或解释错误。加载后需主动开启“实验生成”；默认继续使用本地检索。</p>
    <fieldset :disabled="state.busy || cacheBusy">
      <legend>选择模型</legend>
      <label v-for="model in ASSISTANT_MODELS" :key="model.id">
        <input v-model="selected" type="radio" name="assistant-model" :value="model.id" />
        <span><strong>{{ model.label }}</strong><small>{{ model.description }} · 预计显存 {{ model.estimatedVramMB }} MB</small></span>
      </label>
    </fieldset>
    <p class="model-setup__status" role="status">{{ status }}</p>
    <template v-if="state.modelState === 'loading' && state.progress">
      <p>初始化阶段进度（不是下载字节百分比）</p>
      <progress :value="state.progress.progress" max="1" aria-label="模型初始化进度" />
      <p>已用 {{ Math.round(state.progress.timeElapsed) }} 秒</p>
    </template>
    <p v-if="notice" role="alert">{{ notice }}</p>
    <div class="model-setup__actions">
      <button v-if="state.modelState === 'loading' || state.modelState === 'checking'" class="button" type="button" @click="runtime.cancelInitialization()">取消加载</button>
      <template v-else>
        <button class="button button--primary" type="button" :disabled="state.busy || cacheBusy || (state.modelState === 'ready' && selected === state.modelId)" @click="load">下载并加载模型</button>
        <button v-if="state.modelState === 'ready'" class="button" type="button" :disabled="state.busy || cacheBusy" @click="unload">释放模型</button>
      </template>
    </div>
    <h3>离线与存储</h3>
    <div class="model-setup__actions">
      <button class="button" type="button" :disabled="state.busy || cacheBusy" @click="checkCache">核查模型缓存</button>
      <button class="button" type="button" :disabled="state.busy || cacheBusy" @click="prepareOffline">准备站点离线</button>
      <button class="button" type="button" :disabled="state.busy || cacheBusy" @click="persist">申请持久存储</button>
      <button class="button" type="button" :disabled="state.busy || cacheBusy" @click="clearCache">清除此模型缓存</button>
    </div>
    <p v-if="cacheReport" role="status">{{ cacheReport.complete ? '配置、tokenizer、WASM 和全部权重分片已缓存。' : `模型缓存不完整：缺失或无效 ${cacheReport.missing.length} 项。联网重新加载模型，或使用本地检索。` }}</p>
    <p v-if="offlineNotice" role="status">{{ offlineNotice }}</p>
    <p v-if="storageInfo">{{ storageInfo }}</p>
    <p>缓存完整后仍需实际加载模型验证。存储估算与持久存储申请均不保证永久保留。</p>
    <p>缓存可能被浏览器回收；显存估算不代表下载大小或运行保证。选择 0.5B 会降低回答质量。</p>
  </dialog>
</template>
