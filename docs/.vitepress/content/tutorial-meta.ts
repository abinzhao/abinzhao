const levels = ["beginner", "intermediate", "advanced"] as const;
const statuses = ["draft", "published", "deprecated"] as const;

export type TutorialLevel = (typeof levels)[number];
export type TutorialStatus = (typeof statuses)[number];

export interface TutorialMeta {
  title: string;
  description: string;
  topic: string;
  section: string;
  order: number;
  level: TutorialLevel;
  status: TutorialStatus;
  tags: string[];
  prerequisites: string[];
  comments: boolean;
}

function isOneOf<T extends string>(
  value: unknown,
  candidates: readonly T[],
): value is T {
  return typeof value === "string" && candidates.includes(value as T);
}

export function validateTutorialMeta(input: unknown): TutorialMeta {
  if (!input || typeof input !== "object") {
    throw new Error("Tutorial metadata must be an object");
  }

  const meta = input as Record<string, unknown>;
  if (!isOneOf(meta.level, levels)) {
    throw new Error(`Invalid tutorial level "${String(meta.level)}"`);
  }
  if (!isOneOf(meta.status, statuses)) {
    throw new Error(`Invalid tutorial status "${String(meta.status)}"`);
  }
  if (
    !Array.isArray(meta.tags) ||
    meta.tags.length < 1 ||
    meta.tags.length > 5 ||
    meta.tags.some((tag) => typeof tag !== "string" || !tag.trim())
  ) {
    throw new Error("Tutorial tags must contain between 1 and 5 items");
  }

  const requiredStrings = ["title", "description", "topic", "section"];
  for (const key of requiredStrings) {
    if (typeof meta[key] !== "string" || !meta[key].trim()) {
      throw new Error(`Tutorial ${key} must be a non-empty string`);
    }
  }
  if (!Number.isInteger(meta.order)) {
    throw new Error("Tutorial order must be an integer");
  }
  if (
    !Array.isArray(meta.prerequisites) ||
    meta.prerequisites.some((item) => typeof item !== "string")
  ) {
    throw new Error("Tutorial prerequisites must be a string array");
  }
  if (typeof meta.comments !== "boolean") {
    throw new Error("Tutorial comments must be a boolean");
  }

  return meta as unknown as TutorialMeta;
}
