import { nativeMineDamage } from './combat-native-damage';
import { applyDamage } from './strategic-combat-damage';
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
const COOLDOWN_SECONDS = 6;
const CAPTURE_SECONDS = 0.65;
const CHARGE_SECONDS = 0.85;

function selectThrowable(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  ship: MutableCombatant,
  reach: number
): {
  rock: CombatVisualAsteroid | undefined;
  mine: StrategicCombatRuntime['mines'][number] | undefined;
} {
  const rock = (runtime.arena.asteroids ?? [])
    .filter((candidate) => candidate.radius >= 5 && candidate.radius <= MAX_RADIUS)
    .filter((candidate) => distance(ship.position, candidate.position) <= reach)
    .filter(
      (candidate) => !runtime.thrownAsteroids.some((thrown) => thrown.asteroidId === candidate.id)
    )
    .sort((a, b) => distance(ship.position, a.position) - distance(ship.position, b.position))[0];
  // Reuse the same five-phase throw for an existing, armed OWN mine.
  // Never capture an opposing mine or fabricate ammunition.
  const mine = !rock
    ? runtime.mines.find(
        (candidate) =>
          candidate.owner === side &&
          candidate.armedSeconds <= 0 &&
          distance(ship.position, candidate.position) <= reach
      )
    : undefined;
  return { rock, mine };
}

function removeCapturedThrowable(
  runtime: StrategicCombatRuntime,
  rock?: CombatVisualAsteroid,
  mine?: StrategicCombatRuntime['mines'][number]
): void {
  if (rock) {
    const asteroids = runtime.arena.asteroids as CombatVisualAsteroid[] | undefined;
    const obstacles = runtime.arena.obstacles as StrategicCombatObstacle[] | undefined;
    asteroids?.splice(asteroids.indexOf(rock), 1);
    const obstacleIndex = obstacles?.findIndex((candidate) => candidate.id === rock.id) ?? -1;
    if (obstacleIndex >= 0) obstacles?.splice(obstacleIndex, 1);
  } else if (mine) {
    runtime.mines.splice(runtime.mines.indexOf(mine), 1);
  }
}

function queueTractorThrow(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  ship: MutableCombatant,
  position: { x: number; y: number },
  aim: { x: number; y: number },
  rock?: CombatVisualAsteroid,
  mine?: StrategicCombatRuntime['mines'][number]
): void {
  runtime.thrownAsteroids.push({
    owner: side,
    asteroidId: rock?.id ?? 'mine-' + mine!.id,
    ...(rock?.debrisVariant ? { debrisVariant: rock.debrisVariant } : {}),
    ...(rock?.sectionVariant ? { sectionVariant: rock.sectionVariant } : {}),
    ...(rock?.containerVariant ? { containerVariant: rock.containerVariant } : {}),
    ...(rock?.rotation3d ? { rotation3d: { ...rock.rotation3d } } : {}),
    ...(rock?.effectSeed !== undefined ? { effectSeed: rock.effectSeed } : {}),
    ...(mine ? { mineDefinition: mine.definition } : {}),
    position: { ...position },
    radius: rock?.radius ?? 9,
    velocity: { x: aim.x * THROW_SPEED, y: aim.y * THROW_SPEED },
    ageSeconds: 0,
    phase: 'capture',
    origin: { ...ship.position },
  });
}

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
  const { rock, mine } = selectThrowable(runtime, side, ship, reach);
  if (!rock && !mine) return;
  const position = rock?.position ?? mine!.position;
  const lead = distance(position, target.position) / THROW_SPEED;
  const aim = normalize(
    target.position.x + target.velocity.x * lead - position.x,
    target.position.y + target.velocity.y * lead - position.y
  );
  // Remove the captured rock from normal asteroid physics; it now has one
  // authoritative projectile position instead of a duplicate stationary body.
  removeCapturedThrowable(runtime, rock, mine);
  queueTractorThrow(runtime, side, ship, position, aim, rock, mine);
  ship.tractorThrowCooldown = COOLDOWN_SECONDS;
  runtime.lastEvent =
    ship.setup.name +
    (mine
      ? ': TRAKTOR ERFASST MINE'
      : rock?.debrisVariant || rock?.sectionVariant || rock?.containerVariant
        ? ': TRAKTOR ERFASST SCHROTT'
        : ': TRAKTOR ERFASST ASTEROID');
  runtime.combatLog.push({
    timeSeconds: Number(runtime.elapsedSeconds.toFixed(2)),
    side,
    event: 'action',
    detail:
      (mine
        ? 'TRACTOR_MINE_THROW '
        : rock?.debrisVariant || rock?.sectionVariant || rock?.containerVariant
          ? 'TRACTOR_SCRAP_THROW '
          : 'TRACTOR_ASTEROID_THROW ') + (rock?.id ?? mine!.id),
  });
}

function hitThrownAsteroid(runtime: StrategicCombatRuntime, rock: MutableThrownAsteroid): boolean {
  const enemy = rock.owner === 'attacker' ? runtime.defender : runtime.attacker;
  const hitRadius =
    rock.radius +
    Math.max(enemy.setup.shieldGeometry?.radiusX ?? 30, enemy.setup.shieldGeometry?.radiusY ?? 20);
  if (distance(rock.position, enemy.position) > hitRadius) return false;
  if (rock.mineDefinition) {
    const source = rock.owner === 'attacker' ? runtime.attacker : runtime.defender;
    runtime.impactSerial += 1;
    const result = applyDamage(
      enemy,
      nativeMineDamage(rock.mineDefinition).shieldDamage,
      nativeMineDamage(rock.mineDefinition).hullDamage,
      source,
      false,
      rock.position,
      'missile',
      runtime.impactSerial
    );
    runtime.lastImpact = {
      serial: runtime.impactSerial,
      target: rock.owner === 'attacker' ? 'defender' : 'attacker',
      layer: result.layer,
      damage: result.damage,
      position: { ...rock.position },
      weaponKind: 'missile',
    };
    runtime.lastEvent = 'TRAKTORMINE DETONIERT · ' + Math.round(result.damage) + ' HP';
    runtime.combatLog.push({
      timeSeconds: Number(runtime.elapsedSeconds.toFixed(2)),
      side: rock.owner,
      event: 'action',
      detail:
        'MINE_DETONATE ' +
        rock.mineDefinition.id +
        ' ' +
        result.layer +
        ' ' +
        Math.round(result.damage),
    });
    return true;
  }
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
    source: 'tractor_asteroid',
  };
  const isScrap = Boolean(rock.debrisVariant || rock.sectionVariant || rock.containerVariant);
  runtime.lastEvent =
    (isScrap ? 'SCHROTTTREFFER · ' : 'ASTEROIDENTREFFER · ') +
    Math.round(shieldDamage + hullDamage) +
    ' HP';
  runtime.combatLog.push({
    timeSeconds: Number(runtime.elapsedSeconds.toFixed(2)),
    side: rock.owner,
    event: 'impact',
    detail:
      (isScrap ? 'TRACTOR_SCRAP_HIT' : 'TRACTOR_ASTEROID_HIT') +
      ' shield=' +
      shieldDamage +
      ' hull=' +
      hullDamage,
  });
  return true;
}

function advanceRockPhase(rock: MutableThrownAsteroid, dt: number): void {
  rock.ageSeconds += dt;
  if (rock.phase === 'capture') {
    const dx = rock.origin.x - rock.position.x;
    const dy = rock.origin.y - rock.position.y;
    const length = Math.hypot(dx, dy);
    if (length > 110) {
      const movement = Math.min(length - 110, 150 * dt);
      rock.position.x += (dx / length) * movement;
      rock.position.y += (dy / length) * movement;
    }
    if (rock.ageSeconds >= CAPTURE_SECONDS) rock.phase = 'charge';
    return;
  }
  if (rock.phase === 'charge') {
    if (rock.ageSeconds >= CAPTURE_SECONDS + CHARGE_SECONDS) {
      rock.phase = 'flight';
      rock.ageSeconds = 0;
    }
    return;
  }
  rock.position.x += rock.velocity.x * dt;
  rock.position.y += rock.velocity.y * dt;
}

export function advanceThrownAsteroids(runtime: StrategicCombatRuntime, dt: number): void {
  for (const ship of [runtime.attacker, runtime.defender]) {
    ship.tractorThrowCooldown = Math.max(0, (ship.tractorThrowCooldown ?? 0) - dt);
  }
  for (let index = runtime.thrownAsteroids.length - 1; index >= 0; index -= 1) {
    const rock = runtime.thrownAsteroids[index]!;
    const wasFlying = rock.phase === 'flight';
    advanceRockPhase(rock, dt);
    if (rock.phase !== 'flight') continue;
    if ((wasFlying && hitThrownAsteroid(runtime, rock)) || rock.ageSeconds > 8) {
      runtime.thrownAsteroids.splice(index, 1);
    }
  }
}
