import { expect, test } from "@playwright/test";

test("项目可筛选、深链且空分类有明确状态", async ({ page }) => {
  await page.goto("/abinzhao/projects/");

  await expect(page.locator("body")).toHaveAttribute(
    "data-page-variant",
    "projects",
  );
  await expect(page.locator(".project-card__coordinate")).toHaveCount(5);

  const harmonyFilter = page.getByRole("button", { name: "鸿蒙" });
  await expect
    .poll(async () => (await harmonyFilter.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44);
  await harmonyFilter.focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\?category=harmonyos$/);
  await expect(page.getByText("HarmonyOS Next 开发知识库")).toBeVisible();
  await expect(page.getByText("CPS 图片压缩工具")).toBeHidden();

  await page.goto("/abinzhao/projects/?category=backend");
  await expect(page.getByText("CPS 图片压缩工具")).toBeVisible();
  await expect(page.getByText("HarmonyOS Next 开发知识库")).toBeHidden();

  await page.goto("/abinzhao/projects/?category=experiment");
  await expect(page.getByText("该分类暂无公开项目")).toBeVisible();
});

test("无 JavaScript 时所有公开项目与详情链接仍可用", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto("/abinzhao/projects/?category=harmonyos");
  await expect(page.locator("[data-project-category]")).toHaveCount(5);
  await expect(
    page.getByRole("link", { name: /查看项目：HarmonyOS Next 开发知识库/ }),
  ).toHaveAttribute("href", "/abinzhao/projects/harmony-next-blog/");

  await context.close();
});

test("项目详情只展示真实字段并输出 SoftwareSourceCode JSON-LD", async ({
  page,
}) => {
  await page.goto("/abinzhao/projects/harmony-next-blog/");

  await expect(page.locator("body")).toHaveAttribute(
    "data-page-variant",
    "project",
  );
  await expect(
    page.getByRole("heading", { name: "HarmonyOS Next 开发知识库" }),
  ).toBeVisible();
  await expect(page.getByText("时间未公开")).toBeVisible();
  await expect(
    page
      .locator(".project-detail__links")
      .getByRole("link", { name: "查看 GitHub 仓库", exact: true }),
  ).toHaveAttribute("rel", /noopener/);

  const jsonLd = await page
    .locator('script[type="application/ld+json"]')
    .textContent();
  expect(JSON.parse(jsonLd ?? "{}")).toMatchObject({
    "@type": "SoftwareSourceCode",
    name: "HarmonyOS Next 开发知识库",
    codeRepository: "https://github.com/abinzhao/harmony-next-blog",
  });
});

test("旧项目链接提供 canonical、可见说明和手动跳转", async ({ request }) => {
  const response = await request.get("/abinzhao/work/harmony-next-blog/");
  const html = await response.text();

  expect(response.ok()).toBe(true);
  expect(html).toContain(
    '<link rel="canonical" href="https://abinzhao.github.io/abinzhao/projects/harmony-next-blog/">',
  );
  expect(html).toContain(
    '<meta http-equiv="refresh" content="0;url=/abinzhao/projects/harmony-next-blog/">',
  );
  expect(html).toContain("<h1>页面已迁移</h1>");
  expect(html).toContain(
    '<a href="/abinzhao/projects/harmony-next-blog/">立即跳转</a>',
  );
});
