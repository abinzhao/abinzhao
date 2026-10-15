export interface ArticleOutlineSource {
  id: string;
  level: number;
  title: string;
}

export interface ArticleOutlineItem {
  level: number;
  link: string;
  title: string;
}

export function createArticleOutline(
  headings: ArticleOutlineSource[],
): ArticleOutlineItem[] {
  return headings
    .filter((heading) => Boolean(heading.id))
    .map((heading) => ({
      level: heading.level,
      link: `#${heading.id}`,
      title: heading.title,
    }));
}
