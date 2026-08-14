import { describe, expect, it } from "vitest";
import {
  normalizeGithubSnapshot,
  type GithubSnapshot,
} from "@/lib/github-snapshot";

const previous: GithubSnapshot = {
  updatedAt: "2026-08-14T00:00:00.000Z",
  releases: [],
  repositories: [],
  contributions: [],
};

describe("GitHub 静态快照", () => {
  it("远程数据无效时保留上次成功快照", () => {
    expect(normalizeGithubSnapshot(null, previous)).toEqual(previous);
  });

  it("过滤无效仓库并限制展示数量", () => {
    const remote = {
      repositories: Array.from({ length: 8 }, (_, index) => ({
        name: `repo-${index}`,
        url: `https://github.com/abinzhao/repo-${index}`,
        description: index === 0 ? null : `Repository ${index}`,
        pushedAt: "2026-08-14T00:00:00Z",
      })),
      releases: [],
      contributions: [],
    };
    const result = normalizeGithubSnapshot(remote, previous);
    expect(result.repositories).toHaveLength(6);
    expect(result.repositories[0].description).toBe("");
  });
});
