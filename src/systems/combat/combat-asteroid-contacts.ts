import { applyShieldHit } from '../shields/shield-service';
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
  const previous = native.map((body) => ({
    ...body.position,
    velocity: { ...body.physics.velocity },
  }));
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
    // A ship cannot teleport a massive rock out of its way: limit impulse response
    // and penetration correction. Small debris retains its original solver behavior.
    const original = previous[index]!;
    const resistance = visual.kind === 'resource' ? Math.max(12, visual.radius / 2) : 1;
    visual.position.x = original.x + (body.position.x - original.x) / resistance;
    visual.position.y = original.y + (body.position.y - original.y) / resistance;
    const velocity = visual.velocity as { x: number; y: number };
    velocity.x = original.velocity.x + (body.physics.velocity.x - original.velocity.x) / resistance;
    velocity.y = original.velocity.y + (body.physics.velocity.y - original.velocity.y) / resistance;
  });
  for (const hit of hits) {
    const damage = Math.min(14, Math.max(0, hit.impactSpeed - 7) * 0.22) / Math.max(0.1, geometry?.modifier ?? 1);
    if (damage <= 0) continue;
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
