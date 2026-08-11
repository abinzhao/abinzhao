// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AboutPage from "@/app/about/page";
import ContactPage from "@/app/contact/page";
import WorkPage from "@/app/work/page";
import WritingPage from "@/app/writing/page";
import { Footer } from "@/components/Footer";

afterEach(cleanup);

describe("阶段一核心页面", () => {
  it("项目页展示经过公开证据核对的真实项目", () => {
    const { container } = render(<WorkPage />);

    expect(
      screen.getByRole("heading", { name: "项目与案例" }),
    ).toBeInTheDocument();
    expect(screen.getByText("HarmonyOS Next 开发知识库")).toBeInTheDocument();
    expect(screen.getByText("CPS 图片压缩工具")).toBeInTheDocument();
    expect(screen.getByText("Code Analysis 代码分析工具")).toBeInTheDocument();
    expect(container.querySelectorAll(".project-card")).toHaveLength(5);
    expect(container.querySelectorAll(".project-card.glass-card")).toHaveLength(5);
    expect(container).not.toHaveTextContent(
      /阅读量|浏览量|合作客户|性能提升|20\d{2}\s*[–-]\s*20\d{2}/,
    );
  });

  it("文章页展示真实文章并提供 RSS", () => {
    const { container } = render(<WritingPage />);

    expect(screen.getByRole("heading", { name: "文章与思考" })).toBeInTheDocument();
    expect(
      screen.getByText("从公开仓库整理 HarmonyOS Next 学习路径"),
    ).toBeInTheDocument();
    const rssLink = screen.getByRole("link", { name: "订阅 RSS" });
    expect(rssLink.tagName).toBe("A");
    expect(rssLink).toHaveAttribute("href", "/rss.xml");
    expect(container.querySelector(".writing-grid")).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "文章分类" }),
    ).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent(/阅读量|浏览量|分页|下一页/);
  });

  it("关于页展示公开资料中已确认的技术方向", () => {
    const { container } = render(<AboutPage />);

    expect(screen.getByText("HarmonyOS 开发专家")).toBeInTheDocument();
    expect(screen.getByText("ArkTS")).toBeInTheDocument();
    expect(screen.getByText("ArkUI")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("Node.js")).toBeInTheDocument();
    expect(screen.getByText("AI Agent")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "能力演进" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "跨端界面" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "前端工程" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "智能开发" })).toBeInTheDocument();
    expect(screen.queryByText(/公司|证书编号|工作年限/)).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent(/20\d{2}\s*[–-]\s*20\d{2}/);
  });

  it("联系页展示真实公开入口且不展示虚构邮箱", () => {
    const { container } = render(<ContactPage />);

    expect(screen.getByText("联系表单将在服务确认后开放。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/abinzhao",
    );
    expect(screen.getByRole("link", { name: "掘金" })).toHaveAttribute(
      "href",
      "https://juejin.cn/user/2849548342403454",
    );
    expect(screen.getByRole("link", { name: "RSS" })).toHaveAttribute(
      "href",
      "/rss.xml",
    );
    expect(screen.getByRole("button", { name: "暂未开放提交" })).toBeDisabled();
    expect(container).not.toHaveTextContent(/example\.com|@zjb\.dev/);
  });

  it("页脚提供带文字标签的公开入口", () => {
    render(<Footer />);

    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/abinzhao",
    );
    expect(screen.getByRole("link", { name: "掘金" })).toHaveAttribute(
      "href",
      "https://juejin.cn/user/2849548342403454",
    );
    expect(screen.getByRole("link", { name: "RSS" })).toHaveAttribute(
      "href",
      "/rss.xml",
    );
    expect(screen.getByRole("link", { name: "联系" })).toHaveAttribute(
      "href",
      "/contact",
    );
  });
});
