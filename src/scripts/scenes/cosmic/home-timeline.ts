const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (value: number) => value * value * (3 - 2 * value);

export function getHomeSceneState(progress: number) {
  const raw = clamp01(progress);
  const eased = smoothstep(raw);
  const zoom = smoothstep(eased);

  return {
    progress: raw,
    eased,
    zoom,
    earthX: 1.35 - eased * 0.45,
    earthY: -7.25 - eased * 5.2,
    galaxyX: 0.4 - zoom * 0.9,
    galaxyY: 2.6 - zoom * 1.42,
    galaxyZ: -5.9 + zoom * 3.55,
    galaxyScale: 1.06 + zoom * 0.5,
    cameraY: 0.25 + zoom * 0.78,
    cameraZ: 8.6 - zoom * 1.15,
    cameraFov: 48 - zoom * 7,
    heroOpacity: 1 - Math.min(1, eased * 1.8),
    galaxyCopyOpacity: Math.max(0, (eased - 0.4) / 0.6),
    cardsOpacity: Math.max(0, (eased - 0.65) / 0.35),
  };
}
