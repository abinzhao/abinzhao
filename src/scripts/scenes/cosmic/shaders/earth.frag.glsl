uniform sampler2D uLightsMap;
uniform vec3 uSunDirection;
varying vec2 vUv;
varying vec3 vWorldNormal;

void main() {
  vec3 normal = normalize(vWorldNormal);
  vec3 city = texture2D(uLightsMap, vUv).rgb;
  float luminance = max(city.r, max(city.g, city.b));
  float cityMask = smoothstep(0.18, 0.62, luminance);
  float night = 1.0 - smoothstep(
    -0.12,
    0.2,
    dot(normal, uSunDirection)
  );
  vec3 glow = vec3(1.8, 0.68, 0.18) * cityMask * night * 2.7;
  gl_FragColor = vec4(glow, cityMask * night);
}
