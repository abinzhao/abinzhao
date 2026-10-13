export function extractCode(block: HTMLElement): string {
  const clone = block.querySelector('pre')?.cloneNode(true) as HTMLElement | undefined;
  if (!clone) return '';
  clone.querySelectorAll('.diff.remove, .vp-copy-ignore').forEach((node) => node.remove());
  const text = clone.textContent ?? '';
  return /language-(shellscript|shell|bash|sh|zsh)\b/.test(block.className)
    ? text.replace(/^ *(\$|>) /gm, '').trim()
    : text;
}

export async function copyCode(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Permission can reject asynchronously; keep a selection-based fallback.
    const previous = document.activeElement as HTMLElement | null;
    const selection = document.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : undefined;
    const field = document.createElement('textarea');
    field.value = text;
    field.readOnly = true;
    field.style.cssText = 'position:fixed;left:-9999px;top:0;font-size:16px';
    document.body.append(field);
    field.focus({ preventScroll: true });
    field.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      field.remove();
      if (range && selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      previous?.focus({ preventScroll: true });
    }
  }
}
