import type { Options } from 'minisearch';
import type { SerializedKnowledgeIndex } from './knowledge-index-codec';

export type KnowledgeBlockKind = 'summary' | 'paragraph' | 'list' | 'blockquote' | 'code' | 'table';

export interface KnowledgeBlock {
  anchor?: string;
  articleTitle: string;
  codeTerms: string[];
  column?: string;
  description?: string;
  documentId: string;
  href: string;
  id: string;
  kind: KnowledgeBlockKind;
  language?: string;
  publishedAt: string;
  readingMinutes: number;
  sectionTitle?: string;
  seriesOrder?: number;
  tags: string[];
  text: string;
}

export type KnowledgeBlockMetadata = Omit<KnowledgeBlock, 'codeTerms' | 'text' | 'language'>;
export type KnowledgeBlockContent = Pick<KnowledgeBlock, 'codeTerms' | 'text' | 'language'>;

export interface KnowledgeIndexArtifact {
  contentVersion?: string;
  granularity?: 'document';
  index: SerializedKnowledgeIndex;
  metadata: Record<string, KnowledgeBlockMetadata>;
  packed?: {
    encoding: 'gzip-columns-v1';
    data: string;
  };
  version: 1;
}

export interface KnowledgeCorpusArtifact {
  contentVersion?: string;
  blocks: Record<string, KnowledgeBlockContent>;
  version: 1;
}

export interface KnowledgeSearchDocument {
  code: string;
  description: string;
  id: string;
  section: string;
  tags: string;
  text: string;
  title: string;
}

const LATIN_OR_NUMBER = /[a-z0-9][a-z0-9._+#-]*/giu;
const CJK_SEQUENCE = /[\p{Script=Han}]+/gu;

export function normalizeKnowledgeTerm(term: string): string | null {
  const normalized = term.trim().toLocaleLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function tokenizeKnowledgeText(text: string): string[] {
  const normalized = text.normalize('NFKC').toLocaleLowerCase();
  const tokens: string[] = [...(normalized.match(LATIN_OR_NUMBER) ?? [])];

  for (const sequence of normalized.match(CJK_SEQUENCE) ?? []) {
    if (sequence.length === 1) {
      tokens.push(sequence);
      continue;
    }

    for (let index = 0; index < sequence.length - 1; index += 1) {
      tokens.push(sequence.slice(index, index + 2));
    }
  }

  return [...new Set(tokens)];
}

export function getKnowledgeMiniSearchOptions(): Options<KnowledgeSearchDocument> {
  return {
    fields: ['title', 'section', 'tags', 'description', 'text', 'code'],
    idField: 'id',
    processTerm: normalizeKnowledgeTerm,
    tokenize: tokenizeKnowledgeText,
  };
}
