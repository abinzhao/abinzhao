varying vec3 vNormal;

void main() {
  float intensity = pow(
    max(0.79 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0),
    4.2
  );
  gl_FragColor = vec4(0.08, 0.48, 1.0, intensity * 0.5);
}
