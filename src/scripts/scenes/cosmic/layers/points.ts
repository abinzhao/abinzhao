import type { ThreeRuntime } from "@/scripts/scenes/three-runtime";
import type { PointData } from "../galaxy-data";
import type { CosmicLayer } from "../types";
import fragmentShader from "../shaders/points.frag.glsl?raw";
import vertexShader from "../shaders/points.vert.glsl?raw";

interface PointLayerOptions {
  pointSize: number;
  opacity: number;
  position?: [number, number, number];
}

export function createPointLayer(
  three: ThreeRuntime,
  data: PointData,
  options: PointLayerOptions,
): CosmicLayer {
  const geometry = new three.BufferGeometry();
  geometry.setAttribute(
    "position",
    new three.BufferAttribute(data.positions, 3),
  );
  geometry.setAttribute("color", new three.BufferAttribute(data.colors, 3));
  geometry.setAttribute("scale", new three.BufferAttribute(data.scales, 1));

  const material = new three.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: three.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uPointSize: { value: options.pointSize },
      uOpacity: { value: options.opacity },
      uTime: { value: 0 },
      uTravel: { value: 0 },
      uSignal: { value: new three.Vector3(0.5, 0.93, 1) },
    },
    vertexShader,
    fragmentShader,
  });
  const object = new three.Points(geometry, material);
  if (options.position) object.position.set(...options.position);

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
