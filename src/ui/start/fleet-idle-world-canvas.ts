import { LocalSpaceRenderer } from '../local-space/local-space-renderer';
import { SalvageSpaceRenderer } from '../salvage/salvage-space-renderer';
import type { FleetScenarioRuntime } from './fleet-scenario-runtime';
import type { StrategicCombatArenaOptions } from '../../systems/combat/strategic-combat-types';
import type { CombatCamera, CombatCameraPose } from '../combat/combat-camera';
import { drawCombatAsteroids } from '../combat/combat-asteroid-renderer';
import { drawCombatEscapeGate } from '../combat/combat-escape-gate-renderer';
import { drawNavigationRoutePoints } from '../local-space/local-space-navigation-route';
import { createFleetWorldContactOverlay } from '../combat/fleet-world-contact-overlay';
import { ProceduralSpaceBodyRenderer } from '../space/procedural-space-body-renderer';
import type { FleetWorldContact } from './fleet-scenario-world-bridge';
import type { WorldPoint } from '../../core/world-types';

function campaignFieldPainter(
  canvas: HTMLCanvasElement,
  camera: CombatCamera,
  field: FleetScenarioRuntime['fieldView']
) {
  if (field.kind === 'mining') {
    const renderer = new LocalSpaceRenderer(canvas, field.model(), true);
    return (width: number, height: number, time: number) =>
      renderer.paintFieldLayer(field.model(), camera.pose(), width, height, time);
  }
  const renderer = new SalvageSpaceRenderer(canvas, field.model(), true);
  return (width: number, height: number, time: number) =>
    renderer.paintFieldLayer(field.model(), camera.pose(), width, height, time);
}

/**
 * Renders the same combat map and native ship painter while no encounter owns
 * the simulation. The canvas itself is handed to the live PvP renderer without
 * replacing it or constructing a fake duel.
 */
// eslint-disable-next-line max-lines-per-function
export function createFleetIdleWorldCanvas(
  canvas: HTMLCanvasElement,
  arena: StrategicCombatArenaOptions,
  camera: CombatCamera,
  contacts: () => readonly FleetWorldContact[],
  navigatePlayer: (target: WorldPoint) => void,
  navigation: () => { route: readonly WorldPoint[]; target: WorldPoint | null },
  combatVisible: () => boolean,
  field: FleetScenarioRuntime['fieldView']
) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Fleet idle world canvas unavailable');
  const drawTerrain = campaignFieldPainter(canvas, camera, field);
  const bodies = new ProceduralSpaceBodyRenderer(context);
  const paintContacts = createFleetWorldContactOverlay(canvas, contacts, arena.width, arena.height);
  const drawActors = (
    pose: CombatCameraPose,
    width: number,
    height: number,
    timeSeconds: number
  ) => {
    const flight = navigation();
    if (flight.target && flight.route.length > 0)
      drawNavigationRoutePoints(context, flight.route, flight.target, (point) =>
        camera.project(point, width, height, arena.width, arena.height)
      );
    paintContacts(pose, width, height, timeSeconds);
  };
  const drawField = (width: number, height: number, time: number) => {
    drawTerrain(width, height, time);
    drawCombatAsteroids(
      bodies,
      (arena.asteroids ?? []).filter((body) => body.id.startsWith('fleet-wreck:')),
      camera.scale(width, height, arena.width, arena.height),
      (point) => camera.project(point, width, height, arena.width, arena.height),
      context,
      performance.now() / 1000
    );
  };
  let active = false;
  let lastDrag: { x: number; y: number } | null = null;
  let dragged = false;
  const draw = (): void => {
    if (!active || combatVisible()) return;
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
    drawField(width, height, performance.now() / 1000);
    if (arena.exitPoint)
      drawCombatEscapeGate(
        context,
        camera.project(arena.exitPoint, width, height, arena.width, arena.height)
      );
    drawActors(camera.pose(), width, height, performance.now() / 1000);
  };
  const pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    lastDrag = { x: event.clientX, y: event.clientY };
    dragged = false;
    canvas.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent): void => {
    if (!lastDrag) return;
    if (Math.hypot(event.clientX - lastDrag.x, event.clientY - lastDrag.y) > 3) dragged = true;
    camera.pan(event.clientX - lastDrag.x, event.clientY - lastDrag.y);
    lastDrag = { x: event.clientX, y: event.clientY };
    draw();
  };
  const pointerUp = (event: PointerEvent): void => {
    if (lastDrag && !dragged && event.type === 'pointerup') {
      const rect = canvas.getBoundingClientRect();
      const scale = camera.scale(rect.width, rect.height, arena.width, arena.height);
      navigatePlayer({
        x: arena.width / 2 + (event.clientX - rect.left - rect.width / 2 - camera.offsetX) / scale,
        y: arena.height / 2 + (event.clientY - rect.top - rect.height / 2 - camera.offsetY) / scale,
      });
    }
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
    drawActors,
    drawField,
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
