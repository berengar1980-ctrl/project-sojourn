import { runtimeCombatantEscaped } from './combat-escape-evaluation';
import type { StrategicCombatRuntime } from './strategic-combat-types';

export function resolveRuntimeWinner(runtime: StrategicCombatRuntime): void {
  if (runtime.winner) return;
  if (runtime.defender.hullHp <= 0) {
    runtime.winner = 'attacker';
    runtime.lastEvent = runtime.attacker.setup.name + ' gewinnt das Gefecht';
    return;
  }
  if (runtime.attacker.hullHp <= 0) {
    runtime.winner = 'defender';
    runtime.lastEvent = runtime.defender.setup.name + ' gewinnt das Gefecht';
    return;
  }
  if (runtimeCombatantEscaped(runtime.attacker, runtime.defender, runtime.arena)) {
    runtime.winner = 'defender';
    runtime.lastEvent = runtime.attacker.setup.name + ' entkommt aus dem Gefecht';
  } else if (runtimeCombatantEscaped(runtime.defender, runtime.attacker, runtime.arena)) {
    runtime.winner = 'attacker';
    runtime.lastEvent = runtime.defender.setup.name + ' entkommt aus dem Gefecht';
  }
}
