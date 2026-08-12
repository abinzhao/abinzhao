uniform float uPointSize;
uniform float uTime;
uniform float uTravel;
attribute float scale;
varying vec3 vColor;
varying float vPulse;
varying float vTravel;

void main() {
  vColor = color;
  vTravel = uTravel;
  float phase = position.x * 2.17 + position.z * 3.11;
  float twinkle = 0.82 + 0.18 * sin(uTime * 0.8 + phase);
  vPulse = twinkle;
  vec3 animated = position;
  animated.y += sin(uTime * 0.1 + length(position.xz)) * 0.005;
  vec4 viewPosition = modelViewMatrix * vec4(animated, 1.0);
  gl_PointSize = max(
    1.0,
    scale * uPointSize * twinkle * (48.0 / max(1.0, -viewPosition.z))
  );
  gl_Position = projectionMatrix * viewPosition;
}
