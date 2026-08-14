import { describe, expect, it } from "vitest";
import {
  localeFromPath,
  localizedPath,
  switchLocalePath,
} from "@/lib/i18n";

describe("本地化路由", () => {
  it("为核心页面生成独立英文路由", () => {
    expect(localizedPath("/projects/", "en")).toBe(
      "/abinzhao/en/projects/",
    );
    expect(localizedPath("/toolbox/", "en")).toBe(
      "/abinzhao/en/toolbox/",
    );
    expect(localizedPath("/", "zh")).toBe("/abinzhao/");
  });

  it("从包含 base path 的地址识别语言", () => {
    expect(localeFromPath("/abinzhao/en/about/")).toBe("en");
    expect(localeFromPath("/abinzhao/about/")).toBe("zh");
  });

  it("切换语言时保留核心页面", () => {
    expect(switchLocalePath("/abinzhao/projects/", "en")).toBe(
      "/abinzhao/en/projects/",
    );
    expect(switchLocalePath("/abinzhao/en/toolbox/", "zh")).toBe(
      "/abinzhao/toolbox/",
    );
  });

  it("没有英文对应页时回退英文首页", () => {
    expect(
      switchLocalePath("/abinzhao/blog/harmonyos-ai-app/", "en"),
    ).toBe("/abinzhao/en/");
    expect(switchLocalePath("/abinzhao/toolbox/json/", "en")).toBe(
      "/abinzhao/en/",
    );
  });
});
