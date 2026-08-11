export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "zjb-theme";

export function resolveInitialTheme(
  stored: unknown,
  systemDark: boolean,
): Theme {
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return systemDark ? "dark" : "light";
}
