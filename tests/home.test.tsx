// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";
import { ThemeProvider } from "@/components/ThemeProvider";

vi.mock("@/components/CelestialScene", () => ({
  CelestialScene: () => <div data-testid="celestial-scene-boundary" />,
}));

afterEach(cleanup);

function renderHome() {
  return render(
    <ThemeProvider>
      <HomePage />
    </ThemeProvider>,
  );
}

describe("首页", () => {
  it("展示已确认身份和阶段一核心入口", () => {
    renderHome();

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

  it("通过公共场景组件渲染首页星体", () => {
    renderHome();

    expect(screen.getByTestId("celestial-scene-boundary")).toBeInTheDocument();
  });

  it("为三类受众提供明确入口", () => {
    renderHome();

    expect(screen.getByRole("link", { name: /文章/ })).toHaveAttribute(
      "href",
      "/writing",
    );
    expect(screen.getAllByRole("link", { name: /项目/ })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: expect.stringMatching(/\/work$/) }),
      ]),
    );
    expect(screen.getByRole("link", { name: /建立联系/ })).toHaveAttribute(
      "href",
      "/contact",
    );
  });

  it("按沉浸首屏、精选内容、最新文章、代表项目和联系行动组织首页", () => {
    renderHome();

    const sections = [
      screen.getByRole("region", { name: "个人介绍" }),
      screen.getByRole("heading", { name: "精选内容" }).closest("section"),
      screen.getByRole("heading", { name: "最新文章" }).closest("section"),
      screen.getByRole("heading", { name: "代表项目" }).closest("section"),
      screen.getByRole("region", { name: "联系行动" }),
    ];

    const orderedSections = sections.filter(
      (section): section is HTMLElement => section !== null,
    );

    expect(orderedSections).toHaveLength(5);
    orderedSections.slice(1).forEach((section, index) => {
      expect(
        orderedSections[index].compareDocumentPosition(section) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  it("唯一文章只出现在最新文章中", () => {
    renderHome();

    expect(
      screen.getAllByText("从公开仓库整理 HarmonyOS Next 学习路径"),
    ).toHaveLength(1);
  });

  it("不展示未经确认的经验年限或项目数量", () => {
    const { container } = renderHome();

    expect(container).not.toHaveTextContent(/年经验|项目数量|合作客户/);
  });
});
