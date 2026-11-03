import { describe, expect, test } from 'vitest';
import {
  applyTheme,
  resolveTheme,
  saveTheme,
  toggleTheme,
  resolveThemePreference,
} from '../docs/.vitepress/theme/composables/theme-state';

describe('theme state', () => {
  test('uses a stored theme before the system preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  test('uses the system preference when there is no valid stored theme', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme('unexpected', false)).toBe('light');
  });

  test('keeps system as a preference and resolves it against the current OS', () => {
    expect(resolveThemePreference(null)).toBe('system');
    expect(resolveThemePreference('invalid')).toBe('system');
    expect(resolveThemePreference('dark')).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    const values: string[] = [];
    saveTheme({ setItem: (_key, value) => values.push(value) }, 'system');
    expect(values).toEqual(['system']);
  });

  test('switches to the opposite explicit theme', () => {
    expect(toggleTheme('dark')).toBe('light');
    expect(toggleTheme('light')).toBe('dark');
  });

  test('applies the selected theme to the document root', () => {
    const toggles: Array<[string, boolean | undefined]> = [];
    const root = {
      classList: {
        toggle: (name: string, force?: boolean) => toggles.push([name, force]),
      },
      dataset: {},
      style: {},
    };

    applyTheme(root, 'light');

    expect(root.dataset.theme).toBe('light');
    expect(root.style.colorScheme).toBe('light');
    expect(toggles).toEqual([['dark', false]]);
  });

  test('writes the explicit user preference to storage', () => {
    const writes: Array<[string, string]> = [];

    saveTheme(
      {
        setItem: (key: string, value: string) => writes.push([key, value]),
      },
      'dark',
    );

    expect(writes).toEqual([['abin-lab-theme', 'dark']]);
  });
});
