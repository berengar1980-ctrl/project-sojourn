import type { CombatPoint, MutableCombatant } from './strategic-combat-types';
import { combatShieldCenter, combatShieldGeometry, segmentShieldHit } from './strategic-combat-damage';

/** Intersection with the oriented hull envelope, using the same inset (0.88)
 * as the native contact geometry. This is a raycast, not a probability roll.
 */
function hullSegmentContact(from: CombatPoint, to: CombatPoint, ship: MutableCombatant): {
  readonly t: number;
  readonly point: CombatPoint;
} | null {
  const hull = combatShieldGeometry(ship);
  const center = combatShieldCenter(ship);
  const cos = Math.cos(ship.headingRadians);
  const sin = Math.sin(ship.headingRadians);
  const rotate = (point: CombatPoint) => ({
    x: (point.x - center.x) * cos + (point.y - center.y) * sin,
    y: -(point.x - center.x) * sin + (point.y - center.y) * cos,
  });
  const start = rotate(from);
  const finish = rotate(to);
  const dx = finish.x - start.x;
  const dy = finish.y - start.y;
  const rx = Math.max(5, hull.radiusX * 0.88);
  const ry = Math.max(4, hull.radiusY * 0.88);
  const a = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
  if (a < 1e-9) return null;
  const b = 2 * ((start.x * dx) / (rx * rx) + (start.y * dy) / (ry * ry));
  const c = (start.x * start.x) / (rx * rx) + (start.y * start.y) / (ry * ry) - 1;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const t = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
    .filter((candidate) => candidate >= 0 && candidate <= 1)
    .sort((first, second) => first - second)[0];
  return t === undefined ? null : {
    t,
    point: { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t },
  };
}

export interface FleetPhysicalContact {
  readonly ship: MutableCombatant;
  readonly t: number;
  readonly point: CombatPoint;
  readonly shieldHit: ReturnType<typeof segmentShieldHit>;
}

/** All ships, including friendlies and civilians, are physical participants.
 * Strictly choose the nearest shield/hull entry on the segment, not the aim ID.
 */
export function firstFleetShipContact(
  from: CombatPoint,
  to: CombatPoint,
  ships: readonly MutableCombatant[],
  sourceId: string
): FleetPhysicalContact | null {
  let nearest: FleetPhysicalContact | null = null;
  for (const ship of ships) {
    if (ship.setup.id === sourceId || ship.hullHp <= 0) continue;
    const shield = segmentShieldHit(from, to, ship);
    const hull = shield ? null : hullSegmentContact(from, to, ship);
    const contact = shield ?? hull;
    if (!contact) continue;
    if (!nearest || contact.t < nearest.t - 1e-9 ||
        (Math.abs(contact.t - nearest.t) < 1e-9 &&
          ship.setup.id.localeCompare(nearest.ship.setup.id) < 0)) {
      nearest = { ship, t: contact.t, point: contact.point, shieldHit: shield };
    }
  }
  return nearest;
}
