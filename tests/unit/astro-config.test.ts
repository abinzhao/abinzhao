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

  it("在声明主题令牌的同一入口加载 Tailwind", () => {
    const tokens = readFileSync("src/styles/tokens.css", "utf8");

    expect(tokens).toMatch(/^@import "tailwindcss";/);
    expect(tokens).toContain("@theme");
  });

  it("单元测试不收集 E2E、依赖和构建产物", () => {
    const config = readFileSync("vitest.config.ts", "utf8");

    expect(config).toContain('"tests/e2e/**"');
    expect(config).toContain('"node_modules/**"');
    expect(config).toContain('"dist/**"');
  });

  it("类型检查排除 Astro 构建产物", () => {
    const config = JSON.parse(readFileSync("tsconfig.json", "utf8")) as {
      exclude?: string[];
    };

    expect(config.exclude).toContain("dist");
  });
});
