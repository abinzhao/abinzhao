import type { ArticleMeta, ContentDocument } from "@/lib/content";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildRssFeed(
  articles: Array<ContentDocument<ArticleMeta>>,
  siteUrl: string,
): string {
  const origin = siteUrl.replace(/\/$/, "");
  const items = articles
    .map(({ meta }) => {
      const articleUrl = `${origin}/writing/${meta.slug}`;

      return `<item>
<title>${escapeXml(meta.title)}</title>
<description>${escapeXml(meta.summary)}</description>
<link>${articleUrl}</link>
<guid>${articleUrl}</guid>
<pubDate>${new Date(meta.publishedAt).toUTCString()}</pubDate>
</item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>赵建斌的文章</title>
<description>前端、HarmonyOS 与跨端应用实践</description>
<link>${origin}/writing</link>
<language>zh-CN</language>
${items}
</channel>
</rss>`;
}
