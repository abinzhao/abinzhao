<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vitepress';
import {
  createParticleField,
  getAmbientParticleCount,
  type AmbientParticle,
} from '../composables/visual-effects';

const canvas = ref<HTMLCanvasElement>();
const cursor = ref<HTMLElement>();
const route = useRoute();
let animationFrame = 0;
let context: CanvasRenderingContext2D | null = null;
let particles: AmbientParticle[] = [];
let resizeObserver: ResizeObserver | undefined;
let themeObserver: MutationObserver | undefined;
let contentObserver: MutationObserver | undefined;
let reducedMotionQuery: MediaQueryList | undefined;
let coarsePointerQuery: MediaQueryList | undefined;
let accentColor = '#78c7ff';
let signalColor = '#6ae0b5';
let pointerX = -1;
let pointerY = -1;
let targetPointerX = -1;
let targetPointerY = -1;
let lastFrame = 0;
let width = 0;
let height = 0;
let sprites: HTMLCanvasElement[] = [];
let targets: Array<{ element: HTMLElement; rect: DOMRect }> = [];
let boundsDirty = true;
let activeTarget: HTMLElement | undefined;
let magnetX = 0;
let magnetY = 0;

function refreshTargets(): void {
  targets = Array.from(document.querySelectorAll<HTMLElement>(
    '.button, .filter-button, .module-card, .project-card, .article-list-item, .site-nav__link, .ai-launcher',
  )).slice(0, 80).map((element) => ({ element, rect: element.getBoundingClientRect() }));
  boundsDirty = false;
}

function markBoundsDirty(): void { boundsDirty = true; }

function resetTarget(): void {
  activeTarget?.style.removeProperty('translate');
  activeTarget?.style.removeProperty('--halo-opacity');
  activeTarget = undefined;
  magnetX = 0;
  magnetY = 0;
}

function updateInteractions(): void {
  if (coarsePointerQuery?.matches || reducedMotionQuery?.matches) {
    resetTarget();
    if (cursor.value) cursor.value.style.opacity = '0';
    return;
  }
  if (cursor.value) {
    cursor.value.style.transform = `translate3d(${pointerX}px, ${pointerY}px, 0)`;
    cursor.value.style.opacity = pointerX < 0 ? '0' : '1';
  }
  if (boundsDirty) refreshTargets();
  let nearest: typeof targets[number] | undefined;
  let distance = 64;
  if (targetPointerX >= 0) {
    for (const target of targets) {
      const rect = target.rect;
      if (rect.bottom < 0 || rect.top > height) continue;
      const dx = Math.max(rect.left - targetPointerX, 0, targetPointerX - rect.right);
      const dy = Math.max(rect.top - targetPointerY, 0, targetPointerY - rect.bottom);
      const gap = Math.hypot(dx, dy);
      if (gap < distance) { distance = gap; nearest = target; }
    }
  }
  if (nearest?.element !== activeTarget) { resetTarget(); activeTarget = nearest?.element; }
  if (!nearest || !activeTarget) return;
  const { rect } = nearest;
  const x = targetPointerX - rect.left;
  const y = targetPointerY - rect.top;
  const pressure = 1 - distance / 64;
  const strength = rect.width > 240 ? 3 : 5;
  const desiredX = Math.max(-1, Math.min(1, (x - rect.width / 2) / (rect.width / 2))) * strength * pressure;
  const desiredY = Math.max(-1, Math.min(1, (y - rect.height / 2) / (rect.height / 2))) * strength * pressure;
  magnetX += (desiredX - magnetX) * 0.16;
  magnetY += (desiredY - magnetY) * 0.16;
  activeTarget.style.translate = `${magnetX.toFixed(2)}px ${magnetY.toFixed(2)}px`;
  activeTarget.style.setProperty('--halo-x', `${x}px`);
  activeTarget.style.setProperty('--halo-y', `${y}px`);
  activeTarget.style.setProperty('--halo-opacity', `${pressure}`);
}

function readThemeColors(): void {
  const styles = getComputedStyle(document.documentElement);
  accentColor = styles.getPropertyValue('--site-accent').trim() || '#78c7ff';
  signalColor = styles.getPropertyValue('--site-signal').trim() || '#6ae0b5';
  sprites = [accentColor, signalColor].map((color) => {
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 32;
    const ctx = sprite.getContext('2d')!;
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.14, color);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    return sprite;
  });
}

function resizeCanvas(): void {
  if (!canvas.value) {
    return;
  }

  const bounds = canvas.value.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  width = bounds.width;
  height = bounds.height;
  boundsDirty = true;

  canvas.value.width = Math.max(1, Math.round(bounds.width * pixelRatio));
  canvas.value.height = Math.max(1, Math.round(bounds.height * pixelRatio));
  context = canvas.value.getContext('2d');
  context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  const particleCount = getAmbientParticleCount(
    window.innerWidth,
    coarsePointerQuery?.matches ?? false,
  );
  particles = createParticleField(particleCount);
  restartAnimation();
}

function updatePointer(event: PointerEvent): void {
  if (!canvas.value || coarsePointerQuery?.matches) {
    return;
  }

  targetPointerX = event.clientX;
  targetPointerY = event.clientY;
}

function clearPointer(): void {
  targetPointerX = -1;
  targetPointerY = -1;
}

function drawConnections(width: number, height: number): void {
  if (!context) {
    return;
  }
  const ctx = context;

  const cellSize = 120;
  const buckets = new Map<string, number[]>();
  particles.forEach((particle, index) => {
    const key = `${Math.floor(particle.x * width / cellSize)},${Math.floor(particle.y * height / cellSize)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(index); buckets.set(key, bucket);
  });
  ctx.lineWidth = 0.65;
  ctx.strokeStyle = accentColor;
  particles.forEach((particle, index) => {
    const x = particle.x * width; const y = particle.y * height;
    const cellX = Math.floor(x / cellSize); const cellY = Math.floor(y / cellSize);
    let connections = 0;
    for (let dx = -1; dx <= 1 && connections < 4; dx++) {
      for (let dy = -1; dy <= 1 && connections < 4; dy++) {
        for (const other of buckets.get(`${cellX + dx},${cellY + dy}`) ?? []) {
          if (other <= index || connections >= 4) continue;
          const right = particles[other];
          const deltaX = x - right.x * width; const deltaY = y - right.y * height;
          const squared = deltaX * deltaX + deltaY * deltaY;
          if (squared >= cellSize * cellSize) continue;
          ctx.globalAlpha = (1 - Math.sqrt(squared) / cellSize) * 0.22;
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.lineTo(right.x * width, right.y * height); ctx.stroke();
          connections++;
        }
      }
    }
  });
}

function drawParticles(
  width: number,
  height: number,
  elapsed: number,
  timestamp: number,
): void {
  if (!context) {
    return;
  }

  for (const particle of particles) {
    if (!reducedMotionQuery?.matches) {
      particle.x = (particle.x + particle.velocityX * elapsed + 1) % 1;
      particle.y = (particle.y + particle.velocityY * elapsed + 1) % 1;
    }

    const x = particle.x * width;
    const y = particle.y * height;
    const pointerDistance =
      pointerX < 0 ? Number.POSITIVE_INFINITY : Math.hypot(x - pointerX, y - pointerY);
    const pointerBoost = Math.max(0, 1 - pointerDistance / 190);

    context.globalAlpha = particle.alpha + pointerBoost * 0.34;
    const size = (particle.radius + Math.sin(particle.phase + timestamp * 0.001) * 0.14) * 9;
    const sprite = sprites[pointerBoost > 0.36 ? 1 : 0];
    if (sprite) context.drawImage(sprite, x - size / 2, y - size / 2, size, size);
  }
}

function drawFrame(timestamp: number): void {
  if (!canvas.value || !context) {
    return;
  }

  const elapsed = lastFrame ? Math.min(timestamp - lastFrame, 32) : 16;
  lastFrame = timestamp;

  if (targetPointerX >= 0) {
    pointerX += (targetPointerX - pointerX) * 0.08;
    pointerY += (targetPointerY - pointerY) * 0.08;
  } else {
    pointerX = -1;
    pointerY = -1;
  }

  context.clearRect(0, 0, width, height);
  context.shadowBlur = 0;
  drawConnections(width, height);
  drawParticles(width, height, elapsed, timestamp);
  updateInteractions();
  context.globalAlpha = 1;
  context.shadowBlur = 0;

  if (!reducedMotionQuery?.matches && !document.hidden) {
    animationFrame = window.requestAnimationFrame(drawFrame);
  }
}

function restartAnimation(): void {
  window.cancelAnimationFrame(animationFrame);
  lastFrame = 0;
  drawFrame(0);
}

function handleVisibilityChange(): void {
  if (document.hidden) { window.cancelAnimationFrame(animationFrame); resetTarget(); }
  else restartAnimation();
}

onMounted(() => {
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  coarsePointerQuery = window.matchMedia('(pointer: coarse)');
  readThemeColors();
  resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(canvas.value as HTMLCanvasElement);
  themeObserver = new MutationObserver(() => {
    readThemeColors();
    restartAnimation();
  });
  themeObserver.observe(document.documentElement, {
    attributeFilter: ['data-theme'],
    attributes: true,
  });
  contentObserver = new MutationObserver((changes) => {
    if (changes.some((change) => [...change.addedNodes, ...change.removedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE))) {
      boundsDirty = true;
    }
  });
  contentObserver.observe(document.querySelector('#page-content')!, { childList: true, subtree: true });

  window.addEventListener('pointermove', updatePointer, { passive: true });
  document.addEventListener('pointerleave', clearPointer);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  reducedMotionQuery.addEventListener('change', restartAnimation);
  coarsePointerQuery.addEventListener('change', resizeCanvas);
  window.addEventListener('scroll', markBoundsDirty, { passive: true });
  resizeCanvas();
});

watch(() => route.path, () => { resetTarget(); void nextTick(() => { boundsDirty = true; }); });

onBeforeUnmount(() => {
  window.cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
  contentObserver?.disconnect();
  window.removeEventListener('pointermove', updatePointer);
  document.removeEventListener('pointerleave', clearPointer);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  reducedMotionQuery?.removeEventListener('change', restartAnimation);
  coarsePointerQuery?.removeEventListener('change', resizeCanvas);
  window.removeEventListener('scroll', markBoundsDirty);
  resetTarget();
});
</script>

<template>
  <div class="aurora-background" aria-hidden="true"><i /><i /><i /></div>
  <canvas ref="canvas" class="ambient-field" aria-hidden="true" />
  <div ref="cursor" class="cursor-light" aria-hidden="true"><span /></div>
</template>
