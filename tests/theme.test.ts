import { describe, expect, it } from 'vitest';

describe('resolveThemePreference', () => {
  it('uses the operating system preference in system mode', async () => {
    const { resolveThemePreference } = await import(
      '../docs/.vitepress/theme/utils/theme'
    );

    expect(resolveThemePreference('system', true)).toBe('dark');
    expect(resolveThemePreference('system', false)).toBe('light');
  });

  it('keeps an explicit user theme independent of the system', async () => {
    const { resolveThemePreference } = await import(
      '../docs/.vitepress/theme/utils/theme'
    );

    expect(resolveThemePreference('light', true)).toBe('light');
    expect(resolveThemePreference('dark', false)).toBe('dark');
  });

  it('falls back to system mode for an unknown stored value', async () => {
    const { normalizeThemePreference } = await import(
      '../docs/.vitepress/theme/utils/theme'
    );

    expect(normalizeThemePreference('sepia')).toBe('system');
    expect(normalizeThemePreference(null)).toBe('system');
  });
});
