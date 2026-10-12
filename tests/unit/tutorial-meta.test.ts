import { describe, expect, it } from "vitest";
import {
  validateTutorialMeta,
  type TutorialMeta,
} from "../../docs/.vitepress/content/tutorial-meta";

const validMeta: TutorialMeta = {
  title: "Git 基础与工作模型",
  description: "从工作区、暂存区和提交历史理解 Git。",
  topic: "git",
  section: "foundation",
  order: 10,
  level: "beginner",
  status: "published",
  tags: ["Git", "工程基础"],
  prerequisites: [],
  comments: true,
};

describe("validateTutorialMeta", () => {
  it("returns a normalized tutorial metadata object", () => {
    expect(validateTutorialMeta(validMeta)).toEqual(validMeta);
  });

  it("rejects unsupported levels", () => {
    expect(() =>
      validateTutorialMeta({ ...validMeta, level: "expert" }),
    ).toThrow('Invalid tutorial level "expert"');
  });

  it("rejects tutorials without searchable tags", () => {
    expect(() => validateTutorialMeta({ ...validMeta, tags: [] })).toThrow(
      "Tutorial tags must contain between 1 and 5 items",
    );
  });
});
