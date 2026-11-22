import type { NativeFleetEngagement } from '../../systems/combat/parallel-native-duels';
import type {
  StrategicCombatantSnapshot,
  StrategicCombatSnapshot,
} from '../../systems/combat/strategic-combat-types';
import type { ShipScreenGeometry } from '../ships/ship-hardpoint-projector';

export interface FleetShipBadge {
  readonly id: string;
  readonly label: string;
  readonly role: 'duel' | 'support';
}

/** A primary pair shares D1...D5. Additional/reassigned actors get +1...+5. */
export function fleetShipBadges(
  engagements: readonly NativeFleetEngagement[]
): readonly FleetShipBadge[] {
  const byShip = new Map<string, FleetShipBadge>();
  for (const link of engagements) {
    const label = link.role === 'duel' ? 'D' + link.label : '+' + link.label;
    byShip.set(link.sourceId, { id: link.sourceId, label, role: link.role });
    if (link.role === 'duel') {
      byShip.set(link.targetId, { id: link.targetId, label, role: 'duel' });
    }
  }
  return [...byShip.values()];
}

function livingShips(
  duels: readonly StrategicCombatSnapshot[],
  escaped: ReadonlySet<string>
): ReadonlyMap<string, StrategicCombatantSnapshot> {
  const living = new Map<string, StrategicCombatantSnapshot>();
  for (const duel of duels) {
    for (const ship of [duel.attacker, duel.defender]) {
      if (ship.hullHp > 0 && !escaped.has(ship.id)) living.set(ship.id, ship);
    }
  }
  return living;
}

/** Draw behind vessels, never intercepting mouse/drag/zoom input. */
export function paintFleetEngagementLines(
  context: CanvasRenderingContext2D,
  duels: readonly StrategicCombatSnapshot[],
  engagements: readonly NativeFleetEngagement[],
  escaped: ReadonlySet<string>,
  geometry: (ship: StrategicCombatantSnapshot) => ShipScreenGeometry
): void {
  const ships = livingShips(duels, escaped);
  const drawn = new Set<string>();
  context.save();
  for (const link of engagements) {
    const a = ships.get(link.sourceId);
    const b = ships.get(link.targetId);
    if (!a || !b) continue;
    const key = [a.id, b.id].sort().join('|');
    if (drawn.has(key)) continue;
    drawn.add(key);
    const start = geometry(a).center;
    const end = geometry(b).center;
    context.beginPath();
    context.setLineDash(link.role === 'support' ? [5, 7] : []);
    context.lineWidth = link.role === 'support' ? 1.6 : 1.1;
    context.strokeStyle =
      link.role === 'support' ? 'rgba(255,190,86,0.66)' : 'rgba(122,207,227,0.38)';
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }
  context.restore();
}

/** Fixed-pixel badges remain legible at the full 5v5 zoom level. */
export function paintFleetShipBadges(
  context: CanvasRenderingContext2D,
  duels: readonly StrategicCombatSnapshot[],
  engagements: readonly NativeFleetEngagement[],
  escaped: ReadonlySet<string>,
  geometry: (ship: StrategicCombatantSnapshot) => ShipScreenGeometry,
  width: number,
  height: number
): void {
  const ships = livingShips(duels, escaped);
  context.save();
  context.font = 'bold 11px ui-monospace, monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (const badge of fleetShipBadges(engagements)) {
    const ship = ships.get(badge.id);
    if (!ship) continue;
    const shape = geometry(ship);
    const x = shape.center.x - Math.min(52, Math.max(23, shape.width * 0.52));
    const y = shape.center.y - Math.min(48, Math.max(22, shape.height * 0.72));
    if (x < -35 || x > width + 35 || y < -35 || y > height + 35) continue;
    const tagWidth = 33;
    const tagHeight = 23;
    context.fillStyle = 'rgba(7,19,26,0.94)';
    context.strokeStyle = badge.role === 'support' ? '#f2bc6a' : '#83d6e7';
    context.lineWidth = 1.7;
    context.fillRect(x - tagWidth / 2, y - tagHeight / 2, tagWidth, tagHeight);
    context.strokeRect(x - tagWidth / 2, y - tagHeight / 2, tagWidth, tagHeight);
    context.fillStyle = badge.role === 'support' ? '#ffdc9d' : '#e4f9ff';
    context.fillText(badge.label, x, y + 0.5);
  }
  context.restore();
}
