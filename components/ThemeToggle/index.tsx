"use client";

import { useTheme } from "@/components/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextThemeLabel = theme === "dark" ? "浅色" : "深色";

  return (
    <button
      type="button"
      aria-label={`切换到${nextThemeLabel}模式`}
      onClick={toggleTheme}
    >
      {nextThemeLabel}模式
    </button>
  );
}
