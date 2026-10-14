import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import type { SectorNpcState } from '../core/npc-types';
import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-types';
import { resolveShipRuntimeSetup } from '../systems/ships';

export interface CombatCargoReward {
  readonly resourceId: string;
  readonly quantity: number;
}

/** Apply existing cargo admission rules; debit exactly what the player actually receives. */
export function transferCapturedCargo(
  npc: Pick<SectorNpcState, 'cargo'>,
  receive: (resourceId: string, quantity: number) => number
): CombatCargoReward[] {
  const rewards: CombatCargoReward[] = [];
  for (const [resourceId, amount] of Object.entries(npc.cargo)) {
    const available = Math.max(0, Math.floor(amount));
    if (available === 0) continue;
    const received = receive(resourceId, available);
    if (received === 0) continue;
    npc.cargo[resourceId] = amount - received;
    if (npc.cargo[resourceId] <= 0) delete npc.cargo[resourceId];
    rewards.push({ resourceId, quantity: received });
  }
  return rewards;
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
  const rewards = transferCapturedCargo(npc, (resourceId, available) =>
    economy.trade.receiveCargo(resourceId, available, capacity, npc.locationId)
  );
  for (const reward of rewards) {
    context.systemLog.write('BEUTE > ' + reward.quantity + ' × ' + reward.resourceId.toUpperCase());
  }
  return rewards;
}
