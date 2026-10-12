import { tutorialGroups } from "../data/tutorials";
import { validateTutorialMeta, type TutorialLevel } from "./tutorial-meta";

export interface TutorialSummary {
  title: string;
  description: string;
  topic: string;
  section: string;
  order: number;
  level: TutorialLevel;
  url: string;
}

interface SourcePage {
  url: string;
  frontmatter: Record<string, unknown>;
  src?: string;
}

export function buildCatalog(pages: SourcePage[]): TutorialSummary[] {
  const orders = new Set<string>();
  const listed = new Set(tutorialGroups.flatMap((group) =>
    group.items.flatMap((topic) => topic.chapters.map((chapter) => chapter.link)),
  ));
  return pages
    .filter((page) => page.frontmatter.type === "tutorial")
    .map((page) => ({ url: page.url, meta: validateTutorialMeta(page.frontmatter) }))
    .filter((page) => page.meta.status === "published")
    .map(({ url, meta }) => {
      const key = `${meta.topic}:${meta.order}`;
      if (orders.has(key)) throw new Error(`Duplicate tutorial order: ${key}`);
      orders.add(key);
      if (!listed.has(url)) throw new Error(`Tutorial ${url} is not listed in a learning path`);
      return {
        title: meta.title, description: meta.description, topic: meta.topic,
        section: meta.section, order: meta.order, level: meta.level, url,
      };
    })
    .sort((a, b) => a.order - b.order || a.topic.localeCompare(b.topic));
}
