import {
  convertCase,
  convertColor,
  convertCssUnit,
  convertTimestamp,
  decodeBase64,
  decodeUrl,
  encodeBase64,
  encodeUrl,
  estimateTokens,
  formatJson,
  formatPrompt,
  generateGradient,
  generateShadow,
  generateUuid,
  markdownPreview,
  promptTemplate,
  textStats,
  uniqueLines,
  type CaseMode,
} from "@/lib/toolbox/processors";
import type { ToolResult } from "@/lib/toolbox/types";

function processTool(slug: string, input: string, mode: string): ToolResult {
  switch (slug) {
    case "json":
      return formatJson(input, mode === "compact");
    case "base64":
      return mode === "decode" ? decodeBase64(input) : encodeBase64(input);
    case "url-codec":
      return mode === "decode" ? decodeUrl(input) : encodeUrl(input);
    case "timestamp":
      return convertTimestamp(input);
    case "uuid":
      return generateUuid();
    case "text-stats":
      return textStats(input);
    case "unique-lines":
      return uniqueLines(input);
    case "case-converter":
      return convertCase(input, (mode || "camel") as CaseMode);
    case "markdown-preview":
      return markdownPreview(input);
    case "color":
      return convertColor(input);
    case "gradient":
      return generateGradient(input);
    case "shadow":
      return generateShadow(input);
    case "css-unit":
      return convertCssUnit(input);
    case "prompt-builder": {
      const [role = "", goal = "", constraints = "", output = ""] =
        input.split(/\r?\n/);
      return formatPrompt({ role, goal, constraints, output });
    }
    case "token-estimator":
      return estimateTokens(input);
    case "prompt-template":
      return promptTemplate(input);
    default:
      return { ok: false, error: "未知工具。" };
  }
}

export function initToolbox(root: Document = document): void {
  root.querySelectorAll<HTMLElement>("[data-tool-workspace]").forEach((workspace) => {
    if (workspace.dataset.ready === "true") return;
    workspace.dataset.ready = "true";

    const slug = workspace.dataset.toolSlug ?? "";
    const input = workspace.querySelector<HTMLTextAreaElement>("[data-tool-input]");
    const output = workspace.querySelector<HTMLElement>("[data-tool-output]");
    const mode = workspace.querySelector<HTMLSelectElement>("[data-tool-mode]");
    const run = workspace.querySelector<HTMLButtonElement>("[data-tool-run]");
    const clear = workspace.querySelector<HTMLButtonElement>("[data-tool-clear]");
    const copy = workspace.querySelector<HTMLButtonElement>("[data-tool-copy]");
    if (!output || !run) return;

    const execute = (): void => {
      const result = processTool(slug, input?.value ?? "", mode?.value ?? "");
      output.dataset.state = result.ok ? "success" : "error";
      if (result.ok && slug === "markdown-preview") {
        output.innerHTML = result.value;
      } else {
        output.textContent = result.ok ? result.value : result.error;
      }
    };

    run.addEventListener("click", execute);
    mode?.addEventListener("change", execute);
    clear?.addEventListener("click", () => {
      if (input) input.value = "";
      output.textContent = "输入已清空。";
      output.dataset.state = "";
      input?.focus();
    });
    copy?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(output.textContent ?? "");
        copy.textContent = "已复制";
        window.setTimeout(() => {
          copy.textContent = "复制结果";
        }, 1200);
      } catch {
        output.dataset.state = "error";
        output.textContent = "无法访问剪贴板，请手动选择结果。";
      }
    });
  });
}
