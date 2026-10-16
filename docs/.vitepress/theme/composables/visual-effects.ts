export interface AmbientParticle {
  alpha: number;
  phase: number;
  radius: number;
  velocityX: number;
  velocityY: number;
  x: number;
  y: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function getAmbientParticleCount(
  viewportWidth: number,
  coarsePointer: boolean,
): number {
  if (coarsePointer || viewportWidth <= 640) {
    return 18;
  }

  if (viewportWidth <= 1024) return 48;
  return viewportWidth >= 1800 ? 180 : 128;
}

export function createParticleField(
  count: number,
  random: () => number = Math.random,
): AmbientParticle[] {
  return Array.from({ length: count }, () => ({
    alpha: 0.18 + random() * 0.34,
    phase: random() * Math.PI * 2,
    radius: 0.7 + random() * 1.1,
    velocityX: (random() - 0.5) * 0.00016,
    velocityY: (random() - 0.5) * 0.00016,
    x: clamp(random(), 0, 1),
    y: clamp(random(), 0, 1),
  }));
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
