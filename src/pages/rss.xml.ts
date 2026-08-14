import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { site, withBase } from "@/lib/site";

export async function GET() {
  const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );

  return rss({
    title: "abinzhao 技术文章",
    description: site.description,
    site: site.url,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.summary,
      pubDate: post.data.date,
      link: withBase(`/blog/${post.data.slug}/`),
    })),
  });
}
