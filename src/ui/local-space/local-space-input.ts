import type { LocalSpaceRenderer } from './local-space-renderer';

interface LocalSpaceInputOptions {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: LocalSpaceRenderer;
  readonly onSelectAsteroid: (id: string | null) => void;
  readonly onSelectNpc: (id: string | null) => void;
  readonly onSelectCombatWreck?: (id: string | null) => void;
  readonly onNavigate: (x: number, y: number) => void;
}

export function bindLocalSpaceInput(options: LocalSpaceInputOptions): () => void {
  const { canvas, renderer, onSelectAsteroid, onSelectNpc, onNavigate, onSelectCombatWreck } =
    options;
  let dragging = false;
  let moved = false;
  let lastX = 0;
  let lastY = 0;
  let downX = 0;
  let downY = 0;

  const pointerPoint = (event: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const pointerDown = (event: PointerEvent): void => {
    dragging = true;
    moved = false;
    const point = pointerPoint(event);
    lastX = point.x;
    lastY = point.y;
    downX = point.x;
    downY = point.y;
    canvas.setPointerCapture(event.pointerId);
  };

  const pointerMove = (event: PointerEvent): void => {
    if (!dragging) return;
    const point = pointerPoint(event);
    const dx = point.x - lastX;
    const dy = point.y - lastY;
    if (Math.hypot(point.x - downX, point.y - downY) > 6) moved = true;
    renderer.pan(dx, dy);
    lastX = point.x;
    lastY = point.y;
  };

  const pointerUp = (event: PointerEvent): void => {
    dragging = false;
    if (moved) return;

    const point = pointerPoint(event);
    const npcId = renderer.pickNpc(point.x, point.y);
    if (npcId) {
      onSelectCombatWreck?.(null);
      onSelectAsteroid(null);
      onSelectNpc(npcId);
      return;
    }
    const wreckId = renderer.pickCombatWreck(point.x, point.y);
    if (wreckId) {
      onSelectNpc(null);
      onSelectAsteroid(null);
      onSelectCombatWreck?.(wreckId);
      return;
    }
    onSelectCombatWreck?.(null);
    const asteroidId = renderer.pickAsteroid(point.x, point.y);
    if (asteroidId) {
      onSelectNpc(null);
      onSelectAsteroid(asteroidId);
      return;
    }

    onSelectNpc(null);
    onSelectAsteroid(null);
    const target = renderer.worldPointAt(point.x, point.y);
    onNavigate(target.x, target.y);
  };

  const wheel = (event: WheelEvent): void => {
    event.preventDefault();
    renderer.zoomAt(event.deltaY, event.offsetX, event.offsetY);
  };

  const keyDown = (event: KeyboardEvent): void => {
    if (event.key.toLowerCase() === 'h') renderer.toggleHardpointDebug();
  };

  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('wheel', wheel, { passive: false });
  window.addEventListener('keydown', keyDown);

  return () => {
    canvas.removeEventListener('pointerdown', pointerDown);
    canvas.removeEventListener('pointermove', pointerMove);
    canvas.removeEventListener('pointerup', pointerUp);
    canvas.removeEventListener('wheel', wheel);
    window.removeEventListener('keydown', keyDown);
  };
}
