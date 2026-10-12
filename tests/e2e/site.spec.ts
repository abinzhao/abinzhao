import { expect, test } from "@playwright/test";
import { tutorialGroups } from "../../docs/.vitepress/data/tutorials";

test("home presents the brand and reveals the knowledge map", async ({
  page,
}) => {
  await page.goto("./");

  await expect(page).toHaveTitle(/abinzhao/);
  await expect(page.getByRole("heading", { name: "abinzhao" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "开始学习" }),
  ).toHaveAttribute("href", "/abinzhao/tutorials/");
  await expect(
    page.getByRole("heading", { name: "知识地图" }),
  ).toBeVisible();

  const documentWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(documentWidth).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
});

test("tutorial index lists every confirmed topic", async ({ page }) => {
  await page.goto("./tutorials/");
  const index = page.locator(".tutorial-index");

  const topics = tutorialGroups.flatMap((group) => group.items.map((topic) => topic.name));

  for (const topic of topics) {
    await expect(
      index.getByRole("link", { name: topic, exact: true }),
    ).toBeVisible();
  }
});

test("filter selects a learning domain and opens a real chapter", async ({ page }) => {
  await page.goto("./tutorials/");
  const index = page.locator(".tutorial-index");
  await index.getByRole("button", { name: "平台工程" }).click();
  await expect(index.locator(".tutorial-group")).toHaveCount(1);
  await expect(index.getByRole("link", { name: "Git", exact: true })).toHaveCount(0);
  await index.getByRole("link", { name: "Node.js 全栈", exact: true }).click();
  await expect(page.locator(".vp-doc h1")).toContainText(/HTTP/);
  await expect(page.locator(".VPDocFooter .next")).toBeVisible();
  if ((await page.viewportSize())!.width >= 1280) {
    await expect(page.locator(".VPDocAsideOutline")).toBeVisible();
  }
});

test("Chinese local search finds a tutorial body and navigates", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page.locator(".VPLocalSearchBox input").fill("工作区");
  const results = page.locator(".VPLocalSearchBox .results a");
  await expect(results.first()).toBeVisible();
  await expect(results.first()).toContainText(/Git|工作区|状态/);
  await results.first().click();
  await expect(page).toHaveURL(/tutorials\/git/);
});

test("discussion mounts after navigating from a non-comment page", async ({ page }) => {
  await page.goto("./projects/");
  await expect(page.locator(".doc-comments")).toHaveCount(0);
  if ((await page.viewportSize())!.width < 768) {
    await page.getByRole("button", { name: "mobile navigation" }).click();
  }
  await page.getByRole("link", { name: "教程", exact: true }).click();
  await page.locator(".tutorial-index").getByRole("link", { name: "Git", exact: true }).click();
  const discussion = page.locator(".doc-comments");
  await discussion.scrollIntoViewIfNeeded();
  await expect(discussion).toBeVisible();
  if ((await discussion.innerText()).includes("加载时会连接 Giscus")) {
    await expect(discussion.locator("giscus-widget iframe[title='Comments']")).toHaveCount(1);
  } else {
    await expect(discussion.getByRole("link", { name: "GitHub Discussions" })).toBeVisible();
  }
});

test("code copy provides feedback and theme choice survives navigation", async ({ page }) => {
  await page.goto("./tutorials/git-basics.html");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const copy = page.locator(".vp-doc button.copy").first();
  await copy.hover();
  await copy.click();
  await expect(copy).toHaveClass(/copied/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("git --version");

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("./");
  if ((await page.viewportSize())!.width < 768) {
    await page.getByRole("button", { name: "mobile navigation" }).click();
  }
  await page.locator(".VPSwitchAppearance:visible").click();
  const dark = await page.locator("html").evaluate((el) => el.classList.contains("dark"));
  await page.goto("./topics/");
  expect(await page.locator("html").evaluate((el) => el.classList.contains("dark"))).toBe(dark);
});

test("core routes have no page overflow at four viewport widths", async ({ page }) => {
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["./", "./tutorials/", "./tutorials/node-fullstack/production.html", "./topics/", "./projects/", "./about.html"]) {
      await page.goto(route);
      const dimensions = await page.evaluate(() => ({
        content: document.documentElement.scrollWidth, viewport: innerWidth,
      }));
      expect(dimensions.content, `${route} at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
      await expect(page.locator("h1")).toHaveCount(1);
    }
  }
});

test("tutorial detail keeps learning path, content and outline visible", async ({
  page,
}, testInfo) => {
  await page.goto("./tutorials/git-basics.html");

  await expect(
    page.getByRole("heading", { name: "Git 基础与工作模型" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("教程元信息").getByText("学习路径", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("教程元信息").getByText("最后更新", { exact: false }),
  ).toBeVisible();

  if (testInfo.project.name === "mobile-chromium") {
    const documentWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(documentWidth).toBeLessThanOrEqual(
      await page.evaluate(() => innerWidth),
    );
    return;
  }

  await expect(
    page.locator(".VPDocAsideOutline").getByText("本页目录", { exact: true }),
  ).toBeVisible();
});

test("appearance switch changes the rendered theme", async (
  { page },
  testInfo,
) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("./");

  const root = page.locator("html");
  await expect(root).toHaveClass(/dark/);

  if (testInfo.project.name === "mobile-chromium") {
    await page.getByRole("button", { name: "mobile navigation" }).click();
  }
  await page.locator(".VPSwitchAppearance:visible").click();
  await expect(root).not.toHaveClass(/dark/);
});
