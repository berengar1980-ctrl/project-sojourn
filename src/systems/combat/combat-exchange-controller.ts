import type { StrategicCombatRuntime } from './strategic-combat-types';
import { advanceExchange, initialExchange, type CombatExchange } from './combat-exchange-machine';
import { planExchangeFlight, pilotExchangeShip, type ExchangeFlightPlan } from './combat-exchange-pilot';

export interface ActiveExchange {
  exchange: CombatExchange;
  flight: ExchangeFlightPlan | null;
  attackerHp: number;
  defenderHp: number;
}

export function createActionExchange(runtime: StrategicCombatRuntime): ActiveExchange {
  return {
    exchange: initialExchange(runtime.firstPlanner),
    flight: null,
    attackerHp: runtime.attacker.shieldHp + runtime.attacker.hullHp,
    defenderHp: runtime.defender.shieldHp + runtime.defender.hullHp,
  };
}

export function tickActionExchange(
  runtime: StrategicCombatRuntime,
  state: ActiveExchange,
  dt: number
): void {
  const current = state.exchange;
  const initiator = current.initiative === 'attacker' ? runtime.attacker : runtime.defender;
  const opponent = current.initiative === 'attacker' ? runtime.defender : runtime.attacker;
  const context = {
    frontWeapons: initiator.setup.weapons.filter((w) => w.weapon?.mount === 'forward').length,
    broadsideWeapons: initiator.setup.weapons.filter((w) => w.weapon?.mount === 'broadside').length,
    guidedWeapons: initiator.setup.weapons.filter((w) => w.weapon?.mount === 'guided').length,
    attackerDamage: state.defenderHp - runtime.defender.shieldHp - runtime.defender.hullHp,
    defenderDamage: state.attackerHp - runtime.attacker.shieldHp - runtime.attacker.hullHp,
    roll: runtime.random,
  };
  const next = advanceExchange(current, dt, context);
  if (current.phase === 'choose' && next.action && next.reaction) {
    state.flight = planExchangeFlight(initiator, opponent, next.action, next.reaction, next.quality);
    state.attackerHp = runtime.attacker.shieldHp + runtime.attacker.hullHp;
    state.defenderHp = runtime.defender.shieldHp + runtime.defender.hullHp;
    runtime.lastEvent = next.action + ' / ' + next.reaction;
    runtime.combatLog.push({
      timeSeconds: Number(runtime.elapsedSeconds.toFixed(2)),
      side: next.initiative,
      event: 'plan',
      detail: runtime.lastEvent,
    });
  }
  state.exchange = next;
  if (current.phase === 'resolve') state.flight = null;
  if (!state.flight || next.phase !== 'execute') return;
  pilotExchangeShip(initiator, 'attacker', state.flight, runtime.arena, dt);
  pilotExchangeShip(opponent, 'defender', state.flight, runtime.arena, dt);
}
