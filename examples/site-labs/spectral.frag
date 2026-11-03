#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 resolution;
uniform vec2 lightPosition;
uniform float roughness;
uniform float material;
uniform float time;
uniform float darkTheme;
uniform vec3 accent;

mat2 rotate(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
float surface(vec3 p) {
  p.xz *= rotate(.38 + time * .08);
  p.yz *= rotate(.95);
  float wave = .025 * cos(atan(p.z, p.x) * 3.);
  return length(vec2(length(p.xz) - .79, p.y)) - (.225 + wave);
}
vec3 normalAt(vec3 p) {
  vec2 e = vec2(.001, 0);
  return normalize(vec3(surface(p + e.xyy) - surface(p - e.xyy), surface(p + e.yxy) - surface(p - e.yxy), surface(p + e.yyx) - surface(p - e.yyx)));
}
vec3 environment(vec3 ray) {
  float bands = pow(max(0., sin(ray.y * 8. + ray.x * 2.)), 12.);
  vec3 base = mix(vec3(.045,.07,.09), vec3(.72,.79,.78), 1. - darkTheme);
  vec3 tint = .5 + .5 * cos(6.28318 * (ray.y * .28 + vec3(.0,.32,.65)));
  return base + tint * .22 + bands * vec3(.65,.8,.85);
}
void main() {
  vec2 uv = (gl_FragCoord.xy * 2. - resolution) / resolution.y;
  vec3 origin = vec3(0, 0, 3.4);
  vec3 ray = normalize(vec3(uv, -2.65));
  float distance = 0.;
  bool hit = false;
  for (int i = 0; i < 64; i++) {
    float next = surface(origin + ray * distance);
    if (next < .001) { hit = true; break; }
    distance += next;
    if (distance > 6.) break;
  }
  if (!hit) { outColor = vec4(0); return; }
  vec3 p = origin + ray * distance;
  vec3 n = normalAt(p);
  vec3 light = normalize(vec3(lightPosition * 2., 2.8) - p);
  float fresnel = .04 + .96 * pow(1. - max(dot(n, -ray), 0.), 5.);
  vec3 reflection = environment(reflect(ray, n));
  // 固定三次环境采样的色散近似，不求解真实内部光路或多次全反射。
  vec3 transmission = vec3(
    environment(refract(ray, n, 1. / 1.42)).r,
    environment(refract(ray, n, 1. / 1.48)).g,
    environment(refract(ray, n, 1. / 1.54)).b
  );
  float sheen = pow(max(dot(n, normalize(light - ray)), 0.), mix(180., 6., roughness));
  vec3 color;
  if (material < .5) {
    color = mix(transmission * mix(vec3(.8), accent, .23), reflection, .18 + fresnel * .8);
  } else if (material < 1.5) {
    vec3 film = .5 + .5 * cos(6.28318 * (dot(n, -ray) * 1.7 + vec3(0., .28, .58)));
    color = mix(reflection, film, .7) * (.6 + .4 * max(dot(n, light), 0.));
  } else {
    color = reflection * mix(accent, vec3(.8,.82,.86), roughness * .7);
  }
  color += sheen * mix(1.15, .25, roughness);
  color = mix(color, color * .65 + accent * .12, roughness * .3);
  outColor = vec4(pow(max(color, vec3(0)), vec3(1. / 2.2)), 1.);
}
