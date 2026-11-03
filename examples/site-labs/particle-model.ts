export interface ParticleInput { mode: number; speed: number; x: number; y: number; active: boolean }

/** 8 floats / particle: position, velocity, glyph target, stable hue, spare. */
export function createParticles(count: number) {
  const data = new Float32Array(count * 8);
  const segments = [
    [-.58, .42, -.98, 0], [-.98, 0, -.58, -.42],
    [.58, .42, .98, 0], [.98, 0, .58, -.42],
    [.22, .55, -.22, -.55],
  ];
  let seed = 7301;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  for (let i = 0; i < count; i++) {
    const [x1, y1, x2, y2] = segments[i % segments.length];
    const t = random(); const jitter = (random() - .5) * .045;
    const length = Math.hypot(x2 - x1, y2 - y1);
    const angle = random() * Math.PI * 2; const radius = Math.sqrt(random()) * 1.15;
    data.set([Math.cos(angle) * radius, Math.sin(angle) * radius * .7, 0, 0, x1 + (x2 - x1) * t - jitter * (y2 - y1) / length, y1 + (y2 - y1) * t + jitter * (x2 - x1) / length, random(), 0], i * 8);
  }
  return data;
}

/** 同一受限积分器的 CPU 路径；GPU 对应公式见 particle.wgsl。 */
export function stepParticles(data: Float32Array, delta: number, time: number, input: ParticleInput) {
  const dt = delta * input.speed;
  for (let i = 0; i < data.length; i += 8) {
    const x = data[i], y = data[i + 1], hue = data[i + 6];
    const flow = input.mode === 1;
    const strength = input.mode === 2 ? 22 : 8;
    let ax = flow ? -y * 2 + Math.cos(time + hue * 12) * .6 : (data[i + 4] - x) * strength;
    let ay = flow ? x * 2 + Math.sin(time + hue * 12) * .6 : (data[i + 5] - y) * strength;
    if (input.active) {
      const dx = x - input.x, dy = y - input.y;
      const force = .12 / (dx * dx + dy * dy + .02);
      ax += dx * force; ay += dy * force;
    }
    const damping = Math.exp(-(flow ? 1.6 : 7) * dt);
    data[i + 2] = (data[i + 2] + ax * dt) * damping;
    data[i + 3] = (data[i + 3] + ay * dt) * damping;
    data[i] = Math.max(-1.7, Math.min(1.7, x + data[i + 2] * dt));
    data[i + 1] = Math.max(-1.15, Math.min(1.15, y + data[i + 3] * dt));
  }
}

export function createFixedStepper(step: (delta: number, time: number) => void) {
  const interval = 1 / 120;
  let remainder = 0; let time = 0;
  return {
    advance(delta: number) {
      remainder += Math.min(Math.max(delta, 0), .05);
      while (remainder + 1e-9 >= interval) { time += interval; step(interval, time); remainder -= interval; }
    },
    reset() { remainder = 0; time = 0; },
  };
}
