import MiniSearch from 'minisearch';
import { createMarkdownRenderer } from 'vitepress';
import type { MarkdownRenderer } from 'vitepress';
import {
  loadPublishedArticleSources,
  type Article,
  type PublishedArticleSource,
} from './content';
import {
  getKnowledgeMiniSearchOptions,
  type KnowledgeBlock,
  type KnowledgeBlockKind,
  type KnowledgeCorpusArtifact,
  type KnowledgeIndexArtifact,
  type KnowledgeSearchDocument,
} from './knowledge';

export interface KnowledgeArtifacts {
  blocks: KnowledgeBlock[];
  corpus: KnowledgeCorpusArtifact;
  index: KnowledgeIndexArtifact;
}

interface PendingBlock {
  anchor?: string;
  kind: KnowledgeBlockKind;
  sectionTitle?: string;
  text: string;
  codeTerms: string[];
}

type MarkdownToken = ReturnType<MarkdownRenderer['parse']>[number];

const artifactCache = new Map<string, Promise<KnowledgeArtifacts>>();

function normalizeVisibleText(text: string): string {
  return text
    .replace(/\s+/gu, ' ')
    .replace(/\s+([，。！？：；、,.!?;:])/gu, '$1')
    .trim();
}

function readInlineText(token: MarkdownToken | undefined): string {
  if (!token?.children) return '';

  return normalizeVisibleText(
    token.children
      .filter((child) => child.type === 'text' || child.type === 'code_inline')
      .map((child) => child.content)
      .join(' '),
  );
}

function readGroupedInlineText(tokens: MarkdownToken[], start: number, closeType: string): {
  nextIndex: number;
  text: string;
} {
  const lines: string[] = [];
  let depth = 0;

  for (let index = start; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.nesting === 1) depth += 1;
    if (token.type === 'inline') {
      const text = readInlineText(token);
      if (text) lines.push(text);
    }
    if (token.nesting === -1) depth -= 1;
    if (token.type === closeType && depth === 0) {
      return { nextIndex: index, text: lines.join('\n') };
    }
  }

  return { nextIndex: start, text: lines.join('\n') };
}

function extractCodeTerms(source: string): string[] {
  const terms = source.match(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/gu) ?? [];
  return [...new Set(terms.filter((term) => term.length > 2))];
}

function estimateReadingMinutes(blocks: PendingBlock[]): number {
  const prose = blocks
    .filter((block) => block.kind !== 'code')
    .map((block) => block.text)
    .join(' ');
  const chineseCharacters = prose.match(/[\p{Script=Han}]/gu)?.length ?? 0;
  const latinWords = prose.match(/[A-Za-z0-9][A-Za-z0-9'-]*/gu)?.length ?? 0;

  return Math.max(1, Math.ceil(chineseCharacters / 400 + latinWords / 200));
}

function createBlockId(article: Article, block: PendingBlock, index: number): string {
  const location = block.anchor ?? 'article';
  return `${article.href}::${location}::${block.kind}::${index}`;
}

function parseArticleBlocks(
  renderer: MarkdownRenderer,
  source: PublishedArticleSource,
): KnowledgeBlock[] {
  const tokens = renderer.parse(source.markdown, {});
  const pending: PendingBlock[] = [];
  let sectionTitle: string | undefined;
  let anchor: string | undefined;

  if (source.article.description) {
    pending.push({
      kind: 'summary',
      text: source.article.description,
      codeTerms: [],
    });
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type === 'heading_open') {
      const title = readInlineText(tokens[index + 1]);
      const isDuplicateArticleTitle = token.tag === 'h1' && title === source.article.title;

      if (!isDuplicateArticleTitle) {
        sectionTitle = title || undefined;
        anchor = token.attrGet('id') ?? undefined;
      }

      index += 2;
      continue;
    }

    if (token.type === 'paragraph_open' && token.level === 0) {
      const text = readInlineText(tokens[index + 1]);
      if (text) {
        pending.push({ anchor, kind: 'paragraph', sectionTitle, text, codeTerms: [] });
      }
      index += 2;
      continue;
    }

    if (
      token.level === 0 &&
      (token.type === 'bullet_list_open' || token.type === 'ordered_list_open')
    ) {
      const closeType = token.type.replace('_open', '_close');
      const grouped = readGroupedInlineText(tokens, index, closeType);
      if (grouped.text) {
        pending.push({
          anchor,
          kind: 'list',
          sectionTitle,
          text: grouped.text,
          codeTerms: [],
        });
      }
      index = grouped.nextIndex;
      continue;
    }

    if (token.type === 'blockquote_open' && token.level === 0) {
      const grouped = readGroupedInlineText(tokens, index, 'blockquote_close');
      if (grouped.text) {
        pending.push({
          anchor,
          kind: 'blockquote',
          sectionTitle,
          text: grouped.text,
          codeTerms: [],
        });
      }
      index = grouped.nextIndex;
      continue;
    }

    if (token.type === 'table_open' && token.level === 0) {
      const grouped = readGroupedInlineText(tokens, index, 'table_close');
      if (grouped.text) {
        pending.push({
          anchor,
          kind: 'list',
          sectionTitle,
          text: grouped.text,
          codeTerms: [],
        });
      }
      index = grouped.nextIndex;
      continue;
    }

    if ((token.type === 'fence' || token.type === 'code_block') && token.level === 0) {
      pending.push({
        anchor,
        kind: 'code',
        sectionTitle,
        text: '',
        codeTerms: extractCodeTerms(token.content),
      });
    }
  }

  const readingMinutes = estimateReadingMinutes(pending);
  return pending.map((block, index) => ({
    anchor: block.anchor,
    articleTitle: source.article.title,
    codeTerms: block.codeTerms,
    column: source.article.column,
    description: source.article.description,
    documentId: source.article.href,
    href: block.anchor ? `${source.article.href}#${block.anchor}` : source.article.href,
    id: createBlockId(source.article, block, index),
    kind: block.kind,
    publishedAt: source.article.date,
    readingMinutes,
    sectionTitle: block.sectionTitle,
    seriesOrder: source.article.seriesOrder,
    tags: source.article.tags,
    text: block.text,
  }));
}

export async function buildKnowledgeArtifacts(contentRoot: string): Promise<KnowledgeArtifacts> {
  const renderer = await createMarkdownRenderer(contentRoot);
  const sources = await loadPublishedArticleSources(contentRoot);
  const blocks = sources.flatMap((source) => parseArticleBlocks(renderer, source));
  const miniSearch = new MiniSearch<KnowledgeSearchDocument>(getKnowledgeMiniSearchOptions());
  const indexedDocuments = new Set<string>();
  const indexedSections = new Set<string>();

  miniSearch.addAll(
    blocks.map((block) => {
      const firstDocumentBlock = !indexedDocuments.has(block.documentId);
      const sectionKey = `${block.documentId}#${block.anchor ?? ''}`;
      const firstSectionBlock = Boolean(block.sectionTitle) && !indexedSections.has(sectionKey);
      indexedDocuments.add(block.documentId);
      if (firstSectionBlock) indexedSections.add(sectionKey);

      return {
        code: block.codeTerms.join(' '),
        description: firstDocumentBlock ? block.description ?? '' : '',
        id: block.id,
        section: firstSectionBlock ? block.sectionTitle ?? '' : '',
        tags: firstDocumentBlock ? block.tags.join(' ') : '',
        text: block.text,
        title: firstDocumentBlock ? block.articleTitle : '',
      };
    }),
  );

  return {
    blocks,
    corpus: {
      blocks: Object.fromEntries(
        blocks.map(({ id, text, codeTerms }) => [id, { text, codeTerms }]),
      ),
      version: 1,
    },
    index: {
      index: miniSearch.toJSON(),
      metadata: Object.fromEntries(
        blocks.map(({ text: _text, codeTerms: _codeTerms, ...metadata }) => [
          metadata.id,
          metadata,
        ]),
      ),
      version: 1,
    },
  };
}

export function getKnowledgeArtifacts(contentRoot: string): Promise<KnowledgeArtifacts> {
  const cached = artifactCache.get(contentRoot);
  if (cached) return cached;

  const artifacts = buildKnowledgeArtifacts(contentRoot);
  artifactCache.set(contentRoot, artifacts);
  return artifacts;
}
