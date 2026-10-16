import MiniSearch from 'minisearch';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createMarkdownRenderer } from 'vitepress';
import type { MarkdownRenderer } from 'vitepress';
import matter from 'gray-matter';
import { packKnowledgeIndex } from './knowledge-index-codec';
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
  language?: string;
  sectionTitle?: string;
  text: string;
  codeTerms: string[];
}

type MarkdownToken = ReturnType<MarkdownRenderer['parse']>[number];

const artifactCache = new Map<string, { version: string; artifacts: Promise<KnowledgeArtifacts> }>();

function resolveSnippets(source: PublishedArticleSource, contentRoot: string): { markdown: string; paths: string[] } {
  let fence = '';
  const paths: string[] = [];
  const lines = source.markdown.split('\n').map((line) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/u)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = '';
      return line;
    }
    if (fence) return line;
    const imported = line.match(/^<<<\s+([^\s#{]+)/u)?.[1];
    if (!imported) return line;
    const path = resolve(dirname(source.filePath), imported.replace(/^@(?=\/)/u, contentRoot));
    paths.push(path);
    return line.replace(imported, path);
  });
  return { markdown: lines.join('\n'), paths };
}

function contentVersion(sources: PublishedArticleSource[], contentRoot: string): string {
  const hash = createHash('sha256');
  for (const source of [...sources].sort((a, b) => a.article.href.localeCompare(b.article.href))) {
    hash.update(source.article.href).update('\0').update(source.markdown).update('\0');
    for (const path of resolveSnippets(source, contentRoot).paths) hash.update(readFileSync(path)).update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

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
  contentRoot: string,
): KnowledgeBlock[] {
  const env = { path: source.filePath, realPath: source.filePath };
  // VitePress caches one renderer globally; resolve @ against this content root explicitly.
  const { markdown } = resolveSnippets({ ...source, markdown: matter(source.markdown).content }, contentRoot);
  const tokens = renderer.parse(markdown, env);
  // VitePress loads imported snippets in its fence renderer, after Markdown parsing.
  for (const [index, token] of tokens.entries()) {
    if (token.type === 'fence' && 'src' in token && token.src) {
      renderer.renderer.rules.fence?.(tokens, index, renderer.options, env, renderer.renderer);
    }
  }
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
      const rows: string[][] = [];
      for (let rowIndex = index; rowIndex <= grouped.nextIndex; rowIndex += 1) {
        const rowToken = tokens[rowIndex];
        if (rowToken.type === 'tr_open') rows.push([]);
        if (rowToken.type === 'inline') rows.at(-1)?.push(readInlineText(rowToken).replace(/\|/gu, '\\|'));
      }
      if (rows.length) {
        pending.push({
          anchor,
          kind: 'table',
          sectionTitle,
          text: rows.map((row, rowIndex) =>
            `| ${row.join(' | ')} |${rowIndex === 0 ? `\n| ${row.map(() => '---').join(' | ')} |` : ''}`,
          ).join('\n'),
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
        language: token.info.trim().split(/\s/u)[0] || 'text',
        sectionTitle,
        text: token.content.trimEnd(),
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
    ...(block.language ? { language: block.language } : {}),
    publishedAt: source.article.date,
    readingMinutes,
    sectionTitle: block.sectionTitle,
    seriesOrder: source.article.seriesOrder,
    tags: source.article.tags,
    text: block.text,
  }));
}

async function buildFromSources(
  contentRoot: string,
  sources: PublishedArticleSource[],
): Promise<KnowledgeArtifacts> {
  const renderer = await createMarkdownRenderer(contentRoot, { languageAlias: { mjs: 'javascript' } });
  const version = contentVersion(sources, contentRoot);
  const blocks = sources.flatMap((source) => parseArticleBlocks(renderer, source, contentRoot));
  const miniSearch = new MiniSearch<KnowledgeSearchDocument>(getKnowledgeMiniSearchOptions());
  const documents = new Map<string, KnowledgeBlock[]>();
  for (const block of blocks) {
    const documentBlocks = documents.get(block.documentId) ?? [];
    documentBlocks.push(block);
    documents.set(block.documentId, documentBlocks);
  }
  // Recall whole documents; the lazy corpus retains every block for local selection.
  miniSearch.addAll([...documents].map(([id, documentBlocks]) => ({
    id,
    title: documentBlocks[0].articleTitle,
    description: documentBlocks[0].description ?? '',
    tags: documentBlocks[0].tags.join(' '),
    section: [...new Set(documentBlocks.map((block) => block.sectionTitle ?? ''))].join('\n'),
    text: documentBlocks.filter((block) => block.kind !== 'code').map((block) => block.text).join('\n'),
    code: documentBlocks.flatMap((block) => block.codeTerms).join(' '),
  })));

  return {
    blocks,
    corpus: {
      contentVersion: version,
      blocks: Object.fromEntries(
        blocks.map(({ id, text, codeTerms, language }) => [id, { text, codeTerms, ...(language ? { language } : {}) }]),
      ),
      version: 1,
    },
    index: {
      contentVersion: version,
      granularity: 'document',
      index: packKnowledgeIndex(miniSearch.toJSON()),
      metadata: Object.fromEntries(
        blocks.map(({ text: _text, codeTerms: _codeTerms, language: _language, ...metadata }) => [
          metadata.id,
          metadata,
        ]),
      ),
      version: 1,
    },
  };
}

export async function buildKnowledgeArtifacts(contentRoot: string): Promise<KnowledgeArtifacts> {
  return buildFromSources(contentRoot, await loadPublishedArticleSources(contentRoot));
}

export async function getKnowledgeArtifacts(contentRoot: string): Promise<KnowledgeArtifacts> {
  const sources = await loadPublishedArticleSources(contentRoot);
  const version = contentVersion(sources, contentRoot);
  const cached = artifactCache.get(contentRoot);
  if (cached?.version === version) return cached.artifacts;

  const artifacts = buildFromSources(contentRoot, sources);
  artifactCache.set(contentRoot, { version, artifacts });
  void artifacts.catch(() => {
    if (artifactCache.get(contentRoot)?.artifacts === artifacts) artifactCache.delete(contentRoot);
  });
  return artifacts;
}
