import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadPublishedArticleSources } from '../docs/.vitepress/data/content';

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
        '| 属性 | 作用 |',
        '| --- | --- |',
        '| scope | 限定来源 |',
        '| status | 请求状态 |',
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

    // 新契约保留可展示代码，仍只通过code字段赋予低检索权重。
    expect(codeBlock?.text).toContain('const useLocalState');
    expect(codeBlock).toHaveProperty('language', 'ts');
    expect(codeBlock?.codeTerms).toContain('useLocalState');
    expect(serialized).not.toContain('do-not-index');
    expect(serialized).not.toContain(fixtureRoot);
  });

  test('preserves table row and column relationships', async () => {
    const { blocks } = await knowledgeBuild!.buildKnowledgeArtifacts(fixtureRoot);
    const table = blocks.find((block) => block.kind === 'table');
    expect(table?.text).toContain('| 属性 | 作用 |');
    expect(table?.text).toContain('| scope | 限定来源 |');
  });

  test('indexes the visible body without treating YAML frontmatter as a heading', async () => {
    const path = join(fixtureRoot, 'blog', 'knowledge.md');
    const original = await readFile(path, 'utf8');
    try {
      await writeFile(path, original.replace('# 本地知识测试\n', '# 本地知识测试\n\n引言段应指向文章而不是 YAML 伪标题。\n'));
      const { blocks } = await knowledgeBuild!.buildKnowledgeArtifacts(fixtureRoot);
      const intro = blocks.find((block) => block.text.includes('引言段'));
      expect(intro?.href).toBe('/blog/knowledge.html');
      expect(intro?.sectionTitle).toBeUndefined();
    } finally { await writeFile(path, original); }
  });

  test('invalidates cached artifacts when Markdown content changes', async () => {
    const path = join(fixtureRoot, 'blog', 'knowledge.md');
    const original = await readFile(path, 'utf8');
    const before = await knowledgeBuild!.getKnowledgeArtifacts(fixtureRoot);
    try {
      await writeFile(path, `${original}\n\n新增可检索版本标记。\n`);
      const after = await knowledgeBuild!.getKnowledgeArtifacts(fixtureRoot);
      expect(after.blocks.some((block) => block.text.includes('新增可检索版本标记'))).toBe(true);
      expect(after.corpus.contentVersion).not.toBe(before.corpus.contentVersion);
    } finally {
      await writeFile(path, original);
    }
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

  test('includes every published article from the real site exactly once in the document set', async () => {
    expect(knowledgeBuild?.buildKnowledgeArtifacts).toBeTypeOf('function');
    if (!knowledgeBuild) return;

    const contentRoot = resolve(import.meta.dirname, '../docs');
    const { blocks } = await knowledgeBuild.buildKnowledgeArtifacts(contentRoot);
    const sources = await loadPublishedArticleSources(contentRoot);
    expect([...new Set(blocks.map((block) => block.documentId))].sort()).toEqual(
      sources.map(({ article }) => article.href).sort(),
    );
  }, 30_000);

  test('indexes actual imported source and invalidates its cache after a source edit', async () => {
    const path = join(fixtureRoot, 'blog', 'knowledge.md');
    const original = await readFile(path, 'utf8');
    const snippet = join(fixtureRoot, 'source.mjs');
    try {
      await writeFile(snippet, 'export const importedSource = "version-one";\n');
      await writeFile(path, `${original}\n\n<<< ../source.mjs\n`);
      const before = await knowledgeBuild!.getKnowledgeArtifacts(fixtureRoot);
      expect(before.blocks.some((block) => block.kind === 'code' && block.text.includes('importedSource'))).toBe(true);
      await writeFile(snippet, 'export const importedSource = "version-two";\n');
      const after = await knowledgeBuild!.getKnowledgeArtifacts(fixtureRoot);
      expect(after.blocks.some((block) => block.text.includes('version-two'))).toBe(true);
      expect(after.corpus.contentVersion).not.toBe(before.corpus.contentVersion);
    } finally { await writeFile(path, original); }
  });
});
