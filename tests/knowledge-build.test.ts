import MiniSearch from 'minisearch';
import { resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { beforeAll, describe, expect, test } from 'vitest';
import { buildKnowledgeArtifacts } from '../docs/.vitepress/data/knowledge-build';
import {
  getKnowledgeMiniSearchOptions,
  type KnowledgeBlockMetadata,
  type KnowledgeIndexArtifact,
} from '../docs/.vitepress/data/knowledge';
import { createKnowledgeSearchRuntime } from '../docs/.vitepress/theme/composables/knowledge-search';

type Codec = typeof import('../docs/.vitepress/data/knowledge-index-codec');
let codec: Codec;

function fixture(): KnowledgeIndexArtifact {
  const search = new MiniSearch(getKnowledgeMiniSearchOptions());
  search.addAll([
    { id: 'first', title: 'Harness', section: '状态', tags: 'TypeScript', description: '', text: 'agent agent 中文', code: 'AgentHarness' },
    { id: 'second', title: '中文', section: '', tags: '', description: '', text: 'durable 😀', code: 'constructor' },
  ]);
  const documentId = '/columns/harness/one.html';
  const base = { documentId, articleTitle: 'Harness 😀', tags: ['TypeScript', '状态'], publishedAt: '', readingMinutes: 4 };
  const metadata: Record<string, KnowledgeBlockMetadata> = Object.fromEntries([
    [`${documentId}::状态::paragraph::0`, {
      ...base, anchor: '状态', sectionTitle: '状态', kind: 'paragraph', id: `${documentId}::状态::paragraph::0`, href: `${documentId}#状态`,
    }],
    ['__proto__', {
      ...base, anchor: '', sectionTitle: '', column: '', description: '', seriesOrder: 0,
      kind: 'code', id: 'custom::code::007', href: '/custom#', documentId: '/custom',
    }],
    [`${documentId}::状态::table::2`, {
      ...base, anchor: '状态', sectionTitle: '状态', kind: 'table', id: `${documentId}::状态::table::2`, href: `${documentId}#状态`,
    }],
    ['constructor', {
      ...base, kind: 'summary', id: 'constructor', href: documentId,
    }],
  ]);
  return { version: 1, granularity: 'document', contentVersion: 'fixture', index: search.toJSON(), metadata };
}

function requireArtifactCodec(): Codec {
  expect(codec.packKnowledgeArtifact).toBeTypeOf('function');
  expect(codec.unpackKnowledgeArtifact).toBeTypeOf('function');
  return codec;
}

function damageMetadata(wire: KnowledgeIndexArtifact, mutate: (metadata: any) => void): KnowledgeIndexArtifact {
  const payload = gunzipSync(Buffer.from(wire.packed!.data, 'base64'));
  let offset = 0;
  const readUint = (): number => {
    let value = 0;
    let factor = 1;
    while (true) {
      const byte = payload[offset++];
      value += byte % 128 * factor;
      if (byte < 128) return value;
      factor *= 128;
    }
  };
  const count = readUint();
  const lengths = Array.from({ length: 12 }, readUint);
  const start = payload.length - lengths[11];
  const metadata = JSON.parse(payload.subarray(start).toString());
  mutate(metadata);
  const bytes = Buffer.from(JSON.stringify(metadata));
  lengths[11] = bytes.length;
  const header: number[] = [];
  for (let value of [count, ...lengths]) {
    while (value >= 128) { header.push(value % 128 + 128); value = Math.floor(value / 128); }
    header.push(value);
  }
  return { ...wire, packed: {
    ...wire.packed!,
    data: gzipSync(Buffer.concat([Buffer.from(header), payload.subarray(offset, start), bytes])).toString('base64'),
  } };
}

describe('compact knowledge artifact', () => {
  beforeAll(async () => { codec = await import('../docs/.vitepress/data/knowledge-index-codec'); });

  test('retains direct metadata access and exactly restores serialized metadata and MiniSearch headers', async () => {
    const { packKnowledgeArtifact, unpackKnowledgeArtifact } = requireArtifactCodec();
    const original = fixture();
    const snapshot = JSON.stringify(original);
    const packed = await packKnowledgeArtifact(original);
    expect(packed.metadata).toEqual(original.metadata);
    expect(Object.keys(packed.metadata)).toEqual(Object.keys(original.metadata));
    expect(packed.index).toEqual(original.index);
    const wire = JSON.parse(JSON.stringify(packed));
    expect(wire.packed.encoding).toBe('gzip-columns-v1');
    expect(wire.metadata).toEqual({});
    expect(wire.index.index).toEqual([]);
    const restored = await unpackKnowledgeArtifact(wire);
    expect(restored).toEqual(original);
    expect(Object.keys(restored.metadata)).toEqual(Object.keys(original.metadata));
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(await unpackKnowledgeArtifact(original)).toBe(original);
  });

  test('preserves every term result, frequency, order and fuzzy ranking', async () => {
    const { packKnowledgeArtifact, unpackKnowledgeArtifact } = requireArtifactCodec();
    const original = fixture();
    const raw = codec.unpackKnowledgeIndex(original.index);
    raw.index.push(['large', { 0: { [2 ** 48 + 5]: 300, [Number.MAX_SAFE_INTEGER]: 2 ** 40 } }]);
    original.index = raw;
    const restored = await unpackKnowledgeArtifact(JSON.parse(JSON.stringify(await packKnowledgeArtifact(original))));
    expect(restored.index).toEqual(original.index);
    raw.index.pop();
    const before = MiniSearch.loadJSON(JSON.stringify(raw), getKnowledgeMiniSearchOptions());
    const decoded = codec.unpackKnowledgeIndex(restored.index);
    decoded.index.pop();
    const after = MiniSearch.loadJSON(JSON.stringify(decoded), getKnowledgeMiniSearchOptions());
    for (const query of [...raw.index.map(([term]) => term), 'agent durable', 'harnes', '中']) {
      for (const options of [{}, { fuzzy: 0.2, prefix: true }]) {
        expect(after.search(query, options), query).toEqual(before.search(query, options));
      }
    }
  });

  test('can repack a JSON wire artifact without discarding its index or metadata', async () => {
    const { packKnowledgeArtifact, unpackKnowledgeArtifact } = requireArtifactCodec();
    const original = fixture();
    const wire = JSON.parse(JSON.stringify(await packKnowledgeArtifact(original)));
    const repacked = await packKnowledgeArtifact(wire);
    expect(await unpackKnowledgeArtifact(JSON.parse(JSON.stringify(repacked)))).toEqual(original);
  });

  test('round-trips empty indexes, empty fields and UTF-16 term boundaries', async () => {
    const { packKnowledgeArtifact, unpackKnowledgeArtifact } = requireArtifactCodec();
    const artifact = fixture();
    artifact.metadata = {};
    const raw = new MiniSearch(getKnowledgeMiniSearchOptions()).toJSON();
    for (const index of [[], [['', {}], ['😀', { 0: {} }], ['😁', { 1: {} }]]] as typeof raw.index[]) {
      artifact.index = { ...raw, index };
      expect(await unpackKnowledgeArtifact(JSON.parse(JSON.stringify(await packKnowledgeArtifact(artifact)))))
        .toEqual(artifact);
    }
  });

  test('rejects truncated, corrupt and unsupported compressed artifacts', async () => {
    const { packKnowledgeArtifact, unpackKnowledgeArtifact } = requireArtifactCodec();
    const wire = JSON.parse(JSON.stringify(await packKnowledgeArtifact(fixture())));
    const bytes = Buffer.from(wire.packed.data, 'base64');
    for (let length = 0; length < bytes.length; length += 1) {
      await expect(unpackKnowledgeArtifact({
        ...wire, packed: { ...wire.packed, data: bytes.subarray(0, length).toString('base64') },
      }), `truncated gzip at ${length}`).rejects.toThrow(/knowledge artifact/iu);
    }
    const damaged = Buffer.from(bytes);
    damaged[damaged.length - 8] ^= 1;
    for (const packed of [
      { ...wire.packed, encoding: 'future-v2' },
      { ...wire.packed, data: '!base64!' },
      { ...wire.packed, data: damaged.toString('base64') },
      { ...wire.packed, data: gzipSync(Buffer.concat([gunzipSync(bytes), Buffer.from([0])])).toString('base64') },
    ]) {
      await expect(unpackKnowledgeArtifact({ ...wire, packed })).rejects.toThrow(/knowledge artifact/iu);
    }
  });

  test('rejects unsupported packed headers and malformed metadata identities instead of inventing IDs', async () => {
    const { packKnowledgeArtifact, unpackKnowledgeArtifact } = requireArtifactCodec();
    const wire = JSON.parse(JSON.stringify(await packKnowledgeArtifact(fixture())));
    await expect(unpackKnowledgeArtifact({ ...wire, version: 2 })).rejects.toThrow(/knowledge artifact/iu);
    await expect(unpackKnowledgeArtifact({
      ...wire, index: { ...wire.index, serializationVersion: 1 },
    })).rejects.toThrow(/knowledge artifact/iu);
    for (const mutate of [
      (metadata: any) => { metadata.groups[1][2][0][2].id = null; },
      (metadata: any) => { metadata.groups[0][2][0][0] = 999; },
      (metadata: any) => { metadata.groups[0][1][0][1] = 999; },
      (metadata: any) => { metadata.order = [0, 0, 0, 0]; },
    ]) {
      await expect(unpackKnowledgeArtifact(damageMetadata(wire, mutate))).rejects.toThrow(/knowledge artifact/iu);
    }
  });

  test('keeps the complete real corpus below the unchanged 250 KiB cap with exact metadata', async () => {
    const { unpackKnowledgeArtifact } = requireArtifactCodec();
    const artifacts = await buildKnowledgeArtifacts(resolve(import.meta.dirname, '../docs'));
    const wire = JSON.stringify(artifacts.index);
    expect(gzipSync(wire).byteLength).toBeLessThanOrEqual(250 * 1024);
    const restored = await unpackKnowledgeArtifact(JSON.parse(wire));
    expect(restored.metadata).toEqual(JSON.parse(JSON.stringify(artifacts.index.metadata)));
    expect(codec.unpackKnowledgeIndex(restored.index)).toEqual(codec.unpackKnowledgeIndex(artifacts.index.index));
    const runtime = createKnowledgeSearchRuntime({
      loadIndex: async () => JSON.parse(wire),
      loadCorpus: async () => artifacts.corpus,
    });
    const legacyRuntime = createKnowledgeSearchRuntime({
      loadIndex: async () => artifacts.index,
      loadCorpus: async () => artifacts.corpus,
    });
    for (const [query, options] of [
      ['CSS Grid', {}],
      ['AgentHarness 工具代码', {}],
      ['状态', { scope: 'columns' as const }],
      ['总结', { documentId: '/blog/arkts-page-architecture.html', summary: true, scope: 'article' as const }],
    ] as const) {
      expect(await runtime.search(query, options), query).toEqual(await legacyRuntime.search(query, options));
    }
  }, 30_000);
});
