import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getBlogFacets, groupBlogByMonth } from "@/lib/content";

const tagPageSource = readFileSync(
  new URL("../../src/pages/tags/[tag].astro", import.meta.url),
  "utf8",
);

describe("博客展示数据", () => {
  const entries = [
    {
      slug: "older",
      data: {
        date: new Date("2026-07-01"),
        category: "随笔",
        tags: ["生活", "Astro"],
      },
    },
    {
      slug: "newer",
      data: {
        date: new Date("2026-08-11"),
        category: "技术",
        subcategory: "前端",
        tags: ["中文", "Astro"],
      },
    },
    {
      slug: "oldest",
      data: {
        date: new Date("2025-12-20"),
        category: "折腾",
        subcategory: "前端",
        tags: ["代码"],
      },
    },
  ];

  it("按固定顺序生成存在的分类并去重二级分类", () => {
    expect(getBlogFacets(entries)).toEqual({
      categories: ["技术", "随笔", "折腾"],
      subcategories: ["前端"],
      tags: ["代码", "生活", "中文", "Astro"],
    });
  });

  it("按日期倒序生成年月归档并排序组内文章", () => {
    const groups = groupBlogByMonth(entries);

    expect(Object.keys(groups)).toEqual(["2026-08", "2026-07", "2025-12"]);
    expect(Object.values(groups).flat().map(({ slug }) => slug)).toEqual([
      "newer",
      "older",
      "oldest",
    ]);
  });
});

describe("标签路由契约", () => {
  it("静态路径使用原始标签且只在 URL 中编码", () => {
    expect(tagPageSource).toContain("params: { tag },");
    expect(tagPageSource).not.toContain(
      "params: { tag: encodeURIComponent(tag) }",
    );
    expect(tagPageSource).toContain(
      "canonicalPath={`/tags/${encodeURIComponent(tag)}/`}",
    );
  });
});
