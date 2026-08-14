export interface GithubRepository {
  name: string;
  url: string;
  description: string;
  pushedAt: string;
}

export interface GithubRelease {
  repository: string;
  name: string;
  url: string;
  publishedAt: string;
}

export interface GithubContribution {
  date: string;
  count: number;
}

export interface GithubSnapshot {
  updatedAt: string;
  repositories: GithubRepository[];
  releases: GithubRelease[];
  contributions: GithubContribution[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeGithubSnapshot(
  remote: unknown,
  previous: GithubSnapshot,
): GithubSnapshot {
  if (!isRecord(remote) || !Array.isArray(remote.repositories)) {
    return previous;
  }

  const repositories = remote.repositories
    .filter(
      (item): item is Record<string, unknown> =>
        isRecord(item) &&
        typeof item.name === "string" &&
        typeof item.url === "string" &&
        typeof item.pushedAt === "string",
    )
    .slice(0, 6)
    .map((item) => ({
      name: item.name as string,
      url: item.url as string,
      description:
        typeof item.description === "string" ? item.description : "",
      pushedAt: item.pushedAt as string,
    }));

  if (repositories.length === 0) {
    return previous;
  }

  const releases = Array.isArray(remote.releases)
    ? remote.releases
        .filter(
          (item): item is GithubRelease =>
            isRecord(item) &&
            typeof item.repository === "string" &&
            typeof item.name === "string" &&
            typeof item.url === "string" &&
            typeof item.publishedAt === "string",
        )
        .slice(0, 4)
    : [];
  const contributions = Array.isArray(remote.contributions)
    ? remote.contributions
        .filter(
          (item): item is GithubContribution =>
            isRecord(item) &&
            typeof item.date === "string" &&
            typeof item.count === "number",
        )
        .slice(-84)
    : [];

  return {
    updatedAt: new Date().toISOString(),
    repositories,
    releases,
    contributions,
  };
}
