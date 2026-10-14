import { nativeMineDamage } from './combat-native-damage';
import { usefulEscapeMine } from './combat-commitment';
import type { ShipMineDefinition } from '../../core/combat-types';

import type {
  MutableCombatant,
  StrategicCombatRuntime,
  StrategicCombatSide,
  MutableMine,
} from './strategic-combat-types';

import { distance, MINE_DROP_COOLDOWN, normalize } from './strategic-combat-geometry';

import { runtimeEnemy, runtimeCombatant } from './strategic-combat-runtime';

import { applyDamage } from './strategic-combat-damage';

function chooseRuntimeMine(
  source: MutableCombatant,
  target: MutableCombatant
): ShipMineDefinition | null {
  if (source.mineStock.length === 0) return null;
  const preferredKind =
    target.shieldHp > 0
      ? 'ion'
      : distance(source.position, target.position) > 360
        ? 'hunter'
        : 'shaped_charge';
  return (
    source.mineStock.find((mine) => mine.kind === preferredKind) ?? source.mineStock[0] ?? null
  );
}

/** A minefield ship waits until its present track intersects the enemy's
 * predicted approach, so inventory creates a real route denial rather than
 * an arbitrary trail of mines.
 */
export function usefulMineCorridor(source: MutableCombatant, target: MutableCombatant): boolean {
  const dx = source.position.x - target.position.x;
  const dy = source.position.y - target.position.y;
  const distanceToShip = Math.hypot(dx, dy);
  if (distanceToShip > 720 || distanceToShip < 135) return false;
  const closing =
    (target.velocity.x - source.velocity.x) * dx + (target.velocity.y - source.velocity.y) * dy;
  if (closing < 0) return false;
  const speed = Math.hypot(target.velocity.x, target.velocity.y);
  if (speed < 10) return distanceToShip < 400;
  const approach = Math.max(
    0,
    Math.min(3, (dx * target.velocity.x + dy * target.velocity.y) / (speed * speed))
  );
  const closestX = target.position.x + target.velocity.x * approach;
  const closestY = target.position.y + target.velocity.y * approach;
  return Math.hypot(closestX - source.position.x, closestY - source.position.y) < 240;
}

function canDeployMine(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  source: MutableCombatant,
  justified: boolean
): boolean {
  if (!justified || source.mineStock.length === 0 || source.mineCooldown > 0) return false;
  return !runtime.mines.some(
    (mine) =>
      mine.owner === side &&
      distance(mine.position, source.position) < mine.definition.triggerRadiusMeters * 1.6
  );
}

export function maybeDropRuntimeMine(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  source: MutableCombatant,
  target: MutableCombatant,
  deltaSeconds: number
): void {
  source.mineCooldown = Math.max(0, source.mineCooldown - deltaSeconds);
  const range = distance(source.position, target.position);
  const defensiveMine =
    source.tactic === 'flee' &&
    range <= 640 &&
    target.subsystems.engine > 0 &&
    usefulEscapeMine(source, target, runtime.arena);
  // Armed AI ships can also deploy an opportunistic mine during a close pass.
  const tacticalMine =
    source.setup.aiControlled &&
    source.tactic === 'fight' &&
    range >= 155 &&
    range <= 470 &&
    (target.velocity.x - source.velocity.x) * (target.position.x - source.position.x) +
      (target.velocity.y - source.velocity.y) * (target.position.y - source.position.y) <
      0;
  const zoneMine = source.tactic === 'minefield' && usefulMineCorridor(source, target);
  if (!canDeployMine(runtime, side, source, Boolean(zoneMine || defensiveMine || tacticalMine)))
    return;
  if (range > 720) return;
  const definition = defensiveMine
    ? (source.mineStock.find((mine) => mine.kind === 'hunter') ?? chooseRuntimeMine(source, target))
    : chooseRuntimeMine(source, target);
  if (!definition) return;
  const stockIndex = source.mineStock.findIndex((mine) => mine.id === definition.id);
  if (stockIndex >= 0) source.mineStock.splice(stockIndex, 1);

  runtime.mineSerial += 1;
  source.mineCooldown = MINE_DROP_COOLDOWN;
  runtime.mines.push({
    id: runtime.mineSerial,
    owner: side,
    position: { ...source.position },
    armedSeconds: 0.7,
    pursuitRemaining: definition.pursuitSeconds,
    definition,
  });
  runtime.lastEvent = source.setup.name + ': ' + definition.name + ' gelegt';
  runtime.combatLog?.push({
    timeSeconds: Number(runtime.elapsedSeconds.toFixed(2)),
    side,
    event: 'action',
    detail:
      'MINE_DEPLOY ' +
      definition.id +
      (zoneMine ? ' ZONE_DENIAL' : defensiveMine ? ' REAR_GUARD' : ' CLOSE_PASS'),
  });
}

function advanceRuntimeMine(
  runtime: StrategicCombatRuntime,
  mine: MutableMine,
  index: number,
  deltaSeconds: number
): void {
  mine.armedSeconds = Math.max(0, mine.armedSeconds - deltaSeconds);
  const target = runtimeEnemy(runtime, mine.owner);
  if (target.hullHp <= 0) {
    runtime.mines.splice(index, 1);
    return;
  }
  if (
    mine.armedSeconds <= 0 &&
    mine.pursuitRemaining > 0 &&
    mine.definition.pursuitSpeedMetersPerSecond > 0
  ) {
    const direction = normalize(
      target.position.x - mine.position.x,
      target.position.y - mine.position.y
    );
    mine.position.x += direction.x * mine.definition.pursuitSpeedMetersPerSecond * deltaSeconds;
    mine.position.y += direction.y * mine.definition.pursuitSpeedMetersPerSecond * deltaSeconds;
    mine.pursuitRemaining = Math.max(0, mine.pursuitRemaining - deltaSeconds);
  }
  if (mine.armedSeconds > 0) return;
  if (distance(mine.position, target.position) > mine.definition.triggerRadiusMeters) return;

  runtime.impactSerial += 1;
  const source = runtimeCombatant(runtime, mine.owner);
  const result = applyDamage(
    target,
    nativeMineDamage(mine.definition).shieldDamage,
    nativeMineDamage(mine.definition).hullDamage,
    source,
    false,
    mine.position,
    'missile',
    runtime.impactSerial
  );
  runtime.lastImpact = {
    serial: runtime.impactSerial,
    target: mine.owner === 'attacker' ? 'defender' : 'attacker',
    layer: result.layer,
    damage: result.damage,
    position: { ...target.position },
  };
  runtime.lastEvent =
    source.setup.name +
    ': ' +
    mine.definition.name +
    ' detoniert · ' +
    (result.layer === 'shield' ? 'Schild' : 'Hülle') +
    ' -' +
    Math.round(result.damage);
  runtime.combatLog?.push({
    timeSeconds: Number(runtime.elapsedSeconds.toFixed(2)),
    side: mine.owner,
    event: 'action',
    detail:
      'MINE_DETONATE ' + mine.definition.id + ' ' + result.layer + ' ' + Math.round(result.damage),
  });
  runtime.mines.splice(index, 1);
}

export function advanceRuntimeMines(runtime: StrategicCombatRuntime, deltaSeconds: number): void {
  for (let index = runtime.mines.length - 1; index >= 0; index -= 1) {
    advanceRuntimeMine(runtime, runtime.mines[index]!, index, deltaSeconds);
  }
}
