export type ToolGroupId = "developer" | "text" | "design" | "ai";

export type ToolResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export interface ToolboxGroup {
  id: ToolGroupId;
  label: string;
  labelEn: string;
  description: string;
}

export interface ToolboxTool {
  slug: string;
  group: ToolGroupId;
  title: string;
  titleEn: string;
  description: string;
  placeholder: string;
  sample: string;
}
