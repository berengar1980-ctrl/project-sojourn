import type {
  StrategicCombatArenaOptions,
  StrategicCombatSnapshot,
} from '../../systems/combat/strategic-combat-types';
import { CombatCamera, type CombatCameraPose } from '../combat/combat-camera';
import { CombatAsteroidBackdrop } from '../combat/combat-asteroid-backdrop';
import { drawCombatAsteroids } from '../combat/combat-asteroid-renderer';
import { drawCombatBackground } from '../combat/combat-background-renderer';
import { createFleetWorldContactOverlay } from '../combat/fleet-world-contact-overlay';
import { ProceduralSpaceBodyRenderer } from '../space/procedural-space-body-renderer';
import type { FleetWorldContact } from './fleet-scenario-world-bridge';

/**
 * Renders the same combat map and native ship painter while no encounter owns
 * the simulation. The canvas itself is handed to the live PvP renderer without
 * replacing it or constructing a fake duel.
 */
// eslint-disable-next-line max-lines-per-function
export function createFleetIdleWorldCanvas(
  canvas: HTMLCanvasElement,
  arena: StrategicCombatArenaOptions,
  contacts: () => readonly FleetWorldContact[]
) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Fleet idle world canvas unavailable');
  const camera = new CombatCamera();
  const backdrop = new CombatAsteroidBackdrop(context, arena as StrategicCombatSnapshot['arena']);
  const bodies = new ProceduralSpaceBodyRenderer(context);
  const paintContacts = createFleetWorldContactOverlay(canvas, contacts, arena.width, arena.height);
  let active = false;
  let lastDrag: { x: number; y: number } | null = null;
  const draw = (): void => {
    if (!active) return;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width <= 0 || height <= 0) return;
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    drawCombatBackground(context, width, height, 'fleet-world', 'fleet-world');
    backdrop.draw(width, height, camera);
    drawCombatAsteroids(
      bodies,
      arena.asteroids ?? [],
      camera.scale(width, height, arena.width, arena.height),
      (point) => camera.project(point, width, height, arena.width, arena.height),
      context,
      performance.now() / 1000
    );
    paintContacts(camera.pose(), width, height, performance.now() / 1000);
  };
  const pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    lastDrag = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent): void => {
    if (!lastDrag) return;
    camera.pan(event.clientX - lastDrag.x, event.clientY - lastDrag.y);
    lastDrag = { x: event.clientX, y: event.clientY };
    draw();
  };
  const pointerUp = (event: PointerEvent): void => {
    lastDrag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  const wheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    camera.zoomAt(
      event.deltaY < 0 ? 1.12 : 1 / 1.12,
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height
    );
    draw();
  };
  return {
    draw,
    pose: (): CombatCameraPose => camera.pose(),
    restorePose(pose: CombatCameraPose): void {
      camera.restorePose(pose);
      draw();
    },
    activate(): void {
      if (active) return;
      active = true;
      canvas.addEventListener('pointerdown', pointerDown);
      canvas.addEventListener('pointermove', pointerMove);
      canvas.addEventListener('pointerup', pointerUp);
      canvas.addEventListener('pointercancel', pointerUp);
      canvas.addEventListener('wheel', wheel, { passive: false });
      draw();
    },
    deactivate(): void {
      if (!active) return;
      active = false;
      lastDrag = null;
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerUp);
      canvas.removeEventListener('wheel', wheel);
    },
  };
}
