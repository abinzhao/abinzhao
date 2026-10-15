<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import {
  createParticleField,
  getAmbientParticleCount,
  type AmbientParticle,
} from '../composables/visual-effects';

const canvas = ref<HTMLCanvasElement>();
let animationFrame = 0;
let context: CanvasRenderingContext2D | null = null;
let particles: AmbientParticle[] = [];
let resizeObserver: ResizeObserver | undefined;
let themeObserver: MutationObserver | undefined;
let reducedMotionQuery: MediaQueryList | undefined;
let coarsePointerQuery: MediaQueryList | undefined;
let accentColor = '#78c7ff';
let signalColor = '#6ae0b5';
let pointerX = -1;
let pointerY = -1;
let targetPointerX = -1;
let targetPointerY = -1;
let lastFrame = 0;

function readThemeColors(): void {
  const styles = getComputedStyle(document.documentElement);
  accentColor = styles.getPropertyValue('--site-accent').trim() || '#78c7ff';
  signalColor = styles.getPropertyValue('--site-signal').trim() || '#6ae0b5';
}

function resizeCanvas(): void {
  if (!canvas.value) {
    return;
  }

  const bounds = canvas.value.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);

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

  const bounds = canvas.value.getBoundingClientRect();
  targetPointerX = event.clientX - bounds.left;
  targetPointerY = event.clientY - bounds.top;
}

function clearPointer(): void {
  targetPointerX = -1;
  targetPointerY = -1;
}

function drawConnections(width: number, height: number): void {
  if (!context) {
    return;
  }

  const connectionDistance = Math.min(132, width * 0.13);

  context.lineWidth = 0.7;
  context.strokeStyle = accentColor;

  for (let leftIndex = 0; leftIndex < particles.length; leftIndex += 1) {
    const left = particles[leftIndex];
    const leftX = left.x * width;
    const leftY = left.y * height;

    for (let rightIndex = leftIndex + 1; rightIndex < particles.length; rightIndex += 1) {
      const right = particles[rightIndex];
      const deltaX = leftX - right.x * width;
      const deltaY = leftY - right.y * height;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance >= connectionDistance) {
        continue;
      }

      context.globalAlpha = (1 - distance / connectionDistance) * 0.16;
      context.beginPath();
      context.moveTo(leftX, leftY);
      context.lineTo(right.x * width, right.y * height);
      context.stroke();
    }
  }
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
    context.fillStyle = pointerBoost > 0.36 ? signalColor : accentColor;
    context.shadowBlur = 7 + pointerBoost * 12;
    context.shadowColor = context.fillStyle;
    context.beginPath();
    context.arc(
      x,
      y,
      particle.radius + Math.sin(particle.phase + timestamp * 0.001) * 0.14,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
}

function drawPointerGlow(): void {
  if (!context || pointerX < 0 || pointerY < 0) {
    return;
  }

  const gradient = context.createRadialGradient(
    pointerX,
    pointerY,
    0,
    pointerX,
    pointerY,
    180,
  );
  gradient.addColorStop(0, 'rgba(106, 224, 181, 0.08)');
  gradient.addColorStop(0.5, 'rgba(120, 199, 255, 0.035)');
  gradient.addColorStop(1, 'rgba(120, 199, 255, 0)');
  context.globalAlpha = 1;
  context.fillStyle = gradient;
  context.fillRect(pointerX - 180, pointerY - 180, 360, 360);
}

function drawFrame(timestamp: number): void {
  if (!canvas.value || !context) {
    return;
  }

  const width = canvas.value.clientWidth;
  const height = canvas.value.clientHeight;
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
  drawPointerGlow();
  drawParticles(width, height, elapsed, timestamp);
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
  if (!document.hidden && !reducedMotionQuery?.matches) {
    restartAnimation();
  }
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

  window.addEventListener('pointermove', updatePointer, { passive: true });
  document.addEventListener('pointerleave', clearPointer);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  reducedMotionQuery.addEventListener('change', restartAnimation);
  coarsePointerQuery.addEventListener('change', resizeCanvas);
});

onBeforeUnmount(() => {
  window.cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
  window.removeEventListener('pointermove', updatePointer);
  document.removeEventListener('pointerleave', clearPointer);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  reducedMotionQuery?.removeEventListener('change', restartAnimation);
  coarsePointerQuery?.removeEventListener('change', resizeCanvas);
});
</script>

<template>
  <canvas ref="canvas" class="ambient-field" aria-hidden="true" />
</template>
