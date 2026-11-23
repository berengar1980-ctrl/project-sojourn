import { advanceCombatPower } from './combat-power-service';
import { applyCombatRamImpact } from './combat-ram-impact';
import { advanceShieldImpacts } from '../shields/shield-service';
import { resolveCombatBystanderContacts } from './combat-bystander-contacts';
import { moveCombatant, resolveArenaObstacles } from './strategic-combat-movement';
import { reviewAndExecute } from './strategic-combat-telemetry';
import { advanceRuntimeWeapons, advanceRuntimeProjectiles } from './strategic-combat-weapons';
import { maybeDropRuntimeMine, advanceRuntimeMines } from './strategic-combat-mines';
import {
  advanceThrownAsteroids,
  maybeLaunchTractorAsteroid,
} from './combat-tractor-asteroid-throw';
import { pulseCombatTractor } from './combat-tractor-pulse';
import { resolveRuntimeWinner } from './combat-runtime-winner';
import type { StrategicCombatRuntime, StrategicCombatSide } from './strategic-combat-types';
import type { StrategicCombatBystander } from './strategic-combat-bystander-types';

/**
 * Continue exactly ONE live ship using the original tactics, steering, weapon,
 * projectile, mine and tractor services. The opposing actor belongs to its
 * own service, so its AI, power and cooldowns are not ticked again.
 */
export function tickNativeSupportingShip(
  runtime: StrategicCombatRuntime,
  seconds: number,
  bystanders: readonly StrategicCombatBystander[],
  side: StrategicCombatSide
): void {
  if (runtime.winner || !Number.isFinite(seconds) || seconds <= 0) return;
  const dt = Math.min(seconds, 0.08);
  const source = runtime[side];
  const target = runtime[side === 'attacker' ? 'defender' : 'attacker'];
  if (source.hullHp <= 0 || target.hullHp <= 0) {
    resolveRuntimeWinner(runtime);
    return;
  }

  runtime.elapsedSeconds += dt;
  advanceCombatPower(source, dt);
  source.shieldImpacts = advanceShieldImpacts(source.shieldImpacts, dt);
  for (let i = runtime.beams.length - 1; i >= 0; i -= 1) {
    runtime.beams[i]!.ttlSeconds -= dt;
    if (runtime.beams[i]!.ttlSeconds <= 0) runtime.beams.splice(i, 1);
  }
  if (source.powerFault !== 'total') reviewAndExecute(runtime, source, target, side);
  moveCombatant(source, target, side, dt, runtime.arena, runtime.mines);
  applyCombatRamImpact(runtime);
  // Collisions may correct only the ship owned by this one-sided service.
  // The shared target's physics belongs to its original native duel.
  const { x, y } = source.position;
  resolveCombatBystanderContacts(source, [
    ...bystanders,
    {
      id: target.setup.id,
      shipId: target.setup.shipId,
      position: target.position,
      headingRadians: target.headingRadians,
    },
  ]);
  if (source.position.x !== x || source.position.y !== y)
    resolveArenaObstacles(source, runtime.arena);
  if (source.powerFault !== 'total') {
    maybeDropRuntimeMine(runtime, side, source, target, dt);
    maybeLaunchTractorAsteroid(runtime, side, source, target);
    pulseCombatTractor(runtime, side, source, target, dt);
  }
  // In the original 1vs1 both cooldowns tick. A supporting service only
  // owns its driving ship; ticking the shared target here would double it.
  advanceThrownAsteroids(runtime, dt, side);
  advanceRuntimeWeapons(runtime, side, source, target, dt);
  advanceRuntimeProjectiles(runtime, dt);
  advanceRuntimeMines(runtime, dt);
  resolveRuntimeWinner(runtime);
  // A target's escape is authoritative only in the service that actually
  // drives that target. Do not steal an exit outcome from its native owner.
  if (runtime.outcomeReason === 'escape' && runtime.winner === side) {
    runtime.winner = null;
    runtime.outcomeReason = null;
  }
}

/** Backwards-compatible facade for the already-active fleet supporters. */
export function tickNativeSupportingAttacker(
  runtime: StrategicCombatRuntime,
  seconds: number,
  bystanders: readonly StrategicCombatBystander[]
): void {
  tickNativeSupportingShip(runtime, seconds, bystanders, 'attacker');
}
