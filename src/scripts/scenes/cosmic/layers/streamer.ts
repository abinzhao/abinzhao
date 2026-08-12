import type { ThreeRuntime } from "@/scripts/scenes/three-runtime";
import type { CosmicLayer } from "../types";
import fragmentShader from "../shaders/streamer.frag.glsl?raw";

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

export function createStreamerLayer(
  three: ThreeRuntime,
): CosmicLayer {
  const geometry = new three.PlaneGeometry(2, 2);
  const material = new three.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 },
      uTravel: { value: 0 },
      uPointer: { value: new three.Vector2() },
      uSignal: { value: new three.Vector3(0.5, 0.93, 1) },
    },
    vertexShader,
    fragmentShader,
  });
  const object = new three.Mesh(geometry, material);
  object.frustumCulled = false;

  return {
    object,
    update(time, progress) {
      material.uniforms.uTime.value = time;
      material.uniforms.uTravel.value = progress;
    },
    setPalette(palette) {
      material.uniforms.uSignal.value.set(...palette.signal);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
