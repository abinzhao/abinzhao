type ProjectEntry = {
  slug: string;
  data: { featured: boolean; order: number; year?: number };
};

export const projectCategoryLabels = {
  web: "Web",
  backend: "后端",
  harmonyos: "鸿蒙",
  miniprogram: "小程序",
  crossplatform: "跨端",
  experiment: "实验",
} as const;

export type ProjectCategory = keyof typeof projectCategoryLabels;

export function getProjectCategories(
  entries: Array<{
    data: { category: ProjectCategory };
  }>,
) {
  const present = new Set(entries.map(({ data }) => data.category));
  return (Object.keys(projectCategoryLabels) as ProjectCategory[]).filter(
    (category) => present.has(category),
  );
}

export function sortProjects<T extends ProjectEntry>(entries: T[]): T[] {
  return [...entries].sort(
    (a, b) =>
      Number(b.data.featured) - Number(a.data.featured) ||
      b.data.order - a.data.order ||
      (b.data.year ?? 0) - (a.data.year ?? 0) ||
      a.slug.localeCompare(b.slug, "zh-CN"),
  );
}

export function getReadingMinutes(text: string): number {
  const chinese = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const words = (
    text.replace(/[\u3400-\u9fff]/g, " ").match(/[A-Za-z0-9]+/g) ?? []
  ).length;
  return Math.max(1, Math.ceil((chinese + words) / 400));
}

export function getAdjacentEntries<T extends { slug: string }>(
  entries: T[],
  slug: string,
) {
  const index = entries.findIndex((entry) => entry.slug === slug);
  return {
    previous: index > 0 ? entries[index - 1] : undefined,
    next:
      index >= 0 && index < entries.length - 1
        ? entries[index + 1]
        : undefined,
  };
}
