import MiniSearch, { type SearchResult } from 'minisearch';
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
];

function expandKnowledgeQuery(query: string): string {
  const additions = SYNONYMS
    .filter(({ test }) => test.test(query))
    .map(({ terms }) => terms);
  return [...new Set([query, ...additions])].join(' ');
}

async function loadDefaultIndex(): Promise<KnowledgeIndexArtifact> {
  const module = await import('../../data/knowledge-index.data');
  return module.data;
}

async function loadDefaultCorpus(): Promise<KnowledgeCorpusArtifact> {
  const module = await import('../../data/knowledge-corpus.data');
  return module.data;
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
  const candidates = results
    .map((result) => {
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
        matchedTerms: result.terms,
        score: result.score * headingBoost,
      };
    })
    .filter((result): result is KnowledgeSearchResult => result !== undefined)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

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
  loaders: KnowledgeSearchLoaders = {
    loadCorpus: loadDefaultCorpus,
    loadIndex: loadDefaultIndex,
  },
): KnowledgeSearchRuntime {
  let loadState: KnowledgeLoadState = 'idle';
  let artifactPromise: Promise<KnowledgeIndexArtifact> | undefined;
  let corpusPromise: Promise<KnowledgeCorpusArtifact> | undefined;
  let miniSearchPromise: Promise<MiniSearch<KnowledgeSearchDocument>> | undefined;

  const loadIndex = (): Promise<{
    artifact: KnowledgeIndexArtifact;
    miniSearch: MiniSearch<KnowledgeSearchDocument>;
  }> => {
    if (!artifactPromise) {
      loadState = 'loading-index';
      artifactPromise = loaders.loadIndex();
      miniSearchPromise = artifactPromise.then((artifact) =>
        MiniSearch.loadJSON<KnowledgeSearchDocument>(
          JSON.stringify(artifact.index),
          getKnowledgeMiniSearchOptions(),
        ),
      );
    }

    return Promise.all([artifactPromise, miniSearchPromise!]).then(
      ([artifact, miniSearch]) => ({ artifact, miniSearch }),
    );
  };

  const loadCorpus = (): Promise<KnowledgeCorpusArtifact> => {
    if (!corpusPromise) {
      loadState = 'loading-corpus';
      corpusPromise = loaders.loadCorpus();
    }
    return corpusPromise;
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
      if (queryTokens.length === 0) {
        return { expandedQuery: '', query: trimmedQuery, results: [] };
      }

      const expandedQuery = expandKnowledgeQuery(trimmedQuery);

      try {
        const { artifact, miniSearch } = await loadIndex();
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
            if (/^[\p{Script=Han}]+$/u.test(term)) return term.length >= 2 ? 0.5 : false;
            return term.length >= 5 ? 0.2 : false;
          },
          prefix: (term) => /^[a-z0-9]/iu.test(term) && term.length >= 3,
        });
        if (rawResults.length === 0) {
          loadState = 'ready';
          return { expandedQuery, query: trimmedQuery, results: [] };
        }

        const corpus = await loadCorpus();
        const results = rerank(rawResults, artifact, corpus, trimmedQuery, options);
        loadState = 'ready';
        return { expandedQuery, query: trimmedQuery, results };
      } catch (error) {
        loadState = 'error';
        throw error;
      }
    },
  };
}
