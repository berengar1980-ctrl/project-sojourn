import type { TopdownMapRenderer } from './topdown-map-renderer';
import type { StarMapPickOption } from './star-map-contact-picking';
import { createStarMapPickMenu } from './star-map-pick-menu';

interface StarMapInputOptions {
  readonly canvas: HTMLCanvasElement;
  readonly shell: HTMLElement;
  readonly renderer: TopdownMapRenderer;
  readonly onSelectLocation: (id: string) => void;
  readonly onSelectNpc: (id: string) => void;
}

export function bindStarMapInput(options: StarMapInputOptions): () => void {
  const { canvas, shell, renderer, onSelectLocation, onSelectNpc } = options;
  const select = (contact: StarMapPickOption): void => {
    if (contact.kind === 'npc') onSelectNpc(contact.id);
    else onSelectLocation(contact.id);
  };
  const picker = createStarMapPickMenu(shell, select);
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
    picker.close();
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
    const contacts = renderer.pickContacts(point.x, point.y);
    if (contacts.length > 1) picker.show(contacts, point);
    else if (contacts[0]) select(contacts[0]);
  };

  const wheel = (event: WheelEvent): void => {
    event.preventDefault();
    picker.close();
    renderer.zoomAt(event.deltaY, event.offsetX, event.offsetY);
  };

  const reset = (): void => {
    picker.close();
    renderer.resetCamera();
  };

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
    picker.destroy();
    canvas.removeEventListener('pointerdown', pointerDown);
    canvas.removeEventListener('pointermove', pointerMove);
    canvas.removeEventListener('pointerup', pointerUp);
    canvas.removeEventListener('dblclick', reset);
    canvas.removeEventListener('wheel', wheel);
    window.removeEventListener('keydown', keyDown);
  };
}
