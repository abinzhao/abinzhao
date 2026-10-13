import { describe, expect, it, vi } from 'vitest';
import { copyCode, extractCode } from '../docs/.vitepress/theme/utils/code-copy';

describe('code clipboard recovery', () => {
  it('copies the resulting code and removes deleted lines', async () => {
    const block = document.createElement('div');
    block.className = 'language-js';
    block.innerHTML = '<pre><code><span class="line diff remove">wrong\n</span><span class="line diff add">correct\n</span></code></pre>';
    expect(extractCode(block)).toBe('correct\n');
  });

  it('uses DOM selection when asynchronous clipboard permission is rejected', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')) },
    });
    const selected: string[] = [];
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: () => {
        selected.push((document.activeElement as HTMLTextAreaElement).value);
        return true;
      },
    });
    expect(await copyCode('const result = 3;')).toBe(true);
    expect(selected).toEqual(['const result = 3;']);
    expect(document.querySelector('textarea')).toBeNull();
  });
});
