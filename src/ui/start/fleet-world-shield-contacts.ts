import type { ShieldImpactEffect } from '../../core/shield-types';
import type { WorldPoint } from '../../core/world-types';
import type { ShipShieldCollision } from '../../systems/local-space/ship-shield-collision';

function toLocal(normal: WorldPoint, heading: number): WorldPoint {
  return {
    x: normal.x * Math.cos(heading) + normal.y * Math.sin(heading),
    y: normal.y * Math.cos(heading) - normal.x * Math.sin(heading),
  };
}

/** Paint-only impact history; world physics resolves each contact exactly once. */
export function createFleetWorldShieldContacts() {
  const impacts = new Map<string, ShieldImpactEffect[]>();
  let serial = 0;
  let time = 0;
  const lastHit = new Map<string, number>();
  const record = (
    id: string,
    normal: WorldPoint,
    point: WorldPoint,
    heading: number,
    overlap: number
  ) => {
    if (time - (lastHit.get(id) ?? -1) < 0.18) return;
    lastHit.set(id, time);
    const effect: ShieldImpactEffect = {
      id: ++serial,
      source: 'asteroid',
      point: { ...point },
      normal: { ...normal },
      surfaceAnchor: toLocal(normal, heading),
      damage: 0,
      strength: Math.min(1, 0.3 + overlap / 40),
      lifetimeSeconds: 0.48,
      ageSeconds: 0,
    };
    const effects = impacts.get(id) ?? [];
    effects.push(effect);
    if (effects.length > 5) effects.shift();
    impacts.set(id, effects);
  };
  return {
    get: (id: string): readonly ShieldImpactEffect[] => impacts.get(id) ?? [],
    tick(dt: number) {
      time += dt;
      for (const [id, effects] of impacts) {
        for (const effect of effects) effect.ageSeconds += dt;
        const live = effects.filter((effect) => effect.ageSeconds < effect.lifetimeSeconds);
        if (live.length) impacts.set(id, live);
        else impacts.delete(id);
      }
    },
    register(
      collisions: readonly ShipShieldCollision[],
      heading: (id: string) => number
    ) {
      for (const collision of collisions) {
        record(
          collision.firstId,
          collision.normal,
          collision.point,
          heading(collision.firstId),
          collision.closingDistance
        );
        record(
          collision.secondId,
          { x: -collision.normal.x, y: -collision.normal.y },
          collision.point,
          heading(collision.secondId),
          collision.closingDistance
        );
      }
    },
  };
}
