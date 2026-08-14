import { expect, test } from "@playwright/test";

test("工具箱索引提供四类和十六个独立工具", async ({ page }) => {
  await page.goto("/abinzhao/toolbox/");

  await expect(
    page.getByRole("heading", { name: "工具箱", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".toolbox-hero")).toHaveCount(0);
  await expect(page.locator(".toolbox-group")).toHaveCount(4);
  await expect(page.locator(".tool-card")).toHaveCount(16);
  await expect(page.getByRole("link", { name: /JSON 格式化/ })).toHaveAttribute(
    "href",
    "/abinzhao/toolbox/json/",
  );
});

test("工具箱支持搜索和分类组合筛选", async ({ page }) => {
  await page.goto("/abinzhao/toolbox/");

  await page.getByRole("button", { name: "AI 提效" }).click();
  await expect(page.locator(".tool-card:visible")).toHaveCount(3);
  await expect(page.locator(".toolbox-group:visible")).toHaveCount(1);

  await page.getByRole("searchbox", { name: "搜索工具" }).fill("Token");
  await expect(page.locator(".tool-card:visible")).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Token 粗估/ })).toBeVisible();
});

test("JSON 工具本地处理正常与错误输入", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (/api|graphql/i.test(new URL(request.url()).pathname)) {
      apiRequests.push(request.url());
    }
  });
  await page.goto("/abinzhao/toolbox/json/");

  const input = page.locator("[data-tool-input]");
  const output = page.locator("[data-tool-output]");
  await input.fill('{"name":"abinzhao"}');
  await page.getByRole("button", { name: "运行" }).click();
  await expect(output).toContainText('"name": "abinzhao"');

  await input.fill("{");
  await page.getByRole("button", { name: "运行" }).click();
  await expect(output).toHaveAttribute("data-state", "error");
  expect(apiRequests).toEqual([]);
});

test("命令面板通过快捷键查找工具", async ({ page }) => {
  await page.goto("/abinzhao/");
  await page.keyboard.press("Control+K");

  const input = page.getByRole("combobox");
  await expect(input).toBeFocused();
  await input.fill("JSON");
  await expect(page.getByRole("option", { name: /JSON 格式化/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-command-palette]")).toBeHidden();
});
