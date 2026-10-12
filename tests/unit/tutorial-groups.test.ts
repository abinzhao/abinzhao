import { describe, expect, it } from "vitest";
import { tutorialGroups } from "../../docs/.vitepress/data/tutorials";

describe("tutorialGroups", () => {
  it("covers all sixteen learning paths including browser and Node fullstack", () => {
    const topics = tutorialGroups.flatMap((group) => group.items);

    expect(topics).toHaveLength(16);
    expect(topics.map((topic) => topic.name)).toEqual([
      "Git",
      "Shell",
      "HTML",
      "CSS",
      "JavaScript",
      "TypeScript",
      "React",
      "Vue",
      "Node.js",
      "浏览器",
      "浏览器与插件",
      "现代前端工程化",
      "Node.js 全栈",
      "AI Agent",
      "Rust",
      "Python",
    ]);
  });

  it("uses unique stable links for every topic", () => {
    const links = tutorialGroups.flatMap((group) =>
      group.items.map((topic) => topic.link),
    );

    expect(new Set(links).size).toBe(links.length);
    expect(links.every((link) => link.startsWith("/tutorials/"))).toBe(true);
    expect(links.every((link) => link.endsWith(".html"))).toBe(true);
  });

  it("provides foundations, practice and advanced chapters plus an integrated fullstack example", () => {
    const chapters = tutorialGroups.flatMap((group) =>
      group.items.flatMap((topic) => topic.chapters),
    );
    expect(chapters).toHaveLength(49);
    expect(new Set(chapters.map((chapter) => chapter.link)).size).toBe(49);
  });
});
