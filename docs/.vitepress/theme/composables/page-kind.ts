export type CustomPageKind =
  | 'about'
  | 'article'
  | 'blog'
  | 'column'
  | 'columns'
  | 'home'
  | 'projects'
  | 'chat';

export interface PageMetadata {
  date?: unknown;
  status?: unknown;
}

export function getCustomPageKind(
  path: string,
  layout?: unknown,
  metadata?: PageMetadata,
): CustomPageKind | undefined {
  if (
    layout === 'home' ||
    layout === 'about' ||
    layout === 'blog' ||
    layout === 'columns' ||
    layout === 'projects' ||
    layout === 'chat'
  ) {
    return layout;
  }

  if (metadata?.date) {
    return 'article';
  }

  if (metadata?.status) {
    return 'column';
  }

  const normalizedPath = path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;

  if (normalizedPath === '/' || normalizedPath === '/index') {
    return 'home';
  }

  if (normalizedPath === '/about') {
    return 'about';
  }

  return undefined;
}
