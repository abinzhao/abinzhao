import type { ToolResult } from "./types";

const success = (value: string): ToolResult => ({ ok: true, value });
const failure = (error: string): ToolResult => ({ ok: false, error });

export function formatJson(input: string, compact = false): ToolResult {
  try {
    return success(JSON.stringify(JSON.parse(input), null, compact ? 0 : 2));
  } catch {
    return failure("JSON 格式无效，请检查括号、引号和逗号。");
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function encodeBase64(input: string): ToolResult {
  return success(bytesToBase64(new TextEncoder().encode(input)));
}

export function decodeBase64(input: string): ToolResult {
  try {
    const binary = atob(input.trim());
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    return success(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return failure("Base64 内容无效或不是 UTF-8 文本。");
  }
}

export function encodeUrl(input: string): ToolResult {
  return success(encodeURIComponent(input));
}

export function decodeUrl(input: string): ToolResult {
  try {
    return success(decodeURIComponent(input));
  } catch {
    return failure("URL 编码无效。");
  }
}

export function convertTimestamp(input: string): ToolResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return failure("请输入时间戳或日期。");
  }

  const numeric = Number(trimmed);
  const date = Number.isFinite(numeric)
    ? new Date(Math.abs(numeric) < 1e12 ? numeric * 1000 : numeric)
    : new Date(trimmed);

  return Number.isNaN(date.valueOf())
    ? failure("无法识别该时间。")
    : success(date.toISOString());
}

export function generateUuid(): ToolResult {
  return success(crypto.randomUUID());
}

export function textStats(input: string): ToolResult {
  const lines = input.split(/\r?\n/);
  const words =
    input.match(/[\u3400-\u9fff]|[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? [];
  return success(
    [
      `字符：${[...input].length}`,
      `字词：${words.length}`,
      `行数：${lines.length}`,
      `非空行：${lines.filter((line) => line.trim()).length}`,
    ].join("\n"),
  );
}

export function uniqueLines(input: string): ToolResult {
  const seen = new Set<string>();
  const lines = input
    .split(/\r?\n/)
    .filter((line) => {
      if (!line || seen.has(line)) {
        return false;
      }
      seen.add(line);
      return true;
    });
  return success(lines.join("\n"));
}

export type CaseMode = "camel" | "pascal" | "kebab" | "snake";

function wordsFromIdentifier(input: string): string[] {
  return input
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

export function convertCase(input: string, mode: CaseMode): ToolResult {
  const words = wordsFromIdentifier(input);
  if (words.length === 0) {
    return failure("请输入需要转换的文本。");
  }

  const titled = words.map(
    (word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
  );
  const value = {
    camel: `${words[0]}${titled.slice(1).join("")}`,
    pascal: titled.join(""),
    kebab: words.join("-"),
    snake: words.join("_"),
  }[mode];
  return success(value);
}

export function markdownPreview(input: string): ToolResult {
  const escaped = input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const html = escaped
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br>");
  return success(`<p>${html}</p>`);
}

function rgbToHsl(red: number, green: number, blue: number): string {
  const [r, g, b] = [red, green, blue].map((channel) => channel / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    if (max === g) hue = 60 * ((b - r) / delta + 2);
    if (max === b) hue = 60 * ((r - g) / delta + 4);
  }

  return `hsl(${Math.round((hue + 360) % 360)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%)`;
}

export function convertColor(input: string): ToolResult {
  const match = input.trim().match(/^#([\da-f]{6})$/i);
  if (!match) {
    return failure("请输入 6 位 HEX 颜色，例如 #54e7ff。");
  }
  const value = match[1];
  const [red, green, blue] = [0, 2, 4].map((index) =>
    Number.parseInt(value.slice(index, index + 2), 16),
  );
  const max = Math.max(red, green, blue) / 255;
  const min = Math.min(red, green, blue) / 255;
  const lightness = Math.round(((max + min) / 2) * 100);
  return success(
    [
      `hex: #${value.toLowerCase()}`,
      `rgb(${red} ${green} ${blue})`,
      rgbToHsl(red, green, blue),
      `oklch(${lightness}% 0.16 210)`,
    ].join("\n"),
  );
}

export function generateGradient(input: string): ToolResult {
  const colors = input
    .split(/\r?\n|,/)
    .map((color) => color.trim())
    .filter(Boolean);
  if (colors.length < 2 || colors.some((color) => !/^#[\da-f]{6}$/i.test(color))) {
    return failure("请至少输入两个 6 位 HEX 颜色。");
  }
  return success(`linear-gradient(120deg, ${colors.join(", ")})`);
}

export function generateShadow(input: string): ToolResult {
  const level = Number.parseInt(input, 10);
  const shadows = {
    1: "0 8px 24px rgb(0 0 0 / 0.14)",
    2: "0 18px 50px rgb(0 0 0 / 0.24)",
    3: "0 32px 90px rgb(0 0 0 / 0.34)",
  };
  return level in shadows
    ? success(shadows[level as keyof typeof shadows])
    : failure("请输入 1、2 或 3。");
}

export function convertCssUnit(input: string): ToolResult {
  const match = input.trim().match(/^(-?[\d.]+)\s*(px|rem)$/i);
  if (!match) {
    return failure("请输入 px 或 rem，例如 24px。");
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return failure("数值无效。");
  }
  return success(
    match[2].toLowerCase() === "px"
      ? `${value / 16}rem`
      : `${value * 16}px`,
  );
}

export interface PromptParts {
  role: string;
  goal: string;
  constraints: string;
  output: string;
}

export function formatPrompt(parts: PromptParts): ToolResult {
  if (!parts.goal.trim()) {
    return failure("至少需要填写目标。");
  }
  return success(
    [
      `角色：${parts.role || "专业助手"}`,
      `目标：${parts.goal}`,
      `约束：${parts.constraints || "基于事实，明确不确定性"}`,
      `输出格式：${parts.output || "结构化文本"}`,
    ].join("\n"),
  );
}

export function estimateTokens(input: string): ToolResult {
  const chinese = (input.match(/[\u3400-\u9fff]/g) ?? []).length;
  const other = input.replace(/[\u3400-\u9fff]/g, "").trim().length;
  return success(`约 ${Math.max(0, Math.ceil(chinese / 1.5 + other / 4))} tokens`);
}

export function promptTemplate(input: string): ToolResult {
  if (!input.trim()) {
    return failure("请输入任务描述。");
  }
  return success(
    [
      "## 任务",
      input.trim(),
      "",
      "## 上下文",
      "- 说明已有事实与输入",
      "",
      "## 约束",
      "- 不虚构未提供的信息",
      "- 标注不确定性",
      "",
      "## 输出",
      "- 先给结论，再给证据与下一步",
    ].join("\n"),
  );
}
