function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function calculateReadingProgress(
  scrollY: number,
  articleTop: number,
  articleHeight: number,
  viewportHeight: number,
): number {
  const readableDistance = articleHeight - viewportHeight;

  if (readableDistance <= 0) {
    return scrollY >= articleTop ? 1 : 0;
  }

  return clamp((scrollY - articleTop) / readableDistance, 0, 1);
}

export function selectActiveHeading(
  headings: Array<{ id: string; top: number }>,
  readingOffset: number,
): string {
  return headings.reduce(
    (activeHeading, heading) =>
      heading.top <= readingOffset ? heading.id : activeHeading,
    '',
  );
}
