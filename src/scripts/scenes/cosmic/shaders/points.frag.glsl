uniform float uOpacity;
uniform vec3 uSignal;
varying vec3 vColor;
varying float vPulse;
varying float vTravel;

void main() {
  vec2 point = gl_PointCoord - 0.5;
  float distanceToCenter = length(point);
  float core = smoothstep(0.46, 0.055, distanceToCenter);
  float halo = smoothstep(0.5, 0.16, distanceToCenter) * 0.18;
  float flare =
    smoothstep(0.055, 0.0, abs(point.x)) *
    smoothstep(0.46, 0.08, abs(point.y)) *
    vTravel *
    0.24;
  float alpha = (core * core + halo + flare) * vPulse * uOpacity;
  vec3 color = mix(vColor, uSignal, 0.16 + vTravel * 0.12);
  gl_FragColor = vec4(color, alpha);
}
