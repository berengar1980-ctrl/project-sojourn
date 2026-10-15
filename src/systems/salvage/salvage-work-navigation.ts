import type { WorldPoint } from '../../core/world-types';
import type { LocalShipState } from '../../core/local-space-types';
import type { SalvageWreck } from '../../core/salvage-types';

export const WORK_STANDOFF = 105;

export function clampPoint(point: WorldPoint, width: number, height: number): WorldPoint {
  return {
    x: Math.max(0, Math.min(width, point.x)),
    y: Math.max(0, Math.min(height, point.y)),
  };
}

export function workPoint(ship: LocalShipState, wreck: SalvageWreck): WorldPoint {
  const dx = ship.position.x - wreck.position.x;
  const dy = ship.position.y - wreck.position.y;
  const length = Math.hypot(dx, dy) || 1;
  const range =
    wreck.radius + (wreck.id.startsWith('event-wreck-salvage-distress-') ? 45 : WORK_STANDOFF);
  return {
    x: wreck.position.x + (dx / length) * range,
    y: wreck.position.y + (dy / length) * range,
  };
}
