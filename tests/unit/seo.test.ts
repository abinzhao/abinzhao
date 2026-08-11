import { describe, expect, it } from "vitest";
import {
  buildBlogPostingJsonLd,
  buildCanonical,
  buildPersonJsonLd,
  buildProjectJsonLd,
  buildRedirectCanonical,
} from "@/lib/seo";

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

  it("将尾斜杠放在 query 和 fragment 之前", () => {
    expect(
      buildCanonical(
        "https://abinzhao.github.io",
        "/about?source=nav#contact",
      ),
    ).toBe("https://abinzhao.github.io/about/?source=nav#contact");
    expect(
      buildCanonical("https://abinzhao.github.io", "/about/#contact"),
    ).toBe("https://abinzhao.github.io/about/#contact");
  });
});

describe("structured data", () => {
  it("Person 仅公开已确认的身份和社交入口", () => {
    const person = buildPersonJsonLd();

    expect(person.name).toBe("赵建斌");
    expect(person.sameAs).toEqual([
      "https://github.com/abinzhao",
      "https://juejin.cn/user/2849548342403454",
    ]);
    expect(JSON.stringify(person)).not.toMatch(/email|worksFor|telephone/i);
  });

  it("构建稳定的 BlogPosting 核心字段", () => {
    const jsonLd = buildBlogPostingJsonLd({
      title: "从公开仓库整理 HarmonyOS Next 学习路径",
      summary: "基于公开仓库整理的学习路径。",
      path: "/blog/harmonyos-next-learning-path/",
      date: new Date("2026-08-10T00:00:00.000Z"),
      tags: ["HarmonyOS", "ArkTS", "ArkUI"],
    });

    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: "从公开仓库整理 HarmonyOS Next 学习路径",
      url: "https://abinzhao.github.io/blog/harmonyos-next-learning-path/",
    });
  });

  it("构建稳定的 SoftwareSourceCode 核心字段", () => {
    const jsonLd = buildProjectJsonLd({
      title: "HarmonyOS Next 开发知识库",
      summary: "公开的 HarmonyOS Next 学习笔记和实践教程。",
      path: "/projects/harmony-next-blog/",
      repositoryUrl: "https://github.com/abinzhao/harmony-next-blog",
      category: "鸿蒙",
      tags: ["HarmonyOS", "ArkTS", "ArkUI"],
    });

    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: "HarmonyOS Next 开发知识库",
      url: "https://abinzhao.github.io/projects/harmony-next-blog/",
    });
  });
});

describe("redirect canonical", () => {
  it("将联系页指向 About 联系区", () => {
    expect(buildRedirectCanonical("/contact")).toBe(
      "https://abinzhao.github.io/about/#contact",
    );
  });
});
