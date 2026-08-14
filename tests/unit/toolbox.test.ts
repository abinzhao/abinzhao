import { describe, expect, it } from "vitest";
import {
  convertCase,
  convertColor,
  convertTimestamp,
  decodeBase64,
  encodeBase64,
  formatJson,
  formatPrompt,
  generateUuid,
  uniqueLines,
} from "@/lib/toolbox/processors";
import { toolboxGroups, toolboxTools } from "@/lib/toolbox/registry";

describe("工具箱注册表", () => {
  it("覆盖四个首发分组且每个工具拥有独立 slug", () => {
    expect(toolboxGroups.map(({ id }) => id)).toEqual([
      "developer",
      "text",
      "design",
      "ai",
    ]);
    expect(toolboxTools).toHaveLength(16);
    expect(new Set(toolboxTools.map(({ slug }) => slug)).size).toBe(16);
  });
});

describe("工具箱处理器", () => {
  it("格式化有效 JSON 并拒绝无效 JSON", () => {
    expect(formatJson('{"name":"abinzhao"}')).toEqual({
      ok: true,
      value: '{\n  "name": "abinzhao"\n}',
    });
    expect(formatJson("{")).toMatchObject({ ok: false });
  });

  it("使用 UTF-8 编解码 Base64", () => {
    expect(encodeBase64("阿斌")).toEqual({ ok: true, value: "6Zi/5paM" });
    expect(decodeBase64("6Zi/5paM")).toEqual({ ok: true, value: "阿斌" });
  });

  it("保留首次出现顺序并去除重复行", () => {
    expect(uniqueLines("a\nb\na\n")).toEqual({ ok: true, value: "a\nb" });
  });

  it("转换命名格式", () => {
    expect(convertCase("hello world", "camel")).toEqual({
      ok: true,
      value: "helloWorld",
    });
    expect(convertCase("helloWorld", "kebab")).toEqual({
      ok: true,
      value: "hello-world",
    });
  });

  it("转换时间戳并拒绝无效输入", () => {
    expect(convertTimestamp("0")).toMatchObject({
      ok: true,
      value: "1970-01-01T00:00:00.000Z",
    });
    expect(convertTimestamp("not-a-time")).toMatchObject({ ok: false });
  });

  it("转换颜色并验证 HEX", () => {
    expect(convertColor("#54e7ff")).toMatchObject({
      ok: true,
      value: expect.stringContaining("rgb(84 231 255)"),
    });
    expect(convertColor("blue")).toMatchObject({ ok: false });
  });

  it("生成 UUID 并组装结构化 Prompt", () => {
    expect(generateUuid()).toMatchObject({
      ok: true,
      value: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
    });
    expect(
      formatPrompt({
        role: "前端工程师",
        goal: "审查组件",
        constraints: "只报告真实问题",
        output: "Markdown",
      }),
    ).toEqual({
      ok: true,
      value:
        "角色：前端工程师\n目标：审查组件\n约束：只报告真实问题\n输出格式：Markdown",
    });
  });
});
