import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import matter from 'gray-matter';

export interface Article {
  category?: string;
  column?: string;
  date: string;
  description?: string;
  draft: boolean;
  featured: boolean;
  href: string;
  seriesOrder?: number;
  tags: string[];
  title: string;
}

export interface Column {
  articles: Article[];
  description?: string;
  featured: boolean;
  href: string;
  slug: string;
  status?: string;
  title: string;
}

export interface ContentIndex {
  blogArticles: Article[];
  blogCategories: string[];
  blogTags: string[];
  columns: Column[];
}

export interface PublishedArticleSource {
  article: Article;
  filePath: string;
  markdown: string;
}

type Frontmatter = Record<string, unknown>;

function asRecord(value: unknown): Frontmatter {
  return value !== null && typeof value === 'object' ? (value as Frontmatter) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return asString(value) ?? '';
}

function createArticle(
  source: string,
  href: string,
  column?: string,
): Article | undefined {
  const { data } = matter(source);
  const frontmatter = asRecord(data);
  const title = asString(frontmatter.title);
  const date = asDate(frontmatter.date);

  if (!title || !date || frontmatter.draft === true) {
    return undefined;
  }

  const series = asRecord(frontmatter.series);
  const seriesOrder = typeof series.order === 'number' ? series.order : undefined;

  return {
    category: asString(frontmatter.category),
    column,
    date,
    description: asString(frontmatter.description),
    draft: false,
    featured: frontmatter.featured === true,
    href,
    seriesOrder,
    tags: asStringArray(frontmatter.tags),
    title,
  };
}

async function readMarkdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(directory, entry.name));
}

async function readArticleSource(
  filePath: string,
  href: string,
  column?: string,
): Promise<PublishedArticleSource | undefined> {
  const markdown = await readFile(filePath, 'utf8');
  const article = createArticle(markdown, href, column);

  return article ? { article, filePath, markdown } : undefined;
}

function sortByPublishedDate(left: Article, right: Article): number {
  return right.date.localeCompare(left.date) || left.title.localeCompare(right.title);
}

function sortBySeriesOrder(left: Article, right: Article): number {
  return (
    (left.seriesOrder ?? Number.MAX_SAFE_INTEGER) - (right.seriesOrder ?? Number.MAX_SAFE_INTEGER) ||
    sortByPublishedDate(left, right)
  );
}

interface LoadedContent {
  blogSources: PublishedArticleSource[];
  columns: Array<{
    column: Column;
    sources: PublishedArticleSource[];
  }>;
}

async function loadContent(contentRoot: string): Promise<LoadedContent> {
  const blogFiles = await readMarkdownFiles(join(contentRoot, 'blog'));
  const blogSources = (
    await Promise.all(
      blogFiles.map((filePath) =>
        readArticleSource(filePath, `/blog/${basename(filePath, '.md')}.html`),
      ),
    )
  )
    .filter((source): source is PublishedArticleSource => source !== undefined)
    .sort((left, right) => sortByPublishedDate(left.article, right.article));

  const columnsDirectory = join(contentRoot, 'columns');
  const columnDirectories = await readdir(columnsDirectory, { withFileTypes: true }).catch(() => []);
  const columns = (
    await Promise.all(
      columnDirectories
        .filter((entry) => entry.isDirectory())
        .map(async (entry): Promise<LoadedContent['columns'][number] | undefined> => {
          const slug = entry.name;
          const directory = join(columnsDirectory, slug);
          const indexPath = join(directory, 'index.md');
          const indexSource = await readFile(indexPath, 'utf8').catch(() => '');
          const { data } = matter(indexSource);
          const frontmatter = asRecord(data);
          const title = asString(frontmatter.title);

          if (!title || frontmatter.draft === true) {
            return undefined;
          }

          const articleFiles = (await readMarkdownFiles(directory)).filter(
            (filePath) => basename(filePath) !== 'index.md',
          );
          const articles = (
            await Promise.all(
              articleFiles.map((filePath) =>
                readArticleSource(
                  filePath,
                  `/columns/${slug}/${basename(filePath, '.md')}.html`,
                  slug,
                ),
              ),
            )
          )
            .filter((source): source is PublishedArticleSource => source !== undefined)
            .sort((left, right) => sortBySeriesOrder(left.article, right.article));

          return {
            column: {
              articles: articles.map(({ article }) => article),
              description: asString(frontmatter.description),
              featured: frontmatter.featured === true,
              href: `/columns/${slug}/`,
              slug,
              status: asString(frontmatter.status),
              title,
            },
            sources: articles,
          };
        }),
    )
  ).filter((column): column is LoadedContent['columns'][number] => column !== undefined);

  return {
    blogSources,
    columns: columns.sort((left, right) => left.column.title.localeCompare(right.column.title)),
  };
}

export async function loadPublishedArticleSources(
  contentRoot: string,
): Promise<PublishedArticleSource[]> {
  const content = await loadContent(contentRoot);
  return [
    ...content.blogSources,
    ...content.columns.flatMap(({ sources }) => sources),
  ];
}

export async function createContentIndex(contentRoot: string): Promise<ContentIndex> {
  const content = await loadContent(contentRoot);
  const sortedBlogArticles = content.blogSources.map(({ article }) => article);

  const blogTags = [...new Set(sortedBlogArticles.flatMap((article) => article.tags))].sort();
  const blogCategories = [
    ...new Set(
      sortedBlogArticles.flatMap((article) => (article.category ? [article.category] : [])),
    ),
  ].sort();

  return {
    blogArticles: sortedBlogArticles,
    blogCategories,
    blogTags,
    columns: content.columns.map(({ column }) => column),
  };
}
