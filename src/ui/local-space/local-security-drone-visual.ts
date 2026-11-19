import type { LocalSpaceViewModel } from '../../features/local-space/local-space-view-model';
import type { MapCamera } from '../map/map-camera';
import type { ShieldImpactEffect } from '../../core/shield-types';
import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-types';

const DRONE_SPRITE_URL = '/drones/security-drone-gc87r8.webp';
export const DRONE_DIAMETER_PX = 18;
export const DRONE_ROTATION_PERIOD_SECONDS = 16;
let droneSprite: HTMLImageElement | null = null;

/** Drone-only omnidirectional shield, visible whenever it is charged. */
export function drawDroneShield(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  charge = 1,
  impact = 0
): void {
  if (charge <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(36, 160, 225, ' + (0.045 * charge + impact * 0.15) + ')';
  ctx.fill();
  ctx.strokeStyle = 'rgba(86, 215, 250, ' + (0.29 * charge + impact * 0.65) + ')';
  ctx.lineWidth = 1.3 + impact * 2;
  ctx.shadowColor = '#55caff';
  ctx.shadowBlur = 4 + impact * 12;
  ctx.stroke();
  ctx.restore();
}

/** A background NPC duel owns shield hits while the patrol drone is fighting. */
export function localDroneShieldHits(
  combats: readonly StrategicCombatSnapshot[] = []
): readonly ShieldImpactEffect[] {
  for (const duel of combats) {
    const drone = [duel.attacker, duel.defender].find((ship) =>
      ship.id.startsWith('security-drone:')
    );
    if (drone) return drone.shieldImpacts;
  }
  return [];
}

/** Shield hits are attached to the drone, not to the world or the ship heading. */
export function drawDroneShieldHits(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  impacts: readonly ShieldImpactEffect[]
): void {
  for (const impact of impacts) {
    const age = impact.ageSeconds / Math.max(0.01, impact.lifetimeSeconds);
    if (age < 0 || age >= 1) continue;
    const angle = Math.atan2(impact.surfaceAnchor.y, impact.surfaceAnchor.x);
    const fade = Math.pow(1 - age, 1.35);
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(215, 249, 255, ' + 0.95 * fade + ')';
    ctx.lineWidth = 2.2 + 2.5 * impact.strength * fade;
    ctx.shadowColor = '#91eaff';
    ctx.shadowBlur = 8 * fade + 3;
    ctx.arc(x, y, radius, angle - 0.34, angle + 0.34);
    ctx.stroke();
    ctx.restore();
  }
}

function securityDroneSprite(): HTMLImageElement {
  if (!droneSprite) {
    droneSprite = new Image();
    droneSprite.src = DRONE_SPRITE_URL;
  }
  return droneSprite;
}

/** Shared paint-only layer for mining and salvage, including native PvP overlays. */
export function drawLocalSecurityDrone(
  ctx: CanvasRenderingContext2D,
  camera: MapCamera,
  drone: LocalSpaceViewModel['securityDrone'],
  width: number,
  height: number,
  timeSeconds: number,
  shieldHits: readonly ShieldImpactEffect[] = []
): void {
  if (!drone?.operational) return;
  const point = camera.worldToScreen(drone.position, width, height);
  ctx.save();
  ctx.strokeStyle = 'rgba(80, 185, 225, 0.17)';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 10]);
  ctx.beginPath();
  ctx.arc(point.x, point.y, camera.scale(drone.scanRadius), 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const diameter = DRONE_DIAMETER_PX * camera.getRelativeZoom();
  drawDroneShield(
    ctx,
    point.x,
    point.y,
    diameter * 0.62,
    1,
    Math.max(Math.min(1, (drone.shieldContactSeconds ?? 0) / 0.4), shieldHits.length ? 0.85 : 0)
  );
  drawDroneShieldHits(ctx, point.x, point.y, diameter * 0.62, shieldHits);
  ctx.translate(point.x, point.y);
  ctx.rotate((timeSeconds * Math.PI * 2) / DRONE_ROTATION_PERIOD_SECONDS);
  const image = securityDroneSprite();
  if (image.complete && image.naturalWidth > 0) {
    const radius = diameter / 2;
    ctx.drawImage(image, -radius, -radius, diameter, diameter);
  } else {
    // Preserve a visible contact marker until the small transparent asset loads.
    ctx.fillStyle = '#455b66';
    ctx.beginPath();
    ctx.arc(0, 0, diameter / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
