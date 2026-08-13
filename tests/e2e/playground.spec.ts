import { expect, test } from "@playwright/test";

const experiments = [
  { slug: "particle-galaxy", title: "粒子银河" },
  { slug: "shader-art", title: "着色器艺术" },
  { slug: "physics-sandbox", title: "物理沙盒" },
];

test("实验列表只展示真实集合中的三个公开实验", async ({ page }) => {
  await page.goto("/abinzhao/playground/");

  await expect(page.locator("body")).toHaveAttribute(
    "data-page-variant",
    "playground",
  );

  for (const experiment of experiments) {
    await expect(
      page.getByRole("link", { name: experiment.title, exact: true }),
    ).toHaveAttribute("href", `/abinzhao/playground/${experiment.slug}/`);
  }
  await expect(page.locator("[data-experiment-card]")).toHaveCount(3);
});

test("粒子银河详情保留说明、控制区和返回入口", async ({ page }) => {
  await page.goto("/abinzhao/playground/particle-galaxy/");

  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator("[data-experiment-canvas]")).toHaveCount(1);
  await expect(page.locator("[data-cosmic-canvas]")).toHaveCount(0);
  await expect(page.locator("body")).toHaveAttribute(
    "data-page-variant",
    "experiment",
  );

  await expect(page.getByRole("heading", { name: "粒子银河" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "实验目标" })).toBeVisible();
  await expect(page.getByText("实验状态")).toBeVisible();
  await expect(page.locator("canvas")).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("button", { name: "暂停实验" })).toBeVisible();
  await expect(page.getByRole("button", { name: "继续实验" })).toBeVisible();
  await expect(page.getByRole("button", { name: "重置实验" })).toBeVisible();
  await expect(page.getByRole("link", { name: "返回实验列表" })).toHaveAttribute(
    "href",
    "/abinzhao/playground/",
  );
});

test("无 JavaScript 时实验说明和导航仍可用", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto("/abinzhao/playground/shader-art/");
  await expect(page.getByRole("heading", { name: "着色器艺术" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "交互方式" })).toBeVisible();
  await expect(page.getByText("需要 JavaScript 才能启动交互实验")).toBeVisible();
  await expect(page.getByRole("link", { name: "返回实验列表" })).toBeVisible();

  await context.close();
});

test("移动端详情为单栏且没有横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/abinzhao/playground/physics-sandbox/");

  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);

  const columns = page.locator("[data-experiment-layout]");
  await expect(columns).toHaveCSS("grid-template-columns", "358px");
});
