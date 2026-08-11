import * as THREE from "three";

export type CelestialSceneController = {
  pause: () => void;
  resume: () => void;
  resize: () => void;
  dispose: () => void;
};

type ParticleField = {
  curve: THREE.CatmullRomCurve3;
  geometry: THREE.BufferGeometry;
  phases: Float32Array;
  speed: number;
};

const TEXTURE_WIDTH = 192;
const TEXTURE_HEIGHT = 96;
const PARTICLES_PER_FIELD = 72;

function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createLavaTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = TEXTURE_WIDTH;
  textureCanvas.height = TEXTURE_HEIGHT;

  const context = textureCanvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D unavailable");
  }

  const image = context.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const random = createSeededRandom(0x51a7c0de);

  // 固定种子与周期波纹共同生成纹理，确保每次加载得到相同的熔岩表面。
  for (let y = 0; y < TEXTURE_HEIGHT; y += 1) {
    for (let x = 0; x < TEXTURE_WIDTH; x += 1) {
      const index = (y * TEXTURE_WIDTH + x) * 4;
      const wave =
        Math.sin(x * 0.12 + Math.sin(y * 0.09) * 2.4) * 0.5 +
        Math.sin(y * 0.16 + x * 0.035) * 0.32;
      const grain = (random() - 0.5) * 0.34;
      const heat = THREE.MathUtils.clamp(0.5 + wave + grain, 0, 1);

      image.data[index] = 70 + Math.round(heat * 185);
      image.data[index + 1] = 18 + Math.round(heat * 88);
      image.data[index + 2] = 38 + Math.round(heat * 34);
      image.data[index + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;

  return texture;
}

function createMagneticCurves() {
  return [
    new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-4.6, -0.4, 0.2),
        new THREE.Vector3(-2.5, 2.2, -0.7),
        new THREE.Vector3(0, 3, -1),
        new THREE.Vector3(2.8, 1.8, -0.4),
        new THREE.Vector3(4.7, -0.7, 0.4),
        new THREE.Vector3(2.4, -2.3, 0.8),
        new THREE.Vector3(-0.2, -2.8, 1),
        new THREE.Vector3(-3, -2, 0.7),
      ],
      true,
      "catmullrom",
      0.45,
    ),
    new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-4.1, 0.8, -1.1),
        new THREE.Vector3(-2, 2.7, 0.2),
        new THREE.Vector3(1, 2.4, 1.1),
        new THREE.Vector3(4.2, 0.6, 0.4),
        new THREE.Vector3(2.7, -2.1, -0.8),
        new THREE.Vector3(-0.6, -2.5, -1),
        new THREE.Vector3(-3.3, -1.5, -0.3),
      ],
      true,
      "catmullrom",
      0.5,
    ),
    new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-3.8, 1.4, 0.9),
        new THREE.Vector3(-1.2, 3.1, 0.5),
        new THREE.Vector3(2.1, 2.2, -0.8),
        new THREE.Vector3(4.3, -0.2, -0.6),
        new THREE.Vector3(1.8, -2.8, 0.2),
        new THREE.Vector3(-1.4, -2.6, 0.8),
        new THREE.Vector3(-4.2, -0.6, 0.4),
      ],
      true,
      "catmullrom",
      0.4,
    ),
  ];
}

function createParticleField(
  curve: THREE.CatmullRomCurve3,
  index: number,
) {
  const phases = new Float32Array(PARTICLES_PER_FIELD);
  const positions = new Float32Array(PARTICLES_PER_FIELD * 3);
  const random = createSeededRandom(0xc311e57 + index * 997);
  const point = new THREE.Vector3();

  for (let particle = 0; particle < PARTICLES_PER_FIELD; particle += 1) {
    const phase = (particle / PARTICLES_PER_FIELD + random() * 0.035) % 1;
    phases[particle] = phase;
    curve.getPointAt(phase, point);
    point.toArray(positions, particle * 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  return {
    curve,
    geometry,
    phases,
    speed: 0.018 + index * 0.004,
  } satisfies ParticleField;
}

export function createCelestialScene(
  canvas: HTMLCanvasElement,
): CelestialSceneController {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.15, 10.5);

  const texture = createLavaTexture();
  const sphereGeometry = new THREE.SphereGeometry(2.15, 72, 48);
  const sphereMaterial = new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xff7457,
    emissive: 0x36102b,
    emissiveIntensity: 0.38,
    roughness: 0.66,
    metalness: 0.08,
  });
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.rotation.set(-0.08, -0.45, 0.03);
  scene.add(sphere);

  // 环境光保留暗部细节，方向光负责塑造可信的球体明暗与高光。
  const ambientLight = new THREE.AmbientLight(0x7f83ff, 0.7);
  const keyLight = new THREE.DirectionalLight(0xffd0a8, 4.2);
  keyLight.position.set(-4, 5, 6);
  const rimLight = new THREE.DirectionalLight(0x6b63ff, 2.4);
  rimLight.position.set(4, -2, -3);
  scene.add(ambientLight, keyLight, rimLight);

  const particleMaterial = new THREE.PointsMaterial({
    color: 0xffb18a,
    size: 0.055,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x8b8df9,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
  });
  const particleFields = createMagneticCurves().map((curve, index) => {
    const field = createParticleField(curve, index);
    const particles = new THREE.Points(field.geometry, particleMaterial);
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(
      curve.getPoints(128),
    );
    const line = new THREE.LineLoop(lineGeometry, lineMaterial);
    scene.add(line, particles);

    return { ...field, lineGeometry };
  });

  const pointerTarget = new THREE.Vector2();
  const pointerCurrent = new THREE.Vector2();
  const handlePointerMove = (event: PointerEvent) => {
    const bounds = canvas.getBoundingClientRect();
    pointerTarget.set(
      ((event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5) * 0.5,
      ((event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5) * -0.35,
    );
  };
  const handlePointerLeave = () => pointerTarget.set(0, 0);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerleave", handlePointerLeave);

  let animationFrame: number | null = null;
  let disposed = false;
  const point = new THREE.Vector3();

  const resize = () => {
    if (disposed) {
      return;
    }

    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  const renderFrame = (time: number) => {
    if (disposed) {
      return;
    }

    const elapsed = time * 0.001;
    sphere.rotation.y = -0.45 + elapsed * 0.055;
    pointerCurrent.lerp(pointerTarget, 0.045);
    camera.position.x = pointerCurrent.x;
    camera.position.y = 0.15 + pointerCurrent.y;
    camera.lookAt(0, 0, 0);

    for (const field of particleFields) {
      const positions = field.geometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute;

      for (let index = 0; index < field.phases.length; index += 1) {
        const progress = (field.phases[index] + elapsed * field.speed) % 1;
        field.curve.getPointAt(progress, point);
        positions.setXYZ(index, point.x, point.y, point.z);
      }

      positions.needsUpdate = true;
    }

    renderer.render(scene, camera);
    animationFrame = window.requestAnimationFrame(renderFrame);
  };

  const pause = () => {
    if (animationFrame !== null) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  };

  const resume = () => {
    if (!disposed && animationFrame === null) {
      animationFrame = window.requestAnimationFrame(renderFrame);
    }
  };

  const dispose = () => {
    if (disposed) {
      return;
    }

    disposed = true;
    pause();
    canvas.removeEventListener("pointermove", handlePointerMove);
    canvas.removeEventListener("pointerleave", handlePointerLeave);

    sphereGeometry.dispose();
    sphereMaterial.dispose();
    texture.dispose();
    particleMaterial.dispose();
    lineMaterial.dispose();
    for (const field of particleFields) {
      field.geometry.dispose();
      field.lineGeometry.dispose();
    }

    scene.clear();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  resize();
  resume();

  return { pause, resume, resize, dispose };
}
