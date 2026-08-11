"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  isTheme,
  resolveInitialTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/theme";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getDocumentTheme(): Theme {
  if (typeof document === "undefined") {
    return "light";
  }

  return isTheme(document.documentElement.dataset.theme)
    ? document.documentElement.dataset.theme
    : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getDocumentTheme);

  function setTheme(nextTheme: Theme) {
    setThemeState(nextTheme);
    applyTheme(nextTheme);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // 存储不可用时，当前页面仍保留用户选择的主题。
    }
  }

  function toggleTheme() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  useEffect(() => {
    let storedTheme: unknown = null;

    try {
      storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // 隐私限制可能导致本地存储不可用。
    }

    if (isTheme(storedTheme)) {
      // Hydration recovery must align provider state and DOM with the persisted theme.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThemeState(storedTheme);
      applyTheme(storedTheme);
      return;
    }

    if (typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = (prefersDark: boolean) => {
      const nextTheme = resolveInitialTheme(null, prefersDark);
      setThemeState(nextTheme);
      applyTheme(nextTheme);
    };
    const handleChange = (event: MediaQueryListEvent) => {
      try {
        if (isTheme(localStorage.getItem(THEME_STORAGE_KEY))) {
          return;
        }
      } catch {
        // 存储不可用时继续跟随系统主题。
      }

      syncSystemTheme(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
