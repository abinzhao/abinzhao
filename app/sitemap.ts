import type { MetadataRoute } from "next";
import path from "node:path";
import {
  parseArticleSource,
  parseProjectSource,
  readContentDirectory,
} from "@/lib/content";
import { getSiteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const staticRoutes = ["", "/work", "/writing", "/about", "/contact"];
  const projects = readContentDirectory(
    path.join(process.cwd(), "content/projects"),
    parseProjectSource,
  );
  const articles = readContentDirectory(
    path.join(process.cwd(), "content/articles"),
    parseArticleSource,
  );

  return [
    ...staticRoutes.map((route, index) => ({
      url: `${siteUrl}${route}`,
      changeFrequency: index === 0 ? ("weekly" as const) : ("monthly" as const),
      priority: index === 0 ? 1 : 0.7,
    })),
    ...projects.map(({ meta }) => ({
      url: `${siteUrl}/work/${meta.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...articles.map(({ meta }) => ({
      url: `${siteUrl}/writing/${meta.slug}`,
      lastModified: meta.updatedAt ?? meta.publishedAt,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
