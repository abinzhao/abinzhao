import MiniSearch, { type SearchResult } from 'minisearch';
import { unpackKnowledgeIndex } from '../../data/knowledge-index-codec';
import {
  getKnowledgeMiniSearchOptions,
  tokenizeKnowledgeText,
  type KnowledgeBlockContent,
  type KnowledgeBlockMetadata,
  type KnowledgeCorpusArtifact,
  type KnowledgeIndexArtifact,
  type KnowledgeSearchDocument,
} from '../../data/knowledge';

export type KnowledgeLoadState =
  | 'idle'
  | 'loading-index'
  | 'loading-corpus'
  | 'ready'
  | 'error';

export interface KnowledgeSearchResult extends KnowledgeBlockMetadata, KnowledgeBlockContent {
  contentVersion?: string;
  matchedTerms: string[];
  score: number;
}

export interface KnowledgeSearchResponse {
  expandedQuery: string;
  query: string;
  results: KnowledgeSearchResult[];
}

export interface KnowledgeSearchOptions {
  documentId?: string;
  limit?: number;
  scope?: 'site' | 'blog' | 'columns' | 'article';
  summary?: boolean;
}

export interface KnowledgeSearchLoaders {
  loadCorpus: () => Promise<KnowledgeCorpusArtifact>;
  loadIndex: () => Promise<KnowledgeIndexArtifact>;
}

export interface KnowledgeSearchRuntime {
  readonly loadState: KnowledgeLoadState;
  prepare: () => Promise<void>;
  search: (
    query: string,
    options?: KnowledgeSearchOptions,
  ) => Promise<KnowledgeSearchResponse>;
}

const SYNONYMS: Array<{ terms: string; test: RegExp }> = [
  { test: /弹性布局|flexbox?/iu, terms: 'Flexbox flex 弹性布局' },
  { test: /网格布局|css\s*grid|grid/iu, terms: 'CSS Grid 网格布局 二维布局' },
  { test: /开发者工具|devtools/iu, terms: 'Chrome DevTools 开发者工具 调试' },
  { test: /本地优先|local[-\s]?first/iu, terms: '本地优先 local-first 隐私 离线' },
  { test: /响应式|responsive/iu, terms: '响应式 responsive 媒体查询' },
  { test: /组件化|component/iu, terms: '组件 component 组件化' },
  { test: /泛刑|范型|generics?/iu, terms: '泛型 generics' },
];

function expandKnowledgeQuery(query: string): string {
  const additions = SYNONYMS
    .filter(({ test }) => test.test(query))
    .map(({ terms }) => terms);
  return [...new Set([query, ...additions])].join(' ');
}

function codeQueryTerms(query: string): string[] {
  return tokenizeKnowledgeText(query).filter((term) =>
    /^[a-z]/iu.test(term) && !['code', 'example', 'examples'].includes(term),
  );
}

function termMatchesQuery(term: string, query: string): boolean {
  if (term === query) return true;
  if (query.length >= 3 && term.startsWith(query)) return true;
  if (query.length < 5) return false;
  const budget = Math.round(query.length * 0.2);
  if (Math.abs(term.length - query.length) > budget) return false;
  let previous = Array.from({ length: term.length + 1 }, (_, index) => index);
  for (let row = 1; row <= query.length; row++) {
    const current = [row];
    for (let column = 1; column <= term.length; column++) {
      current[column] = Math.min(
        current[column - 1] + 1, previous[column] + 1,
        previous[column - 1] + Number(query[row - 1] !== term[column - 1]),
      );
    }
    previous = current;
  }
  return previous[term.length] <= budget;
}

function codeTermMatchPriority(term: string, query: string): number {
  // Member/event names such as db.onversionchange remain one searchable identifier.
  const parts = term.split('.');
  if (term === query || parts.includes(query)) return 3;
  if ((query.length >= 5 && term.includes(query)) ||
    (query.length >= 3 && parts.some((part) => part.startsWith(query)))) return 2;
  return Number(parts.some((part) => termMatchesQuery(part, query)));
}

function rerank(
  results: SearchResult[],
  artifact: KnowledgeIndexArtifact,
  corpus: KnowledgeCorpusArtifact,
  query: string,
  options: KnowledgeSearchOptions,
): KnowledgeSearchResult[] {
  const normalizedQuery = query.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, '');
  const queryTerms = new Set(tokenizeKnowledgeText(query));
  const wantsCode = /代码|示例|\bcode\b/iu.test(query);
  const namedTerms = codeQueryTerms(query);
  const codePriority = (result: KnowledgeSearchResult): number => {
    if (!wantsCode || result.kind !== 'code') return 0;
    if (namedTerms.length === 0) return 1;
    // Only the code block itself can establish a code match, including prefix/fuzzy queries.
    const ownTerms = tokenizeKnowledgeText(result.codeTerms.join(' '));
    return Math.max(0, ...ownTerms.map((term) =>
      Math.max(0, ...namedTerms.map((queryTerm) => codeTermMatchPriority(term, queryTerm))),
    ));
  };
  const candidates = results
    .map((result): KnowledgeSearchResult | undefined => {
      const metadata = artifact.metadata[String(result.id)];
      const content = corpus.blocks[String(result.id)];
      if (!metadata || !content) return undefined;
      if (options.documentId && metadata.documentId !== options.documentId) return undefined;

      const headingText = `${metadata.articleTitle}${metadata.sectionTitle ?? ''}`
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/\s+/gu, '');
      const headingTerms = new Set(tokenizeKnowledgeText(headingText));
      const headingMatches = [...queryTerms].filter((term) => headingTerms.has(term)).length;
      const headingCoverage = queryTerms.size > 0 ? headingMatches / queryTerms.size : 0;
      const headingBoost =
        (normalizedQuery.length > 1 && headingText.includes(normalizedQuery) ? 1.35 : 1) *
        (1 + headingCoverage * 1.5);

      return {
        ...metadata,
        ...content,
        contentVersion: corpus.contentVersion,
        matchedTerms: result.terms,
        score: result.score * headingBoost,
      };
    })
    .filter((result): result is KnowledgeSearchResult => result !== undefined)
    // 先选出相关代码，再应用每篇文章的多样性上限，避免摘要占掉代码的名额。
    .sort((left, right) => codePriority(right) - codePriority(left) || right.score - left.score || left.id.localeCompare(right.id));

  const limit = Math.max(1, options.limit ?? 6);
  if (options.documentId) return candidates.slice(0, limit);

  const documentCounts = new Map<string, number>();
  const diverse: KnowledgeSearchResult[] = [];
  for (const candidate of candidates) {
    const count = documentCounts.get(candidate.documentId) ?? 0;
    if (count >= 2) continue;

    diverse.push(candidate);
    documentCounts.set(candidate.documentId, count + 1);
    if (diverse.length >= limit) break;
  }

  return diverse;
}

export function createKnowledgeSearchRuntime(
  loaders: KnowledgeSearchLoaders,
): KnowledgeSearchRuntime {
  let loadState: KnowledgeLoadState = 'idle';
  let artifactPromise: Promise<KnowledgeIndexArtifact> | undefined;
  let corpusPromise: Promise<KnowledgeCorpusArtifact> | undefined;
  let miniSearchPromise: Promise<MiniSearch<KnowledgeSearchDocument>> | undefined;
  const documentBlocks = new Map<string, KnowledgeBlockMetadata[]>();
  const blockTerms = new Map<string, Set<string>>();

  const loadIndex = (): Promise<{
    artifact: KnowledgeIndexArtifact;
    miniSearch: MiniSearch<KnowledgeSearchDocument>;
  }> => {
    if (!artifactPromise) {
      loadState = 'loading-index';
      artifactPromise = loaders.loadIndex();
      miniSearchPromise = artifactPromise.then((artifact) => {
        documentBlocks.clear();
        blockTerms.clear();
        for (const block of Object.values(artifact.metadata)) {
          const blocks = documentBlocks.get(block.documentId) ?? [];
          blocks.push(block);
          documentBlocks.set(block.documentId, blocks);
        }
        return MiniSearch.loadJSON<KnowledgeSearchDocument>(
          JSON.stringify(unpackKnowledgeIndex(artifact.index)),
          getKnowledgeMiniSearchOptions(),
        );
      });
    }

    const loadingArtifact = artifactPromise;
    return Promise.all([loadingArtifact, miniSearchPromise!]).then(
      ([artifact, miniSearch]) => ({ artifact, miniSearch }),
    ).catch((error) => {
      if (artifactPromise === loadingArtifact) {
        artifactPromise = undefined;
        miniSearchPromise = undefined;
      }
      throw error;
    });
  };

  const loadCorpus = (): Promise<KnowledgeCorpusArtifact> => {
    if (!corpusPromise) {
      loadState = 'loading-corpus';
      corpusPromise = loaders.loadCorpus().catch((error) => {
        corpusPromise = undefined;
        throw error;
      });
    }
    return corpusPromise;
  };

  const selectBlocks = (
    documents: SearchResult[],
    corpus: KnowledgeCorpusArtifact,
    limit: number,
    query: string,
  ): SearchResult[] => {
    const selected = documents.slice(0, Math.max(6, limit));
    const selectedIds = new Set(selected.map((document) => String(document.id)));
    const namedTerms = codeQueryTerms(query);
    if (/代码|示例|\bcode\b/iu.test(query) && namedTerms.length) {
      for (const document of documents) {
        if (selectedIds.has(String(document.id))) continue;
        const codeMatch = (documentBlocks.get(String(document.id)) ?? []).some((block) =>
          block.kind === 'code' && corpus.blocks[block.id]?.codeTerms.some((identifier) =>
            namedTerms.some((queryTerm) => codeTermMatchPriority(identifier.toLocaleLowerCase(), queryTerm) > 0),
          ),
        );
        if (codeMatch) selected.push(document);
      }
    }
    return selected.flatMap((document) => {
      const blocks = documentBlocks.get(String(document.id)) ?? [];
      const firstBlock = blocks[0];
      const shared = new Set(tokenizeKnowledgeText([
        firstBlock?.articleTitle ?? '', firstBlock?.description ?? '', firstBlock?.tags.join(' ') ?? '',
      ].join(' ')));
      const sharedMatches = document.terms.filter((term) => shared.has(term));
      return blocks.flatMap((block): SearchResult[] => {
        const body = corpus.blocks[block.id];
        if (!body) return [];
        let terms = blockTerms.get(block.id);
        if (!terms) {
          terms = new Set(tokenizeKnowledgeText([
            block.sectionTitle ?? '', body.text, body.codeTerms.join(' '),
          ].join(' ')));
          blockTerms.set(block.id, terms);
        }
        const directMatches = document.terms.filter((term) => terms.has(term));
        if (block.kind === 'code') {
          for (const identifier of tokenizeKnowledgeText(body.codeTerms.join(' '))) {
            if (namedTerms.some((queryTerm) => codeTermMatchPriority(identifier, queryTerm) > 0)) directMatches.push(identifier);
          }
        }
        // Shared titles/tags can rank prose; a code block needs its own matching evidence.
        const ownMatches = [...new Set(directMatches)];
        const matched = block.kind === 'code' ? ownMatches : [...new Set([...ownMatches, ...sharedMatches])];
        if (matched.length === 0) return [];
        const coverage = matched.length / Math.max(1, document.terms.length);
        const directCoverage = ownMatches.length / Math.max(1, document.terms.length);
        return [{
          ...document,
          id: block.id,
          terms: matched,
          score: document.score * (0.5 + coverage + directCoverage),
        }];
      });
    });
  };

  return {
    get loadState() {
      return loadState;
    },
    async prepare() {
      try {
        await loadIndex();
        loadState = 'ready';
      } catch (error) {
        loadState = 'error';
        throw error;
      }
    },
    async search(query, options = {}) {
      const trimmedQuery = query.trim();
      const queryTokens = tokenizeKnowledgeText(trimmedQuery);
      if (queryTokens.length === 0 && !options.summary) {
        return { expandedQuery: '', query: trimmedQuery, results: [] };
      }

      const expandedQuery = expandKnowledgeQuery(trimmedQuery);

      try {
        const { artifact, miniSearch } = await loadIndex();
        if (options.summary && options.documentId) {
          const corpus = await loadCorpus();
          const sections = new Set<string>();
          const results = Object.values(artifact.metadata)
            .filter((block) => block.documentId === options.documentId && block.kind !== 'code')
            .flatMap((block): KnowledgeSearchResult[] => {
              const section = block.sectionTitle ?? block.articleTitle;
              const body = corpus.blocks[block.id];
              if (!body?.text.trim() || sections.has(section)) return [];
              sections.add(section);
              return [{ ...block, ...body, contentVersion: corpus.contentVersion, score: 100, matchedTerms: queryTokens }];
            }).slice(0, options.limit ?? 8);
          loadState = 'ready';
          return { expandedQuery, query: trimmedQuery, results };
        }
        const rawResults = miniSearch.search(expandedQuery, {
          boost: {
            title: 8,
            section: 6,
            tags: 5,
            description: 3,
            text: 1,
            code: 0.25,
          },
          fuzzy: (term) => {
            // 汉字二元组的50%模糊匹配会把问候等短问扩大为无关命中。
            if (/^[\p{Script=Han}]+$/u.test(term)) return false;
            return term.length >= 5 ? 0.2 : false;
          },
          prefix: (term) => /^[a-z0-9]/iu.test(term) && term.length >= 3,
          filter: (result) => {
            const documentId = artifact.granularity === 'document'
              ? String(result.id)
              : artifact.metadata[String(result.id)]?.documentId;
            if (!documentId) return false;
            if (options.documentId && documentId !== options.documentId) return false;
            if (options.scope === 'article' && !options.documentId) return false;
            if (options.scope === 'blog') return documentId.startsWith('/blog/');
            if (options.scope === 'columns') return documentId.startsWith('/columns/');
            return true;
          },
        });
        if (rawResults.length === 0) {
          loadState = 'ready';
          return { expandedQuery, query: trimmedQuery, results: [] };
        }

        const corpus = await loadCorpus();
        const blockResults = artifact.granularity === 'document'
          ? selectBlocks(rawResults, corpus, options.limit ?? 6, trimmedQuery)
          : rawResults;
        const results = rerank(blockResults, artifact, corpus, trimmedQuery, options);
        loadState = 'ready';
        return { expandedQuery, query: trimmedQuery, results };
      } catch (error) {
        loadState = 'error';
        throw error;
      }
    },
  };
}
