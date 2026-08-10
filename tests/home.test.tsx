// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import HomePage from "@/app/page";

afterEach(cleanup);

describe("首页", () => {
  it("展示已确认身份和阶段一核心入口", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "构建跨端数字体验。" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("赵建斌", { selector: ".identity" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看项目" })).toHaveAttribute(
      "href",
      "/work",
    );
    expect(screen.getByRole("link", { name: "了解我" })).toHaveAttribute(
      "href",
      "/about",
    );
  });

  it("为三类受众提供明确入口", () => {
    render(<HomePage />);

    expect(screen.getByText("技术同行")).toBeInTheDocument();
    expect(screen.getByText("招聘与管理者")).toBeInTheDocument();
    expect(screen.getByText("潜在合作方")).toBeInTheDocument();
  });

  it("不展示未经确认的经验年限或项目数量", () => {
    const { container } = render(<HomePage />);

    expect(container).not.toHaveTextContent(/年经验|项目数量|合作客户/);
  });
});
