import GithubSlugger from "github-slugger";
import { toString } from "mdast-util-to-string";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

export type ArticleHeading = {
  id: string;
  text: string;
  level: 2 | 3;
};

export function getArticleTopics(
  articles: Array<{ topic?: string }>,
): string[] {
  return [
    ...new Set(articles.flatMap(({ topic }) => (topic ? [topic] : []))),
  ].sort();
}

export function extractArticleHeadings(source: string): ArticleHeading[] {
  const tree = unified().use(remarkParse).parse(source);
  const slugger = new GithubSlugger();
  const headings: ArticleHeading[] = [];

  /** 复用 rehype-slug 的 slug 算法，保证目录锚点与正文标题一致。 */
  visit(tree, "heading", (node) => {
    if (node.depth !== 2 && node.depth !== 3) {
      return;
    }

    const text = toString(node);

    headings.push({
      id: slugger.slug(text),
      text,
      level: node.depth,
    });
  });

  return headings;
}
