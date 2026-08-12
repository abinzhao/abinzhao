uniform float uTime;
uniform float uTravel;
uniform float uLayer;
uniform vec3 uNebula;
uniform vec3 uCore;
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

float fbm(vec2 point) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int index = 0; index < 6; index++) {
    value += amplitude * noise(point);
    point = mat2(1.72, 1.18, -1.18, 1.72) * point;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 point = (vUv - 0.5) * vec2(2.0, 1.0);
  point += vec2(uLayer * 0.13, -uLayer * 0.045);
  point.y += sin(point.x * (2.05 + uLayer * 0.18) + uLayer) * 0.09;
  float cloud = fbm(point * (2.1 + uLayer * 0.22) + vec2(uTime * 0.008, uLayer * 3.1));
  float detail = fbm(point * (6.4 + uLayer * 0.7) - vec2(uTime * 0.012, uLayer));
  float band = exp(-pow(abs(point.y), 1.22) * (6.2 - uLayer * 0.65));
  float core = exp(-length(vec2((point.x - 0.18) * 0.7, point.y * 2.45)) * 3.55);
  float dust = exp(-pow(abs(point.y + 0.02 + detail * 0.065), 1.12) * 28.0);
  vec3 cold = mix(uNebula * 0.7, uNebula, 0.5 + uLayer * 0.14);
  vec3 color = mix(cold, uCore, core * 0.7);
  color *= band * (0.32 + cloud * 0.98 + uTravel * 0.24) + core * 0.7;
  color = mix(color, vec3(0.002, 0.004, 0.009), dust * 0.34);
  float alpha = clamp((band * (0.13 + cloud * 0.38) + core * 0.29) * (1.0 - uLayer * 0.16), 0.0, 0.66);
  gl_FragColor = vec4(color, alpha);
}
