export interface GithubProject {
  name: string;
  description: string;
  htmlUrl: string;
  homepage: string;
  language: string;
  topics: string[];
  stars: number;
  updatedAt: string;
  archived: boolean;
}

export interface CuratedProject {
  repo: string;
  title: string;
  description: string;
  category: string;
  featured: boolean;
}

export interface Project extends CuratedProject {
  htmlUrl: string;
  homepage: string;
  language: string;
  topics: string[];
  stars: number;
  updatedAt: string;
  archived: boolean;
}

export function mergeGithubProjects(
  remote: GithubProject[],
  curated: CuratedProject[],
): Project[] {
  const remoteByName = new Map(
    remote.map((project) => [project.name, project] as const),
  );

  return curated.map((project) => {
    const github = remoteByName.get(project.repo);

    return {
      ...project,
      htmlUrl:
        github?.htmlUrl ?? `https://github.com/abinzhao/${project.repo}`,
      homepage: github?.homepage ?? '',
      language: github?.language ?? '',
      topics: github?.topics ?? [],
      stars: github?.stars ?? 0,
      updatedAt: github?.updatedAt ?? '',
      archived: github?.archived ?? false,
    };
  });
}
