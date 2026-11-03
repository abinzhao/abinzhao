struct Particle { position: vec2f, velocity: vec2f, destination: vec2f, hue: f32, spare: f32 }
struct Params { timing: vec4f, pointer: vec4f, screen: vec4f, accent: vec4f }
@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: Params;

@compute @workgroup_size(64)
fn update(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(params.timing.w)) { return; }
  var p = particles[id.x];
  let dt = params.timing.x * params.pointer.w;
  let flow = params.timing.z == 1.0;
  let strength = select(8.0, 22.0, params.timing.z == 2.0);
  var force = (p.destination - p.position) * strength;
  if (flow) {
    force = vec2f(-p.position.y, p.position.x) * 2.0
      + vec2f(cos(params.timing.y + p.hue * 12.0), sin(params.timing.y + p.hue * 12.0)) * .6;
  }
  if (params.pointer.z > .5) {
    let direction = p.position - params.pointer.xy;
    force += direction * (.12 / (dot(direction, direction) + .02));
  }
  p.velocity = (p.velocity + force * dt) * exp(-select(7.0, 1.6, flow) * dt);
  p.position = clamp(p.position + p.velocity * dt, vec2f(-1.7, -1.15), vec2f(1.7, 1.15));
  particles[id.x] = p;
}
