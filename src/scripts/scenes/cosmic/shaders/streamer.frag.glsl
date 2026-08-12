uniform float uTime;
uniform float uTravel;
uniform vec2 uPointer;
uniform vec3 uSignal;
varying vec2 vUv;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 fraction = fract(point);
  fraction = fraction * fraction * (3.0 - 2.0 * fraction);
  return mix(
    mix(hash(cell), hash(cell + vec2(1.0, 0.0)), fraction.x),
    mix(hash(cell + vec2(0.0, 1.0)), hash(cell + 1.0), fraction.x),
    fraction.y
  );
}

void main() {
  vec2 point = (vUv - 0.5) * vec2(1.8, 1.0) + uPointer * 0.04;
  float flow = noise(point * 10.0 + vec2(uTime * 0.025, -uTime * 0.012));
  float detail = noise(point * 24.0 - vec2(uTime * 0.018, uTime * 0.01));
  float waveA = abs(
    point.y + 0.24 - sin(point.x * 2.2 - uTime * 0.045) * 0.1
  );
  float waveB = abs(
    point.y - 0.16 - sin(point.x * 1.7 + uTime * 0.035) * 0.075
  );
  float ribbonA = smoothstep(0.085, 0.0, waveA) * (0.3 + flow * 0.7);
  float ribbonB = smoothstep(0.052, 0.0, waveB) * (0.38 + detail * 0.62);
  float ribbon = ribbonA + ribbonB * 0.72;
  vec3 color = uSignal * ribbon * (0.11 + uTravel * 0.12);
  gl_FragColor = vec4(color, ribbon * 0.14);
}
