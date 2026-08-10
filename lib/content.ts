import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import matter from "gray-matter";
import { z } from "zod";

const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug 必须使用小写字母、数字和连字符");

const dateStringSchema = z.preprocess(
  (value) =>
    value instanceof Date ? value.toISOString().slice(0, 10) : value,
  z
    .string()
    .min(1)
    .refine((value) => !Number.isNaN(Date.parse(value)), "日期必须是有效日期"),
);

const projectMetaSchema = z.object({
  title: z.string().min(1),
  slug: slugSchema,
  summary: z.string().min(1),
  domains: z.array(z.string().min(1)).min(1),
  role: z.string().min(1),
  period: z.string().min(1).optional(),
  status: z.enum(["已完成", "维护中", "实验"]),
  featured: z.boolean(),
  draft: z.boolean(),
  repositoryUrl: z.string().url(),
});

const articleMetaSchema = z.object({
  title: z.string().min(1),
  slug: slugSchema,
  summary: z.string().min(1),
  publishedAt: dateStringSchema,
  updatedAt: dateStringSchema.optional(),
  tags: z.array(z.string().min(1)).min(1),
  topic: z.string().min(1).optional(),
  draft: z.boolean(),
  cover: z.string().min(1).optional(),
});

export type ProjectMeta = z.infer<typeof projectMetaSchema>;
export type ArticleMeta = z.infer<typeof articleMetaSchema>;

export type ContentDocument<TMeta extends { slug: string; draft: boolean }> = {
  meta: TMeta;
  content: string;
};

type ContentParser<TMeta extends { slug: string; draft: boolean }> = (
  source: string,
  expectedSlug?: string,
) => ContentDocument<TMeta>;

function parseSource<TMeta extends { slug: string; draft: boolean }>(
  source: string,
  schema: z.ZodType<TMeta>,
  expectedSlug?: string,
): ContentDocument<TMeta> {
  const parsed = matter(source);
  const meta = schema.parse(parsed.data);

  if (expectedSlug && meta.slug !== expectedSlug) {
    throw new Error(`Frontmatter slug "${meta.slug}" 与文件名 "${expectedSlug}" 不一致`);
  }

  return {
    meta,
    content: parsed.content.trim(),
  };
}

export function parseProjectSource(
  source: string,
  expectedSlug?: string,
): ContentDocument<ProjectMeta> {
  return parseSource(source, projectMetaSchema, expectedSlug);
}

export function parseArticleSource(
  source: string,
  expectedSlug?: string,
): ContentDocument<ArticleMeta> {
  return parseSource(source, articleMetaSchema, expectedSlug);
}

export function readContentDirectory<
  TMeta extends { slug: string; draft: boolean; publishedAt?: string },
>(
  directory: string,
  parser: ContentParser<TMeta>,
): Array<ContentDocument<TMeta>> {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory)
    .filter((fileName) => [".md", ".mdx"].includes(extname(fileName)))
    .map((fileName) => {
      const slug = basename(fileName, extname(fileName));
      const source = readFileSync(join(directory, fileName), "utf8");
      return parser(source, slug);
    })
    .filter((document) => !document.meta.draft)
    .sort((left, right) => {
      if (left.meta.publishedAt && right.meta.publishedAt) {
        return (
          Date.parse(right.meta.publishedAt) - Date.parse(left.meta.publishedAt)
        );
      }

      return left.meta.slug.localeCompare(right.meta.slug, "zh-CN");
    });
}
