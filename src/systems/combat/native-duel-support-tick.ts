import { advanceCombatPower } from './combat-power-service';
import { applyCombatRamImpact } from './combat-ram-impact';
import { advanceShieldImpacts } from '../shields/shield-service';
import { resolveCombatBystanderContacts } from './combat-bystander-contacts';
import { resolveCombatantCollision, moveCombatant } from './strategic-combat-movement';
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
  resolveCombatantCollision(source, target);
  resolveCombatBystanderContacts(source, bystanders);
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
}

/** Backwards-compatible facade for the already-active fleet supporters. */
export function tickNativeSupportingAttacker(
  runtime: StrategicCombatRuntime,
  seconds: number,
  bystanders: readonly StrategicCombatBystander[]
): void {
  tickNativeSupportingShip(runtime, seconds, bystanders, 'attacker');
}
