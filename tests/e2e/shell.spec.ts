import { expect, test } from "@playwright/test";

test("全局壳输出品牌、SEO 和可访问导航", async ({ page }) => {
  await page.goto("/abinzhao/");

  await expect(page).toHaveTitle("ZJB.DEV｜前端、鸿蒙与 AI 应用实践");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://abinzhao.github.io/abinzhao/",
  );
  await expect(page.getByRole("link", { name: "跳到主要内容" })).toHaveAttribute(
    "href",
    "#main-content",
  );
  await expect(page.locator("main")).toHaveAttribute("id", "main-content");
  await expect(page.getByRole("link", { name: "ZJB.DEV 首页" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
});

test("主题选择持久化且存储失败时仍可切换", async ({ page }) => {
  await page.goto("/abinzhao/");

  const toggle = page.getByRole("button", { name: /切换到.+模式/ });
  await toggle.click();
  const selectedTheme = await page.locator("html").getAttribute("data-theme");
  expect(selectedTheme).toMatch(/^(dark|light)$/);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    selectedTheme!,
  );

  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error("storage unavailable");
    };
  });
  await toggle.click();
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-theme",
    selectedTheme!,
  );
});

test("移动菜单支持按钮、链接和 Escape 关闭", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/abinzhao/");

  const menu = page.locator("[data-menu-toggle]");
  await expect(menu).toHaveAttribute("aria-label", "打开菜单");
  await expect
    .poll(async () => (await menu.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44);

  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toHaveAttribute("aria-label", "关闭菜单");

  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toHaveAttribute("aria-label", "打开菜单");

  await menu.click();
  const projectLink = page.getByRole("link", { name: "项目", exact: true });
  await projectLink.evaluate((link) => {
    link.addEventListener("click", (event) => event.preventDefault());
  });
  await projectLink.click();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toHaveAttribute("aria-label", "打开菜单");

  await menu.click();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toHaveAttribute("aria-label", "打开菜单");
  await expect(menu).toBeFocused();
});

test("菜单关闭时 Escape 不改变当前焦点", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/abinzhao/");

  const brand = page.getByRole("link", { name: "ZJB.DEV 首页" });
  await brand.focus();
  await page.keyboard.press("Escape");

  await expect(brand).toBeFocused();
});

test("Header 滚动态和返回顶部可用", async ({ page }) => {
  await page.goto("/abinzhao/");
  await page.evaluate(() => {
    document.body.style.minHeight = "250vh";
    window.scrollTo(0, window.innerHeight + 100);
  });

  const header = page.locator("[data-site-header]");
  const backToTop = page.getByRole("button", { name: "返回顶部" });
  await expect(header).toHaveAttribute("data-scrolled", "true");
  await expect(backToTop).toBeVisible();

  await backToTop.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
