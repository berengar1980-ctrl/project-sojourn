import { getShipDefinition } from '../../systems/ships';
import { drawCombatShipBody, drawCombatShipCaption } from './combat-ship-detail-renderer';
import { CombatCamera, type CombatCameraPose } from './combat-camera';
import { ShipLightingRenderer } from '../ships/ship-lighting-renderer';
import type { ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import { DRONE_DIAMETER_PX } from '../local-space/local-security-drone-visual';
import type { FleetWorldContact } from '../start/fleet-scenario-world-bridge';

/** Reuses exactly the combat sprite/lighting painter for moving noncombat NPCs. */
export function createFleetWorldContactOverlay(
  canvas: HTMLCanvasElement,
  contacts: () => readonly FleetWorldContact[],
  arenaWidth: number,
  arenaHeight: number
): (pose: CombatCameraPose, width: number, height: number, now: number) => void {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Fleet contact canvas context unavailable');
  const camera = new CombatCamera();
  const lighting = new ShipLightingRenderer();
  const images = new Map<string, HTMLImageElement>();
  return (pose, width, height) => {
    camera.restorePose(pose);
    const scale = camera.scale(width, height, arenaWidth, arenaHeight);
    for (const ship of contacts()) {
      const definition = getShipDefinition(ship.shipId);
      const drone = ship.id.startsWith('security-drone:');
      if (!definition && !drone) continue;
      const url = drone
        ? '/drones/security-drone-gc87r8.webp'
        : definition!.sprite.assetUrl;
      let sprite = images.get(url);
      if (!sprite) {
        sprite = new Image();
        sprite.src = url;
        images.set(url, sprite);
      }
      const length = drone ? DRONE_DIAMETER_PX * pose.zoom
        : (definition?.nominalLengthMeters ?? 60) * scale;
      const aspect = drone ? 1
        : sprite.complete && sprite.naturalWidth > 0 && sprite.naturalHeight > 0
          ? sprite.naturalWidth / sprite.naturalHeight
          : (definition?.sprite.widthPx ?? 60) / (definition?.sprite.heightPx ?? 30);
      const geometry: ShipScreenGeometry = {
        center: camera.project(ship.position, width, height, arenaWidth, arenaHeight),
        width: length,
        height: length / Math.max(0.35, aspect),
        angle: ship.headingRadians,
      };
      drawCombatShipBody(
        context, geometry, 1, sprite,
        drone ? undefined : definition?.sprite.hardpoints, lighting
      );
      drawCombatShipCaption(context, ship.name, 1, geometry);
    }
  };
}
