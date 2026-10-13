export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export function normalizeThemePreference(
  value: string | null,
): ThemePreference {
  if (value === 'light' || value === 'dark') {
    return value;
  }

  return 'system';
}

export function resolveThemePreference(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }

  return preference;
}
