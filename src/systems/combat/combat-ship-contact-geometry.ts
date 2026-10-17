import type { MutableCombatant } from './strategic-combat-types';

type ContactShip = Pick<MutableCombatant, 'position'> &
  Partial<Pick<MutableCombatant, 'headingRadians' | 'setup'>>;

export interface ShipContact {
  readonly distance: number;
  readonly required: number;
  readonly normal: { readonly x: number; readonly y: number };
}

/**
 * Physical hull contact is NOT the tactical avoidance distance or the nominal
 * shield visual. Approximate the solid hull by an oriented ellipse just INSIDE
 * the configured shield envelope. A full sprite/mesh polygon can replace this
 * single geometry provider later without editing flight, ram and collision AI.
 */
function hullExtent(ship: ContactShip, nx: number, ny: number): number {
  const nominal = /([0-9]+(?:\.[0-9]+)?)m\b/i.exec(ship.setup?.shipId ?? '');
  const length = nominal ? Number(nominal[1]) : 60;
  const shield = ship.setup?.shieldGeometry;
  const rx = Math.max(5, (shield?.radiusX ?? length * 0.5) * 0.88);
  const ry = Math.max(4, (shield?.radiusY ?? length * 0.34) * 0.88);
  const theta = ship.headingRadians ?? 0;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const localX = nx * cos + ny * sin;
  const localY = -nx * sin + ny * cos;
  return 1 / Math.hypot(localX / rx, localY / ry);
}

/** One contact threshold shared by physical response, ram damage and steering. */
export function shipContact(first: ContactShip, second: ContactShip): ShipContact {
  const dx = second.position.x - first.position.x;
  const dy = second.position.y - first.position.y;
  const distance = Math.hypot(dx, dy);
  const normal = distance > 0.001 ? { x: dx / distance, y: dy / distance } : { x: 1, y: 0 };
  return {
    distance,
    normal,
    required:
      hullExtent(first, normal.x, normal.y) + hullExtent(second, -normal.x, -normal.y),
  };
}
