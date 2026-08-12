import type { ThreeRuntime } from "@/scripts/scenes/three-runtime";
import type { CosmicLayer } from "../types";
import atmosphereFragmentShader from "../shaders/atmosphere.frag.glsl?raw";
import earthFragmentShader from "../shaders/earth.frag.glsl?raw";

const surfaceVertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmosphereVertexShader = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export async function createEarthLayer(
  three: ThreeRuntime,
  assetsBase: string,
): Promise<CosmicLayer> {
  const loader = new three.TextureLoader();
  const [dayMap, normalMap, specularMap, cloudMap, lightsMap] =
    await Promise.all(
      [
        "earth_atmos_2048.jpg",
        "earth_normal_2048.jpg",
        "earth_specular_2048.jpg",
        "earth_clouds_1024.png",
        "earth_lights_2048.png",
      ].map((name) => loader.loadAsync(`${assetsBase}${name}`)),
    );
  dayMap.colorSpace = three.SRGBColorSpace;
  cloudMap.colorSpace = three.SRGBColorSpace;
  lightsMap.colorSpace = three.SRGBColorSpace;

  const object = new three.Group();
  object.position.set(1.35, -7.25, 0.15);

  const surfaceGeometry = new three.SphereGeometry(7.35, 128, 96);
  const dayMaterial = new three.MeshPhongMaterial({
    map: dayMap,
    normalMap,
    normalScale: new three.Vector2(0.8, 0.8),
    specularMap,
    specular: new three.Color(0x5a8da7),
    shininess: 24,
  });
  const earth = new three.Mesh(surfaceGeometry, dayMaterial);
  earth.rotation.set(0.03, -0.12, -0.12);
  object.add(earth);

  const sunDirection = new three.Vector3(-0.7, 0.18, -0.9).normalize();
  const nightMaterial = new three.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: three.AdditiveBlending,
    uniforms: {
      uLightsMap: { value: lightsMap },
      uSunDirection: { value: sunDirection },
    },
    vertexShader: surfaceVertexShader,
    fragmentShader: earthFragmentShader,
  });
  const night = new three.Mesh(
    new three.SphereGeometry(7.37, 128, 96),
    nightMaterial,
  );
  night.rotation.copy(earth.rotation);
  object.add(night);

  const cloudGeometry = new three.SphereGeometry(7.405, 128, 96);
  const cloudMaterial = new three.MeshPhongMaterial({
    map: cloudMap,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const clouds = new three.Mesh(cloudGeometry, cloudMaterial);
  clouds.rotation.copy(earth.rotation);
  object.add(clouds);

  const atmosphereGeometry = new three.SphereGeometry(7.44, 128, 96);
  const atmosphereMaterial = new three.ShaderMaterial({
    transparent: true,
    side: three.BackSide,
    blending: three.AdditiveBlending,
    depthWrite: false,
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
  });
  object.add(new three.Mesh(atmosphereGeometry, atmosphereMaterial));

  return {
    object,
    update(time) {
      earth.rotation.y = -0.12 + time * 0.0035;
      night.rotation.y = earth.rotation.y;
      clouds.rotation.y = -0.12 + time * 0.006;
    },
    dispose() {
      surfaceGeometry.dispose();
      cloudGeometry.dispose();
      atmosphereGeometry.dispose();
      night.geometry.dispose();
      dayMaterial.dispose();
      nightMaterial.dispose();
      cloudMaterial.dispose();
      atmosphereMaterial.dispose();
      dayMap.dispose();
      normalMap.dispose();
      specularMap.dispose();
      cloudMap.dispose();
      lightsMap.dispose();
    },
  };
}
