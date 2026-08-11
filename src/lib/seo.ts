export function buildCanonical(origin: string, pathname: string): string {
  const base = origin.replace(/\/+$/, "");
  const path = `/${pathname}`.replace(/\/+/g, "/").replace(/\/?$/, "/");

  return `${base}${path}`;
}
