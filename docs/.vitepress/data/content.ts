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
  articles: Article[];
  categories: string[];
  columns: Column[];
  tags: string[];
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

async function readArticle(
  filePath: string,
  href: string,
  column?: string,
): Promise<Article | undefined> {
  return createArticle(await readFile(filePath, 'utf8'), href, column);
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

export async function createContentIndex(contentRoot: string): Promise<ContentIndex> {
  const blogFiles = await readMarkdownFiles(join(contentRoot, 'blog'));
  const blogArticles = (
    await Promise.all(
      blogFiles.map((filePath) =>
        readArticle(filePath, `/blog/${basename(filePath, '.md')}/`),
      ),
    )
  ).filter((article): article is Article => article !== undefined);

  const columnsDirectory = join(contentRoot, 'columns');
  const columnDirectories = await readdir(columnsDirectory, { withFileTypes: true }).catch(() => []);
  const columns = (
    await Promise.all(
      columnDirectories
        .filter((entry) => entry.isDirectory())
        .map(async (entry): Promise<Column | undefined> => {
          const slug = entry.name;
          const directory = join(columnsDirectory, slug);
          const indexPath = join(directory, 'index.md');
          const { data } = matter(await readFile(indexPath, 'utf8'));
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
                readArticle(
                  filePath,
                  `/columns/${slug}/${basename(filePath, '.md')}/`,
                  slug,
                ),
              ),
            )
          )
            .filter((article): article is Article => article !== undefined)
            .sort(sortBySeriesOrder);

          return {
            articles,
            description: asString(frontmatter.description),
            featured: frontmatter.featured === true,
            href: `/columns/${slug}/`,
            slug,
            status: asString(frontmatter.status),
            title,
          };
        }),
    )
  ).filter((column): column is Column => column !== undefined);

  const articles = [...blogArticles, ...columns.flatMap((column) => column.articles)].sort(
    sortByPublishedDate,
  );
  const tags = [...new Set(articles.flatMap((article) => article.tags))].sort();
  const categories = [
    ...new Set(
      articles.flatMap((article) => (article.category ? [article.category] : [])),
    ),
  ].sort();

  return {
    articles,
    categories,
    columns: columns.sort((left, right) => left.title.localeCompare(right.title)),
    tags,
  };
}
