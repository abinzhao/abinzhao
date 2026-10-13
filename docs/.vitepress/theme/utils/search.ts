export interface SearchItem {
  id: string;
  type: string;
  title: string;
  summary: string;
  tags: string[];
  href: string;
}

export function searchContent(
  items: SearchItem[],
  query: string,
): SearchItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (!normalizedQuery) {
    return items;
  }

  return items
    .map((item, index) => {
      const title = item.title.toLocaleLowerCase();
      const summary = item.summary.toLocaleLowerCase();
      const tags = item.tags.map((tag) => tag.toLocaleLowerCase());
      let score = 0;

      if (title.startsWith(normalizedQuery)) score += 100;
      else if (title.includes(normalizedQuery)) score += 60;
      if (tags.some((tag) => tag === normalizedQuery)) score += 40;
      else if (tags.some((tag) => tag.includes(normalizedQuery))) score += 25;
      if (summary.includes(normalizedQuery)) score += 15;

      return { item, index, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
}
