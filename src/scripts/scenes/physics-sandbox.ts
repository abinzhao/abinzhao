import { getSceneProfile } from "./scene-lifecycle";
import type { ExperimentController } from "./runtime";
import {
  constrainDistance,
  constrainPoint,
  integratePoint,
  type VerletPoint,
} from "./verlet";

interface PhysicsBody extends VerletPoint {
  radius: number;
  color: string;
}

interface DragState {
  pointerId: number;
  bodyIndex: number;
  x: number;
  y: number;
}

const fixedStepMs = 1000 / 60;
const gravity = { x: 0, y: 0.24 };
const colors = ["#ff7653", "#f5cf64", "#7c6dff"] as const;

function createBodies(
  width: number,
  height: number,
  count: number,
): PhysicsBody[] {
  const columns = count === 12 ? 4 : 6;
  const rows = Math.ceil(count / columns);

  return Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const radius = 10 + (index % 4) * 2;
    const x = ((column + 1) / (columns + 1)) * width;
    const y = ((row + 1) / (rows + 1)) * height;

    return {
      x,
      y,
      previousX: x - ((index % 3) - 1) * 0.45,
      previousY: y,
      radius,
      color: colors[index % colors.length],
    };
  });
}

export function mount(
  canvas: HTMLCanvasElement,
  controls: HTMLElement,
): ExperimentController {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建 Canvas 2D context");

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const profile = getSceneProfile({
    width: window.innerWidth,
    dpr: window.devicePixelRatio,
    reducedMotion,
  });
  const bodyCount = window.innerWidth < 768 ? 12 : 18;
  const targetFps = window.innerWidth < 768 ? 30 : profile.fps;
  const frameInterval = 1000 / targetFps;
  const originalTouchAction = canvas.style.touchAction;

  const controlRoot = document.createElement("div");
  const gravityButton = document.createElement("button");
  const stepButton = reducedMotion ? document.createElement("button") : null;

  gravityButton.type = "button";
  gravityButton.textContent = "关闭重力";
  controlRoot.append(gravityButton);

  if (stepButton) {
    stepButton.type = "button";
    stepButton.textContent = "运行一次";
    controlRoot.append(stepButton);
  }

  controls.append(controlRoot);
  canvas.style.touchAction = "none";

  let width = 1;
  let height = 1;
  let bodies: PhysicsBody[] = [];
  let gravityEnabled = true;
  let disposed = false;
  let paused = false;
  let frame = 0;
  let previousFrame = 0;
  let accumulator = 0;
  let dragState: DragState | null = null;

  const constrainBody = (body: PhysicsBody) => {
    const position = constrainPoint(
      body,
      width,
      height,
      body.radius,
    );
    const previous = constrainPoint(
      { x: body.previousX, y: body.previousY },
      width,
      height,
      body.radius,
    );

    body.x = position.x;
    body.y = position.y;
    body.previousX = previous.x;
    body.previousY = previous.y;
  };

  const pinDraggedBody = () => {
    if (!dragState) return;

    const body = bodies[dragState.bodyIndex];
    const position = constrainPoint(
      dragState,
      width,
      height,
      body.radius,
    );
    body.x = position.x;
    body.y = position.y;
    body.previousX = position.x;
    body.previousY = position.y;
  };

  const stepSimulation = () => {
    for (const [index, body] of bodies.entries()) {
      if (dragState?.bodyIndex === index) continue;

      const next = integratePoint(
        body,
        gravityEnabled ? gravity : { x: 0, y: 0 },
      );
      body.x = next.x;
      body.y = next.y;
      body.previousX = next.previousX;
      body.previousY = next.previousY;
    }

    for (let iteration = 0; iteration < 2; iteration += 1) {
      for (let firstIndex = 0; firstIndex < bodies.length; firstIndex += 1) {
        const first = bodies[firstIndex];

        for (
          let secondIndex = firstIndex + 1;
          secondIndex < bodies.length;
          secondIndex += 1
        ) {
          const second = bodies[secondIndex];
          const minimumDistance = first.radius + second.radius;
          const distance = Math.hypot(
            second.x - first.x,
            second.y - first.y,
          );
          if (distance >= minimumDistance) continue;

          const [nextFirst, nextSecond] = constrainDistance(
            first,
            second,
            minimumDistance,
          );
          first.x = nextFirst.x;
          first.y = nextFirst.y;
          second.x = nextSecond.x;
          second.y = nextSecond.y;
        }
      }

      pinDraggedBody();
      for (const body of bodies) constrainBody(body);
    }
  };

  const draw = () => {
    if (disposed) return;

    context.clearRect(0, 0, width, height);
    for (const body of bodies) {
      context.beginPath();
      context.arc(body.x, body.y, body.radius, 0, Math.PI * 2);
      context.fillStyle = body.color;
      context.shadowColor = body.color;
      context.shadowBlur = 14;
      context.fill();
    }
    context.shadowBlur = 0;
  };

  const resize = () => {
    if (disposed) return;

    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;

    width = bounds.width;
    height = bounds.height;
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      profile.maxDpr,
    );
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    for (const body of bodies) constrainBody(body);
    pinDraggedBody();
    draw();
  };

  const render = (time: number) => {
    frame = 0;
    if (disposed || paused || !profile.animated) return;

    if (previousFrame && time - previousFrame < frameInterval) {
      frame = requestAnimationFrame(render);
      return;
    }

    const elapsed = previousFrame
      ? Math.min(time - previousFrame, 100)
      : fixedStepMs;
    previousFrame = time;
    accumulator += elapsed;

    while (accumulator >= fixedStepMs) {
      stepSimulation();
      accumulator -= fixedStepMs;
    }

    draw();
    frame = requestAnimationFrame(render);
  };

  const resume = () => {
    paused = false;
    if (!disposed && profile.animated && frame === 0) {
      previousFrame = 0;
      frame = requestAnimationFrame(render);
    }
  };

  const pause = () => {
    paused = true;
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };

  const reset = () => {
    gravityEnabled = true;
    gravityButton.textContent = "关闭重力";
    accumulator = 0;
    previousFrame = 0;
    bodies = createBodies(width, height, bodyCount);
    pinDraggedBody();
    draw();
  };

  const pointerPosition = (event: PointerEvent) => {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  };

  const finishDrag = (event: PointerEvent) => {
    if (dragState?.pointerId !== event.pointerId) return;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    dragState = null;
  };

  const onPointerDown = (event: PointerEvent) => {
    const position = pointerPosition(event);
    const bodyIndex = bodies.findLastIndex(
      (body) =>
        Math.hypot(body.x - position.x, body.y - position.y) <=
        body.radius + 6,
    );
    if (bodyIndex < 0) return;

    dragState = { pointerId: event.pointerId, bodyIndex, ...position };
    canvas.setPointerCapture(event.pointerId);
    pinDraggedBody();
    draw();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (dragState?.pointerId !== event.pointerId) return;

    Object.assign(dragState, pointerPosition(event));
    pinDraggedBody();
    draw();
  };

  const onLostPointerCapture = (event: PointerEvent) => {
    if (dragState?.pointerId === event.pointerId) dragState = null;
  };

  const onGravityClick = () => {
    gravityEnabled = !gravityEnabled;
    gravityButton.textContent = gravityEnabled ? "关闭重力" : "开启重力";
    draw();
  };

  const onStepClick = () => {
    stepSimulation();
    draw();
  };

  gravityButton.addEventListener("click", onGravityClick);
  stepButton?.addEventListener("click", onStepClick);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", finishDrag);
  canvas.addEventListener("pointercancel", finishDrag);
  canvas.addEventListener("lostpointercapture", onLostPointerCapture);

  const dispose = () => {
    if (disposed) return;

    if (
      dragState &&
      canvas.hasPointerCapture(dragState.pointerId)
    ) {
      canvas.releasePointerCapture(dragState.pointerId);
    }
    dragState = null;
    disposed = true;
    pause();
    gravityButton.removeEventListener("click", onGravityClick);
    stepButton?.removeEventListener("click", onStepClick);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", finishDrag);
    canvas.removeEventListener("pointercancel", finishDrag);
    canvas.removeEventListener(
      "lostpointercapture",
      onLostPointerCapture,
    );
    canvas.style.touchAction = originalTouchAction;
    controlRoot.remove();
  };

  resize();
  reset();
  if (profile.animated) resume();

  return { pause, resume, resize, reset, dispose };
}
