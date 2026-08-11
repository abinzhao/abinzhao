import { describe, expect, it } from "vitest";
import { buildCanonical } from "@/lib/seo";

describe("canonical URL", () => {
  it("去除 origin 尾部斜杠并为路径保留一个尾斜杠", () => {
    expect(
      buildCanonical("https://abinzhao.github.io///", "/blog/post"),
    ).toBe("https://abinzhao.github.io/blog/post/");
  });

  it("规范路径中的重复斜杠", () => {
    expect(
      buildCanonical("https://abinzhao.github.io", "///blog//post///"),
    ).toBe("https://abinzhao.github.io/blog/post/");
  });

  it("规范站点根路径", () => {
    expect(buildCanonical("https://abinzhao.github.io/", "")).toBe(
      "https://abinzhao.github.io/",
    );
  });
});
