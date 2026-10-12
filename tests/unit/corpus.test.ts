import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { tutorialGroups } from "../../docs/.vitepress/data/tutorials";

describe("published tutorial corpus", () => {
  it("has exactly one real Markdown page for each chapter in the navigation", () => {
    const root = resolve("docs/tutorials");
    const actual = readdirSync(root, { recursive: true })
      .filter((path) => typeof path === "string" && path.endsWith(".md") && path !== "index.md")
      .map((path) => `/tutorials/${String(path).replace(/\.md$/, ".html")}`);
    const expected = tutorialGroups.flatMap((group) =>
      group.items.flatMap((topic) => topic.chapters.map((chapter) => chapter.link)),
    );
    expect(actual.sort()).toEqual(expected.sort());
  });

  it("provides substantive explanations, executable examples and references for every path", () => {
    for (const group of tutorialGroups) {
      for (const topic of group.items) {
        for (const chapter of topic.chapters) {
          const path = resolve("docs", chapter.link.slice(1).replace(/\.html$/, ".md"));
          const text = readFileSync(path, "utf8").replace(/^---[\s\S]*?---/, "");
          const name = relative(process.cwd(), path);
          expect(text.length, name).toBeGreaterThan(3500);
          expect((text.match(/^## /gm) ?? []).length, name).toBeGreaterThanOrEqual(4);
          expect(text, name).toMatch(/```(?:bash|sh|js|javascript|ts|typescript|html|css|vue|rust|python|sql|json)/);
          expect(text, name).toMatch(/\]\(https:\/\//);
          expect(text, name).toMatch(/验证|验收|预期/);
        }
      }
    }
  });
});
