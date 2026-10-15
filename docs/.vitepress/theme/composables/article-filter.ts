export interface FilterableArticle {
  category?: string;
  description?: string;
  tags: string[];
  title: string;
}

export interface ArticleFilter {
  category: string;
  query: string;
}

export function filterArticles<T extends FilterableArticle>(
  articles: T[],
  filter: ArticleFilter,
): T[] {
  const query = filter.query.trim().toLocaleLowerCase();

  return articles.filter((article) => {
    const matchesCategory =
      filter.category === '全部' || article.category === filter.category;

    if (!matchesCategory || !query) {
      return matchesCategory;
    }

    return [article.title, article.description ?? '', ...article.tags]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query);
  });
}
