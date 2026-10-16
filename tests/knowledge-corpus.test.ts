import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

type KnowledgeBuildModule = typeof import('../docs/.vitepress/data/knowledge-build');

let fixtureRoot = '';
let knowledgeBuild: KnowledgeBuildModule | undefined;

describe('knowledge corpus', () => {
  beforeAll(async () => {
    knowledgeBuild = await import('../docs/.vitepress/data/knowledge-build').catch(() => undefined);
    fixtureRoot = await mkdtemp(join(tmpdir(), 'abinzhao-knowledge-'));
    await mkdir(join(fixtureRoot, 'blog'), { recursive: true });
    await mkdir(join(fixtureRoot, 'columns', 'testing'), { recursive: true });

    await writeFile(
      join(fixtureRoot, 'blog', 'knowledge.md'),
      [
        '---',
        'title: 本地知识测试',
        'description: 只使用站内已发布内容回答。',
        'date: "2026-10-16"',
        'category: 工程化',
        'tags: [本地优先, TypeScript]',
        '---',
        '',
        '# 本地知识测试',
        '',
        '## 同名章节',
        '',
        '第一段保留为完整知识块，不应从句子中间截断。',
        '',
        '## 同名章节',
        '',
        '- 列表第一项',
        '- 列表第二项',
        '',
        '> 引用内容也应作为独立知识块。',
        '',
        '```ts',
        'const useLocalState = () => window.localStorage;',
        '```',
        '',
        '<SecretPanel token="do-not-index" />',
        '',
        '<script>window.secret = "do-not-index"</script>',
      ].join('\n'),
    );

    await writeFile(
      join(fixtureRoot, 'blog', 'draft.md'),
      [
        '---',
        'title: 草稿',
        'date: "2026-10-16"',
        'draft: true',
        '---',
        '',
        '草稿不应进入语料。',
      ].join('\n'),
    );

    await writeFile(
      join(fixtureRoot, 'columns', 'testing', 'index.md'),
      [
        '---',
        'title: 测试专题',
        '---',
      ].join('\n'),
    );
  });

  afterAll(() => rm(fixtureRoot, { force: true, recursive: true }));

  test('builds published Markdown into section-linked semantic blocks', async () => {
    expect(knowledgeBuild?.buildKnowledgeArtifacts).toBeTypeOf('function');
    if (!knowledgeBuild) return;

    const artifacts = await knowledgeBuild.buildKnowledgeArtifacts(fixtureRoot);
    const blocks = artifacts.blocks;

    expect(new Set(blocks.map((block) => block.documentId))).toEqual(
      new Set(['/blog/knowledge.html']),
    );
    expect(blocks.some((block) => block.sectionTitle === '本地知识测试')).toBe(false);
    expect(blocks.some((block) => block.href === '/blog/knowledge.html#同名章节')).toBe(true);
    expect(blocks.some((block) => block.href === '/blog/knowledge.html#同名章节-1')).toBe(true);
    expect(blocks.map((block) => block.kind)).toEqual(
      expect.arrayContaining(['summary', 'paragraph', 'list', 'blockquote', 'code']),
    );
    expect(blocks.every((block) => block.readingMinutes >= 1)).toBe(true);
  });

  test('keeps code identifiers low-weight and excludes executable or component markup', async () => {
    expect(knowledgeBuild?.buildKnowledgeArtifacts).toBeTypeOf('function');
    if (!knowledgeBuild) return;

    const artifacts = await knowledgeBuild.buildKnowledgeArtifacts(fixtureRoot);
    const codeBlock = artifacts.blocks.find((block) => block.kind === 'code');
    const serialized = JSON.stringify(artifacts);

    expect(codeBlock?.text).toBe('');
    expect(codeBlock?.codeTerms).toContain('useLocalState');
    expect(serialized).not.toContain('do-not-index');
    expect(serialized).not.toContain(fixtureRoot);
  });

  test('separates searchable metadata from answer text with stable IDs', async () => {
    expect(knowledgeBuild?.buildKnowledgeArtifacts).toBeTypeOf('function');
    if (!knowledgeBuild) return;

    const { blocks, corpus, index } = await knowledgeBuild.buildKnowledgeArtifacts(fixtureRoot);
    const ids = blocks.map((block) => block.id);

    expect(index.version).toBe(1);
    expect(corpus.version).toBe(1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(index.metadata).sort()).toEqual([...ids].sort());
    expect(Object.keys(corpus.blocks).sort()).toEqual([...ids].sort());
    expect(JSON.stringify(index.metadata)).not.toContain('第一段保留');
    expect(corpus.blocks[ids[0]]).toHaveProperty('text');
  });

  test('includes all 44 published articles from the real site', async () => {
    expect(knowledgeBuild?.buildKnowledgeArtifacts).toBeTypeOf('function');
    if (!knowledgeBuild) return;

    const contentRoot = resolve(import.meta.dirname, '../docs');
    const { blocks } = await knowledgeBuild.buildKnowledgeArtifacts(contentRoot);

    expect(new Set(blocks.map((block) => block.documentId))).toHaveLength(44);
  }, 30_000);
});
