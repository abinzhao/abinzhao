import { describe, expect, it } from "vitest";
import { withBase } from "../../docs/.vitepress/site";

describe("withBase", () => {
  it("prefixes internal absolute paths with the GitHub Pages base", () => {
    expect(withBase("/tutorials/")).toBe("/abinzhao/tutorials/");
  });

  it("does not prefix external URLs or hash links", () => {
    expect(withBase("https://github.com/abinzhao")).toBe(
      "https://github.com/abinzhao",
    );
    expect(withBase("#content")).toBe("#content");
  });

  it("does not duplicate an existing base prefix", () => {
    expect(withBase("/abinzhao/about.html")).toBe("/abinzhao/about.html");
  });
});
