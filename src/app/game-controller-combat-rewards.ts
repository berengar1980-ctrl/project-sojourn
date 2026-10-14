import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-types';
import { resolveShipRuntimeSetup } from '../systems/ships';

export interface CombatCargoReward {
  readonly resourceId: string;
  readonly quantity: number;
}

/**
 * Transfer only real NPC cargo, through the existing cargo-capacity rules.
 * The removed amount always equals the quantity successfully received.
 * Only call on a resolved victory or a successful player boarding.
 */
export function collectCombatCargo(
  context: ControllerRuntimeContext,
  snapshot: StrategicCombatSnapshot,
  capturedByBoarding = false
): CombatCargoReward[] {
  if (snapshot.winner !== 'attacker' || snapshot.attacker.hullHp <= 0) return [];
  if (!capturedByBoarding && snapshot.defender.hullHp > 0) return [];
  const npc = context.engagements.activePlayerEnemy();
  if (!npc || npc.id !== snapshot.defender.id) return [];
  const { state, crew, loadouts, economy } = context;
  const capacity = resolveShipRuntimeSetup(state.activeShip, {
    ...crew.runtimeOptions(state.activeShip),
    installed: loadouts.get(state.activeShip),
  }).cargoCapacityTons;
  const rewards: CombatCargoReward[] = [];
  for (const [resourceId, amount] of Object.entries(npc.cargo)) {
    const available = Math.max(0, Math.floor(amount));
    if (available === 0) continue;
    const received = economy.trade.receiveCargo(resourceId, available, capacity, npc.locationId);
    if (received === 0) continue;
    npc.cargo[resourceId] = amount - received;
    if (npc.cargo[resourceId] <= 0) delete npc.cargo[resourceId];
    rewards.push({ resourceId, quantity: received });
    context.systemLog.write('BEUTE > ' + received + ' × ' + resourceId.toUpperCase());
  }
  return rewards;
}
