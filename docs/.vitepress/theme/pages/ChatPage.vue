<script setup lang="ts">
import {
  Download,
  History,
  Menu,
  Plus,
  Sparkles,
} from '@lucide/vue';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import { data as content } from '../../data/content.data';
import AssistantComposer from '../components/AssistantComposer.vue';
import AssistantMessage from '../components/AssistantMessage.vue';
import AssistantStatus from '../components/AssistantStatus.vue';
import ChatQuickActions from '../components/ChatQuickActions.vue';
import ChatSessionList from '../components/ChatSessionList.vue';
import ModelSetup from '../components/ModelSetup.vue';
import {
  createConversation,
  exportConversationMarkdown,
  type ChatMessage,
  type Conversation,
} from '../composables/chat';
import { createAssistantStorage, type ConversationEnvelopeV3 } from '../assistant/storage';
import { useAssistant } from '../composables/use-assistant';
import {
  resolveArticleChatContext,
  type ArticleChatAction,
} from '../composables/article-context';
import {
  answerQuestion,
  classifyIntent,
  createStudyTask,
  extractEntities,
  selectRandomTopic,
  type ChatContext,
  type KnowledgeScope,
  type QuickAction,
} from '../composables/local-assistant';
import { createBrowserKnowledgeSearch } from '../assistant/knowledge-client';

const allArticles = [
  ...content.blogArticles,
  ...content.columns.flatMap((column) => column.articles),
];
const publishedArticleHrefs = new Set(allArticles.map((article) => article.href));
const articleTitles = new Map(allArticles.map((article) => [article.href, article.title]));
const searchRuntime = createBrowserKnowledgeSearch();
const storage = createAssistantStorage(publishedArticleHrefs);
const assistant = useAssistant();

const conversations = ref<Conversation[]>([]);
const activeId = ref<string | null>(null);
const migrationCompletedAt = ref(Date.now());
const input = ref('');
const pending = ref(false);
const notice = ref('');
const storageNotice = ref('');
const copied = ref('');
const selectedAction = ref<QuickAction>('lookup');
const actionOverride = ref<QuickAction>();
const selectedScope = ref<KnowledgeScope>('site');
const modelEnabled = ref(false);
const currentArticleId = ref<string>();
const indexStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const thread = ref<HTMLElement>();
const composer = ref<InstanceType<typeof AssistantComposer>>();
const showLatest = ref(false);
const historyDialog = ref<HTMLDialogElement>();
const historyTrigger = ref<HTMLButtonElement>();
let copyTimer: ReturnType<typeof setTimeout> | undefined;
let alive = true;
let requestSerial = 0;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let storageReady = false;
function updateViewport(): void {
  const viewport = window.visualViewport;
  // 缩放时保留阅读比例；仅处理键盘引起的可视区域变化。
  if (viewport && viewport.scale === 1) {
    document.documentElement.style.setProperty('--assistant-viewport-height', `${viewport.height}px`);
  }
}

const current = computed(() =>
  conversations.value.find((session) => session.id === activeId.value),
);
const messages = computed(() => current.value?.messages ?? []);
const hasArticleScope = computed(() => Boolean(currentArticleId.value));
const currentArticleTitle = computed(() =>
  currentArticleId.value ? articleTitles.get(currentArticleId.value) : undefined,
);

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function createEnvelope(): ConversationEnvelopeV3 {
  return {
    activeConversationId: activeId.value,
    conversations: conversations.value.slice(0, 30),
    migrationCompletedAt: migrationCompletedAt.value,
    draft: input.value,
    version: 3,
  };
}

function persist(): void {
  clearTimeout(saveTimer);
  if (!storageReady) return;
  void storage.save(createEnvelope()).then((result) => {
    if (alive) storageNotice.value = result.warning ?? '';
  });
}
function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 350);
}
watch(input, scheduleSave);

function createSession(): Conversation {
  const session = createConversation(
    uid(),
    Date.now(),
    selectedScope.value,
    currentArticleId.value,
  );
  conversations.value.unshift(session);
  conversations.value = conversations.value.slice(0, 30);
  activeId.value = session.id;
  return conversations.value[0];
}

function newConversation(): void {
  if (pending.value) return;
  activeId.value = null;
  input.value = '';
  notice.value = '';
  closeHistory();
  persist();
  void nextTick(() => composer.value?.focus());
}

function selectSession(session: Conversation): void {
  if (pending.value) return;
  activeId.value = session.id;
  selectedScope.value = session.scope;
  currentArticleId.value = session.articleId;
  notice.value = '';
  closeHistory();
  persist();
  scrollToLatest(true);
}

function deleteSession(session: Conversation): void {
  if (pending.value || !window.confirm(`确定删除会话“${session.title}”吗？`)) return;
  conversations.value = conversations.value.filter(({ id }) => id !== session.id);
  if (activeId.value === session.id) activeId.value = null;
  persist();
}

function updateScope(scope: KnowledgeScope): void {
  if (pending.value) return;
  selectedScope.value = scope;
  if (current.value) {
    current.value.scope = scope;
    current.value.articleId = scope === 'article' ? currentArticleId.value : undefined;
    current.value.context = { entities: [], intent: 'lookup', scope, sourceIds: [] };
    current.value.updatedAt = Date.now();
    persist();
  }
}

function scrollToLatest(force = false): void {
  const element = thread.value;
  const nearBottom =
    !element ||
    element.scrollHeight - element.scrollTop - element.clientHeight < 160;
  if (force || nearBottom) {
    void nextTick(() => {
      if (thread.value) thread.value.scrollTop = thread.value.scrollHeight;
      showLatest.value = false;
    });
  } else showLatest.value = true;
}

function deriveLegacyContext(session: Conversation): ChatContext | undefined {
  if (session.context) return session.context;
  const lastQuestion = [...session.messages]
    .reverse()
    .find((message) => message.role === 'user');
  if (!lastQuestion) return undefined;

  return {
    entities: extractEntities(lastQuestion.content),
    intent: classifyIntent(lastQuestion.content),
    scope: session.scope,
    sourceIds: [],
  };
}

function assistantMessageContent(reply: Awaited<ReturnType<typeof answerQuestion>>): string {
  if (reply.confidence.level === 'insufficient') {
    return reply.blocks[0]?.heading ?? '本站暂时没有足够资料回答这个问题。';
  }
  if (reply.clarification?.length) {
    return reply.blocks[0]?.heading ?? '你更想了解哪一部分？';
  }
  return '已根据站内已发布内容整理回答。';
}

async function send(
  question = input.value,
  action: QuickAction | undefined = actionOverride.value,
): Promise<void> {
  const trimmedQuestion = question.trim();
  if (pending.value || !trimmedQuestion) return;
  if (trimmedQuestion.length > 4000) {
    notice.value = '问题请控制在 4000 字以内。';
    return;
  }
  if (!current.value && conversations.value.length >= 30) {
    notice.value = '已达 30 个会话，请导出并整理历史后新建会话。';
    return;
  }

  const session = current.value ?? createSession();
  if (session.messages.length > 98) {
    notice.value = '当前会话已达 100 条消息，请开启新会话。';
    return;
  }

  const previousContext = deriveLegacyContext(session);
  const history = session.messages.filter((message) => message.status === 'complete').map((message) => ({
    role: message.role, content: message.content,
  }));
  const requestId = ++requestSerial;
  const snapshot = Object.freeze({
    requestId: String(requestId),
    conversationId: session.id,
    question: trimmedQuestion,
    articleId: selectedScope.value === 'article' ? currentArticleId.value : undefined,
    scope: selectedScope.value,
  });
  session.scope = selectedScope.value;
  session.articleId =
    selectedScope.value === 'article' ? currentArticleId.value : undefined;
  session.messages.push({
    content: trimmedQuestion,
    createdAt: Date.now(),
    id: uid(),
    role: 'user',
    status: 'complete',
  });
  if (session.title === '新会话') session.title = trimmedQuestion.slice(0, 28);
  session.updatedAt = Date.now();
  session.messages.push({ id: uid(), role: 'assistant', content: '', status: 'streaming', createdAt: Date.now() });
  const output = session.messages[session.messages.length - 1];
  input.value = '';
  notice.value = '';
  pending.value = true;
  persist();
  scrollToLatest(true);

  try {
    const result = await assistant.run({
      action,
      request: snapshot,
      modelEnabled: modelEnabled.value,
      history,
      context: previousContext,
      search: searchRuntime.search,
      onEvidence: (prompt) => {
        output.provenance = 'webllm';
        output.citations = prompt.citations;
      },
      onDelta: (delta) => {
        if (!alive || requestId !== requestSerial) return;
        output.content += delta;
        scheduleSave();
        scrollToLatest();
      },
    });
    if (!alive || requestId !== requestSerial || activeId.value !== snapshot.conversationId) return;
    const { reply } = result;
    if (result.provenance === 'webllm') {
      Object.assign(output, {
        content: result.text, status: result.stopped ? 'stopped' : 'complete',
        provenance: result.provenance, citations: result.citations, versions: result.versions,
        citationWarning: result.citationAudit.invalid.length
          ? `回答包含未提供的引用：${result.citationAudit.invalid.join('、')}，请核对原文。`
          : !result.citationAudit.valid.length ? '回答未引用本轮资料，请核对来源后使用。' : '模型回答可能有误，请结合来源核对。',
      });
      if (result.truncated) notice.value = '问题超出本地上下文预算，本轮只使用了问题开头，请缩短后重试。';
    } else {
      Object.assign(output, { content: assistantMessageContent(reply), reply, provenance: 'retrieval', status: 'complete' });
    }
    if (reply.confidence.level !== 'insufficient' && !reply.clarification) {
      session.context = reply.nextContext;
    }
    session.updatedAt = Date.now();
  } catch (error) {
    if (!alive || requestId !== requestSerial) return;
    output.status = (error as Error).name === 'AbortError' ? 'stopped' : 'error';
    if (output.status === 'error') {
      if (!output.content) output.content = '本地回答未完成，请重试。';
      if (searchRuntime.loadState === 'error') indexStatus.value = 'error';
      notice.value = error instanceof Error ? error.message : '本地回答未完成，请重试。';
    }
  } finally {
    if (alive && requestId === requestSerial) {
      pending.value = false;
      actionOverride.value = undefined;
      selectedAction.value = 'lookup';
      persist();
      scrollToLatest();
      void nextTick(() => composer.value?.focus());
    }
  }
}

function selectAction(action: QuickAction): void {
  if (pending.value) return;
  selectedAction.value = action;
  actionOverride.value = action;
}

async function runSpecial(action: 'random-topic' | 'study-task'): Promise<void> {
  if (pending.value) return;
  pending.value = true;
  try {
    const response = await searchRuntime.search(
      input.value.trim() || 'CSS HTML JavaScript TypeScript React 浏览器 工程化',
      { limit: 40, scope: selectedScope.value, documentId: selectedScope.value === 'article' ? currentArticleId.value : undefined },
    );
    if (!alive) return;
    if (action === 'random-topic') {
      const topic = selectRandomTopic(response.results);
      pending.value = false;
      if (topic) await send(`请介绍 ${topic}`, 'explain');
      return;
    }

    const task = createStudyTask(response.results, 15);
    const topics = task.map((step) => step.title).join('、');
    pending.value = false;
    await send(
      topics ? `请按顺序给我一个 15 分钟学习任务：${topics}` : '给我一个 15 分钟学习任务',
      'learning-path',
    );
  } catch {
    pending.value = false;
    notice.value = '本地知识库暂时无法生成探索任务，请重试。';
  }
}

async function copyMessage(message: ChatMessage): Promise<void> {
  const text = exportConversationMarkdown({ ...current.value!, messages: [message] });
  try {
    await navigator.clipboard.writeText(text);
    copied.value = message.id;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copied.value = '';
    }, 1800);
  } catch {
    notice.value = '复制失败，请选中回答文字手动复制。';
  }
}

function exportConversation(): void {
  if (!current.value) return;
  const markdown = exportConversationMarkdown(current.value);
  const url = URL.createObjectURL(
    new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'AI助手会话.md';
  link.click();
  URL.revokeObjectURL(url);
}

function clarify(option: string): void {
  if (pending.value) return;
  if (option === '切换到当前文章范围' && currentArticleId.value) updateScope('article');
  else if (current.value?.context?.entities.includes(option)) input.value = `解释 ${option}`;
  else {
    input.value = '';
    notice.value = option === '从文章页进入问答' ? '打开需要阅读的文章，选择“总结本文”进入当前文章范围。' : option;
  }
  void nextTick(() => composer.value?.focus());
}

function openHistory(): void {
  historyDialog.value?.showModal();
}

function closeHistory(): void {
  historyDialog.value?.close();
}

function closeHistoryFromBackdrop(event: MouseEvent): void {
  if (event.target === historyDialog.value) closeHistory();
}

function restoreHistoryFocus(): void {
  historyTrigger.value?.focus();
}

function retryKnowledge(): void {
  persist();
  // 原生ESM会缓存失败的模块；新文档才能可靠重新请求失败的静态资源。
  window.location.reload();
}

function applyArticleAction(action: ArticleChatAction): void {
  if (action === 'ask') {
    void nextTick(() => {
      // 异步知识加载完成时，保留用户已经选择的控件或弹层焦点。
      const active = document.activeElement;
      if (!historyDialog.value?.open && (active === document.body || active?.id === 'page-content')) composer.value?.focus();
    });
    return;
  }

  const actionMap: Record<Exclude<ArticleChatAction, 'ask'>, {
    prompt: string;
    quickAction: QuickAction;
  }> = {
    'key-points': { prompt: '提炼本文要点', quickAction: 'summarize' },
    'learning-path': { prompt: '给出本文后续学习路线', quickAction: 'learning-path' },
    summary: { prompt: '总结这篇文章', quickAction: 'summarize' },
  };
  const selected = actionMap[action];
  selectedAction.value = selected.quickAction;
  void send(selected.prompt, selected.quickAction);
}

onMounted(async () => {
  updateViewport();
  window.visualViewport?.addEventListener('resize', updateViewport);
  const restored = await storage.load();
  if (!alive) return;
  conversations.value = restored.envelope.conversations;
  activeId.value = restored.envelope.activeConversationId;
  migrationCompletedAt.value = restored.envelope.migrationCompletedAt;
  input.value = restored.envelope.draft;
  storageReady = true;
  storageNotice.value = restored.warning ?? '';
  if (current.value) {
    selectedScope.value = current.value.scope;
    currentArticleId.value = current.value.articleId;
  }

  const articleContext = resolveArticleChatContext(
    window.location.search,
    publishedArticleHrefs,
  );
  if (!articleContext.valid) {
    activeId.value = null;
    selectedScope.value = 'site';
    currentArticleId.value = undefined;
    notice.value = '限定来源已失效，已切换到全站范围。';
  } else if (articleContext.articleId) {
    activeId.value = null;
    selectedScope.value = 'article';
    currentArticleId.value = articleContext.articleId;
  }

  indexStatus.value = 'loading';
  try {
    await searchRuntime.prepare();
    if (!alive) return;
    indexStatus.value = 'ready';
    if (articleContext.valid) applyArticleAction(articleContext.action);
  } catch {
    if (!alive) return;
    indexStatus.value = 'error';
    notice.value = '本地知识库加载失败，可以重新加载后重试。';
  }

  window.addEventListener('pagehide', persist);
});

onBeforeUnmount(() => {
  alive = false;
  requestSerial++;
  clearTimeout(copyTimer);
  clearTimeout(saveTimer);
  assistant.stop();
  searchRuntime.dispose();
  for (const session of conversations.value) for (const message of session.messages) {
    if (message.status === 'streaming') message.status = 'stopped';
  }
  persist();
  window.removeEventListener('pagehide', persist);
  window.visualViewport?.removeEventListener('resize', updateViewport);
  document.documentElement.style.removeProperty('--assistant-viewport-height');
});
</script>

<template>
  <main class="chat-page">
    <div class="chat-workspace">
      <aside class="chat-sidebar" aria-label="会话历史">
        <ChatSessionList
          :active-id="activeId"
          :disabled="pending"
          :sessions="conversations"
          @create="newConversation"
          @delete="deleteSession"
          @select="selectSession"
        />
      </aside>

      <section class="chat-panel" aria-label="本地知识问答">
        <header class="chat-panel__header">
          <div class="chat-panel__identity">
            <h1>AI 助手</h1>
            <p>
              <AssistantStatus :model="assistant.model.value.modelState" :generation="assistant.generation.value" :index="indexStatus" />
              <span v-if="currentArticleTitle" class="chat-article-context">
                {{ currentArticleTitle }}
              </span>
            </p>
          </div>
          <div class="chat-panel__commands">
            <ModelSetup />
            <button
              ref="historyTrigger"
              class="icon-button chat-history-trigger"
              type="button"
              aria-label="打开会话历史"
              @click="openHistory"
            >
              <History :size="18" aria-hidden="true" />
            </button>
            <button
              class="icon-button"
              type="button"
              aria-label="新建会话"
              :disabled="pending"
              @click="newConversation"
            >
              <Plus :size="18" aria-hidden="true" />
            </button>
            <button
              class="icon-button"
              type="button"
              aria-label="导出会话"
              :disabled="!messages.length || pending"
              @click="exportConversation"
            >
              <Download :size="18" aria-hidden="true" />
            </button>
          </div>
        </header>

        <ChatQuickActions
          :action="selectedAction"
          :disabled="pending"
          :has-article="hasArticleScope"
          :scope="selectedScope"
          @special="runSpecial"
          @update:action="selectAction"
          @update:scope="updateScope"
        />
        <label class="chat-mode">
          <input v-model="modelEnabled" type="checkbox" :disabled="pending || assistant.model.value.modelState !== 'ready'" />
          实验生成
          <span>{{ assistant.model.value.modelState === 'ready' ? '需核对来源；关闭时使用本地检索' : '加载模型后可开启，默认使用本地检索' }}</span>
        </label>

        <div
          ref="thread"
          class="chat-thread"
          role="log"
          aria-label="对话记录"
          :aria-busy="pending"
          aria-live="off"
          aria-relevant="additions"
        >
          <div v-if="!messages.length" class="chat-welcome">
            <span class="chat-welcome__mark">
              <Sparkles :size="26" aria-hidden="true" />
            </span>
            <h2>从站内知识开始</h2>
            <p>可查资料、做对比、总结文章或整理学习路线。</p>
            <div class="chat-suggestions">
              <button type="button" @click="send('CSS 布局怎么学习？', 'learning-path')">
                CSS 布局怎么学习？
              </button>
              <button type="button" @click="send('动画卡顿应该如何排查？', 'troubleshoot')">
                动画卡顿如何排查？
              </button>
              <button type="button" @click="send('解释浏览器渲染流程', 'explain')">
                浏览器如何渲染页面？
              </button>
            </div>
          </div>

          <AssistantMessage
            v-for="message in messages"
            :key="message.id"
            :message="message"
            :copied="copied === message.id"
            @copy="copyMessage(message)"
            @clarify="clarify"
          />

          <div v-if="pending" class="chat-loading" aria-hidden="true">
            <span /><span /><span />
          </div>
        </div>

        <button v-if="showLatest" class="chat-latest chat-text-button" type="button" @click="scrollToLatest(true)">回到最新回答 ↓</button>
        <p class="sr-only" role="status" aria-live="polite">{{ assistant.generation.value === 'complete' ? '回答已完成' : assistant.generation.value === 'stopped' ? '回答已停止' : '' }}</p>
        <p v-if="notice" class="chat-notice" role="alert">{{ notice }}</p>
        <button v-if="indexStatus === 'error'" class="chat-text-button" type="button" @click="retryKnowledge">重试知识库</button>
        <p v-if="storageNotice" class="chat-notice" role="status">
          {{ storageNotice }}
        </p>

        <AssistantComposer ref="composer" v-model="input" :pending="pending" :disabled="indexStatus !== 'ready'"
          @submit="send()" @stop="assistant.stop()" />
      </section>
    </div>

    <dialog
      ref="historyDialog"
      class="chat-history-dialog"
      aria-labelledby="chat-history-title"
      @click="closeHistoryFromBackdrop"
      @close="restoreHistoryFocus"
    >
      <header>
        <h2 id="chat-history-title">
          <Menu :size="18" aria-hidden="true" />
          会话历史
        </h2>
        <button class="icon-button" type="button" aria-label="关闭会话历史" @click="closeHistory">
          ×
        </button>
      </header>
      <ChatSessionList
        :active-id="activeId"
        :disabled="pending"
        :sessions="conversations"
        @create="newConversation"
        @delete="deleteSession"
        @select="selectSession"
      />
    </dialog>
  </main>
</template>
