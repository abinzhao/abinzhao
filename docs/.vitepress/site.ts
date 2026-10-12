export const siteBase = "/abinzhao/";

const externalProtocol = /^[a-z][a-z\d+.-]*:/i;

export function withBase(path: string): string {
  if (
    path.startsWith("#") ||
    path.startsWith("//") ||
    externalProtocol.test(path)
  ) {
    return path;
  }

  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (
    normalized === siteBase.slice(0, -1) ||
    normalized.startsWith(siteBase)
  ) {
    return normalized;
  }

  return `${siteBase.slice(0, -1)}${normalized}`;
}
