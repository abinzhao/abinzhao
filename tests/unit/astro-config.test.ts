import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Astro 工程配置", () => {
  it("使用静态输出、站点 URL、MDX、Sitemap 和 Tailwind", () => {
    const config = readFileSync("astro.config.mjs", "utf8");
    expect(config).toContain('output: "static"');
    expect(config).toContain('site: "https://abinzhao.github.io"');
    expect(config).toContain("mdx()");
    expect(config).toContain("sitemap()");
    expect(config).toContain("tailwindcss()");
  });

  it("不提交视觉伴侣运行目录", () => {
    expect(readFileSync(".gitignore", "utf8")).toContain(".superpowers/");
  });
});
