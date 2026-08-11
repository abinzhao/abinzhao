export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "personal-site-theme";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function resolveInitialTheme(
  storedTheme: unknown,
  systemPrefersDark: boolean,
): Theme {
  if (isTheme(storedTheme)) {
    return storedTheme;
  }

  return systemPrefersDark ? "dark" : "light";
}
