import { tokenizeKnowledgeText } from '../../data/knowledge';
import type {
  KnowledgeSearchOptions,
  KnowledgeSearchResponse,
  KnowledgeSearchResult,
} from './knowledge-search';

export type ChatIntent =
  | 'lookup'
  | 'explain'
  | 'compare'
  | 'learning-path'
  | 'troubleshoot'
  | 'summarize';

export type QuickAction =
  | ChatIntent
  | 'random-topic'
  | 'study-task';

export type KnowledgeScope = 'site' | 'blog' | 'columns' | 'article';
export type ConfidenceLevel = 'high' | 'medium' | 'insufficient';

export interface ChatContext {
  entities: string[];
  intent: ChatIntent;
  pendingClarification?: string[];
  scope: KnowledgeScope;
  sourceIds: string[];
}

export interface ConfidenceResult {
  level: ConfidenceLevel;
  reasons: string[];
  score: number;
}

export interface EvidenceItem {
  kind?: 'code' | 'table';
  language?: string;
  sourceIds: string[];
  text: string;
}

export interface AnswerBlock {
  heading?: string;
  items: EvidenceItem[];
  kind: 'paragraph' | 'list' | 'comparison' | 'steps' | 'clarification';
}

export interface EvidenceSource {
  contentVersion?: string;
  href: string;
  id: string;
  sectionTitle?: string;
  title: string;
}

export interface StructuredReply {
  blocks: AnswerBlock[];
  clarification?: string[];
  confidence: ConfidenceResult;
  intent: ChatIntent;
  nextContext: ChatContext;
  sources: EvidenceSource[];
}

export interface AssistantRequest {
  action?: QuickAction;
  articleId?: string;
  context?: ChatContext;
  question: string;
  scope?: KnowledgeScope;
  search: (
    query: string,
    options?: KnowledgeSearchOptions,
  ) => Promise<KnowledgeSearchResponse>;
}

export interface ResolveContextInput {
  entities: string[];
  intent: ChatIntent;
  previous?: ChatContext;
  question: string;
  scope?: KnowledgeScope;
}

export interface StudyTaskStep {
  href: string;
  minutes: number;
  seriesOrder: number;
  title: string;
}

const INTENT_RULES: Array<{
  intent: ChatIntent;
  pattern: RegExp;
  score: number;
}> = [
  {
    intent: 'compare',
    pattern: /(?:对比|比较|区别|差异|不同|优缺点|\bvs\.?\b| versus )/iu,
    score: 5,
  },
  {
    intent: 'summarize',
    pattern: /(?:总结|摘要|概括|提炼|要点|梳理|小结)/u,
    score: 4,
  },
  {
    intent: 'learning-path',
    pattern: /(?:怎么学|如何学|学习路线|学习路径|学习顺序|入门|先学|路线图)/u,
    score: 4,
  },
  {
    intent: 'troubleshoot',
    pattern: /(?:排查|调试|报错|错误|异常|失败|卡顿|不生效|无法|怎么修|为什么.*(?:慢|卡|错|失败))/u,
    score: 4,
  },
  {
    intent: 'explain',
    pattern: /(?:什么是|是什么意思|解释|介绍|原理|为什么|适合什么|怎么理解)/u,
    score: 3,
  },
  {
    intent: 'lookup',
    pattern: /(?:找|搜索|资料|文章|有哪些|哪里|哪篇|相关内容)/u,
    score: 2,
  },
];

const INTENT_PRIORITY: ChatIntent[] = [
  'compare',
  'summarize',
  'learning-path',
  'troubleshoot',
  'explain',
  'lookup',
];

const CONTROLLED_ENTITIES = [
  'Chrome DevTools',
  'GitHub Pages',
  '浏览器渲染',
  'CSS 布局',
  'TypeScript',
  'VitePress',
  'Flexbox',
  'Canvas',
  'React Hooks',
  'React',
  'ArkTS',
  'CSS Grid',
  'Grid',
  'SVG',
  'DOM',
  'CSSOM',
  'Vue',
  'JavaScript',
  'HTML',
  'WebLLM',
  'Node.js',
];

const SINGLE_PRONOUN = /(?:它|这个|该内容|该技术|这种方式)/u;
const CONTINUATION = /(?:继续|展开|再详细|更多|接着|然后呢)/u;
const VALID_SOURCE = /^\/(?:blog\/[^/?#]+\.html|columns\/[^/?#]+\/[^/?#]+\.html)(?:#[^?]*)?$/u;

export function normalizeAssistantQuestion(question: string): string {
  return question
    .normalize('NFKC')
    .replace(/[？?]+/gu, '？')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function classifyIntent(
  question: string,
  action?: QuickAction,
): ChatIntent {
  if (action && INTENT_PRIORITY.includes(action as ChatIntent)) {
    return action as ChatIntent;
  }
  if (action === 'study-task') return 'learning-path';

  const normalized = normalizeAssistantQuestion(question);
  const matches = INTENT_RULES
    .filter(({ pattern }) => pattern.test(normalized))
    .sort(
      (left, right) =>
        right.score - left.score ||
        INTENT_PRIORITY.indexOf(left.intent) - INTENT_PRIORITY.indexOf(right.intent),
    );
  return matches[0]?.intent ?? 'lookup';
}

export function extractEntities(
  question: string,
  knownEntities: string[] = [],
): string[] {
  const normalized = normalizeAssistantQuestion(question);
  const candidates = [...new Set([...knownEntities, ...CONTROLLED_ENTITIES])]
    .sort((left, right) => right.length - left.length);
  const entities: string[] = [];

  for (const candidate of candidates) {
    if (normalized.toLocaleLowerCase().includes(candidate.toLocaleLowerCase())) {
      if (!entities.some((entity) => entity.toLocaleLowerCase().includes(candidate.toLocaleLowerCase()))) {
        entities.push(candidate);
      }
    }
  }

  return entities;
}

export function resolveConversationContext({
  entities,
  intent,
  previous,
  question,
  scope,
}: ResolveContextInput): ChatContext & { clarification?: string[] } {
  const normalized = normalizeAssistantQuestion(question);
  const isContinuation = CONTINUATION.test(normalized);
  const usesPronoun = SINGLE_PRONOUN.test(normalized);
  const usesFormer = /前者/u.test(normalized);
  const usesLatter = /后者/u.test(normalized);
  const resolvedScope = scope ?? previous?.scope ?? 'site';

  if (!previous || resolvedScope !== previous.scope) {
    return {
      entities,
      intent,
      scope: resolvedScope,
      sourceIds: [],
      ...(usesPronoun || usesFormer || usesLatter ? { clarification: [] } : {}),
    };
  }

  if (isContinuation) {
    return {
      entities: previous.entities,
      intent: previous.intent,
      scope: previous.scope,
      sourceIds: previous.sourceIds,
    };
  }

  if ((usesFormer || usesLatter) && previous.entities.length === 2) {
    return {
      entities: [previous.entities[usesLatter ? 1 : 0]],
      intent,
      scope: resolvedScope,
      sourceIds: previous.sourceIds,
    };
  }

  if (usesPronoun && previous.entities.length > 1 && entities.length === 0) {
    return {
      entities: [],
      intent,
      scope: resolvedScope,
      sourceIds: previous.sourceIds,
      clarification: previous.entities,
    };
  }

  if (usesPronoun && previous.entities.length === 1) {
    return {
      entities: [...new Set([...previous.entities, ...entities])],
      intent,
      scope: resolvedScope,
      sourceIds: previous.sourceIds,
    };
  }

  if (entities.length > 0) {
    return {
      entities,
      intent,
      scope: resolvedScope,
      sourceIds: [],
    };
  }

  return {
    entities,
    intent,
    scope: resolvedScope,
    sourceIds: [],
  };
}

export function calculateConfidence(input: {
  evidenceCoverage: number;
  hasConflict: boolean;
  hasQuotableText: boolean;
  hasValidSources: boolean;
  intentCompleteness: number;
  retrievalConfidence: number;
}): ConfidenceResult {
  const score = Math.max(
    0,
    Math.min(
      1,
      input.retrievalConfidence * 0.5 +
        input.evidenceCoverage * 0.3 +
        input.intentCompleteness * 0.2,
    ),
  );
  const reasons: string[] = [];

  if (!input.hasValidSources) reasons.push('没有合法站内来源');
  if (!input.hasQuotableText) reasons.push('没有可引用原文');
  if (input.hasConflict) reasons.push('来源表述存在冲突');

  if (!input.hasValidSources || !input.hasQuotableText || score < 0.45) {
    return { level: 'insufficient', reasons, score };
  }
  if (input.hasConflict || score < 0.72 || input.intentCompleteness < 1) {
    return { level: 'medium', reasons, score };
  }
  return { level: 'high', reasons, score };
}

function hasEvidenceConflict(results: KnowledgeSearchResult[]): boolean {
  const positive = results.filter((result) =>
    /(?:支持|可以|能够|应当|应该)/u.test(result.text) &&
    !/(?:不支持|不可以|不能|不应当|不应该)/u.test(result.text),
  );
  const negative = results.filter((result) =>
    /(?:不支持|不可以|不能|不应当|不应该)/u.test(result.text),
  );

  return positive.some((left) =>
    negative.some((right) => {
      const leftTokens = new Set(tokenizeKnowledgeText(left.text));
      const shared = tokenizeKnowledgeText(right.text).filter((token) => leftTokens.has(token));
      return shared.length >= 2;
    }),
  );
}

function filterResultsByScope(
  results: KnowledgeSearchResult[],
  scope: KnowledgeScope,
  articleId?: string,
): KnowledgeSearchResult[] {
  return results.filter((result) => {
    if (!VALID_SOURCE.test(result.href) || !VALID_SOURCE.test(result.documentId)) return false;
    if (scope === 'blog') return result.documentId.startsWith('/blog/');
    if (scope === 'columns') return result.documentId.startsWith('/columns/');
    if (scope === 'article') return result.documentId === articleId;
    return true;
  });
}

function retrievalConfidence(
  question: string,
  results: KnowledgeSearchResult[],
): number {
  if (results.length === 0) return 0;
  const queryTerms = tokenizeKnowledgeText(question.replace(
    /(?:请|帮我|解释|介绍|什么是|是什么意思|如何|怎么|有哪些|相关|资料|文章|示例|代码|一下|继续|展开|详细|找|搜索)/gu, ' ',
  )).filter((term) => term.length > 1);
  const evidenceTerms = new Set(results.slice(0, 3).flatMap((result) =>
    tokenizeKnowledgeText(`${result.articleTitle} ${result.sectionTitle ?? ''} ${result.text}`),
  ));
  const matched = queryTerms.filter((term) => evidenceTerms.has(term));
  const namedTerms = queryTerms.filter((term) => /^[a-z][a-z0-9._-]{2,}$/iu.test(term));
  if (namedTerms.length && !namedTerms.some((term) => evidenceTerms.has(term))) return 0;
  const coverage = queryTerms.length > 0
    ? matched.length / queryTerms.length
    : 0;
  if (coverage < 0.25) return 0;
  const raw = results[0].score;
  return Math.min(1, raw / (raw + 16) * 0.65 + coverage * 0.35);
}

function intentCompleteness(intent: ChatIntent, entities: string[], scope: KnowledgeScope): number {
  if (intent === 'compare') return entities.length >= 2 ? 1 : 0.5;
  if (intent === 'summarize') return scope === 'article' ? 1 : 0.6;
  return 1;
}

function createEvidenceBlocks(
  intent: ChatIntent,
  results: KnowledgeSearchResult[],
): AnswerBlock[] {
  const evidence = (result: KnowledgeSearchResult): EvidenceItem => ({
    sourceIds: [result.id],
    text: result.text,
    ...(result.kind === 'code' || result.kind === 'table' ? { kind: result.kind } : {}),
    ...(result.language ? { language: result.language } : {}),
  });

  if (intent === 'compare') {
    return [{
      heading: '对比依据',
      items: results.slice(0, 4).map(evidence),
      kind: 'comparison',
    }];
  }
  if (intent === 'learning-path') {
    return [{
      heading: '建议顺序',
      items: [...results]
        .sort(
          (left, right) =>
            (left.seriesOrder ?? Number.MAX_SAFE_INTEGER) -
            (right.seriesOrder ?? Number.MAX_SAFE_INTEGER),
        )
        .slice(0, 5)
        .map(evidence),
      kind: 'steps',
    }];
  }
  if (intent === 'troubleshoot') {
    return [{
      heading: '排查步骤',
      items: results.slice(0, 5).map(evidence),
      kind: 'steps',
    }];
  }
  if (intent === 'summarize') {
    const seenSections = new Set<string>();
    return [{
      heading: '内容提要',
      items: results
        .filter((result) => {
          const section = result.sectionTitle ?? result.articleTitle;
          if (seenSections.has(section)) return false;
          seenSections.add(section);
          return true;
        })
        .slice(0, 8)
        .map(evidence),
      kind: 'list',
    }];
  }
  if (intent === 'explain') {
    return [
      {
        heading: '核心说明',
        items: results.slice(0, 1).map(evidence),
        kind: 'paragraph',
      },
      {
        heading: '相关要点',
        items: results.slice(1, 4).map(evidence),
        kind: 'list',
      },
    ].filter((block) => block.items.length > 0) as AnswerBlock[];
  }
  return [{
    heading: '相关资料',
    items: results.slice(0, 6).map(evidence),
    kind: 'list',
  }];
}

function createSources(results: KnowledgeSearchResult[]): EvidenceSource[] {
  const seen = new Set<string>();
  return results.flatMap((result) => {
    if (seen.has(result.id)) return [];
    seen.add(result.id);
    return [{
      contentVersion: result.contentVersion,
      href: result.href,
      id: result.id,
      sectionTitle: result.sectionTitle,
      title: result.articleTitle,
    }];
  }).slice(0, 8);
}

export async function answerQuestion({
  action,
  articleId,
  context,
  question,
  scope = context?.scope ?? 'site',
  search,
}: AssistantRequest): Promise<StructuredReply> {
  const normalizedQuestion = normalizeAssistantQuestion(question);
  const intent = classifyIntent(normalizedQuestion, action);
  const entities = extractEntities(normalizedQuestion, context?.entities);
  const resolved = resolveConversationContext({
    entities,
    intent,
    previous: context,
    question: normalizedQuestion,
    scope,
  });

  const greeting = /^(?:你好|您好|嗨|哈喽|hello|hi|谢谢|感谢|再见)[！!。？?～\s]*$/iu.test(normalizedQuestion);
  const offSite = /(?:天气|酸面包|咖啡机|签证|股票|世界杯|餐厅|行程|房贷|医学|新闻|黄金价格|马拉松|仲裁|番茄|票房|量子力学|感冒)/u.test(normalizedQuestion);
  if (greeting || offSite) {
    return {
      blocks: [{
        heading: greeting ? '你好，可以向我询问本站的技术文章。' : '这个问题超出了本站资料范围。',
        kind: 'paragraph',
        items: [],
      }],
      confidence: { level: 'insufficient', score: 0, reasons: [greeting ? '日常交流不引用文章' : '问题超出本站范围'] },
      intent,
      nextContext: context ?? resolved,
      sources: [],
    };
  }

  if (resolved.clarification) {
    const confidence: ConfidenceResult = {
      level: 'medium',
      reasons: ['需要确认指代对象'],
      score: 0.5,
    };
    return {
      blocks: [{
        heading: '你更想了解哪一部分？',
        items: [],
        kind: 'clarification',
      }],
      clarification: resolved.clarification,
      confidence,
      intent: resolved.intent,
      nextContext: context ?? resolved,
      sources: [],
    };
  }

  if (resolved.intent === 'summarize' && scope !== 'article') {
    return {
      blocks: [{
        heading: '请选择需要总结的文章',
        items: [],
        kind: 'clarification',
      }],
      clarification: ['从文章页进入问答', '切换到当前文章范围'],
      confidence: {
        level: 'medium',
        reasons: ['总结缺少文章范围'],
        score: 0.5,
      },
      intent: resolved.intent,
      nextContext: context ?? resolved,
      sources: [],
    };
  }

  if (resolved.intent === 'compare' && resolved.entities.length < 2) {
    return {
      blocks: [{
        heading: '请选择两个需要对比的主题',
        items: [],
        kind: 'clarification',
      }],
      clarification: ['补充第一个主题', '补充第二个主题'],
      confidence: {
        level: 'medium',
        reasons: ['对比缺少两个明确实体'],
        score: 0.5,
      },
      intent: resolved.intent,
      nextContext: context ?? resolved,
      sources: [],
    };
  }

  const searchQuery = [...resolved.entities, normalizedQuestion].join(' ');
  const searchOptions = {
    documentId: scope === 'article' ? articleId : undefined,
    limit: 40,
    scope,
    summary: resolved.intent === 'summarize',
  };
  const responses = resolved.intent === 'compare'
    ? await Promise.all(resolved.entities.slice(0, 2).map((entity) => search(entity, searchOptions)))
    : [await search(searchQuery, searchOptions)];
  const interleaved = responses.length === 1 ? responses[0].results : responses[0].results.flatMap((left, index) =>
    responses[1].results[index] ? [left, responses[1].results[index]] : [left],
  ).concat(responses[1].results.slice(responses[0].results.length));
  const seenResults = new Set<string>();
  const response = { results: interleaved.filter((result) => {
    if (seenResults.has(result.id)) return false;
    seenResults.add(result.id);
    return true;
  }) };
  const validResults = filterResultsByScope(response.results, scope, articleId)
    .filter((result) => result.text.trim().length > 0)
    .filter((result) => !CONTINUATION.test(normalizedQuestion) || !resolved.sourceIds.includes(result.id));
  const relevance = resolved.intent === 'summarize'
    ? 1
    : retrievalConfidence(searchQuery, validResults);
  const conflict = hasEvidenceConflict(validResults);
  const completeness = intentCompleteness(resolved.intent, resolved.entities, scope);
  const coverage = validResults.length === 0
    ? 0
    : resolved.intent === 'compare'
      ? Math.min(1, validResults.length / 2)
      : relevance > 0 ? 1 : 0;
  const confidence = calculateConfidence({
    evidenceCoverage: coverage,
    hasConflict: conflict,
    hasQuotableText: validResults.some((result) => result.text.length > 0),
    hasValidSources: validResults.length > 0,
    intentCompleteness: completeness,
    retrievalConfidence: relevance,
  });

  if (confidence.level === 'insufficient') {
    return {
      blocks: [{
        heading: '本站暂时没有足够资料回答这个问题。',
        items: [],
        kind: 'clarification',
      }],
      clarification: ['换一个站内技术主题', '使用更具体的关键词'],
      confidence,
      intent: resolved.intent,
      nextContext: context ?? resolved,
      sources: [],
    };
  }

  const blocks = createEvidenceBlocks(resolved.intent, validResults);
  const sourceIds = [...new Set(blocks.flatMap((block) =>
    block.items.flatMap((item) => item.sourceIds),
  ))];
  const nextContext: ChatContext = {
    entities: resolved.entities,
    intent: resolved.intent,
    scope,
    sourceIds,
  };

  return {
    blocks,
    confidence,
    intent: resolved.intent,
    nextContext,
    sources: createSources(validResults.filter((result) => sourceIds.includes(result.id))),
  };
}

export function createStudyTask(
  results: KnowledgeSearchResult[],
  maxMinutes = 18,
): StudyTaskStep[] {
  const seenDocuments = new Set<string>();
  const ordered = [...results].sort(
    (left, right) =>
      (left.seriesOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.seriesOrder ?? Number.MAX_SAFE_INTEGER),
  );
  const steps: StudyTaskStep[] = [];
  let remaining = maxMinutes;

  for (const result of ordered) {
    if (seenDocuments.has(result.documentId) || remaining <= 0 || steps.length >= 3) continue;
    const minutes = Math.max(1, Math.min(result.readingMinutes, remaining));
    steps.push({
      href: result.href,
      minutes,
      seriesOrder: result.seriesOrder ?? Number.MAX_SAFE_INTEGER,
      title: result.sectionTitle ?? result.articleTitle,
    });
    seenDocuments.add(result.documentId);
    remaining -= minutes;
  }

  return steps;
}

export function selectRandomTopic(
  results: KnowledgeSearchResult[],
  random: () => number = Math.random,
): string | undefined {
  const topics = [...new Set(results.map((result) =>
    result.sectionTitle ?? result.articleTitle,
  ).filter(Boolean))];
  if (topics.length === 0) return undefined;

  const index = Math.min(topics.length - 1, Math.floor(random() * topics.length));
  return topics[index];
}
