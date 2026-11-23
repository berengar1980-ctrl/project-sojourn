import type { ShipDefinition } from '../../core/ship-types';
import type { FleetWorldContact } from '../start/fleet-world-contact-types';
import { CombatCamera } from './combat-camera';
import {
  MiningEffectsRenderer,
  drawMiningChunkVisual,
} from '../local-space/mining-effects-renderer';
import { drawMiningLaserBeam, drawMiningTractorBeam } from '../local-space/mining-beam-visuals';
import { projectHardpoint, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';

/** The same mining laser, impact and ore tractor painters as the career field. */
export function drawFleetWorldMiningEffects(
  context: CanvasRenderingContext2D,
  ship: FleetWorldContact,
  definition: ShipDefinition | undefined,
  geometry: ShipScreenGeometry,
  camera: CombatCamera,
  miningEffects: MiningEffectsRenderer,
  width: number,
  height: number,
  arenaWidth: number,
  arenaHeight: number
): void {
  if (!ship.miningBeamTarget || !ship.miningTargetRadius) return;
  const dx = ship.position.x - ship.miningBeamTarget.x;
  const dy = ship.position.y - ship.miningBeamTarget.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const normal = { x: dx / distance, y: dy / distance };
  const impactWorld = {
    x: ship.miningBeamTarget.x + normal.x * ship.miningTargetRadius * 0.86,
    y: ship.miningBeamTarget.y + normal.y * ship.miningTargetRadius * 0.86,
  };
  const target = camera.project(impactWorld, width, height, arenaWidth, arenaHeight);
  const port = definition?.sprite.hardpoints.miningLasers[0];
  const start = port && definition
    ? projectHardpoint(port, definition.sprite.hardpoints, geometry)
    : geometry.center;
  drawMiningLaserBeam(context, start, target, Math.max(1, geometry.width / 100), 1, 0.55);
  miningEffects.drawImpactEffects(target, normal, performance.now() / 1000);
  const extraction = ship.miningOreCollection;
  if (!extraction) return;
  const progress = 1 - extraction.remainingSeconds / extraction.durationSeconds;
  const travel = Math.max(0, Math.min(1, progress));
  const chunk = {
    x: target.x + (geometry.center.x - target.x) * travel,
    y: target.y + (geometry.center.y - target.y) * travel,
  };
  drawMiningTractorBeam(context, chunk, geometry.center, 0.7);
  drawMiningChunkVisual(context, chunk, ship.id + ':' + extraction.resourceId);
}
