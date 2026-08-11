import { describe, expect, it } from "vitest";
import {
  getAdjacentEntries,
  getReadingMinutes,
  sortProjects,
} from "@/lib/content";

describe("内容展示逻辑", () => {
  it("项目按精选、权重和年份排序", () => {
    const projects = [
      { slug: "a", data: { featured: false, order: 1, year: 2026 } },
      { slug: "b", data: { featured: true, order: 3, year: 2025 } },
      { slug: "c", data: { featured: true, order: 8, year: undefined } },
    ];
    expect(sortProjects(projects).map(({ slug }) => slug)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("计算中文阅读时间且至少为一分钟", () => {
    expect(getReadingMinutes("短文")).toBe(1);
    expect(getReadingMinutes("文".repeat(1000))).toBe(3);
  });

  it("返回上一篇和下一篇", () => {
    const entries = [{ slug: "new" }, { slug: "current" }, { slug: "old" }];
    expect(getAdjacentEntries(entries, "current")).toEqual({
      previous: entries[0],
      next: entries[2],
    });
  });
});
