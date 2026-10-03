import type { TopdownMapRenderer } from './topdown-map-renderer';

interface StarMapInputOptions {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: TopdownMapRenderer;
  readonly onSelectLocation: (id: string) => void;
}

export function bindStarMapInput(options: StarMapInputOptions): () => void {
  const { canvas, renderer, onSelectLocation } = options;
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
    const id = renderer.pickLocation(event.offsetX, event.offsetY);
    if (id) onSelectLocation(id);
  };

  const wheel = (event: WheelEvent): void => {
    event.preventDefault();
    renderer.zoomAt(event.deltaY, event.offsetX, event.offsetY);
  };

  const reset = (): void => renderer.resetCamera();

  const keyDown = (event: KeyboardEvent): void => {
    if (event.key.toLowerCase() === 'h') renderer.toggleHardpointDebug();
  };

  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('dblclick', reset);
  canvas.addEventListener('wheel', wheel, { passive: false });
  window.addEventListener('keydown', keyDown);

  return () => {
    canvas.removeEventListener('pointerdown', pointerDown);
    canvas.removeEventListener('pointermove', pointerMove);
    canvas.removeEventListener('pointerup', pointerUp);
    canvas.removeEventListener('dblclick', reset);
    canvas.removeEventListener('wheel', wheel);
    window.removeEventListener('keydown', keyDown);
  };
}
