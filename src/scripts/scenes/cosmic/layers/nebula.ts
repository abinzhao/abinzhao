import type { ThreeRuntime } from "@/scripts/scenes/three-runtime";
import type { ShaderMaterial } from "three";
import type { CosmicLayer } from "../types";
import fragmentShader from "../shaders/nebula.frag.glsl?raw";

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export function createNebulaLayer(
  three: ThreeRuntime,
): CosmicLayer {
  const object = new three.Group();
  const geometry = new three.PlaneGeometry(19, 9.2);
  const materials: ShaderMaterial[] = [];

  for (let index = 0; index < 3; index += 1) {
    const material = new three.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uTime: { value: 0 },
        uTravel: { value: 0 },
        uLayer: { value: index },
        uNebula: { value: new three.Vector3(0.03, 0.2, 0.32) },
        uCore: { value: new three.Vector3(1, 0.78, 0.56) },
      },
      vertexShader,
      fragmentShader,
    });
    const cloud = new three.Mesh(geometry, material);
    cloud.position.set((index - 1.5) * 0.35, (index - 1) * 0.12, -6.7 - index * 0.45);
    cloud.rotation.z = index === 1 ? 0.035 : -0.045;
    cloud.scale.setScalar(1 + index * 0.07);
    object.add(cloud);
    materials.push(material);
  }

  return {
    object,
    update(time, progress) {
      materials.forEach((material, index) => {
        material.uniforms.uTime.value = time * (1 + index * 0.08);
        material.uniforms.uTravel.value = progress;
      });
    },
    setPalette(palette) {
      materials.forEach((material) => {
        material.uniforms.uNebula.value.set(...palette.nebula);
        material.uniforms.uCore.value.set(...palette.core);
      });
    },
    dispose() {
      geometry.dispose();
      materials.forEach((material) => material.dispose());
    },
  };
}
