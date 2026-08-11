// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArticleToc } from "@/components/ArticleToc";
import { CodeBlock } from "@/components/CodeBlock";
import { WritingCollection } from "@/components/WritingCollection";
import type { ArticleHeading } from "@/lib/article-presentation";
import type { ArticleMeta } from "@/lib/content";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const crossPlatformArticle: ArticleMeta = {
  title: "跨端界面实践",
  slug: "cross-platform-interface",
  summary: "从真实项目整理跨端界面的实现边界。",
  publishedAt: "2026-08-10",
  tags: ["HarmonyOS", "ArkUI"],
  topic: "跨端开发",
  draft: false,
};

const toolingArticle: ArticleMeta = {
  title: "前端工具链复盘",
  slug: "frontend-tooling-review",
  summary: "记录前端工具链的取舍与验证过程。",
  publishedAt: "2026-08-09",
  tags: ["TypeScript", "工程化"],
  topic: "前端工程",
  draft: false,
};

const articleHeadings: ArticleHeading[] = [
  { id: "知识骨架", text: "知识骨架", level: 2 },
  { id: "验证过程", text: "验证过程", level: 3 },
];

describe("文章集合", () => {
  it("只有一个真实主题时隐藏筛选栏", () => {
    render(<WritingCollection articles={[crossPlatformArticle]} />);

    expect(
      screen.queryByRole("group", { name: "文章分类" }),
    ).not.toBeInTheDocument();
  });

  it("使用原生按钮筛选多主题文章并可恢复全部文章", () => {
    render(
      <WritingCollection
        articles={[crossPlatformArticle, toolingArticle]}
      />,
    );

    const filter = screen.getByRole("group", { name: "文章分类" });
    const toolingButton = screen.getByRole("button", { name: "前端工程" });

    expect(filter).toContainElement(toolingButton);
    expect(toolingButton.tagName).toBe("BUTTON");
    expect(toolingButton).toHaveAttribute("type", "button");

    fireEvent.click(toolingButton);

    expect(toolingButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(toolingArticle.title)).toBeInTheDocument();
    expect(
      screen.queryByText(crossPlatformArticle.title),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "全部" }));

    expect(screen.getByText(toolingArticle.title)).toBeInTheDocument();
    expect(screen.getByText(crossPlatformArticle.title)).toBeInTheDocument();
  });

  it("卡片只展示真实文章字段并使用可聚焦链接", () => {
    const { container } = render(
      <WritingCollection articles={[crossPlatformArticle]} />,
    );

    const articleLink = screen.getByRole("link", {
      name: new RegExp(crossPlatformArticle.title),
    });

    expect(articleLink.tagName).toBe("A");
    expect(articleLink).toHaveAttribute(
      "href",
      `/writing/${crossPlatformArticle.slug}`,
    );
    expect(screen.getByText(crossPlatformArticle.summary)).toBeInTheDocument();
    expect(screen.getByText(crossPlatformArticle.publishedAt)).toHaveAttribute(
      "datetime",
      crossPlatformArticle.publishedAt,
    );
    expect(screen.getByText(crossPlatformArticle.topic!)).toBeInTheDocument();
    crossPlatformArticle.tags.forEach((tag) => {
      expect(screen.getByText(tag)).toBeInTheDocument();
    });
    expect(container).not.toHaveTextContent(/阅读量|浏览量|分页|下一页/);
  });

  it("文章卡片按桌面、平板和移动端使用 3、2、1 栏", () => {
    const componentsCss = readFileSync(
      resolve(process.cwd(), "app/styles/components.css"),
      "utf8",
    );
    const pagesCss = readFileSync(
      resolve(process.cwd(), "app/styles/pages.css"),
      "utf8",
    );

    expect(componentsCss).toMatch(
      /\.topic-filter[\s\S]*min-height:\s*2\.75rem/,
    );
    expect(pagesCss).toMatch(
      /\.writing-grid[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(pagesCss).toMatch(
      /@media \(max-width:\s*60rem\)[\s\S]*\.writing-grid[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(pagesCss).toMatch(
      /@media \(max-width:\s*47\.5rem\)[\s\S]*\.writing-grid[\s\S]*grid-template-columns:\s*1fr/,
    );
  });
});

describe("文章目录", () => {
  it("少于两个标题时不渲染目录", () => {
    render(
      <ArticleToc
        headings={[{ id: "唯一标题", text: "唯一标题", level: 2 }]}
      />,
    );

    expect(
      screen.queryByRole("navigation", { name: "文章目录" }),
    ).not.toBeInTheDocument();
  });

  it("使用可点击锚点并根据可见章节标记当前位置", async () => {
    let handleIntersection: IntersectionObserverCallback | undefined;
    const observedIds: string[] = [];

    /** 保存观察器回调，以真实章节元素驱动目录状态。 */
    class IntersectionObserverStub {
      constructor(callback: IntersectionObserverCallback) {
        handleIntersection = callback;
      }

      observe(element: Element) {
        observedIds.push(element.id);
      }

      disconnect() {}
    }

    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);

    render(
      <>
        <h2 id="知识骨架">知识骨架</h2>
        <h3 id="验证过程">验证过程</h3>
        <ArticleToc headings={articleHeadings} />
      </>,
    );

    expect(
      screen.getByRole("navigation", { name: "文章目录" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "知识骨架" })).toHaveAttribute(
      "href",
      "#知识骨架",
    );
    expect(screen.getByRole("link", { name: "验证过程" })).toHaveAttribute(
      "href",
      "#验证过程",
    );
    expect(observedIds).toEqual(["知识骨架", "验证过程"]);

    handleIntersection?.(
      [
        {
          isIntersecting: true,
          target: document.getElementById("验证过程")!,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "验证过程" })).toHaveAttribute(
        "aria-current",
        "location",
      );
    });
    expect(screen.getByRole("link", { name: "知识骨架" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("观察器不可用时仍保留可点击目录", () => {
    vi.stubGlobal("IntersectionObserver", undefined);

    render(<ArticleToc headings={articleHeadings} />);

    expect(screen.getByRole("link", { name: "知识骨架" })).toHaveAttribute(
      "href",
      "#知识骨架",
    );
    expect(
      screen.getByRole("link", { name: "知识骨架" }),
    ).not.toHaveAttribute("aria-current");
  });
});

describe("文章代码块", () => {
  it("复制真实代码文本并显示成功状态", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const { container } = render(
      <CodeBlock>
        <code>{"const answer = 42;\n"}</code>
      </CodeBlock>,
    );

    /** jsdom 未实现 innerText，这里按真实 DOM 文本补齐浏览器语义。 */
    Object.defineProperty(container.querySelector("pre")!, "innerText", {
      configurable: true,
      get() {
        return this.textContent ?? "";
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "复制代码" }));

    expect(writeText).toHaveBeenCalledWith("const answer = 42;\n");
    expect(
      await screen.findByRole("button", { name: "已复制" }),
    ).toBeInTheDocument();
  });

  it("剪贴板写入失败时显示失败状态", async () => {
    /** 模拟浏览器拒绝剪贴板写入，验证非颜色错误反馈。 */
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("clipboard denied")),
      },
    });

    render(
      <CodeBlock>
        <code>npm run build</code>
      </CodeBlock>,
    );

    fireEvent.click(screen.getByRole("button", { name: "复制代码" }));

    expect(
      await screen.findByRole("button", { name: "复制失败" }),
    ).toBeInTheDocument();
  });
});
