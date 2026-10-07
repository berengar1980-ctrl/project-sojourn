import type { SalvageSpaceRenderer } from './salvage-space-renderer';

interface SalvageSpaceInputOptions {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: SalvageSpaceRenderer;
  readonly onSelectWreck: (id: string | null) => void;
  readonly onSelectNpc: (id: string | null) => void;
  readonly onNavigate: (x: number, y: number) => void;
}

export function bindSalvageSpaceInput(options: SalvageSpaceInputOptions): () => void {
  const { canvas, renderer } = options;
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
      options.onSelectWreck(null);
      options.onSelectNpc(npcId);
      return;
    }
    const wreckId = renderer.pickWreck(point.x, point.y);
    if (wreckId) {
      options.onSelectNpc(null);
      options.onSelectWreck(wreckId);
      return;
    }
    options.onSelectNpc(null);
    options.onSelectWreck(null);
    const target = renderer.worldPointAt(point.x, point.y);
    options.onNavigate(target.x, target.y);
  };

  const wheel = (event: WheelEvent): void => {
    event.preventDefault();
    renderer.zoomAt(event.deltaY, event.offsetX, event.offsetY);
  };

  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('wheel', wheel, { passive: false });

  return () => {
    canvas.removeEventListener('pointerdown', pointerDown);
    canvas.removeEventListener('pointermove', pointerMove);
    canvas.removeEventListener('pointerup', pointerUp);
    canvas.removeEventListener('wheel', wheel);
  };
}
