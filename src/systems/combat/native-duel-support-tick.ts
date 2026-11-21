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
import type { StrategicCombatRuntime } from './strategic-combat-types';
import type { StrategicCombatBystander } from './strategic-combat-bystander-types';

/**
 * Native, one-sided participant. The defender is the ACTUAL live combatant
 * owned/ticked by an existing 1vs1 service, never a duplicate or a second AI.
 * All tactical planning, physics, aiming, damage and mines are original systems.
 */
export function tickNativeSupportingAttacker(
  runtime: StrategicCombatRuntime,
  seconds: number,
  bystanders: readonly StrategicCombatBystander[]
): void {
  if (runtime.winner || !Number.isFinite(seconds) || seconds <= 0) return;
  const dt = Math.min(seconds, 0.08);
  const source = runtime.attacker;
  const target = runtime.defender;
  // The shared defender may already have been destroyed by its primary duel
  // or another supporter. Never move or damage that ship again.
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
  if (source.powerFault !== 'total') reviewAndExecute(runtime, source, target, 'attacker');
  moveCombatant(source, target, 'attacker', dt, runtime.arena, runtime.mines);
  // Contact is handled by the original resolver, but the shared target never
  // gets its own AI or acceleration step in this support tick.
  applyCombatRamImpact(runtime);
  resolveCombatantCollision(source, target);
  resolveCombatBystanderContacts(source, bystanders);
  if (source.powerFault !== 'total') {
    maybeDropRuntimeMine(runtime, 'attacker', source, target, dt);
    maybeLaunchTractorAsteroid(runtime, 'attacker', source, target);
    pulseCombatTractor(runtime, 'attacker', source, target, dt);
  }
  advanceThrownAsteroids(runtime, dt);
  advanceRuntimeWeapons(runtime, 'attacker', source, target, dt);
  advanceRuntimeProjectiles(runtime, dt);
  advanceRuntimeMines(runtime, dt);
  resolveRuntimeWinner(runtime);
}
