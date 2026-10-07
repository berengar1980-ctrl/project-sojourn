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
    const npcId = renderer.pickNpc(event.offsetX, event.offsetY);
    if (npcId) {
      options.onSelectWreck(null);
      options.onSelectNpc(npcId);
      return;
    }
    const wreckId = renderer.pickWreck(event.offsetX, event.offsetY);
    if (wreckId) {
      options.onSelectNpc(null);
      options.onSelectWreck(wreckId);
      return;
    }
    options.onSelectNpc(null);
    options.onSelectWreck(null);
    const target = renderer.worldPointAt(event.offsetX, event.offsetY);
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
