import { applyShieldHit } from '../shields/shield-service';
import { damageFromImpactEnergy } from '../shields/shield-service';
import { resolveShieldCollisions } from '../local-space/local-space-collision';
import { nativeCombatAsteroids } from './combat-asteroid-motion';
import type { MutableCombatant, StrategicCombatArenaOptions } from './strategic-combat-types';

export function resolveCombatAsteroidContacts(
  ship: MutableCombatant,
  arena: StrategicCombatArenaOptions
): void {
  if (!arena.asteroids?.length) return;
  const geometry = ship.setup.shieldGeometry;
  const native = nativeCombatAsteroids(arena);
  const hits = resolveShieldCollisions(
    {
      position: ship.position,
      headingRadians: ship.headingRadians,
      speed: ship.speed,
      turnRateRadiansPerSecond: ship.turnRateRadiansPerSecond,
      angularThrust: ship.angularThrust,
      lateralThrust: 0,
    },
    ship.velocity,
    native,
    {
      centerOffset: geometry?.centerOffset ?? { x: 0, y: 0 },
      radiusX: geometry?.radiusX ?? 30,
      radiusY: geometry?.radiusY ?? 20,
    }
  );
  // The shared solver changes asteroid positions and impulses, not the player's ship position.
  native.forEach((body, index) => {
    const visual = arena.asteroids![index]!;
    visual.position.x = body.position.x;
    visual.position.y = body.position.y;
    const velocity = visual.velocity as { x: number; y: number };
    velocity.x = body.physics.velocity.x;
    velocity.y = body.physics.velocity.y;
  });
  for (const hit of hits) {
    const damage = damageFromImpactEnergy(hit.kineticEnergy, geometry?.modifier ?? 1);
    if (ship.shieldHp <= 0) {
      ship.hullHp = Math.max(0, ship.hullHp - damage);
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
    ship.hullHp = Math.max(0, ship.hullHp - effect.overflowDamage);
    ship.shieldImpacts.push(effect.impact);
  }
}
