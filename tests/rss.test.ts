import { describe, expect, it } from "vitest";
import { buildRssFeed } from "@/lib/rss";

describe("RSS", () => {
  it("转义标题和摘要中的 XML 特殊字符", () => {
    const feed = buildRssFeed(
      [
        {
          meta: {
            title: "ArkUI <布局> & 性能",
            slug: "arkui-layout",
            summary: "讨论 <组件> 与渲染",
            publishedAt: "2026-08-10",
            tags: ["HarmonyOS"],
            draft: false,
          },
          content: "正文",
        },
      ],
      "https://example.com",
    );

    expect(feed).toContain("ArkUI &lt;布局&gt; &amp; 性能");
    expect(feed).toContain("讨论 &lt;组件&gt; 与渲染");
    expect(feed).toContain(
      "<link>https://example.com/writing/arkui-layout</link>",
    );
  });

  it("没有公开文章时仍生成有效频道", () => {
    const feed = buildRssFeed([], "https://example.com");

    expect(feed).toContain('<rss version="2.0">');
    expect(feed).toContain("<title>赵建斌的文章</title>");
    expect(feed).not.toContain("<item>");
  });
});
