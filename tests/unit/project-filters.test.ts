import { describe, expect, it } from "vitest";
import { getProjectCategories } from "@/lib/content";

describe("项目分类", () => {
  it("按固定中文顺序返回存在的分类", () => {
    expect(
      getProjectCategories([
        { data: { category: "experiment" } },
        { data: { category: "web" } },
        { data: { category: "harmonyos" } },
      ]),
    ).toEqual(["web", "harmonyos", "experiment"]);
  });
});
