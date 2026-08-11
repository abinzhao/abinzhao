import { site } from "@/lib/site";

export function buildCanonical(origin: string, pathname: string): string {
  const base = origin.replace(/\/+$/, "");
  const [pathAndQuery, fragment] = pathname.split("#", 2);
  const [rawPath, query] = pathAndQuery.split("?", 2);
  const path = `/${rawPath}`
    .replace(/\/+/g, "/")
    .replace(/\/?$/, "/");
  const suffix = `${query === undefined ? "" : `?${query}`}${
    fragment === undefined ? "" : `#${fragment}`
  }`;

  return `${base}${path}${suffix}`;
}

export function buildPersonJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: site.owner,
    url: site.url,
    sameAs: site.social.map(({ href }) => href),
  };
}

interface BlogPostingJsonLdInput {
  title: string;
  summary: string;
  path: string;
  date: Date;
  updatedAt?: Date;
  tags: readonly string[];
}

export function buildBlogPostingJsonLd({
  title,
  summary,
  path,
  date,
  updatedAt,
  tags,
}: BlogPostingJsonLdInput) {
  const url = buildCanonical(site.url, path);

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description: summary,
    url,
    mainEntityOfPage: url,
    datePublished: date.toISOString(),
    ...(updatedAt ? { dateModified: updatedAt.toISOString() } : {}),
    author: {
      "@type": "Person",
      name: site.owner,
    },
    keywords: tags,
  };
}

interface ProjectJsonLdInput {
  title: string;
  summary: string;
  path: string;
  repositoryUrl: string;
  category: string;
  tags: readonly string[];
  year?: number;
}

export function buildProjectJsonLd({
  title,
  summary,
  path,
  repositoryUrl,
  category,
  tags,
  year,
}: ProjectJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: title,
    description: summary,
    url: buildCanonical(site.url, path),
    codeRepository: repositoryUrl,
    applicationCategory: category,
    keywords: tags,
    ...(year ? { dateCreated: String(year) } : {}),
  };
}

export function buildRedirectCanonical(pathname: string): string {
  const target = pathname === "/contact" ? "/about/#contact" : pathname;

  return buildCanonical(site.url, target);
}
