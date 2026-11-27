import { contactAxis } from '../../core/field-geometry';
import {
  combatHullRadii,
  orientedHullRadius,
  type ShieldWorldGeometry,
} from '../../core/ship-contact-geometry';
import type { MutableCombatant } from './strategic-combat-types';

interface ContactShip {
  readonly position: { readonly x: number; readonly y: number };
  readonly headingRadians?: number;
  readonly hullShieldGeometry?: ShieldWorldGeometry;
  readonly setup?: Pick<MutableCombatant['setup'], 'shipId' | 'shieldGeometry'>;
}

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
  const { radiusX, radiusY } = combatHullRadii(
    length,
    ship.hullShieldGeometry ?? ship.setup?.shieldGeometry
  );
  return orientedHullRadius(nx, ny, ship.headingRadians ?? 0, radiusX, radiusY);
}

/** One contact threshold shared by physical response, ram damage and steering. */
export function shipContact(first: ContactShip, second: ContactShip): ShipContact {
  const dx = second.position.x - first.position.x;
  const dy = second.position.y - first.position.y;
  const { distance, normal } = contactAxis(dx, dy);
  const required = hullExtent(first, normal.x, normal.y) + hullExtent(second, -normal.x, -normal.y);
  return { distance, normal, required };
}
