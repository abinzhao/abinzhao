export const THEME_STORAGE_KEY = 'abin-lab-theme';

export type Theme = 'dark' | 'light';

interface ThemeRoot {
  classList: Pick<DOMTokenList, 'toggle'>;
  dataset: DOMStringMap;
  style: Pick<CSSStyleDeclaration, 'colorScheme'>;
}

interface ThemeStorage {
  setItem(key: string, value: string): void;
}

function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

export function resolveTheme(storedTheme: unknown, prefersDark: boolean): Theme {
  return isTheme(storedTheme) ? storedTheme : prefersDark ? 'dark' : 'light';
}

export function toggleTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

export function applyTheme(root: ThemeRoot, theme: Theme): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.classList.toggle('dark', theme === 'dark');
}

export function saveTheme(storage: ThemeStorage, theme: Theme): void {
  storage.setItem(THEME_STORAGE_KEY, theme);
}
