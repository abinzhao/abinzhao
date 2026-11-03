struct Particle { position: vec2f, velocity: vec2f, destination: vec2f, hue: f32, spare: f32 }
struct Params { timing: vec4f, pointer: vec4f, screen: vec4f, accent: vec4f }
@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: Params;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f, @location(1) hue: f32 }
@vertex
fn vertex(@builtin(vertex_index) vertexId: u32, @builtin(instance_index) instance: u32) -> Vertex {
  let corners = array<vec2f, 6>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(-1,1), vec2f(1,-1), vec2f(1,1));
  let p = particles[instance];
  let uv = corners[vertexId];
  let radius = params.screen.y * (1.0 + p.hue * .6);
  var result: Vertex;
  result.position = vec4f((p.position + uv * radius) / vec2f(params.screen.x, 1.0), 0, 1);
  result.uv = uv; result.hue = p.hue;
  return result;
}
@fragment
fn fragment(input: Vertex) -> @location(0) vec4f {
  let alpha = (1.0 - smoothstep(.15, 1.0, length(input.uv))) * .85;
  let warm = select(vec3f(.59,.29,.12), vec3f(.96,.70,.42), params.screen.z > .5);
  return vec4f(mix(params.accent.rgb, warm, pow(input.hue, 5.0)), alpha);
}
