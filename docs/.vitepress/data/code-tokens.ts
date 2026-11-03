export interface CodeToken { id: string; text: string; kind: 'space' | 'word' | 'number' | 'punctuation' | 'comment' }

/** 有限 CSS 示例的词法着色和 LCS 映射只在构建时运行，不解释或执行源码。 */
export function tokenizeSteps(sources: string[]): CodeToken[][] {
  let serial = 0;
  let previous: CodeToken[] = [];
  return sources.map((source) => {
    const words = source.match(/\/\*[\s\S]*?\*\/|\s+|#[\da-fA-F]+|--?[\w-]+|[a-zA-Z_][\w-]*|\d+(?:\.\d+)?|[^\s]/g) ?? [];
    const columns = words.length + 1;
    const table = new Uint16Array((previous.length + 1) * columns);
    for (let i = previous.length - 1; i >= 0; i--) {
      for (let j = words.length - 1; j >= 0; j--) {
        table[i * columns + j] = previous[i].text === words[j]
          ? 1 + table[(i + 1) * columns + j + 1]
          : Math.max(table[(i + 1) * columns + j], table[i * columns + j + 1]);
      }
    }
    const ids = new Map<number, string>();
    for (let i = 0, j = 0; i < previous.length && j < words.length;) {
      if (previous[i].text === words[j]) { ids.set(j, previous[i].id); i++; j++; }
      else if (table[(i + 1) * columns + j] >= table[i * columns + j + 1]) i++;
      else j++;
    }
    previous = words.map((text, index) => ({
      id: ids.get(index) ?? `token-${serial++}`, text,
      kind: /^\s+$/.test(text) ? 'space' : text.startsWith('/*') ? 'comment' : /^[\d#]/.test(text) ? 'number' : /^[a-zA-Z_-]/.test(text) ? 'word' : 'punctuation',
    }));
    return previous;
  });
}
