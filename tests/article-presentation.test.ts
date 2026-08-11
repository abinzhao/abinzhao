import { describe, expect, it } from "vitest";
import {
  extractArticleHeadings,
  getArticleTopics,
} from "@/lib/article-presentation";

describe("文章展示数据", () => {
  it("去重并排序真实主题，忽略空主题", () => {
    expect(
      getArticleTopics([
        { topic: "跨端开发" },
        { topic: "前端工程" },
        { topic: "跨端开发" },
        {},
      ]),
    ).toEqual(["前端工程", "跨端开发"]);
  });

  it("从二级和三级标题生成与正文一致的稳定目录", () => {
    expect(
      extractArticleHeadings(`
# 页面标题
## 先建立知识骨架
### ArkTS 与 ArkUI
#### 不进入目录
## 先建立知识骨架
`),
    ).toEqual([
      { id: "先建立知识骨架", text: "先建立知识骨架", level: 2 },
      { id: "arkts-与-arkui", text: "ArkTS 与 ArkUI", level: 3 },
      { id: "先建立知识骨架-1", text: "先建立知识骨架", level: 2 },
    ]);
  });
});
