"use client";

import {
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";

type CopyStatus = "idle" | "copied" | "failed";

const copyStatusText: Record<CopyStatus, string> = {
  idle: "复制代码",
  copied: "已复制",
  failed: "复制失败",
};

export function CodeBlock({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"pre">) {
  const codeRef = useRef<HTMLPreElement>(null);
  const [status, setStatus] = useState<CopyStatus>("idle");

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(codeRef.current?.innerText ?? "");
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div className="code-block">
      <pre
        {...props}
        ref={codeRef}
        className={className}
      >
        {children}
      </pre>
      <button type="button" onClick={copyCode}>
        {copyStatusText[status]}
      </button>
    </div>
  );
}
