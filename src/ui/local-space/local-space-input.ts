import type { LocalSpaceRenderer } from './local-space-renderer';

interface LocalSpaceInputOptions {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: LocalSpaceRenderer;
  readonly onSelectAsteroid: (id: string | null) => void;
}

export function bindLocalSpaceInput(options: LocalSpaceInputOptions): () => void {
  const { canvas, renderer, onSelectAsteroid } = options;
  let dragging = false;
  let moved = false;
  let lastX = 0;
  let lastY = 0;

  const pointerDown = (event: PointerEvent): void => {
    dragging = true;
    moved = false;
    lastX = event.offsetX;
    lastY = event.offsetY;
    canvas.setPointerCapture(event.pointerId);
  };

  const pointerMove = (event: PointerEvent): void => {
    if (!dragging) return;
    const dx = event.offsetX - lastX;
    const dy = event.offsetY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    renderer.pan(dx, dy);
    lastX = event.offsetX;
    lastY = event.offsetY;
  };

  const pointerUp = (event: PointerEvent): void => {
    dragging = false;
    if (moved) return;
    onSelectAsteroid(renderer.pickAsteroid(event.offsetX, event.offsetY));
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
