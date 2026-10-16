import MiniSearch, { type AsPlainObject } from 'minisearch';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, test } from 'vitest';
import { buildKnowledgeArtifacts } from '../docs/.vitepress/data/knowledge-build';
import {
  getKnowledgeMiniSearchOptions,
  tokenizeKnowledgeText,
  type KnowledgeIndexArtifact,
  type KnowledgeSearchDocument,
} from '../docs/.vitepress/data/knowledge';
import { createKnowledgeSearchRuntime } from '../docs/.vitepress/theme/composables/knowledge-search';

type Codec = typeof import('../docs/.vitepress/data/knowledge-index-codec');
let codec: Codec | undefined;

const options = { fields: ['title', 'text'], storeFields: ['title'] };

function sampleIndex(): AsPlainObject {
  const search = new MiniSearch(options);
  search.addAll([
    { id: 'zero', title: 'Harness', text: 'agent agent agent 中文检索 __proto__ constructor' },
    { id: 'one', title: 'Agent harness', text: 'agent durable durable cancellation rollback' },
    { id: 'two', title: '中文检索', text: 'harness durable 中文检索😀' },
  ]);
  return search.toJSON();
}

function requireCodec(): Codec {
  expect(codec?.packKnowledgeIndex).toBeTypeOf('function');
  expect(codec?.unpackKnowledgeIndex).toBeTypeOf('function');
  return codec!;
}

function encodeBytes(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

describe('knowledge index codec', () => {
  beforeAll(async () => {
    codec = await import('../docs/.vitepress/data/knowledge-index-codec').catch(() => undefined);
  });

  test('round-trips every term, posting, frequency and MiniSearch header without mutation', () => {
    const { packKnowledgeIndex, unpackKnowledgeIndex } = requireCodec();
    const original = sampleIndex();
    const snapshot = JSON.stringify(original);
    const packed = packKnowledgeIndex(original);

    expect(packed.index.encoding).toBe('varint-postings-v1');
    expect(packed.index.prefixes).toHaveLength(original.index.length);
    expect(packed.index.terms.join('').length).toBeLessThan(
      original.index.map(([term]) => term).join('').length,
    );
    expect(packed.index.data).toBeTypeOf('string');
    expect(unpackKnowledgeIndex(JSON.parse(JSON.stringify(packed)))).toEqual(original);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(unpackKnowledgeIndex(packed)).not.toBe(packed);
  });

  test('preserves exact MiniSearch results and ranking for every term, fuzzy and combined queries', () => {
    const { packKnowledgeIndex, unpackKnowledgeIndex } = requireCodec();
    const original = sampleIndex();
    const before = MiniSearch.loadJSON(JSON.stringify(original), options);
    const after = MiniSearch.loadJSON(
      JSON.stringify(unpackKnowledgeIndex(packKnowledgeIndex(original))),
      options,
    );
    const queries = [...original.index.map(([term]) => term), 'agent durable', 'harnes', '中文'];

    for (const query of queries) {
      for (const searchOptions of [{}, { prefix: true, fuzzy: 0.2 }]) {
        expect(after.search(query, searchOptions), query).toEqual(before.search(query, searchOptions));
      }
    }
    expect(after.toJSON()).toEqual(before.toJSON());
  });

  test('supports large document deltas and frequencies without 32-bit truncation', () => {
    const { packKnowledgeIndex, unpackKnowledgeIndex } = requireCodec();
    const original = sampleIndex();
    original.index = [['large', {
      0: { 0: 1, [2 ** 32 + 7]: 2, [2 ** 48 + 5]: 300, [Number.MAX_SAFE_INTEGER]: 2 ** 40 },
      5: { [Number.MAX_SAFE_INTEGER]: Number.MAX_SAFE_INTEGER },
    }]];

    expect(unpackKnowledgeIndex(packKnowledgeIndex(original))).toEqual(original);
  });

  test('preserves an empty index and empty term or field entries', () => {
    const { packKnowledgeIndex, unpackKnowledgeIndex } = requireCodec();
    const empty = new MiniSearch(options).toJSON();
    expect(unpackKnowledgeIndex(packKnowledgeIndex(empty))).toEqual(empty);
    const sparse = { ...empty, index: [['', {}], ['空词', { 0: {} }]] } as AsPlainObject;
    expect(unpackKnowledgeIndex(packKnowledgeIndex(sparse))).toEqual(sparse);
  });

  test('keeps legacy uncompressed MiniSearch JSON readable, including serialization version 1', () => {
    const { unpackKnowledgeIndex } = requireCodec();
    const original = sampleIndex();
    expect(unpackKnowledgeIndex(original)).toBe(original);
    const legacy: AsPlainObject = {
      ...original,
      serializationVersion: 1,
      index: original.index.map(([term, fields]) => [
        term,
        Object.fromEntries(Object.entries(fields).map(([field, postings]) => [
          field, { df: Object.keys(postings).length, ds: postings },
        ])),
      ]),
    };
    expect(unpackKnowledgeIndex(legacy)).toBe(legacy);
    expect(MiniSearch.loadJSON(JSON.stringify(unpackKnowledgeIndex(legacy)), options).search('agent'))
      .toEqual(MiniSearch.loadJSON(JSON.stringify(original), options).search('agent'));
  });

  test('rejects every byte-truncated posting stream instead of silently dropping terms', () => {
    const { packKnowledgeIndex, unpackKnowledgeIndex } = requireCodec();
    const packed = packKnowledgeIndex(sampleIndex());
    const bytes = atob(packed.index.data);
    for (let length = 0; length < bytes.length; length += 1) {
      const truncated = { ...packed, index: { ...packed.index, data: btoa(bytes.slice(0, length)) } };
      expect(() => unpackKnowledgeIndex(truncated), `truncated at byte ${length}`)
        .toThrow(/knowledge index.*truncated/iu);
    }
  });

  test('rejects trailing bytes, unsupported encoding and invalid base64', () => {
    const { packKnowledgeIndex, unpackKnowledgeIndex } = requireCodec();
    const packed = packKnowledgeIndex(sampleIndex());
    expect(() => unpackKnowledgeIndex({
      ...packed, index: { ...packed.index, data: btoa(`${atob(packed.index.data)}\0`) },
    })).toThrow(/knowledge index.*trailing/iu);
    expect(() => unpackKnowledgeIndex({
      ...packed, index: { ...packed.index, encoding: 'future-v2' as 'varint-postings-v1' },
    })).toThrow(/knowledge index.*encoding/iu);
    expect(() => unpackKnowledgeIndex({
      ...packed, index: { ...packed.index, data: '!not-base64!' },
    })).toThrow(/knowledge index.*base64/iu);
  });

  test.each([
    ['overflow', [1, 0, 1, 128, 255, 255, 255, 255, 255, 255, 255, 127]],
    ['frequency', [1, 0, 1, 1, 0]],
    ['duplicate document', [1, 0, 2, 0, 0]],
    ['duplicate field', [2, 0, 0, 0, 0]],
  ])('rejects corrupt %s values', (_reason, bytes) => {
    const { packKnowledgeIndex, unpackKnowledgeIndex } = requireCodec();
    const packed = packKnowledgeIndex(sampleIndex());
    const damaged = {
      ...packed, index: { ...packed.index, terms: ['term'], prefixes: [0], data: encodeBytes(bytes) },
    };
    expect(() => unpackKnowledgeIndex(damaged)).toThrow(/invalid knowledge index/iu);
  });

  test('rejects lossy numeric input and unsupported MiniSearch serialization before packing', () => {
    const { packKnowledgeIndex } = requireCodec();
    for (const postings of [{ 0: 1.5 }, { 0: 0 }, { '-1': 1 }, { '9007199254740992': 1 }]) {
      expect(() => packKnowledgeIndex({
        ...sampleIndex(), index: [['term', { 0: postings }]],
      })).toThrow(/invalid knowledge index/iu);
    }
    expect(() => packKnowledgeIndex({ ...sampleIndex(), serializationVersion: 1 }))
      .toThrow(/knowledge index.*serialization/iu);
  });

  test('rejects missing or out-of-range front-coded prefixes', () => {
    const { packKnowledgeIndex, unpackKnowledgeIndex } = requireCodec();
    const packed = packKnowledgeIndex(sampleIndex());
    expect(() => unpackKnowledgeIndex({
      ...packed, index: { ...packed.index, prefixes: [] },
    })).toThrow(/knowledge index.*truncated/iu);
    expect(() => unpackKnowledgeIndex({
      ...packed, index: { ...packed.index, prefixes: packed.index.prefixes.map(() => 999) },
    })).toThrow(/knowledge index.*prefix/iu);
  });

  test('indexes every real article and complete body/code term inside the unchanged gzip budget', async () => {
    const { unpackKnowledgeIndex } = requireCodec();
    const { blocks, corpus, index } = await buildKnowledgeArtifacts(resolve(import.meta.dirname, '../docs'));
    expect(Array.isArray(index.index.index)).toBe(false);
    const decoded = unpackKnowledgeIndex(index.index);
    const documents = new Set(blocks.map((block) => block.documentId));
    expect(decoded.documentCount).toBe(documents.size);
    expect(new Set(Object.values(decoded.documentIds))).toEqual(documents);
    const expectedTerms = new Set(blocks.flatMap((block) => tokenizeKnowledgeText([
      block.articleTitle, block.sectionTitle ?? '', block.tags.join(' '), block.description ?? '',
      block.kind === 'code' ? '' : block.text, block.codeTerms.join(' '),
    ].join(' '))));
    expect(new Set(decoded.index.map(([term]) => term))).toEqual(expectedTerms);
    for (const block of blocks) {
      expect(corpus.blocks[block.id]).toEqual({
        text: block.text, codeTerms: block.codeTerms, ...(block.language ? { language: block.language } : {}),
      });
    }
    expect(gzipSync(JSON.stringify(index)).byteLength).toBeLessThanOrEqual(250 * 1024);
    expect(Object.keys(corpus.blocks)).toEqual(blocks.map((block) => block.id));
    expect(Object.keys(index.metadata)).toEqual(blocks.map((block) => block.id));
    expect(index.contentVersion).toBe(corpus.contentVersion);
    const restored = MiniSearch.loadJSON<KnowledgeSearchDocument>(
      JSON.stringify(decoded), getKnowledgeMiniSearchOptions(),
    );
    for (const [term, fields] of decoded.index) {
      const results = new Set(restored.search(term).map((result) => result.id));
      for (const postings of Object.values(fields)) {
        for (const id of Object.keys(postings)) expect(results, term).toContain(decoded.documentIds[id]);
      }
    }
  }, 30_000);

  test('loads packed and legacy artifacts with identical runtime results and lazy corpus loading', async () => {
    const { packKnowledgeIndex, unpackKnowledgeIndex } = requireCodec();
    const artifacts = await buildKnowledgeArtifacts(resolve(import.meta.dirname, '../docs'));
    const legacy: KnowledgeIndexArtifact = {
      ...artifacts.index, index: unpackKnowledgeIndex(artifacts.index.index),
    };
    const packed: KnowledgeIndexArtifact = {
      ...legacy, index: packKnowledgeIndex(unpackKnowledgeIndex(legacy.index)),
    };
    let indexLoads = 0;
    let corpusLoads = 0;
    const runtime = createKnowledgeSearchRuntime({
      loadIndex: async () => { indexLoads += 1; return packed; },
      loadCorpus: async () => { corpusLoads += 1; return artifacts.corpus; },
    });
    const oldRuntime = createKnowledgeSearchRuntime({
      loadIndex: async () => legacy,
      loadCorpus: async () => artifacts.corpus,
    });
    expect(indexLoads).toBe(0);
    expect(corpusLoads).toBe(0);
    await runtime.search('  ');
    expect(indexLoads).toBe(0);
    await runtime.prepare();
    expect(indexLoads).toBe(1);
    expect(corpusLoads).toBe(0);
    for (const query of ['CSS Grid', 'AgentHarness 工具代码', 'Typescript 泛刑', '状态 组件']) {
      expect(await runtime.search(query)).toEqual(await oldRuntime.search(query));
    }
    expect(indexLoads).toBe(1);
    expect(corpusLoads).toBe(1);
  }, 30_000);

  test('selects readable code, scoped blocks and article summaries after document recall', async () => {
    requireCodec();
    const artifacts = await buildKnowledgeArtifacts(resolve(import.meta.dirname, '../docs'));
    const runtime = createKnowledgeSearchRuntime({
      loadIndex: async () => artifacts.index,
      loadCorpus: async () => artifacts.corpus,
    });
    const code = await runtime.search('解释React代码示例');
    expect(code.results.some((block) => block.kind === 'code' &&
      block.documentId.includes('react') && block.text.trim() && block.language)).toBe(true);
    for (const scope of ['blog', 'columns'] as const) {
      const scoped = await runtime.search('状态', { scope });
      expect(scoped.results.length).toBeGreaterThan(0);
      expect(scoped.results.every((block) => block.documentId.startsWith(`/${scope}/`))).toBe(true);
    }
    const documentId = '/blog/arkts-page-architecture.html';
    const summary = await runtime.search('总结', { documentId, summary: true, scope: 'article' });
    expect(new Set(summary.results.map((block) => block.sectionTitle)).size).toBeGreaterThanOrEqual(3);
    expect(summary.results.every((block) => block.documentId === documentId)).toBe(true);
  }, 30_000);

  test.each(['legacy', 'document'] as const)(
    'keeps tags/description searchable and prefers direct body evidence in %s indexes',
    async (granularity) => {
      const { packKnowledgeIndex } = requireCodec();
      const documentId = '/blog/test.html';
      const metadata = Object.fromEntries(['0', '1'].map((id) => [id, {
        id, documentId, href: documentId, articleTitle: 'rareword', kind: 'paragraph' as const,
        tags: ['uniquetag'], description: 'uniquedescription', publishedAt: '',
        readingMinutes: 1,
      }]));
      const corpus = { version: 1 as const, blocks: {
        0: { text: 'unrelated introduction', codeTerms: [] },
        1: { text: 'rareword direct body evidence', codeTerms: [] },
      } };
      const search = new MiniSearch<KnowledgeSearchDocument>(getKnowledgeMiniSearchOptions());
      search.addAll(granularity === 'document' ? [{
        id: documentId, title: 'rareword', section: '', tags: 'uniquetag',
        description: 'uniquedescription', text: 'unrelated introduction rareword direct body evidence', code: '',
      }] : [{
        id: '0', title: 'rareword', section: '', tags: 'uniquetag',
        description: 'uniquedescription', text: 'unrelated introduction', code: '',
      }, {
        id: '1', title: '', section: '', tags: '', description: '',
        text: 'rareword direct body evidence', code: '',
      }]);
      const artifact: KnowledgeIndexArtifact = {
        version: 1, metadata, index: packKnowledgeIndex(search.toJSON()),
        ...(granularity === 'document' ? { granularity } : {}),
      };
      const runtime = createKnowledgeSearchRuntime({
        loadIndex: async () => artifact, loadCorpus: async () => corpus,
      });
      for (const query of ['uniquetag', 'uniquedescription']) {
        expect((await runtime.search(query)).results.length, query).toBeGreaterThan(0);
      }
      if (granularity === 'document') expect((await runtime.search('rareword')).results[0].id).toBe('1');
    },
  );
});
