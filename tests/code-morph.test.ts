import { describe, expect, it } from 'vitest';
import { tokenizeSteps } from '../docs/.vitepress/data/code-tokens';
import { loadCodeSteps } from '../docs/.vitepress/data/code-morph.data';

describe('code steps built from runnable sources', () => {
  it('preserves exact whitespace and stable token identity for a reversible insertion', () => {
    const steps = tokenizeSteps(['.signal {\n  width: 100%;\n}\n', '.signal {\n  contain: paint;\n  width: 100%;\n}\n']);
    expect(steps[0].map((token) => token.text).join('')).toBe('.signal {\n  width: 100%;\n}\n');
    expect(new Set(steps[1].map((token) => token.id)).size).toBe(steps[1].length);
    const width = steps[0].find((token) => token.text === 'width')!;
    expect(steps[1].find((token) => token.text === 'width')?.id).toBe(width.id);
  });
  it('ships exact source and tokens for each preview without runtime highlighter or eval', () => {
    const steps = loadCodeSteps();
    expect(steps).toHaveLength(3);
    for (const step of steps) {
      expect(step.tokens.map((token) => token.text).join('')).toBe(step.source);
      expect(step.source).toContain('.signal');
      expect(step.source).toContain('var(--progress)');
    }
    expect(steps[0].source).toContain('width: calc');
    expect(steps[1].source).toContain('scaleX');
    expect(steps[2].source).toContain('contain: layout paint');
  });
});
