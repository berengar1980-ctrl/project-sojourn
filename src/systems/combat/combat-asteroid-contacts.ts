import { applyShieldHit } from '../shields/shield-service';
import type { MutableCombatant, StrategicCombatArenaOptions } from './strategic-combat-types';

function rotate(x: number, y: number, angle: number): { x: number; y: number } {
  return { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) };
}

/** Elliptical ship-shield contact, corresponding to the local-space shield collision geometry. */
export function resolveCombatAsteroidContacts(ship: MutableCombatant, arena: StrategicCombatArenaOptions): void {
  const geometry = ship.setup.shieldGeometry;
  const offset = geometry?.centerOffset ?? { x: 0, y: 0 };
  const rotatedOffset = rotate(offset.x, offset.y, ship.headingRadians);
  const center = { x: ship.position.x + rotatedOffset.x, y: ship.position.y + rotatedOffset.y };
  const radiusX = geometry?.radiusX ?? 30;
  const radiusY = geometry?.radiusY ?? 20;
  for (const asteroid of arena.asteroids ?? []) {
    if (asteroid.kind !== 'resource') continue;
    const dx = asteroid.position.x - center.x;
    const dy = asteroid.position.y - center.y;
    const relative = rotate(dx, dy, -ship.headingRadians);
    const rx = radiusX + asteroid.radius;
    const ry = radiusY + asteroid.radius;
    const metric = Math.hypot(relative.x / rx, relative.y / ry);
    if (metric >= 1) continue;
    const correction = metric > 0.001
      ? rotate(relative.x * (1 / metric - 1), relative.y * (1 / metric - 1), ship.headingRadians)
      : { x: rx + 1, y: 0 };
    // Move the ship out of solid contact; do not repel it from an oversized invisible circle.
    ship.position.x -= correction.x;
    ship.position.y -= correction.y;
    const magnitude = Math.max(0.001, Math.hypot(correction.x, correction.y));
    const nx = correction.x / magnitude;
    const ny = correction.y / magnitude;
    const incoming = (ship.velocity.x - asteroid.velocity.x) * nx + (ship.velocity.y - asteroid.velocity.y) * ny;
    if (incoming <= 0) continue;
    ship.velocity.x -= nx * incoming * 1.35;
    ship.velocity.y -= ny * incoming * 1.35;
    ship.speed = Math.hypot(ship.velocity.x, ship.velocity.y);
    const damage = Math.min(12, Math.max(0, incoming - 12) * 0.075);
    if (damage <= 0) continue;
    const hit = applyShieldHit(
      { maxHp: Math.max(1, ship.shieldMaxHp), modifier: geometry?.modifier ?? 1, currentHp: ship.shieldHp },
      { source: 'asteroid', point: { x: center.x + nx * radiusX, y: center.y + ny * radiusY }, normal: { x: nx, y: ny }, surfaceAnchor: { x: nx, y: ny }, directDamage: damage },
      Math.floor((ship.shieldImpacts.length + 1) * 100000 + incoming * 100)
    );
    ship.shieldHp -= hit.absorbedDamage;
    ship.hullHp = Math.max(0, ship.hullHp - hit.overflowDamage);
    ship.shieldImpacts.push(hit.impact);
  }
}
