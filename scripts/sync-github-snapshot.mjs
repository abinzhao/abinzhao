import { readFile, writeFile } from "node:fs/promises";

const snapshotUrl = new URL("../src/data/github-snapshot.json", import.meta.url);
const previous = JSON.parse(await readFile(snapshotUrl, "utf8"));

if (process.env.GITHUB_SNAPSHOT_OFFLINE === "1") {
  console.log("GitHub snapshot: offline mode, keeping checked-in data.");
  process.exit(0);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 4500);

try {
  const response = await fetch(
    "https://api.github.com/users/abinzhao/repos?sort=pushed&per_page=6",
    {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "abinzhao-static-site",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}`);
  }

  const repositories = await response.json();
  if (!Array.isArray(repositories) || repositories.length === 0) {
    throw new Error("GitHub API returned no repositories");
  }

  const next = {
    ...previous,
    updatedAt: new Date().toISOString(),
    repositories: repositories.map((repository) => ({
      name: repository.name,
      url: repository.html_url,
      description: repository.description ?? "",
      pushedAt: repository.pushed_at,
    })),
  };
  await writeFile(snapshotUrl, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(`GitHub snapshot: updated ${next.repositories.length} repositories.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`GitHub snapshot: ${message}; keeping checked-in data.`);
} finally {
  clearTimeout(timeout);
}
