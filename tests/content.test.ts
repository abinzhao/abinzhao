import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseArticleSource,
  parseProjectSource,
  readContentDirectory,
} from "@/lib/content";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("内容模型", () => {
  it("读取五个带公开仓库链接的真实项目", () => {
    const projects = readContentDirectory(
      join(process.cwd(), "content/projects"),
      parseProjectSource,
    );

    expect(projects).toHaveLength(5);
    expect(projects.map(({ meta }) => meta.slug)).toEqual([
      "code-analysis",
      "cps",
      "harmony-next-blog",
      "scio-design",
      "scio-pro",
    ]);
    expect(
      projects.every(({ meta }) =>
        meta.repositoryUrl.startsWith("https://github.com/abinzhao/"),
      ),
    ).toBe(true);
  });

  it("读取基于公开仓库资料的真实文章", () => {
    const articles = readContentDirectory(
      join(process.cwd(), "content/articles"),
      parseArticleSource,
    );

    expect(articles.map(({ meta }) => meta.slug)).toContain(
      "harmonyos-next-learning-path",
    );
    expect(articles[0].content).toContain(
      "https://github.com/abinzhao/harmony-next-blog",
    );
  });

  it("拒绝缺少职责字段的项目", () => {
    const source = `---
title: 跨端应用
slug: cross-platform-app
summary: 一个可公开的项目摘要
domains:
  - HarmonyOS
status: 已完成
featured: true
draft: false
---

项目正文
`;

    expect(() => parseProjectSource(source)).toThrowError(/role/);
  });

  it("拒绝正文 slug 与文件身份不一致的文章", () => {
    const source = `---
title: 鸿蒙开发笔记
slug: harmony-notes
summary: 一篇技术文章
publishedAt: 2026-08-10
tags:
  - HarmonyOS
draft: false
---

文章正文
`;

    expect(() => parseArticleSource(source, "different-slug")).toThrowError(
      /slug/,
    );
  });

  it("空内容目录返回空数组", () => {
    const directory = mkdtempSync(join(tmpdir(), "zjb-content-"));
    temporaryDirectories.push(directory);

    expect(readContentDirectory(directory, parseArticleSource)).toEqual([]);
  });

  it("读取内容时排除草稿并按发布日期倒序排列", () => {
    const directory = mkdtempSync(join(tmpdir(), "zjb-content-"));
    temporaryDirectories.push(directory);

    const files = {
      "older.mdx": `---
title: 较早文章
slug: older
summary: 较早发布的文章
publishedAt: 2026-08-01
tags: [前端]
draft: false
---
正文`,
      "newer.mdx": `---
title: 较新文章
slug: newer
summary: 较新发布的文章
publishedAt: 2026-08-09
tags: [HarmonyOS]
draft: false
---
正文`,
      "draft.mdx": `---
title: 草稿文章
slug: draft
summary: 不应公开
publishedAt: 2026-08-10
tags: [草稿]
draft: true
---
正文`,
    };

    for (const [name, source] of Object.entries(files)) {
      writeFileSync(join(directory, name), source);
    }

    const articles = readContentDirectory(directory, parseArticleSource);

    expect(articles.map((article) => article.meta.slug)).toEqual([
      "newer",
      "older",
    ]);
  });
});
