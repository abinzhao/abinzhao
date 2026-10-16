import type { AsPlainObject } from 'minisearch';

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
