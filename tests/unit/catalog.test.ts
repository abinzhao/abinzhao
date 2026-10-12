import { describe, expect, it } from "vitest";
import { buildCatalog } from "../../docs/.vitepress/content/catalog";

const meta = {
  title: "第一课", description: "理解版本模型", type: "tutorial",
  topic: "git", section: "foundation", order: 10, level: "beginner",
  status: "published", tags: ["Git"], prerequisites: [], comments: true,
};

describe("tutorial catalog", () => {
  it("excludes drafts and strips full text from client data", () => {
    const catalog = buildCatalog([
      { url: "/tutorials/git-basics.html", frontmatter: meta, src: "private full text" },
      { url: "/tutorials/draft.html", frontmatter: { ...meta, status: "draft" } },
      { url: "/tutorials/", frontmatter: { title: "教程" } },
    ]);
    expect(catalog).toEqual([{
      title: "第一课", description: "理解版本模型", topic: "git",
      section: "foundation", order: 10, level: "beginner",
      url: "/tutorials/git-basics.html",
    }]);
  });

  it("rejects ambiguous chapter order in the same learning path", () => {
    expect(() => buildCatalog([
      { url: "/tutorials/git-basics.html", frontmatter: meta },
      { url: "/tutorials/git/workflow.html", frontmatter: meta },
    ])).toThrow("Duplicate tutorial order");
  });

  it("rejects a published chapter missing from the learning paths", () => {
    expect(() => buildCatalog([
      { url: "/tutorials/unlisted.html", frontmatter: meta },
    ])).toThrow("not listed");
  });
});
