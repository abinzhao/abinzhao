export interface SeriesArticle {
  href: string;
  title: string;
}

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
