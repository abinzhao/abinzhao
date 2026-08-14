import { withoutBase, withBase } from "./site";

export type Locale = "zh" | "en";

const englishPrefix = "/en";
const localizedCorePaths = new Set([
  "/",
  "/projects/",
  "/blog/",
  "/playground/",
  "/toolbox/",
  "/about/",
]);

function normalizePath(path: string): string {
  const withoutProjectBase = withoutBase(path);
  const withoutEnglishPrefix = withoutProjectBase.replace(/^\/en(?=\/|$)/, "");
  const normalized = withoutEnglishPrefix || "/";

  if (normalized === "/") {
    return normalized;
  }

  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

export function localeFromPath(pathname: string): Locale {
  const path = withoutBase(pathname);
  return path === englishPrefix || path.startsWith(`${englishPrefix}/`)
    ? "en"
    : "zh";
}

export function localizedPath(path: string, locale: Locale): string {
  const normalized = normalizePath(path);
  if (locale === "zh") {
    return withBase(normalized);
  }

  return withBase(
    normalized === "/" ? `${englishPrefix}/` : `${englishPrefix}${normalized}`,
  );
}

export function switchLocalePath(
  pathname: string,
  targetLocale: Locale,
): string {
  const normalized = normalizePath(pathname);

  if (targetLocale === "en" && !localizedCorePaths.has(normalized)) {
    return localizedPath("/", targetLocale);
  }

  return localizedPath(normalized, targetLocale);
}
