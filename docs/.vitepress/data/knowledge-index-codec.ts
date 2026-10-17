import type { AsPlainObject } from 'minisearch';
import type { KnowledgeBlockKind, KnowledgeBlockMetadata, KnowledgeIndexArtifact } from './knowledge';

export type PackedKnowledgeIndex = Omit<AsPlainObject, 'index'> & {
  index: {
    encoding: 'varint-postings-v1';
    terms: string[];
    prefixes: number[];
    data: string;
  };
};

export type SerializedKnowledgeIndex = AsPlainObject | PackedKnowledgeIndex;

function invalid(reason: string): never {
  throw new Error(`Invalid knowledge index: ${reason}`);
}

function unsigned(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) invalid('unsigned integer overflow');
  return value;
}

function numericKey(key: string): number {
  const value = unsigned(Number(key));
  if (String(value) !== key) invalid('non-canonical numeric key');
  return value;
}

function writeVarint(bytes: number[], value: number): void {
  unsigned(value);
  while (value >= 128) {
    bytes.push(value % 128 + 128);
    value = Math.floor(value / 128);
  }
  bytes.push(value);
}

export function packKnowledgeIndex(source: AsPlainObject): PackedKnowledgeIndex {
  if (source.serializationVersion !== 2) invalid('unsupported MiniSearch serialization');
  const bytes: number[] = [];
  const terms: string[] = [];
  const prefixes: number[] = [];
  let previousTerm = '';
  for (const [term, fields] of source.index) {
    let prefix = 0;
    while (prefix < Math.min(term.length, previousTerm.length) && term[prefix] === previousTerm[prefix]) prefix += 1;
    prefixes.push(prefix);
    terms.push(term.slice(prefix));
    previousTerm = term;
    const entries = Object.entries(fields);
    writeVarint(bytes, entries.length);
    for (const [field, postings] of entries) {
      writeVarint(bytes, numericKey(field));
      const documents = Object.entries(postings)
        .map(([id, frequency]) => [numericKey(id), frequency] as const)
        .sort(([left], [right]) => left - right);
      writeVarint(bytes, documents.length);
      let previousId = 0;
      for (const [id, frequency] of documents) {
        unsigned(frequency);
        if (frequency === 0) invalid('zero frequency');
        const delta = id - previousId;
        const flag = Number(frequency !== 1);
        // Equivalent to delta * 2 + flag, without overflowing a safe integer.
        bytes.push(delta % 64 * 2 + flag + (delta >= 64 ? 128 : 0));
        if (delta >= 64) writeVarint(bytes, Math.floor(delta / 64));
        if (flag) writeVarint(bytes, frequency);
        previousId = id;
      }
    }
  }

  const data = Uint8Array.from(bytes);
  const chunks: string[] = [];
  for (let offset = 0; offset < data.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...data.subarray(offset, offset + 0x8000)));
  }
  return {
    ...source,
    index: { encoding: 'varint-postings-v1', terms, prefixes, data: btoa(chunks.join('')) },
  };
}

export function unpackKnowledgeIndex(source: SerializedKnowledgeIndex): AsPlainObject {
  if (Array.isArray(source.index)) return source as AsPlainObject;
  const packed = source as PackedKnowledgeIndex;
  if (packed.index.encoding !== 'varint-postings-v1') invalid('unsupported encoding');
  if (packed.serializationVersion !== 2) invalid('unsupported MiniSearch serialization');
  if (packed.index.prefixes.length !== packed.index.terms.length) invalid('truncated term prefixes');
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(packed.index.data), (character) => character.charCodeAt(0));
  } catch {
    invalid('invalid base64');
  }
  let offset = 0;
  const readByte = (): number => {
    if (offset >= bytes.length) invalid('truncated postings');
    return bytes[offset++];
  };
  const readVarint = (): number => {
    let value = 0;
    let factor = 1;
    while (true) {
      const byte = readByte();
      value = unsigned(value + byte % 128 * factor);
      if (byte < 128) return value;
      factor = unsigned(factor * 128);
    }
  };

  // Each term has fieldCount, then fieldID/postingCount and delta/frequency pairs.
  const index: AsPlainObject['index'] = [];
  let previousTerm = '';
  for (const [termIndex, suffix] of packed.index.terms.entries()) {
    const prefix = unsigned(packed.index.prefixes[termIndex]);
    if (prefix > previousTerm.length) invalid('term prefix out of range');
    const term = previousTerm.slice(0, prefix) + suffix;
    previousTerm = term;
    const fields: AsPlainObject['index'][number][1] = {};
    const fieldCount = readVarint();
    for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex += 1) {
      const field = readVarint();
      if (Object.hasOwn(fields, field)) invalid('duplicate field');
      const postings: Record<string, number> = {};
      const postingCount = readVarint();
      let previousId = 0;
      for (let postingIndex = 0; postingIndex < postingCount; postingIndex += 1) {
        const tag = readByte();
        const delta = unsigned(Math.floor(tag % 128 / 2) + (tag >= 128 ? readVarint() * 64 : 0));
        if (postingIndex > 0 && delta === 0) invalid('duplicate document');
        const id = unsigned(previousId + delta);
        const frequency = tag % 2 ? readVarint() : 1;
        if (frequency === 0) invalid('zero frequency');
        postings[id] = frequency;
        previousId = id;
      }
      fields[field] = postings;
    }
    index.push([term, fields]);
  }
  if (offset !== bytes.length) invalid('trailing postings bytes');
  return { ...source, index };
}

const BLOCK_KINDS: KnowledgeBlockKind[] = ['summary', 'paragraph', 'list', 'blockquote', 'code', 'table'];
const COLUMN_ORDER = [0, 3, 4, 1, 2, 5, 6, 7, 8, 9, 10, 11];

function invalidArtifact(reason: string): never {
  throw new Error(`Invalid knowledge artifact: ${reason}`);
}

function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(chunks.join(''));
}

type MetadataSection = [string | null, number, string | null];
type MetadataRow = [number, number, { key: string; id: string; href: string }?];
type MetadataDocument = Omit<KnowledgeBlockMetadata, 'id' | 'href' | 'kind' | 'anchor' | 'sectionTitle'>;
type MetadataGroup = [MetadataDocument, MetadataSection[], MetadataRow[]];
interface CompactMetadata {
  groups: MetadataGroup[];
  order?: number[];
}

function compactMetadata(metadata: KnowledgeIndexArtifact['metadata']): CompactMetadata {
  const groups: MetadataGroup[] = [];
  const documents = new Map<string, number>();
  const sections: Map<string, number>[] = [];
  const order: Array<[number, number]> = [];
  for (const [key, block] of Object.entries(metadata)) {
    const { id, href, kind, anchor, sectionTitle, ...document } = block;
    const documentKey = JSON.stringify(document);
    let groupId = documents.get(documentKey);
    if (groupId === undefined) {
      groupId = groups.length;
      documents.set(documentKey, groupId);
      groups.push([document, [], []]);
      sections.push(new Map());
    }
    const [shared, headings, rows] = groups[groupId];
    const sectionKey = JSON.stringify([sectionTitle, anchor]);
    let sectionId = sections[groupId].get(sectionKey);
    if (sectionId === undefined) {
      sectionId = headings.length;
      sections[groupId].set(sectionKey, sectionId);
      let prefix = 0;
      while (prefix < Math.min(sectionTitle?.length ?? 0, anchor?.length ?? 0) &&
        sectionTitle![prefix] === anchor![prefix]) prefix += 1;
      headings.push([sectionTitle ?? null, prefix, anchor === undefined ? null : anchor.slice(prefix)]);
    }
    const ordinal = rows.length;
    const expectedId = `${shared.documentId}::${anchor ?? 'article'}::${kind}::${ordinal}`;
    const expectedHref = anchor ? `${shared.documentId}#${anchor}` : shared.documentId;
    const row: MetadataRow = [sectionId, BLOCK_KINDS.indexOf(kind)];
    if (row[1] < 0) invalidArtifact('unknown block kind');
    if (key !== expectedId || id !== expectedId || href !== expectedHref) row.push({ key, id, href });
    rows.push(row);
    order.push([groupId, ordinal]);
  }
  const starts: number[] = [];
  let count = 0;
  for (const [, , rows] of groups) {
    starts.push(count);
    count += rows.length;
  }
  const positions = order.map(([groupId, ordinal]) => starts[groupId] + ordinal);
  return {
    groups,
    ...(positions.some((position, index) => position !== index) ? { order: positions } : {}),
  };
}

function restoreMetadata(compact: CompactMetadata): KnowledgeIndexArtifact['metadata'] {
  if (!compact || !Array.isArray(compact.groups)) invalidArtifact('invalid metadata groups');
  const entries: Array<[string, KnowledgeBlockMetadata]> = [];
  for (const [document, sections, rows] of compact.groups) {
    if (!document || typeof document.documentId !== 'string' ||
      !Array.isArray(sections) || !Array.isArray(rows)) invalidArtifact('invalid metadata document');
    for (const [ordinal, row] of rows.entries()) {
      const [sectionId, kindId, custom] = row;
      if (custom !== undefined && (!custom || typeof custom.key !== 'string' ||
        typeof custom.id !== 'string' || typeof custom.href !== 'string')) {
        invalidArtifact('invalid metadata identity');
      }
      if (!Number.isSafeInteger(sectionId) || !sections[sectionId] ||
        !Number.isSafeInteger(kindId) || !BLOCK_KINDS[kindId]) invalidArtifact('invalid metadata reference');
      const [title, prefix, suffix] = sections[sectionId];
      if ((title !== null && typeof title !== 'string') || (suffix !== null && typeof suffix !== 'string') ||
        !Number.isSafeInteger(prefix) || prefix < 0 || prefix > (title?.length ?? 0)) {
        invalidArtifact('invalid metadata section');
      }
      const anchor = suffix === null ? undefined : (title ?? '').slice(0, prefix) + suffix;
      const kind = BLOCK_KINDS[kindId];
      const id = custom?.id ?? `${document.documentId}::${anchor ?? 'article'}::${kind}::${ordinal}`;
      const href = custom?.href ?? (anchor ? `${document.documentId}#${anchor}` : document.documentId);
      const key = custom?.key ?? id;
      if (typeof id !== 'string' || typeof href !== 'string' || typeof key !== 'string') {
        invalidArtifact('invalid metadata identity');
      }
      entries.push([key, {
        ...document, id, href, kind,
        ...(anchor !== undefined ? { anchor } : {}),
        ...(title !== null ? { sectionTitle: title } : {}),
      }]);
    }
  }
  let ordered = entries;
  if (compact.order) {
    if (compact.order.length !== entries.length || new Set(compact.order).size !== entries.length) {
      invalidArtifact('invalid metadata order');
    }
    ordered = compact.order.map((position) => {
      if (!Number.isSafeInteger(position) || !entries[position]) invalidArtifact('invalid metadata order');
      return entries[position];
    });
  }
  if (new Set(ordered.map(([key]) => key)).size !== ordered.length) invalidArtifact('duplicate metadata key');
  return Object.fromEntries(ordered);
}

async function transformGzip(bytes: Uint8Array, compress: boolean): Promise<Uint8Array> {
  const stream = compress ? new CompressionStream('gzip') : new DecompressionStream('gzip');
  const input = new ReadableStream<BufferSource>({
    start(controller) { controller.enqueue(Uint8Array.from(bytes)); controller.close(); },
  });
  return new Uint8Array(await new Response(input.pipeThrough(stream)).arrayBuffer());
}

/**
 * Direct callers retain the old objects; JSON serialization emits only the compact wire data.
 * The build can provide Node's maximum-compression gzip without shipping Node code to browsers.
 */
export async function packKnowledgeArtifact(
  source: KnowledgeIndexArtifact,
  compress: (bytes: Uint8Array) => Promise<Uint8Array> = (bytes) => transformGzip(bytes, true),
): Promise<KnowledgeIndexArtifact> {
  source = await unpackKnowledgeArtifact(source);
  const raw = unpackKnowledgeIndex(source.index);
  // Validate numeric postings using the existing lossless codec.
  const front = packKnowledgeIndex(raw).index;
  const occurrences = new Map<number, number>();
  for (const term of front.terms) {
    for (let index = 0; index < term.length; index += 1) {
      const unit = term.charCodeAt(index);
      occurrences.set(unit, (occurrences.get(unit) ?? 0) + 1);
    }
  }
  const alphabet = [...occurrences].sort((left, right) => right[1] - left[1]).map(([unit]) => unit);
  const alphabetIds = new Map(alphabet.map((unit, index) => [unit, index]));
  // Separate columns let gzip share repeated prefixes, field counts and document deltas.
  const columns: number[][] = Array.from({ length: 12 }, () => []);
  for (const unit of alphabet) columns[0].push(unit % 256, Math.floor(unit / 256));
  for (const [termIndex, suffix] of front.terms.entries()) {
    writeVarint(columns[1], front.prefixes[termIndex]);
    writeVarint(columns[2], suffix.length);
    for (let index = 0; index < suffix.length; index += 1) {
      const unit = alphabetIds.get(suffix.charCodeAt(index))!;
      columns[3].push(unit % 256);
      columns[4].push(Math.floor(unit / 256));
    }
  }
  let postingOrdinal = 0;
  let previousException = 0;
  for (const [, fields] of raw.index) {
    const fieldEntries = Object.entries(fields);
    writeVarint(columns[5], fieldEntries.length);
    for (const [field, postings] of fieldEntries) {
      writeVarint(columns[6], numericKey(field));
      const documents = Object.entries(postings)
        .map(([id, frequency]) => [numericKey(id), frequency] as const)
        .sort(([left], [right]) => left - right);
      writeVarint(columns[7], documents.length);
      let previousId = 0;
      for (const [index, [id, frequency]] of documents.entries()) {
        writeVarint(columns[index === 0 ? 8 : 9], id - previousId);
        if (frequency !== 1) {
          writeVarint(columns[10], postingOrdinal - previousException);
          writeVarint(columns[10], frequency);
          previousException = postingOrdinal;
        }
        postingOrdinal += 1;
        previousId = id;
      }
    }
  }
  columns[11] = [...new TextEncoder().encode(JSON.stringify(compactMetadata(source.metadata)))];
  const header: number[] = [];
  writeVarint(header, raw.index.length);
  for (const column of columns) writeVarint(header, column.length);
  const payload = new Uint8Array(header.length + columns.reduce((length, column) => length + column.length, 0));
  payload.set(header);
  let offset = header.length;
  for (const columnId of COLUMN_ORDER) {
    const column = columns[columnId];
    payload.set(column, offset);
    offset += column.length;
  }
  const { index: _index, ...miniSearchHeader } = raw;
  const { packed: _packed, ...artifactHeader } = source;
  const wire: KnowledgeIndexArtifact = {
    ...artifactHeader,
    index: { ...miniSearchHeader, index: [] },
    metadata: {},
    packed: { encoding: 'gzip-columns-v1', data: encodeBase64(await compress(payload)) },
  };
  const artifact = { ...artifactHeader };
  Object.defineProperty(artifact, 'toJSON', { value: () => wire });
  return artifact;
}

export async function unpackKnowledgeArtifact(source: KnowledgeIndexArtifact): Promise<KnowledgeIndexArtifact> {
  if (!source.packed) return source;
  if (source.packed.encoding !== 'gzip-columns-v1') invalidArtifact('unsupported encoding');
  if (source.version !== 1 || source.index.serializationVersion !== 2) invalidArtifact('unsupported serialization');
  try {
    const encoded = source.packed.data;
    if (typeof encoded !== 'string') invalidArtifact('invalid base64');
    const compressed = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    if (encodeBase64(compressed) !== encoded) invalidArtifact('invalid base64');
    const bytes = await transformGzip(compressed, false);
    const reader = (data: Uint8Array) => {
      let offset = 0;
      return {
        byte(): number {
          if (offset >= data.length) invalidArtifact('truncated column');
          return data[offset++];
        },
        uint(): number {
          let value = 0;
          let factor = 1;
          while (true) {
            const byte = this.byte();
            value = unsigned(value + byte % 128 * factor);
            if (byte < 128) return value;
            factor = unsigned(factor * 128);
          }
        },
        get remaining() { return data.length - offset; },
      };
    };
    const header = reader(bytes);
    const termCount = header.uint();
    const lengths = Array.from({ length: 12 }, () => header.uint());
    let offset = bytes.length - header.remaining;
    const columns: Uint8Array[] = [];
    for (const columnId of COLUMN_ORDER) {
      const length = lengths[columnId];
      if (length > bytes.length - offset) invalidArtifact('truncated payload');
      columns[columnId] = bytes.subarray(offset, offset + length);
      offset += length;
    }
    if (offset !== bytes.length) invalidArtifact('trailing payload bytes');
    if (columns[0].length % 2 || columns[3].length !== columns[4].length) invalidArtifact('invalid term columns');
    const alphabet: number[] = [];
    for (let index = 0; index < columns[0].length; index += 2) {
      alphabet.push(columns[0][index] + columns[0][index + 1] * 256);
    }
    if (new Set(alphabet).size !== alphabet.length) invalidArtifact('duplicate alphabet unit');
    const readers = columns.map(reader);
    const index: AsPlainObject['index'] = [];
    let previousTerm = '';
    let postingOrdinal = 0;
    let nextException = readers[10].remaining ? readers[10].uint() : -1;
    const seenTerms = new Set<string>();
    for (let termIndex = 0; termIndex < termCount; termIndex += 1) {
      const prefix = readers[1].uint();
      const length = readers[2].uint();
      if (prefix > previousTerm.length) invalidArtifact('term prefix out of range');
      let suffix = '';
      for (let character = 0; character < length; character += 1) {
        const unit = readers[3].byte() + readers[4].byte() * 256;
        if (unit >= alphabet.length) invalidArtifact('alphabet reference out of range');
        suffix += String.fromCharCode(alphabet[unit]);
      }
      const term = previousTerm.slice(0, prefix) + suffix;
      if (seenTerms.has(term)) invalidArtifact('duplicate term');
      seenTerms.add(term);
      previousTerm = term;
      const fields: AsPlainObject['index'][number][1] = {};
      const fieldCount = readers[5].uint();
      for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex += 1) {
        const field = readers[6].uint();
        if (Object.hasOwn(fields, field)) invalidArtifact('duplicate field');
        const postings: Record<string, number> = {};
        const count = readers[7].uint();
        let previousId = 0;
        for (let documentIndex = 0; documentIndex < count; documentIndex += 1) {
          const delta = readers[documentIndex === 0 ? 8 : 9].uint();
          if (documentIndex > 0 && delta === 0) invalidArtifact('duplicate document');
          const id = unsigned(previousId + delta);
          let frequency = 1;
          if (postingOrdinal === nextException) {
            frequency = readers[10].uint();
            if (frequency <= 1) invalidArtifact('invalid frequency exception');
            if (readers[10].remaining) {
              const distance = readers[10].uint();
              if (distance === 0) invalidArtifact('duplicate frequency exception');
              nextException = unsigned(nextException + distance);
            } else nextException = -1;
          }
          postings[id] = frequency;
          previousId = id;
          postingOrdinal += 1;
        }
        fields[field] = postings;
      }
      index.push([term, fields]);
    }
    if (nextException !== -1) invalidArtifact('frequency exception out of range');
    for (let column = 1; column <= 10; column += 1) {
      if (readers[column].remaining) invalidArtifact('trailing column bytes');
    }
    const metadata = restoreMetadata(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(columns[11])));
    const { packed: _packed, ...artifact } = source;
    return { ...artifact, index: { ...source.index, index }, metadata };
  } catch (error) {
    invalidArtifact(error instanceof Error ? error.message : 'corrupt payload');
  }
}
