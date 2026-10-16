<script setup lang="ts">
import {
  Check,
  Clock3,
  Copy,
  Download,
  History,
  Menu,
  Plus,
  Send,
  Sparkles,
} from '@lucide/vue';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue';
import { withBase } from 'vitepress';
import { data as content } from '../../data/content.data';
import ChatAnswer from '../components/ChatAnswer.vue';
import ChatQuickActions from '../components/ChatQuickActions.vue';
import ChatSessionList from '../components/ChatSessionList.vue';
import {
  createConversation,
  exportConversationMarkdown,
  loadConversationStorage,
  persistConversationEnvelope,
  type ChatMessage,
  type Conversation,
  type ConversationEnvelopeV2,
} from '../composables/chat';
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
import { createKnowledgeSearchRuntime } from '../composables/knowledge-search';

const allArticles = [
  ...content.blogArticles,
  ...content.columns.flatMap((column) => column.articles),
];
const publishedArticleHrefs = new Set(allArticles.map((article) => article.href));
const articleTitles = new Map(allArticles.map((article) => [article.href, article.title]));
const searchRuntime = createKnowledgeSearchRuntime();

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
const currentArticleId = ref<string>();
const indexStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const thread = ref<HTMLElement>();
const textarea = ref<HTMLTextAreaElement>();
const historyDialog = ref<HTMLDialogElement>();
const historyTrigger = ref<HTMLButtonElement>();
let copyTimer: ReturnType<typeof setTimeout> | undefined;
let alive = true;

const current = computed(() =>
  conversations.value.find((session) => session.id === activeId.value),
);
const messages = computed(() => current.value?.messages ?? []);
const hasArticleScope = computed(() => Boolean(currentArticleId.value));
const currentArticleTitle = computed(() =>
  currentArticleId.value ? articleTitles.get(currentArticleId.value) : undefined,
);
const indexStatusText = computed(() => {
  if (indexStatus.value === 'loading') return '正在准备本地知识库…';
  if (indexStatus.value === 'error') return '本地知识库加载失败';
  if (pending.value) return '正在检索站内资料…';
  return '完全本地 · 内容不上传';
});

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function createEnvelope(): ConversationEnvelopeV2 {
  return {
    activeConversationId: activeId.value,
    conversations: conversations.value.slice(0, 30),
    migration: {
      completedAt: migrationCompletedAt.value,
      v1Completed: true,
    },
    version: 2,
  };
}

function persist(): void {
  if (!persistConversationEnvelope(localStorage, createEnvelope())) {
    storageNotice.value =
      '浏览器无法保存会话，刷新后记录可能丢失。你仍可导出当前会话。';
  }
}

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
  return session;
}

function newConversation(): void {
  if (pending.value) return;
  activeId.value = null;
  input.value = '';
  notice.value = '';
  closeHistory();
  void nextTick(() => textarea.value?.focus());
}

function selectSession(session: Conversation): void {
  if (pending.value) return;
  activeId.value = session.id;
  selectedScope.value = session.scope;
  currentArticleId.value = session.articleId;
  notice.value = '';
  closeHistory();
  scrollToLatest(true);
}

function deleteSession(session: Conversation): void {
  if (pending.value || !window.confirm(`确定删除会话“${session.title}”吗？`)) return;
  conversations.value = conversations.value.filter(({ id }) => id !== session.id);
  if (activeId.value === session.id) activeId.value = null;
  persist();
}

function updateScope(scope: KnowledgeScope): void {
  selectedScope.value = scope;
  if (current.value) {
    current.value.scope = scope;
    current.value.articleId = scope === 'article' ? currentArticleId.value : undefined;
    current.value.context = undefined;
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
    });
  }
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
    return '本站暂时没有足够资料回答这个问题。';
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

  const session = current.value ?? createSession();
  if (session.messages.length >= 100) {
    notice.value = '当前会话已达 100 条消息，请开启新会话。';
    return;
  }

  const previousContext = deriveLegacyContext(session);
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
  input.value = '';
  notice.value = '';
  pending.value = true;
  persist();
  scrollToLatest(true);

  try {
    const reply = await answerQuestion({
      action,
      articleId: session.articleId,
      context: previousContext,
      question: trimmedQuestion,
      scope: session.scope,
      search: searchRuntime.search,
    });
    const message: ChatMessage = {
      content: assistantMessageContent(reply),
      createdAt: Date.now(),
      id: uid(),
      reply,
      role: 'assistant',
      status: 'complete',
    };
    session.messages.push(message);
    if (reply.confidence.level !== 'insufficient' && !reply.clarification) {
      session.context = reply.nextContext;
    }
    session.updatedAt = Date.now();
  } catch {
    session.messages.push({
      content: '本地知识库暂时无法完成检索，请重试。',
      createdAt: Date.now(),
      id: uid(),
      role: 'assistant',
      status: 'error',
    });
    notice.value = '本地知识库加载失败。请确认静态资源已完成加载后重试。';
  } finally {
    pending.value = false;
    actionOverride.value = undefined;
    selectedAction.value = 'lookup';
    if (alive) {
      persist();
      scrollToLatest();
      void nextTick(() => textarea.value?.focus());
    }
  }
}

function selectAction(action: QuickAction): void {
  selectedAction.value = action;
  actionOverride.value = action;
}

async function runSpecial(action: 'random-topic' | 'study-task'): Promise<void> {
  if (pending.value) return;
  pending.value = true;
  try {
    const response = await searchRuntime.search(
      input.value.trim() || 'CSS HTML JavaScript TypeScript React 浏览器 工程化',
      { limit: 40 },
    );
    if (action === 'random-topic') {
      const topic = selectRandomTopic(response.results);
      pending.value = false;
      if (topic) await send(`请介绍 ${topic}`, 'explain');
      return;
    }

    const task = createStudyTask(response.results, 18);
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
  const replyText = message.reply?.blocks
    .flatMap((block) => block.items.map((item) => item.text))
    .join('\n');
  const text = replyText || message.content;
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
  link.download = '智能问答记录.md';
  link.click();
  URL.revokeObjectURL(url);
}

function handleEnter(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void send();
  }
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

function applyArticleAction(action: ArticleChatAction): void {
  if (action === 'ask') {
    void nextTick(() => textarea.value?.focus());
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
  const restored = loadConversationStorage(
    localStorage,
    publishedArticleHrefs,
  );
  conversations.value = restored.envelope.conversations;
  activeId.value = restored.envelope.activeConversationId;
  migrationCompletedAt.value = restored.envelope.migration.completedAt;
  storageNotice.value = restored.storageWarning ?? '';
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
    indexStatus.value = 'ready';
    if (articleContext.valid) applyArticleAction(articleContext.action);
  } catch {
    indexStatus.value = 'error';
    notice.value = '本地知识库加载失败。刷新页面后可以重试。';
  }

  window.addEventListener('pagehide', persist);
});

onBeforeUnmount(() => {
  alive = false;
  clearTimeout(copyTimer);
  persist();
  window.removeEventListener('pagehide', persist);
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
            <h1>智能问答</h1>
            <p>
              <span class="chat-local-status" :data-status="indexStatus">
                <Clock3 v-if="indexStatus === 'loading'" :size="14" aria-hidden="true" />
                <Sparkles v-else :size="14" aria-hidden="true" />
                {{ indexStatusText }}
              </span>
              <span v-if="currentArticleTitle" class="chat-article-context">
                {{ currentArticleTitle }}
              </span>
            </p>
          </div>
          <div class="chat-panel__commands">
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
          :has-article="hasArticleScope"
          :scope="selectedScope"
          @special="runSpecial"
          @update:action="selectAction"
          @update:scope="updateScope"
        />

        <div
          ref="thread"
          class="chat-thread"
          role="log"
          aria-label="对话记录"
          :aria-busy="pending"
          aria-live="polite"
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

          <article
            v-for="message in messages"
            :key="message.id"
            class="chat-message"
            :class="`chat-message--${message.role}`"
          >
            <header>
              <span>{{ message.role === 'user' ? '我' : '站内资料助手' }}</span>
              <small v-if="message.legacyRecord">旧版记录</small>
              <small v-else-if="message.status === 'error'">未完成</small>
              <small v-else-if="message.status === 'stopped'">已停止</small>
            </header>
            <p v-if="message.role === 'user' || !message.reply" class="chat-message__text">
              {{ message.content }}
            </p>
            <ChatAnswer
              v-if="message.reply"
              :reply="message.reply"
              @clarify="send($event)"
            />
            <nav
              v-else-if="message.sources?.length"
              class="chat-answer__sources"
              aria-label="旧版参考资料"
            >
              <a
                v-for="source in message.sources"
                :key="source.href"
                class="chat-source-link"
                :href="withBase(source.href)"
              >
                {{ source.title }}
              </a>
            </nav>
            <footer v-if="message.role === 'assistant'">
              <button
                class="chat-text-button"
                type="button"
                @click="copyMessage(message)"
              >
                <Check v-if="copied === message.id" :size="14" aria-hidden="true" />
                <Copy v-else :size="14" aria-hidden="true" />
                {{ copied === message.id ? '已复制' : '复制回答' }}
              </button>
            </footer>
          </article>

          <div v-if="pending" class="chat-loading" aria-hidden="true">
            <span /><span /><span />
          </div>
        </div>

        <p class="sr-only" role="status" aria-live="polite">
          {{ indexStatusText }}
        </p>
        <p v-if="notice" class="chat-notice" role="alert">{{ notice }}</p>
        <p v-if="storageNotice" class="chat-notice" role="status">
          {{ storageNotice }}
        </p>

        <form class="chat-composer" @submit.prevent="send()">
          <label class="sr-only" for="chat-input">输入问题</label>
          <textarea
            id="chat-input"
            ref="textarea"
            v-model="input"
            :disabled="pending || indexStatus === 'error'"
            rows="1"
            maxlength="4000"
            placeholder="输入问题，检索本站知识…"
            @keydown="handleEnter"
          />
          <button
            class="chat-send"
            type="submit"
            :disabled="pending || indexStatus !== 'ready' || !input.trim()"
            aria-label="发送问题"
          >
            <Send :size="18" aria-hidden="true" />
          </button>
          <p>回车发送，Shift + 回车换行。答案仅来自站内已发布内容。</p>
        </form>
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
