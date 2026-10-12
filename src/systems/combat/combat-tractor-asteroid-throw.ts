import { distance, normalize } from './strategic-combat-geometry';
import type {
  MutableCombatant,
  CombatVisualAsteroid,
  StrategicCombatObstacle,
  MutableThrownAsteroid,
  StrategicCombatRuntime,
  StrategicCombatSide,
} from './strategic-combat-types';

const MAX_RADIUS = 35;
const THROW_SPEED = 420;
const COOLDOWN_SECONDS = 16;

export function maybeLaunchTractorAsteroid(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  ship: MutableCombatant,
  target: MutableCombatant
): void {
  if (ship.shieldHp > 0 || ship.subsystems.tractor <= 0 || ship.tactic === 'flee') return;
  if ((ship.tractorThrowCooldown ?? 0) > 0 || target.hullHp <= 0) return;
  const reach = Math.min(700, ship.setup.tractorRangeMeters ?? 0);
  if (reach <= 0 || distance(ship.position, target.position) > 1200) return;
  const rock = (runtime.arena.asteroids ?? [])
    .filter((candidate) => candidate.radius >= 5 && candidate.radius <= MAX_RADIUS)
    .filter((candidate) => distance(ship.position, candidate.position) <= reach)
    .filter(
      (candidate) => !runtime.thrownAsteroids.some((thrown) => thrown.asteroidId === candidate.id)
    )
    .sort((a, b) => distance(ship.position, a.position) - distance(ship.position, b.position))[0];
  if (!rock) return;
  const lead = distance(rock.position, target.position) / THROW_SPEED;
  const aim = normalize(
    target.position.x + target.velocity.x * lead - rock.position.x,
    target.position.y + target.velocity.y * lead - rock.position.y
  );
  // Remove the captured rock from normal asteroid physics; it now has one
  // authoritative projectile position instead of a duplicate stationary body.
  const asteroids = runtime.arena.asteroids as CombatVisualAsteroid[] | undefined;
  const obstacles = runtime.arena.obstacles as StrategicCombatObstacle[] | undefined;
  asteroids?.splice(asteroids.indexOf(rock), 1);
  const obstacleIndex = obstacles?.findIndex((candidate) => candidate.id === rock.id) ?? -1;
  if (obstacleIndex >= 0) obstacles?.splice(obstacleIndex, 1);
  runtime.thrownAsteroids.push({
    owner: side,
    asteroidId: rock.id,
    position: { ...rock.position },
    radius: rock.radius,
    velocity: { x: aim.x * THROW_SPEED, y: aim.y * THROW_SPEED },
    ageSeconds: 0,
  });
  ship.tractorThrowCooldown = COOLDOWN_SECONDS;
  runtime.lastEvent = ship.setup.name + ': ASTEROID GESCHLEUDERT';
  runtime.combatLog.push({
    timeSeconds: Number(runtime.elapsedSeconds.toFixed(2)),
    side,
    event: 'action',
    detail: 'TRACTOR_ASTEROID_THROW ' + rock.id,
  });
}

function hitThrownAsteroid(runtime: StrategicCombatRuntime, rock: MutableThrownAsteroid): boolean {
  const enemy = rock.owner === 'attacker' ? runtime.defender : runtime.attacker;
  const hitRadius =
    rock.radius +
    Math.max(enemy.setup.shieldGeometry?.radiusX ?? 30, enemy.setup.shieldGeometry?.radiusY ?? 20);
  if (distance(rock.position, enemy.position) > hitRadius) return false;
  const shieldDamage = Math.min(enemy.shieldHp, 130);
  enemy.shieldHp -= shieldDamage;
  const hullDamage = enemy.shieldHp <= 0 ? 95 : 0;
  enemy.hullHp = Math.max(0, enemy.hullHp - hullDamage);
  runtime.impactSerial += 1;
  runtime.lastImpact = {
    serial: runtime.impactSerial,
    target: rock.owner === 'attacker' ? 'defender' : 'attacker',
    layer: hullDamage > 0 ? 'hull' : 'shield',
    damage: shieldDamage + hullDamage,
    position: { ...rock.position },
    weaponKind: 'missile',
  };
  runtime.lastEvent = 'ASTEROIDENTREFFER · ' + Math.round(shieldDamage + hullDamage) + ' HP';
  runtime.combatLog.push({
    timeSeconds: Number(runtime.elapsedSeconds.toFixed(2)),
    side: rock.owner,
    event: 'impact',
    detail: 'TRACTOR_ASTEROID_HIT shield=' + shieldDamage + ' hull=' + hullDamage,
  });
  return true;
}

export function advanceThrownAsteroids(runtime: StrategicCombatRuntime, dt: number): void {
  for (const ship of [runtime.attacker, runtime.defender]) {
    ship.tractorThrowCooldown = Math.max(0, (ship.tractorThrowCooldown ?? 0) - dt);
  }
  for (let index = runtime.thrownAsteroids.length - 1; index >= 0; index -= 1) {
    const rock = runtime.thrownAsteroids[index]!;
    rock.ageSeconds += dt;
    rock.position.x += rock.velocity.x * dt;
    rock.position.y += rock.velocity.y * dt;
    if (hitThrownAsteroid(runtime, rock) || rock.ageSeconds > 8) {
      runtime.thrownAsteroids.splice(index, 1);
    }
  }
}
