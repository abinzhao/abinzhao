export interface Point {
  x: number;
  y: number;
}

export interface VerletPoint extends Point {
  previousX: number;
  previousY: number;
}

export function integratePoint(
  point: VerletPoint,
  acceleration: Point,
): VerletPoint {
  return {
    x: point.x + (point.x - point.previousX) + acceleration.x,
    y: point.y + (point.y - point.previousY) + acceleration.y,
    previousX: point.x,
    previousY: point.y,
  };
}

export function constrainPoint(
  point: Point,
  width: number,
  height: number,
  radius: number,
): Point {
  return {
    x: Math.min(width - radius, Math.max(radius, point.x)),
    y: Math.min(height - radius, Math.max(radius, point.y)),
  };
}

export function constrainDistance(
  first: Point,
  second: Point,
  targetDistance: number,
): [Point, Point] {
  const deltaX = second.x - first.x;
  const deltaY = second.y - first.y;
  const distance = Math.hypot(deltaX, deltaY);

  if (distance === 0) return [{ ...first }, { ...second }];

  const correction = ((distance - targetDistance) / distance) * 0.5;
  const offsetX = deltaX * correction;
  const offsetY = deltaY * correction;

  return [
    { x: first.x + offsetX, y: first.y + offsetY },
    { x: second.x - offsetX, y: second.y - offsetY },
  ];
}
