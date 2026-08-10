import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import path from "node:path";
import { MDXRemote } from "next-mdx-remote/rsc";
import { parseArticleSource, readContentDirectory } from "@/lib/content";

function getArticles() {
  return readContentDirectory(
    path.join(process.cwd(), "content/articles"),
    parseArticleSource,
  );
}

export const dynamicParams = false;

export function generateStaticParams() {
  return getArticles().map(({ meta }) => ({ slug: meta.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/writing/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticles().find(({ meta }) => meta.slug === slug);

  if (!article) {
    return {};
  }

  return {
    title: article.meta.title,
    description: article.meta.summary,
  };
}

export default async function ArticleDetailPage({
  params,
}: PageProps<"/writing/[slug]">) {
  const { slug } = await params;
  const article = getArticles().find(({ meta }) => meta.slug === slug);

  if (!article) {
    notFound();
  }

  return (
    <main className="detail-shell">
      <article>
        <Link className="text-link" href="/writing">
          返回文章
        </Link>
        <h1>{article.meta.title}</h1>
        <p className="meta-line">
          {article.meta.publishedAt} / {article.meta.tags.join(" · ")}
        </p>
        <p>{article.meta.summary}</p>
        <div className="prose">
          <MDXRemote source={article.content} />
        </div>
      </article>
    </main>
  );
}
