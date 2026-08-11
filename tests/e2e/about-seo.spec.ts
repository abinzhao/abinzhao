import { expect, test } from "@playwright/test";

test("About 展示六类公开技术方向、联系入口和隐私边界", async ({
  page,
}) => {
  await page.goto("/about/");

  const contact = page.locator("#contact");
  await expect(contact).toBeVisible();
  await expect(contact.getByRole("link", { name: "GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/abinzhao",
  );
  await expect(contact.getByRole("link", { name: "掘金" })).toHaveAttribute(
    "href",
    "https://juejin.cn/user/2849548342403454",
  );

  for (const group of ["前端", "后端", "鸿蒙", "小程序", "跨端", "工具"]) {
    await expect(page.getByRole("heading", { name: group })).toBeVisible();
  }

  await expect(page.locator("body")).not.toContainText(
    /邮箱|微信|公司|工作年限/,
  );
});

test("Contact 原始 HTML 提供正确 canonical 和无 JavaScript 跳转链接", async ({
  request,
}) => {
  const response = await request.get("/contact/");
  const html = await response.text();

  expect(response.ok()).toBe(true);
  expect(html).toContain(
    '<link rel="canonical" href="https://abinzhao.github.io/about/#contact">',
  );
  expect(html).toContain('<a href="/about/#contact">立即跳转</a>');
});

test("404 页面提供信号丢失说明和四个恢复入口", async ({ page }) => {
  await page.goto("/404/");

  await expect(
    page.getByRole("heading", { name: "信号丢失" }),
  ).toBeVisible();
  const recovery = page.getByRole("navigation", { name: "页面恢复入口" });
  await expect(recovery.getByRole("link", { name: "首页" })).toHaveAttribute(
    "href",
    "/",
  );
  await expect(recovery.getByRole("link", { name: "项目" })).toHaveAttribute(
    "href",
    "/projects/",
  );
  await expect(recovery.getByRole("link", { name: "博客" })).toHaveAttribute(
    "href",
    "/blog/",
  );
  await expect(recovery.getByRole("link", { name: "实验室" })).toHaveAttribute(
    "href",
    "/playground/",
  );
});

test("About 输出 canonical、Person JSON-LD 和默认 OG 图", async ({ page }) => {
  await page.goto("/about/");

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://abinzhao.github.io/about/",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://abinzhao.github.io/og-default.svg",
  );

  const jsonLd = await page
    .locator('script[type="application/ld+json"]')
    .textContent();
  expect(JSON.parse(jsonLd ?? "{}")).toMatchObject({
    "@context": "https://schema.org",
    "@type": "Person",
    name: "赵建斌",
    sameAs: [
      "https://github.com/abinzhao",
      "https://juejin.cn/user/2849548342403454",
    ],
  });
});
