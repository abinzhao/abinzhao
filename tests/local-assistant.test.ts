import { beforeAll, describe, expect, test } from 'vitest';
import {
  chatKnowledgeResults,
  conflictKnowledgeResults,
  invalidKnowledgeResult,
} from './fixtures/chat-corpus';

type LocalAssistantModule = typeof import(
  '../docs/.vitepress/theme/composables/local-assistant'
);

let localAssistant: LocalAssistantModule | undefined;

describe('local assistant', () => {
  beforeAll(async () => {
    localAssistant = await import(
      '../docs/.vitepress/theme/composables/local-assistant'
    ).catch(() => undefined);
  });

  test('classifies the six supported intents with deterministic priority', () => {
    expect(localAssistant?.classifyIntent).toBeTypeOf('function');
    if (!localAssistant) return;

    const cases = [
      ['帮我找 CSS 布局资料', 'lookup'],
      ['有哪些 VitePress 文章', 'lookup'],
      ['什么是 Flexbox', 'explain'],
      ['解释一下浏览器渲染', 'explain'],
      ['Flexbox 和 Grid 有什么区别', 'compare'],
      ['对比 Canvas 与 SVG', 'compare'],
      ['CSS 应该怎么学', 'learning-path'],
      ['给我一条 React 学习路线', 'learning-path'],
      ['动画卡顿怎么排查', 'troubleshoot'],
      ['为什么样式不生效，如何调试', 'troubleshoot'],
      ['总结这篇文章', 'summarize'],
      ['提炼本文要点', 'summarize'],
    ] as const;

    const correct = cases.filter(
      ([question, intent]) => localAssistant!.classifyIntent(question) === intent,
    ).length;

    expect(correct / cases.length).toBeGreaterThanOrEqual(0.9);
    expect(localAssistant.classifyIntent('介绍 Grid', 'compare')).toBe('compare');
  });

  test('resolves pronouns, ordered entities, continuation and explicit topic changes', () => {
    expect(localAssistant?.resolveConversationContext).toBeTypeOf('function');
    if (!localAssistant) return;

    const base = {
      intent: 'learning-path' as const,
      entities: ['CSS 布局'],
      scope: 'site' as const,
      sourceIds: ['flex'],
    };
    const pair = { ...base, entities: ['Flexbox', 'Grid'] };
    const cases = [
      {
        question: '那它和 Grid 有什么区别',
        intent: 'compare' as const,
        entities: ['Grid'],
        previous: base,
        expected: { intent: 'compare', entities: ['CSS 布局', 'Grid'] },
      },
      {
        question: '它适合什么场景',
        intent: 'explain' as const,
        entities: [],
        previous: base,
        expected: { entities: ['CSS 布局'] },
      },
      {
        question: '它有什么优点',
        intent: 'explain' as const,
        entities: [],
        previous: pair,
        expected: { clarification: ['Flexbox', 'Grid'] },
      },
      {
        question: '前者适合什么',
        intent: 'explain' as const,
        entities: [],
        previous: pair,
        expected: { entities: ['Flexbox'] },
      },
      {
        question: '后者呢',
        intent: 'explain' as const,
        entities: [],
        previous: pair,
        expected: { entities: ['Grid'] },
      },
      {
        question: '继续展开',
        intent: 'lookup' as const,
        entities: [],
        previous: base,
        expected: { intent: 'learning-path', entities: ['CSS 布局'], sourceIds: ['flex'] },
      },
      {
        question: '解释浏览器渲染',
        intent: 'explain' as const,
        entities: ['浏览器渲染'],
        previous: base,
        expected: { entities: ['浏览器渲染'], sourceIds: [] },
      },
      {
        question: '这个怎么用',
        intent: 'explain' as const,
        entities: [],
        previous: undefined,
        expected: { clarification: [] },
      },
    ];

    const correct = cases.filter((entry) => {
      const resolved = localAssistant!.resolveConversationContext(entry);
      return Object.entries(entry.expected).every(
        ([key, value]) => JSON.stringify(resolved[key as keyof typeof resolved]) === JSON.stringify(value),
      );
    }).length;

    expect(correct).toBeGreaterThanOrEqual(7);
  });

  test('builds evidence-only replies whose facts are verbatim source substrings', async () => {
    expect(localAssistant?.answerQuestion).toBeTypeOf('function');
    if (!localAssistant) return;

    const reply = await localAssistant.answerQuestion({
      question: '解释 Flexbox 和 Grid 的区别',
      search: async () => ({
        expandedQuery: 'Flexbox Grid',
        query: 'Flexbox Grid',
        results: chatKnowledgeResults,
      }),
    });
    const sourceById = new Map(chatKnowledgeResults.map((source) => [source.id, source]));
    const evidenceItems = reply.blocks.flatMap((block) => block.items);

    expect(reply.intent).toBe('compare');
    expect(reply.sources.length).toBeGreaterThanOrEqual(2);
    expect(evidenceItems.length).toBeGreaterThan(0);
    for (const item of evidenceItems) {
      expect(item.sourceIds.length).toBeGreaterThan(0);
      expect(item.sourceIds.every((id) => sourceById.has(id))).toBe(true);
      expect(item.sourceIds.some((id) => sourceById.get(id)!.text.includes(item.text))).toBe(true);
    }
  });

  test('applies confidence thresholds, conflict downgrade and invalid-source rejection', async () => {
    expect(localAssistant?.calculateConfidence).toBeTypeOf('function');
    expect(localAssistant?.answerQuestion).toBeTypeOf('function');
    if (!localAssistant) return;

    expect(localAssistant.calculateConfidence({
      evidenceCoverage: 1,
      hasConflict: false,
      hasQuotableText: true,
      hasValidSources: true,
      intentCompleteness: 1,
      retrievalConfidence: 0.9,
    }).level).toBe('high');
    expect(localAssistant.calculateConfidence({
      evidenceCoverage: 0.6,
      hasConflict: false,
      hasQuotableText: true,
      hasValidSources: true,
      intentCompleteness: 0.6,
      retrievalConfidence: 0.4,
    }).level).toBe('medium');
    expect(localAssistant.calculateConfidence({
      evidenceCoverage: 0,
      hasConflict: false,
      hasQuotableText: false,
      hasValidSources: false,
      intentCompleteness: 1,
      retrievalConfidence: 0,
    }).level).toBe('insufficient');

    const conflict = await localAssistant.answerQuestion({
      question: '离线能力是否支持离线使用',
      search: async () => ({
        expandedQuery: '离线',
        query: '离线',
        results: conflictKnowledgeResults,
      }),
    });
    expect(conflict.confidence.level).toBe('medium');
    expect(conflict.confidence.reasons).toContain('来源表述存在冲突');

    const invalid = await localAssistant.answerQuestion({
      question: '解释这条资料',
      search: async () => ({
        expandedQuery: '资料',
        query: '资料',
        results: [invalidKnowledgeResult],
      }),
    });
    expect(invalid.confidence.level).toBe('insufficient');
    expect(invalid.sources).toHaveLength(0);
  });

  test('does not hard-answer clearly off-site questions', async () => {
    expect(localAssistant?.answerQuestion).toBeTypeOf('function');
    if (!localAssistant) return;

    const questions = [
      '怎么烤酸面包',
      '明天北京天气',
      '推荐一款咖啡机',
      '量子力学最新论文',
      '如何申请法国签证',
      '给我写股票投资建议',
      '治疗感冒吃什么药',
      '世界杯冠军是谁',
      '附近哪家餐厅好吃',
      '帮我规划日本行程',
      '房贷利率是多少',
      '分析这张医学影像',
      '今天有哪些新闻',
      '黄金价格走势',
      '如何训练马拉松',
      '给小孩选什么学校',
      '劳动合同怎么仲裁',
      '如何种番茄',
      '电影票房排行榜',
      '给我生成一首歌',
    ];
    let hardAnswers = 0;

    for (const question of questions) {
      const reply = await localAssistant.answerQuestion({
        question,
        search: async () => ({
          expandedQuery: question,
          query: question,
          results: [],
        }),
      });
      if (reply.confidence.level !== 'insufficient') hardAnswers += 1;
    }

    expect(hardAnswers).toBeLessThanOrEqual(1);
  });

  test('clarifies missing compare entities and summarize scope before searching', async () => {
    expect(localAssistant?.answerQuestion).toBeTypeOf('function');
    if (!localAssistant) return;

    let searches = 0;
    const search = async () => {
      searches += 1;
      return {
        expandedQuery: '',
        query: '',
        results: chatKnowledgeResults,
      };
    };
    const compare = await localAssistant.answerQuestion({
      action: 'compare',
      question: '比较一下',
      search,
    });
    const summary = await localAssistant.answerQuestion({
      action: 'summarize',
      question: '总结内容',
      search,
    });

    expect(compare.clarification).toBeDefined();
    expect(compare.blocks[0].kind).toBe('clarification');
    expect(summary.clarification).toBeDefined();
    expect(searches).toBe(0);
  });

  test('creates bounded study tasks and deterministic published-topic exploration', () => {
    expect(localAssistant?.createStudyTask).toBeTypeOf('function');
    expect(localAssistant?.selectRandomTopic).toBeTypeOf('function');
    if (!localAssistant) return;

    const task = localAssistant.createStudyTask(chatKnowledgeResults, 18);
    expect(task).toHaveLength(3);
    expect(task.reduce((total, step) => total + step.minutes, 0)).toBeLessThanOrEqual(18);
    expect(task.map((step) => step.seriesOrder)).toEqual(
      [...task.map((step) => step.seriesOrder)].sort((left, right) => left - right),
    );

    expect(localAssistant.selectRandomTopic(chatKnowledgeResults, () => 0)).toBe(
      chatKnowledgeResults[0].sectionTitle,
    );
  });
});
