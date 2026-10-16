export interface SeriesArticle {
  href: string;
  title: string;
}

export type ArticleChatAction = 'ask' | 'summary' | 'key-points' | 'learning-path';

export interface ArticleChatContext {
  action: ArticleChatAction;
  articleId?: string;
  valid: boolean;
}

const ARTICLE_CHAT_ACTIONS = new Set<ArticleChatAction>([
  'ask',
  'summary',
  'key-points',
  'learning-path',
]);
const PUBLIC_ARTICLE_HREF = /^\/(?:blog\/[^/?#]+\.html|columns\/[^/?#]+\/[^/?#]+\.html)$/u;

export interface SeriesColumn<TArticle extends SeriesArticle = SeriesArticle> {
  articles: TArticle[];
  href: string;
  slug: string;
  title: string;
}

export function normalizeContentHref(path: string): string {
  const withoutHtml = path.replace(/\.html$/, '');
  const withoutIndex = withoutHtml.replace(/\/index$/, '');
  const contentPath = withoutIndex.match(/\/(?:blog|columns)(?:\/|$).*/)?.[0] ?? withoutIndex;
  const trimmed = contentPath.replace(/^\/+|\/+$/g, '');

  return trimmed ? `/${trimmed}/` : '/';
}

export function getSeriesNavigation<TColumn extends SeriesColumn>(
  columns: TColumn[],
  href: string,
): {
  column: TColumn | undefined;
  next: TColumn['articles'][number] | undefined;
  previous: TColumn['articles'][number] | undefined;
} {
  const normalizedHref = normalizeContentHref(href);
  const column = columns.find((item) =>
    item.articles.some(
      (article) => normalizeContentHref(article.href) === normalizedHref,
    ),
  );

  if (!column) {
    return { column: undefined, next: undefined, previous: undefined };
  }

  const index = column.articles.findIndex(
    (article) => normalizeContentHref(article.href) === normalizedHref,
  );

  return {
    column,
    next: column.articles[index + 1],
    previous: column.articles[index - 1],
  };
}

export function resolveArticlePagination<TArticle extends SeriesArticle>(
  series: {
    column: unknown;
    next: TArticle | undefined;
    previous: TArticle | undefined;
  },
  global: {
    next: TArticle | undefined;
    previous: TArticle | undefined;
  },
): {
  next: TArticle | undefined;
  previous: TArticle | undefined;
} {
  return series.column
    ? { next: series.next, previous: series.previous }
    : global;
}

export function buildArticleChatHref(
  articleHref: string,
  action: ArticleChatAction,
  base = '/',
): string {
  if (!PUBLIC_ARTICLE_HREF.test(articleHref)) {
    throw new Error('文章地址不是可公开使用的站内路径。');
  }

  const normalizedBase = `/${base.replace(/^\/+|\/+$/gu, '')}`;
  const chatPath = `${normalizedBase === '/' ? '' : normalizedBase}/chat/`;
  const params = new URLSearchParams({
    article: articleHref,
    action,
  });

  return `${chatPath}?${params.toString()}`;
}

export function resolveArticleChatContext(
  search: string,
  publishedArticleHrefs: ReadonlySet<string>,
): ArticleChatContext {
  const params = new URLSearchParams(search);
  const articleId = params.get('article');
  const requestedAction = params.get('action');

  if (!articleId && !requestedAction) {
    return { action: 'ask', valid: true };
  }
  if (
    !articleId ||
    !PUBLIC_ARTICLE_HREF.test(articleId) ||
    !publishedArticleHrefs.has(articleId) ||
    !ARTICLE_CHAT_ACTIONS.has(requestedAction as ArticleChatAction)
  ) {
    return { action: 'ask', valid: false };
  }

  return {
    action: requestedAction as ArticleChatAction,
    articleId,
    valid: true,
  };
}
