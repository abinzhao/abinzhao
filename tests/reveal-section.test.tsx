// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RevealSection } from "@/components/RevealSection";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("内容进入组件", () => {
  it("服务端默认输出可见内容", () => {
    const markup = renderToStaticMarkup(
      <RevealSection>服务端内容</RevealSection>,
    );

    expect(markup).toContain('class="reveal-section"');
    expect(markup).not.toContain("is-reveal-ready");
  });

  it("进入视口后展示内容并停止观察", () => {
    let handleIntersection: IntersectionObserverCallback | undefined;
    const disconnect = vi.fn();

    class IntersectionObserverStub {
      constructor(callback: IntersectionObserverCallback) {
        handleIntersection = callback;
      }

      observe = vi.fn();
      disconnect = disconnect;
    }

    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);

    render(<RevealSection>主要内容</RevealSection>);

    const section = screen.getByText("主要内容");
    expect(section).toHaveClass("is-reveal-ready");
    expect(section).not.toHaveClass("is-visible");

    act(() => {
      handleIntersection?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(section).toHaveClass("is-visible");
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("浏览器不支持观察器时直接展示内容", () => {
    vi.stubGlobal("IntersectionObserver", undefined);

    render(<RevealSection>降级内容</RevealSection>);

    expect(screen.getByText("降级内容")).toHaveClass("reveal-section", {
      exact: true,
    });
  });
});
