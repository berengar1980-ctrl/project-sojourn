import { applyShieldHit } from '../shields/shield-service';
import { resolveShieldCollisions } from '../local-space/local-space-collision';
import { nativeCombatAsteroids } from './combat-asteroid-motion';
import { directionalHullDamage } from './strategic-combat-damage';
import type { MutableCombatant, StrategicCombatArenaOptions } from './strategic-combat-types';

function separateShipFromRock(
  ship: MutableCombatant,
  rock: NonNullable<StrategicCombatArenaOptions['asteroids']>[number],
  geometry: MutableCombatant['setup']['shieldGeometry']
): void {
  // Resolve penetration using the shield's directional ellipse, not its
  // largest axis as a circle. The old circle pushed ships away visibly
  // before their narrow-side shield had reached the asteroid.
  const heading = ship.headingRadians;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const offset = geometry?.centerOffset ?? { x: 0, y: 0 };
  const shieldX = ship.position.x + offset.x * cos - offset.y * sin;
  const shieldY = ship.position.y + offset.x * sin + offset.y * cos;
  const dx = rock.position.x - shieldX;
  const dy = rock.position.y - shieldY;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const localX = (dx * cos + dy * sin) / length;
  const localY = (-dx * sin + dy * cos) / length;
  const rx = Math.max(1, geometry?.radiusX ?? 30);
  const ry = Math.max(1, geometry?.radiusY ?? 20);
  const shieldExtent = 1 / Math.hypot(localX / rx, localY / ry);
  const penetration = Math.max(0, (rock.collisionRadius ?? rock.radius) + shieldExtent - length);
  ship.position.x -= (dx / length) * penetration;
  ship.position.y -= (dy / length) * penetration;
}

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
    // The shared campaign solver pushes the asteroid but never updates the ship.
    // Resolve the equal-and-opposite ship response before applying damage.
    const rock = arena.asteroids.find((asteroid) => asteroid.id === hit.asteroidId);
    const approach =
      (ship.velocity.x - (rock?.velocity.x ?? 0)) * hit.normal.x +
      (ship.velocity.y - (rock?.velocity.y ?? 0)) * hit.normal.y;
    if (approach > 0) {
      const impulse = approach * 1.15;
      ship.velocity.x -= hit.normal.x * impulse;
      ship.velocity.y -= hit.normal.y * impulse;
      ship.speed = Math.hypot(ship.velocity.x, ship.velocity.y);
    }
    if (rock) separateShipFromRock(ship, rock, geometry);
    const damage =
      Math.min(14, Math.max(0, hit.impactSpeed - 7) * 0.22) /
      Math.max(0.1, geometry?.modifier ?? 1);
    if (damage <= 0) continue;
    if (ship.shieldHp <= 0) {
      ship.hullHp = Math.max(0, ship.hullHp - directionalHullDamage(ship, damage, rock?.position ?? hit.point));
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
      ship.hullHp - directionalHullDamage(ship, effect.overflowDamage, rock?.position ?? hit.point)
    );
    ship.shieldImpacts.push(effect.impact);
  }
}
