import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

function generateId({
  entry,
  data,
}: {
  entry: string;
  data: Record<string, unknown>;
}): string {
  const fileSlug = entry.split("/").at(-1)?.replace(/\.(?:md|mdx)$/, "");

  if (!fileSlug || data.slug !== fileSlug) {
    throw new Error(
      `Content slug "${String(data.slug)}" must match file slug "${fileSlug}".`,
    );
  }

  return fileSlug;
}

const projects = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/projects",
    generateId,
  }),
  schema: z.object({
    title: z.string().min(1),
    slug,
    summary: z.string().min(1),
    category: z.enum([
      "web",
      "backend",
      "harmonyos",
      "miniprogram",
      "crossplatform",
      "experiment",
    ]),
    tags: z.array(z.string().min(1)).min(1),
    year: z.number().int().min(2000).max(2100).optional(),
    status: z.enum(["completed", "ongoing", "archived"]),
    role: z.string().min(1),
    repositoryUrl: z.url(),
    externalUrl: z.url().optional(),
    cover: z.string().optional(),
    featured: z.boolean().default(false),
    order: z.number().int().default(0),
    draft: z.boolean().default(false),
  }),
});

const blog = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/blog",
    generateId,
  }),
  schema: z.object({
    title: z.string().min(1),
    slug,
    date: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    category: z.enum(["技术", "随笔", "折腾"]),
    subcategory: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).min(1),
    cover: z.string().optional(),
    summary: z.string().min(1),
    draft: z.boolean().default(false),
  }),
});

const playground = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/playground",
    generateId,
  }),
  schema: z.object({
    title: z.string().min(1),
    slug,
    description: z.string().min(1),
    tech: z.array(z.string().min(1)).min(1),
    preview: z.string().optional(),
    date: z.coerce.date(),
    featured: z.boolean().default(false),
    githubUrl: z.url().optional(),
    draft: z.boolean().default(false),
  }),
});

const vibes = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/vibes",
    generateId,
  }),
  schema: z.object({
    slug,
    date: z.coerce.date(),
    text: z.string().min(1),
    tags: z.array(z.string().min(1)).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { projects, blog, playground, vibes };
