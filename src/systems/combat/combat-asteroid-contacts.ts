import { applyShieldHit } from '../shields/shield-service';
import { resolveShieldCollisions } from '../local-space/local-space-collision';
import { nativeCombatAsteroids } from './combat-asteroid-motion';
import { directionalHullDamage } from './strategic-combat-damage';
import type { MutableCombatant, StrategicCombatArenaOptions } from './strategic-combat-types';
import { shipContactMassProperties } from '../../core/ship-contact-mass';
import { getShipDefinition } from '../ships';
import { shipShieldGeometry } from '../../core/ship-contact-geometry';

export function resolveCombatAsteroidContacts(
  ship: MutableCombatant,
  arena: StrategicCombatArenaOptions
): void {
  if (!arena.asteroids?.length) return;
  const geometry = ship.setup.shieldGeometry;
  const definition = getShipDefinition(ship.setup.shipId);
  const shield = geometry ?? (definition ? shipShieldGeometry(definition) : undefined);
  const native = nativeCombatAsteroids(arena);
  const hits = resolveShieldCollisions(
    ship,
    ship.velocity,
    native,
    {
      centerOffset: shield?.centerOffset ?? { x: 0, y: 0 },
      radiusX: shield?.radiusX ?? 30,
      radiusY: shield?.radiusY ?? 20,
    },
    shipContactMassProperties(
      ship.setup.nominalLengthMeters ?? definition?.nominalLengthMeters ?? 60,
      shield
    ).mass
  );
  native.forEach((body, index) => {
    const visual = arena.asteroids![index]!;
    visual.position.x = body.position.x;
    visual.position.y = body.position.y;
    const velocity = visual.velocity as { x: number; y: number };
    velocity.x = body.physics.velocity.x;
    velocity.y = body.physics.velocity.y;
    if (visual.physics) {
      visual.physics.velocity = { ...body.physics.velocity };
      visual.physics.angularVelocity = body.physics.angularVelocity;
    }
  });
  for (const hit of hits) {
    const damage =
      Math.min(14, Math.max(0, hit.impactSpeed - 7) * 0.22) /
      Math.max(0.1, geometry?.modifier ?? 1);
    if (damage <= 0) continue;
    if (ship.shieldHp <= 0) {
      ship.hullHp = Math.max(0, ship.hullHp - directionalHullDamage(ship, damage, hit.point));
      continue;
    }
    const effect = applyShieldHit(
      { maxHp: Math.max(1, ship.shieldMaxHp), modifier: 1, currentHp: ship.shieldHp },
      {
        source: 'asteroid',
        point: hit.point,
        normal: hit.normal,
        surfaceAnchor: hit.surfaceAnchor,
        directDamage: damage,
      },
      Math.floor((ship.shieldImpacts.length + 1) * 100000 + hit.impactSpeed * 100)
    );
    ship.shieldHp -= effect.absorbedDamage;
    ship.hullHp = Math.max(
      0,
      ship.hullHp - directionalHullDamage(ship, effect.overflowDamage, hit.point)
    );
    ship.shieldImpacts.push(effect.impact);
  }
}
