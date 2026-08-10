import path from "node:path";
import { parseArticleSource, readContentDirectory } from "@/lib/content";
import { buildRssFeed } from "@/lib/rss";
import { getSiteUrl } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  const articles = readContentDirectory(
    path.join(process.cwd(), "content/articles"),
    parseArticleSource,
  );

  return new Response(buildRssFeed(articles, getSiteUrl()), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
