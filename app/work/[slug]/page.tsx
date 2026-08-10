import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import path from "node:path";
import { MDXRemote } from "next-mdx-remote/rsc";
import { parseProjectSource, readContentDirectory } from "@/lib/content";

function getProjects() {
  return readContentDirectory(
    path.join(process.cwd(), "content/projects"),
    parseProjectSource,
  );
}

export const dynamicParams = false;

export function generateStaticParams() {
  return getProjects().map(({ meta }) => ({ slug: meta.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/work/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjects().find(({ meta }) => meta.slug === slug);

  if (!project) {
    return {};
  }

  return {
    title: project.meta.title,
    description: project.meta.summary,
  };
}

export default async function ProjectDetailPage({
  params,
}: PageProps<"/work/[slug]">) {
  const { slug } = await params;
  const project = getProjects().find(({ meta }) => meta.slug === slug);

  if (!project) {
    notFound();
  }

  return (
    <main className="detail-shell">
      <article>
        <Link className="text-link" href="/work">
          返回项目
        </Link>
        <h1>{project.meta.title}</h1>
        <p className="meta-line">
          {project.meta.role} / {project.meta.status} /{" "}
          {project.meta.domains.join(" · ")}
        </p>
        <p>{project.meta.summary}</p>
        <div className="prose">
          <MDXRemote source={project.content} />
        </div>
      </article>
    </main>
  );
}
