<script setup lang="ts">
import { ArrowUpRight, Check, Copy, Download, MessageCircle, Plus, Send, Settings2, Sparkles, Square, Trash2, X } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { withBase } from 'vitepress';
import { data as content } from '../../data/content.data';
import { buildKnowledgeReply, normalizeModelEndpoint, readCompletionStream, restoreConversations, type ChatMessage, type Conversation } from '../composables/chat';

const historyKey = 'abin-conversations-v1';
const conversations = ref<Conversation[]>([]);
const activeId = ref('');
const current = computed(() => conversations.value.find((session) => session.id === activeId.value));
const messages = computed(() => current.value?.messages ?? []);
const mode = ref<'knowledge' | 'model'>('knowledge');
const input = ref('');
const pending = ref(false);
const notice = ref('');
const storageNotice = ref('');
const copied = ref('');
const dialog = ref<HTMLDialogElement>();
const thread = ref<HTMLElement>();
const textarea = ref<HTMLTextAreaElement>();
const endpoint = ref('http://localhost:11434/v1');
const model = ref('');
const apiKey = ref('');
const documents = [...content.blogArticles, ...content.columns.flatMap((column) => column.articles)];
const suggestions = ['CSS 布局怎么学习？', '如何组织鸿蒙页面架构？', '本地优先的智能体有哪些边界？', '静态博客如何部署？'];
let controller: AbortController | undefined;
let timeout: ReturnType<typeof setTimeout> | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let copyTimer: ReturnType<typeof setTimeout> | undefined;
let alive = true;
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

function persist(): void {
  try { localStorage.setItem(historyKey, JSON.stringify(conversations.value)); }
  catch { storageNotice.value = '浏览器无法保存会话，刷新后记录可能丢失。可以导出当前会话。'; }
}
function createSession(): Conversation {
  const session: Conversation = { id: uid(), title: '新会话', mode: mode.value, updatedAt: Date.now(), messages: [] };
  conversations.value.unshift(session);
  conversations.value = conversations.value.slice(0, 30);
  activeId.value = session.id;
  return current.value!;
}
function newConversation(): void {
  if (pending.value) return;
  activeId.value = '';
  input.value = '';
  notice.value = '';
  void nextTick(() => textarea.value?.focus());
}
function selectSession(session: Conversation): void {
  if (pending.value) return;
  activeId.value = session.id;
  mode.value = session.mode;
  notice.value = '';
  scrollToLatest(true);
}
function changeMode(value: 'knowledge' | 'model'): void {
  if (pending.value || value === mode.value) return;
  mode.value = value;
  newConversation();
}
function deleteSession(id: string): void {
  if (pending.value) return;
  conversations.value = conversations.value.filter((session) => session.id !== id);
  if (activeId.value === id) newConversation();
  persist();
}
function scrollToLatest(force = false): void {
  const nearBottom = !thread.value || thread.value.scrollHeight - thread.value.scrollTop - thread.value.clientHeight < 160;
  if (force || nearBottom) void nextTick(() => {
    if (thread.value) thread.value.scrollTop = thread.value.scrollHeight;
  });
}
function stop(): void { controller?.abort(); }
function openSettings(): void { dialog.value?.showModal(); }
function saveSettings(): void {
  try {
    normalizeModelEndpoint(endpoint.value);
    if (!model.value.trim()) throw new Error('请填写服务中已安装或可用的模型名称。');
    notice.value = '';
    dialog.value?.close();
  } catch (error) { notice.value = (error as Error).message; }
}
async function send(question = input.value, retry = false): Promise<void> {
  if (pending.value || !question.trim()) return;
  if (question.trim().length > 4000) { notice.value = '问题请控制在 4000 字以内。'; return; }
  if (mode.value === 'model') {
    try {
      normalizeModelEndpoint(endpoint.value);
      if (!model.value.trim()) throw new Error('请先填写模型名称。');
    } catch (error) { notice.value = (error as Error).message; openSettings(); return; }
  }
  const session = current.value ?? createSession();
  if (session.messages.length >= 100 && !retry) { notice.value = '当前会话已达 100 条消息，请开启新会话。'; return; }
  if (retry) session.messages.pop();
  else session.messages.push({ id: uid(), role: 'user', content: question.trim(), status: 'complete' });
  session.title = session.messages.find((message) => message.role === 'user')!.content.slice(0, 28);
  session.updatedAt = Date.now();
  input.value = '';
  notice.value = '';
  pending.value = true;
  session.messages.push({ id: uid(), role: 'assistant', content: '', status: 'streaming' });
  const answer = session.messages[session.messages.length - 1];
  persist();
  scrollToLatest(true);
  let timedOut = false;
  let generated = false;
  try {
    if (mode.value === 'knowledge') {
      const result = buildKnowledgeReply(question, documents);
      answer.content = result.text;
      answer.sources = result.sources;
    } else {
      controller = new AbortController();
      const resetTimeout = () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => { timedOut = true; controller?.abort(); }, 60_000);
      };
      resetTimeout();
      const response = await fetch(normalizeModelEndpoint(endpoint.value), {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(apiKey.value.trim() ? { Authorization: `Bearer ${apiKey.value.trim()}` } : {}) },
        body: JSON.stringify({
          model: model.value.trim(), stream: true,
          messages: [
            { role: 'system', content: '请用标准中文回答。你是阿斌实验室的技术助手。区分事实和建议，不编造本站文章、链接或项目。' },
            ...session.messages.slice(0, -1).filter((message) => message.status === 'complete').slice(-20)
              .map((message) => ({ role: message.role, content: message.content })),
          ],
        }),
      });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403
        ? '模型服务拒绝访问，请检查访问密钥和权限。'
        : response.status === 429 ? '模型请求过于频繁或额度不足，请稍后重试。' : `模型服务暂不可用（${response.status}），请稍后重试。`);
      if (!response.body) throw new Error('模型服务没有返回可读取的响应。');
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        await readCompletionStream(response.body, (chunk) => {
          resetTimeout();
          answer.content += chunk;
          generated = true;
          scrollToLatest();
          clearTimeout(saveTimer);
          saveTimer = setTimeout(persist, 500);
        });
      } else {
        const result = await response.json();
        const text = result.choices?.[0]?.message?.content;
        if (typeof text !== 'string' || !text.trim()) throw new Error('模型服务返回了空回答或不兼容的响应。');
        answer.content = text;
      }
      if (!answer.content.trim()) throw new Error('模型未返回文本回答，请尝试其他模型。');
    }
    answer.status = 'complete';
  } catch (error) {
    if (controller?.signal.aborted && !timedOut) {
      answer.status = 'stopped';
      if (!generated) answer.content = '已停止生成。';
    } else {
      answer.status = 'error';
      notice.value = timedOut ? '模型响应超时，可以重试。' : error instanceof TypeError
        ? '无法连接模型服务，请检查地址、网络和浏览器跨域权限。'
        : (error as Error).message;
      if (!answer.content) answer.content = '这次回答未能完成，请检查连接后重试。';
    }
  } finally {
    clearTimeout(timeout);
    clearTimeout(saveTimer);
    controller = undefined;
    pending.value = false;
    if (alive) { persist(); scrollToLatest(); void nextTick(() => textarea.value?.focus()); }
  }
}
function retryLast(): void {
  const question = [...messages.value].reverse().find((message) => message.role === 'user');
  if (question) void send(question.content, true);
}
async function copy(message: ChatMessage): Promise<void> {
  try {
    await navigator.clipboard.writeText(message.content);
    copied.value = message.id;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copied.value = ''; }, 1800);
  } catch { notice.value = '复制失败，请选中回答文字手动复制。'; }
}
function exportConversation(): void {
  if (!current.value) return;
  const text = messages.value.map((message) => `## ${message.role === 'user' ? '我' : '助手'}\n\n${message.content}`).join('\n\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = '智能问答记录.md'; link.click();
  URL.revokeObjectURL(url);
}
function handleEnter(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void send(); }
}
onMounted(() => {
  try { conversations.value = restoreConversations(localStorage.getItem(historyKey)); }
  catch { storageNotice.value = '浏览器存储不可用，当前会话仍可正常使用。'; }
  window.addEventListener('pagehide', persist);
});
onBeforeUnmount(() => {
  alive = false;
  controller?.abort();
  clearTimeout(timeout); clearTimeout(saveTimer); clearTimeout(copyTimer);
  persist();
  window.removeEventListener('pagehide', persist);
});
</script>

<template>
  <main class="site-container listing-page__main chat-page">
    <header class="listing-header">
      <div><p class="technical-label">让知识继续生长</p><h1>智能问答</h1><p>找到相关资料，或与你选择的模型深入讨论。</p></div>
      <button class="button button--secondary" @click="openSettings"><Settings2 :size="17" aria-hidden="true" /> 模型设置</button>
    </header>
    <div class="chat-workspace">
      <aside class="chat-sidebar" aria-label="会话历史">
        <button class="button button--primary chat-new" :disabled="pending" @click="newConversation"><Plus :size="17" aria-hidden="true" /> 新会话</button>
        <h2>最近会话</h2>
        <p v-if="!conversations.length" class="chat-sidebar__empty">第一段对话，从一个问题开始。</p>
        <ul>
          <li v-for="session in conversations" :key="session.id" :class="{ 'chat-session--active': session.id === activeId }">
            <button :disabled="pending" class="chat-session" :aria-current="session.id === activeId ? 'true' : undefined" @click="selectSession(session)"><MessageCircle :size="15" aria-hidden="true" /><span>{{ session.title }}</span></button>
            <button :disabled="pending" class="icon-button" :aria-label="`删除会话：${session.title}`" @click="deleteSession(session.id)"><Trash2 :size="14" aria-hidden="true" /></button>
          </li>
        </ul>
        <p class="chat-sidebar__note">记录只保存在当前浏览器。访问密钥不会写入本地存储。</p>
      </aside>
      <section class="chat-panel" aria-label="对话">
        <header class="chat-panel__header">
          <div class="chat-mode" role="group" aria-label="对话模式">
            <button :class="{ active: mode === 'knowledge' }" :aria-pressed="mode === 'knowledge'" :disabled="pending" @click="changeMode('knowledge')">站内检索</button>
            <button :class="{ active: mode === 'model' }" :aria-pressed="mode === 'model'" :disabled="pending" @click="changeMode('model')">模型对话</button>
          </div>
          <button class="icon-button" :disabled="!messages.length || pending" aria-label="导出会话" @click="exportConversation"><Download :size="17" aria-hidden="true" /></button>
        </header>
        <div ref="thread" class="chat-thread" role="log" aria-label="对话记录" aria-live="polite" aria-relevant="additions">
          <div v-if="!messages.length" class="chat-welcome">
            <span class="chat-welcome__mark"><Sparkles :size="32" aria-hidden="true" /></span>
            <h2>今天想探索什么？</h2>
            <p>{{ mode === 'knowledge' ? '从本站的博客与专题教程中寻找线索。' : '连接模型后，即可开始多轮技术对话。' }}</p>
            <div class="chat-suggestions"><button v-for="question in suggestions" :key="question" @click="send(question)">{{ question }}<ArrowUpRight :size="15" aria-hidden="true" /></button></div>
          </div>
          <article v-for="(message, index) in messages" :key="message.id" class="chat-message" :class="`chat-message--${message.role}`">
            <header><span>{{ message.role === 'user' ? '我' : mode === 'knowledge' ? '站内资料助手' : '模型助手' }}</span><small v-if="message.status === 'stopped'">已停止</small><small v-if="message.status === 'error'">未完成</small></header>
            <p v-if="message.content" class="chat-message__text">{{ message.content }}</p>
            <span v-if="message.status === 'streaming'" class="loading-dots" aria-label="正在生成"><i /><i /><i /></span>
            <nav v-if="message.sources?.length" class="chat-sources" aria-label="参考资料"><a v-for="source in message.sources" :key="source.href" :href="withBase(source.href)">{{ source.title }}</a></nav>
            <footer v-if="message.role === 'assistant' && message.status !== 'streaming'">
              <button class="chat-text-button" @click="copy(message)"><Check v-if="copied === message.id" :size="14" aria-hidden="true" /><Copy v-else :size="14" aria-hidden="true" />{{ copied === message.id ? '已复制' : '复制回答' }}</button>
              <button v-if="index === messages.length - 1 && ['error', 'stopped'].includes(message.status)" class="chat-text-button" :disabled="pending" @click="retryLast">重新生成</button>
            </footer>
          </article>
        </div>
        <p v-if="notice" class="chat-notice" role="alert">{{ notice }}</p>
        <p v-if="storageNotice" class="chat-notice" role="status">{{ storageNotice }}</p>
        <form class="chat-composer" @submit.prevent="send()">
          <label class="sr-only" for="chat-input">输入问题</label>
          <textarea id="chat-input" ref="textarea" v-model="input" :disabled="pending" rows="2" maxlength="4000" placeholder="输入你的问题，开启一段讨论…" @keydown="handleEnter" />
          <button v-if="pending" type="button" class="chat-send" aria-label="停止生成" @click="stop"><Square :size="18" aria-hidden="true" /></button>
          <button v-else type="submit" class="chat-send" :disabled="!input.trim()" aria-label="发送问题"><Send :size="19" aria-hidden="true" /></button>
          <p>{{ mode === 'knowledge' ? '站内检索无需连接模型。' : '问题将发送至你配置的模型服务。' }} 回车发送，换行请按 Shift + 回车。</p>
        </form>
      </section>
    </div>
    <dialog ref="dialog" class="model-dialog">
      <form @submit.prevent="saveSettings">
        <header><h2>模型连接设置</h2><button type="button" class="icon-button" aria-label="关闭模型设置" @click="dialog?.close()"><X :size="20" aria-hidden="true" /></button></header>
        <p>支持 OpenAI 兼容接口与本机 Ollama。远程服务需允许浏览器跨域访问；密钥仅在本次页面会话中使用。</p>
        <label>服务地址<input v-model="endpoint" type="url" required placeholder="http://localhost:11434/v1" /></label>
        <label>模型名称<input v-model="model" required placeholder="填写服务中可用的模型名称" autocomplete="off" /></label>
        <label>访问密钥（本机服务可留空）<input v-model="apiKey" type="password" autocomplete="off" placeholder="仅用于你选择的服务" /></label>
        <p v-if="notice" class="chat-notice" role="alert">{{ notice }}</p>
        <footer><button type="button" class="button button--secondary" @click="dialog?.close()">取消</button><button type="submit" class="button button--primary">保存设置</button></footer>
      </form>
    </dialog>
  </main>
</template>
