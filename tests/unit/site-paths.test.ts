import { describe, expect, it } from "vitest";
import { withoutBase, withBase } from "@/lib/site";

describe("站点基础路径", () => {
  it("为站内绝对路径添加项目站点前缀", () => {
    expect(withBase("/")).toBe("/abinzhao/");
    expect(withBase("/projects/")).toBe("/abinzhao/projects/");
    expect(withBase("/about/#contact")).toBe("/abinzhao/about/#contact");
  });

  it("不重复添加前缀", () => {
    expect(withBase("/abinzhao/blog/")).toBe("/abinzhao/blog/");
  });

  it("保留页内锚点和外部链接", () => {
    expect(withBase("#main-content")).toBe("#main-content");
    expect(withBase("https://github.com/abinzhao")).toBe(
      "https://github.com/abinzhao",
    );
  });

  it("从 Astro pathname 中移除项目站点前缀", () => {
    expect(withoutBase("/abinzhao/")).toBe("/");
    expect(withoutBase("/abinzhao/blog/post/")).toBe("/blog/post/");
    expect(withoutBase("/projects/")).toBe("/projects/");
  });
});
