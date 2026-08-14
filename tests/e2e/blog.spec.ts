import { expect, test } from "@playwright/test";

test("博客筛选写入 URL 并支持浏览器前进后退", async ({ page }) => {
  await page.goto("/abinzhao/blog/");

  await expect(page.locator("body")).toHaveAttribute(
    "data-page-variant",
    "blog",
  );

  await expect(
    page.getByRole("heading", { name: "博客", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "从公开仓库整理 HarmonyOS Next 学习路径",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "按一级分类筛选" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "ArkTS", exact: true }).click();
  await expect(page).toHaveURL(/\?tag=ArkTS$/);
  await expect(
    page.getByRole("heading", {
      name: "从公开仓库整理 HarmonyOS Next 学习路径",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "ArkUI", exact: true }).click();
  await expect(page).toHaveURL(/\?tag=ArkUI$/);
  await page.goBack();
  await expect(page).toHaveURL(/\?tag=ArkTS$/);
  await expect(
    page.getByRole("button", { name: "ArkTS", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goForward();
  await expect(page).toHaveURL(/\?tag=ArkUI$/);
});

test("无 JavaScript 时公开文章与链接仍完整可用", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto("/abinzhao/blog/?tag=not-present");
  await expect(page.locator("[data-blog-entry]")).toHaveCount(1);
  await expect(
    page.getByRole("link", {
      name: /阅读文章：从公开仓库整理 HarmonyOS Next 学习路径/,
    }),
  ).toHaveAttribute("href", "/abinzhao/blog/harmonyos-next-learning-path/");

  await context.close();
});

test("博客详情具备目录、阅读时间、标签和真实 JSON-LD", async ({
  page,
}) => {
  await page.goto("/abinzhao/blog/harmonyos-next-learning-path/");

  await expect(page.locator("body")).toHaveAttribute(
    "data-page-variant",
    "article",
  );
  await expect(page.locator("canvas")).toHaveCount(0);

  await expect(page.getByText(/预计阅读 2 分钟/)).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "文章目录" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "HarmonyOS" })).toHaveAttribute(
    "href",
    "/abinzhao/tags/HarmonyOS/",
  );

  const jsonLd = await page
    .locator('script[type="application/ld+json"]')
    .textContent();
  expect(JSON.parse(jsonLd ?? "{}")).toMatchObject({
    "@type": "BlogPosting",
    headline: "从公开仓库整理 HarmonyOS Next 学习路径",
    datePublished: "2026-08-10T00:00:00.000Z",
  });
});

test("代码复制增强可重复初始化并处理成功与失败状态", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto("/abinzhao/blog/harmonyos-next-learning-path/");

  await page.evaluate(() => {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = "const value = 1;";
    pre.append(code);
    document.querySelector(".article-body")?.append(pre);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.resolve(),
      },
    });
    document.dispatchEvent(new Event("astro:page-load"));
    document.dispatchEvent(new Event("astro:page-load"));
  });

  await expect(page.getByRole("button", { name: "复制代码" })).toHaveCount(1);
  await page.getByRole("button", { name: "复制代码" }).click();
  await expect(page.getByRole("button", { name: "已复制" })).toBeVisible();

  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error("clipboard unavailable")),
      },
    });
  });
  await page.getByRole("button", { name: "已复制" }).click();
  await expect(page.getByRole("button", { name: "复制失败" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("归档、标签、RSS 与旧写作路径来自真实公开文章", async ({
  page,
  request,
}) => {
  await page.goto("/abinzhao/blog/archive/");
  await expect(page.locator("body")).toHaveAttribute(
    "data-page-variant",
    "article",
  );
  await expect(page.locator('time[datetime="2026-08"]')).toHaveText(
    "2026 年 8 月",
  );

  await page.goto("/abinzhao/tags/");
  await expect(page.locator("body")).toHaveAttribute(
    "data-page-variant",
    "article",
  );
  await expect(
    page.locator('a[href="/abinzhao/tags/HarmonyOS/"]'),
  ).toContainText("HarmonyOS");

  await page.goto("/abinzhao/tags/HarmonyOS/");
  await expect(page.locator("body")).toHaveAttribute(
    "data-page-variant",
    "article",
  );
  await expect(
    page.getByRole("heading", { name: "标签：HarmonyOS" }),
  ).toBeVisible();

  const rss = await request.get("/abinzhao/rss.xml");
  expect(rss.ok()).toBe(true);
  expect(await rss.text()).toContain(
    "https://abinzhao.github.io/abinzhao/blog/harmonyos-next-learning-path/",
  );

  const legacy = await request.get(
    "/abinzhao/writing/harmonyos-next-learning-path/",
  );
  const legacyHtml = await legacy.text();
  expect(legacyHtml).toContain(
    '<link rel="canonical" href="https://abinzhao.github.io/abinzhao/blog/harmonyos-next-learning-path/">',
  );
  expect(legacyHtml).toContain(
    '<a href="/abinzhao/blog/harmonyos-next-learning-path/">立即跳转</a>',
  );
});
