<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    density?: number;
    interactive?: boolean;
    responseStrength?: number;
    lazy?: boolean;
  }>(),
  {
    density: 920,
    interactive: true,
    responseStrength: 0.16,
    lazy: false,
  },
);

const host = ref<HTMLElement>();
const ready = ref(false);
const unavailable = ref(false);
let cleanup: (() => void) | undefined;
let startObserver: IntersectionObserver | undefined;
let disposed = false;

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pointOnSegment(
  from: [number, number],
  to: [number, number],
  progress: number,
) {
  return [
    from[0] + (to[0] - from[0]) * progress,
    from[1] + (to[1] - from[1]) * progress,
  ] as const;
}

function createTargetPositions(count: number) {
  const random = seededRandom(20261013);
  const positions = new Float32Array(count * 3);
  const segments: Array<[[number, number], [number, number]]> = [
    [[-4.2, -2.5], [-3.0, 2.5]],
    [[-3.0, 2.5], [-1.8, -2.5]],
    [[-3.75, -0.3], [-2.25, -0.3]],
    [[0.5, 2.5], [3.6, 2.5]],
    [[2.05, 2.5], [2.05, -2.5]],
    [[0.5, -2.5], [3.6, -2.5]],
  ];

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const onGlyph = index < count * 0.72;

    if (onGlyph) {
      const segment = segments[index % segments.length];
      const progress = random();
      const [x, y] = pointOnSegment(segment[0], segment[1], progress);
      positions[offset] = x + (random() - 0.5) * 0.35;
      positions[offset + 1] = y + (random() - 0.5) * 0.35;
      positions[offset + 2] = (random() - 0.5) * 1.5;
    } else {
      const angle = random() * Math.PI * 2;
      const radius = 3.2 + random() * 4.8;
      positions[offset] = Math.cos(angle) * radius;
      positions[offset + 1] = Math.sin(angle) * radius * 0.58;
      positions[offset + 2] = (random() - 0.5) * 4;
    }
  }

  return positions;
}

async function initializeField() {
  if (!host.value) return;

  try {
    const THREE = await import('three');
    if (disposed || !host.value) return;
    const container = host.value;
    const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionMedia.matches || document.documentElement.classList.contains('quiet-motion');
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const count = reducedMotion
      ? Math.min(360, props.density)
      : coarsePointer
        ? Math.min(620, props.density)
        : props.density;
    const targets = createTargetPositions(count);
    const positions = new Float32Array(targets.length);
    const random = seededRandom(9090);

    for (let index = 0; index < positions.length; index += 3) {
      positions[index] = (random() - 0.5) * 15;
      positions[index + 1] = (random() - 0.5) * 9;
      positions[index + 2] = (random() - 0.5) * 6;
    }
    if (reducedMotion) positions.set(targets);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.z = 12.5;

    const renderer = new THREE.WebGLRenderer({
      antialias: !coarsePointer,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: reducedMotion,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearAlpha(0);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(renderer.domElement);

    const dotCanvas = document.createElement('canvas');
    dotCanvas.width = 64;
    dotCanvas.height = 64;
    const dotContext = dotCanvas.getContext('2d');

    if (!dotContext) {
      throw new Error('Canvas 2D context is unavailable');
    }

    const dotGradient = dotContext.createRadialGradient(32, 32, 0, 32, 32, 32);
    dotGradient.addColorStop(0, 'rgba(255,255,255,1)');
    dotGradient.addColorStop(0.35, 'rgba(255,255,255,.9)');
    dotGradient.addColorStop(1, 'rgba(255,255,255,0)');
    dotContext.fillStyle = dotGradient;
    dotContext.fillRect(0, 0, 64, 64);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    const pointsMaterial = new THREE.PointsMaterial({
      color: 0x7893ff,
      size: 0.1,
      map: new THREE.CanvasTexture(dotCanvas),
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, pointsMaterial);
    scene.add(points);

    const linePositions: number[] = [];
    const lineLimit = Math.min(count - 1, 220);
    for (let index = 0; index < lineLimit; index += 1) {
      const next = (index + 17) % count;
      const currentOffset = index * 3;
      const nextOffset = next * 3;
      const dx = targets[currentOffset] - targets[nextOffset];
      const dy = targets[currentOffset + 1] - targets[nextOffset + 1];
      if (Math.hypot(dx, dy) < 2.1) {
        linePositions.push(
          targets[currentOffset],
          targets[currentOffset + 1],
          targets[currentOffset + 2],
          targets[nextOffset],
          targets[nextOffset + 1],
          targets[nextOffset + 2],
        );
      }
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(linePositions, 3),
    );
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x55d2c3,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
    });
    scene.add(new THREE.LineSegments(lineGeometry, lineMaterial));

    const pointer = new THREE.Vector2(0, 0);
    let frame = 0;
    let visible = true;
    let documentVisible = !document.hidden;

    function resize() {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      if (reducedMotion) render();
    }

    function handlePointerMove(event: PointerEvent) {
      if (!props.interactive || coarsePointer) return;
      const rect = container.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    }

    function handlePointerLeave() {
      pointer.set(0, 0);
    }

    function handleVisibilityChange() {
      documentVisible = !document.hidden;
      resume();
    }

    function updateColors() {
      const dark = document.documentElement.classList.contains('dark');
      pointsMaterial.color.setHex(dark ? 0x7893ff : 0x315fe8);
      lineMaterial.color.setHex(dark ? 0x55d2c3 : 0x0a968a);
      const nextReduced = motionMedia.matches || document.documentElement.classList.contains('quiet-motion');
      if (reducedMotion !== nextReduced) {
        reducedMotion = nextReduced;
        resume();
      } else if (reducedMotion) render();
    }

    function resume() {
      window.cancelAnimationFrame(frame);
      frame = 0;
      if (visible && documentVisible) render();
    }

    function render(time = 0) {
      frame = 0;
      if (visible && documentVisible) {
        const positionAttribute = geometry.getAttribute(
          'position',
        ) as InstanceType<typeof THREE.BufferAttribute>;
        const array = positionAttribute.array as Float32Array;
        const elapsed = time * 0.00025;

        for (let index = 0; index < count; index += 1) {
          const offset = index * 3;
          const wave = reducedMotion
            ? 0
            : Math.sin(elapsed * 4 + index * 0.12) * 0.035;
          const pointerInfluence = props.interactive
            ? props.responseStrength
            : 0;
          const targetX =
            targets[offset] + pointer.x * pointerInfluence + wave;
          const targetY =
            targets[offset + 1] + pointer.y * pointerInfluence - wave;
          array[offset] += (targetX - array[offset]) * 0.035;
          array[offset + 1] += (targetY - array[offset + 1]) * 0.035;
          array[offset + 2] +=
            (targets[offset + 2] - array[offset + 2]) * 0.035;
        }

        positionAttribute.needsUpdate = true;
        points.rotation.y = pointer.x * 0.035;
        points.rotation.x = -pointer.y * 0.025;
        renderer.render(scene, camera);
      }

      if (!reducedMotion && visible && documentVisible) {
        frame = window.requestAnimationFrame(render);
      }
    }

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      resume();
    });
    const themeObserver = new MutationObserver(updateColors);

    resizeObserver.observe(container);
    intersectionObserver.observe(container);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    container.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    });
    container.addEventListener('pointerleave', handlePointerLeave);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    motionMedia.addEventListener('change', updateColors);
    resize();
    updateColors();
    render();
    ready.value = true;

    cleanup = () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      themeObserver.disconnect();
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerleave', handlePointerLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      motionMedia.removeEventListener('change', updateColors);
      geometry.dispose();
      pointsMaterial.map?.dispose();
      pointsMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  } catch {
    unavailable.value = true;
  }
}

onMounted(() => {
  if (!props.lazy || !host.value) {
    initializeField();
    return;
  }

  startObserver = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        startObserver?.disconnect();
        startObserver = undefined;
        initializeField();
      }
    },
    { rootMargin: '240px' },
  );
  startObserver.observe(host.value);
});

onUnmounted(() => {
  disposed = true;
  startObserver?.disconnect();
  cleanup?.();
});
</script>

<template>
  <div
    ref="host"
    class="particle-field"
    :class="{
      'particle-field--ready': ready,
      'particle-field--fallback': unavailable,
    }"
  >
    <div class="particle-field__fallback" aria-hidden="true" />
  </div>
</template>
