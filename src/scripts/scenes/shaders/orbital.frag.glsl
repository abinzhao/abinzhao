precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uSpeed;
uniform float uScale;
uniform float uHue;

float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);

  float a = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(cell + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(cell + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(cell + vec2(1.0), vec2(127.1, 311.7))) * 43758.5453);

  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float fbm(vec2 point) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int octave = 0; octave < 5; octave++) {
    value += amplitude * noise(point);
    point = mat2(1.6, 1.2, -1.2, 1.6) * point + 0.17;
    amplitude *= 0.5;
  }

  return value;
}

vec3 hueShift(vec3 color, float angle) {
  vec3 axis = normalize(vec3(1.0));
  float cosine = cos(angle);
  float sine = sin(angle);
  return color * cosine
    + cross(axis, color) * sine
    + axis * dot(axis, color) * (1.0 - cosine);
}

void main() {
  vec2 resolution = max(uResolution, vec2(1.0));
  vec2 uv = (2.0 * gl_FragCoord.xy - resolution) / min(resolution.x, resolution.y);
  float time = uTime * uSpeed;
  float radius = length(uv);
  float angle = atan(uv.y, uv.x);
  vec2 orbit = vec2(angle * 1.35, radius * 4.2 - time * 0.35);
  vec2 flow = uv * (1.8 * uScale);

  float first = fbm(flow + vec2(cos(angle + time), sin(angle - time)) * 0.55);
  float second = fbm(orbit + vec2(first * 1.8, time * 0.16));
  float ribbons = sin(angle * 3.0 + radius * 8.0 - time + second * 5.0);

  vec3 orange = vec3(1.0, 0.27, 0.08);
  vec3 lemon = vec3(1.0, 0.88, 0.22);
  vec3 violet = vec3(0.28, 0.22, 0.95);
  vec3 color = mix(violet, orange, smoothstep(0.2, 0.82, second));
  color = mix(color, lemon, smoothstep(0.42, 0.96, first + ribbons * 0.18));
  color = hueShift(color, radians(uHue - 24.0));
  color *= 0.72 + 0.45 * smoothstep(0.0, 1.0, first + second);
  color *= 1.0 - smoothstep(1.15, 2.05, radius);

  gl_FragColor = vec4(color, 1.0);
}
