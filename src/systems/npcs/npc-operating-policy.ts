import type { SectorNpcState } from '../../core/npc-types';
import { repairCost } from '../ships/ship-operating-costs';

/**
 * Critical ships spend their available funds on hull survival before routine fueling.
 * Minor damage is deliberately deferred if repairing would consume the fuel reserve.
 */
export function npcRepairPriority(
  npc: Pick<SectorNpcState, 'credits' | 'fuelCapacity' | 'hullHp' | 'hullMaxHp'>,
  shipyard: boolean
): 'critical' | 'affordable' | 'defer' {
  if (npc.hullMaxHp <= 0 || npc.hullHp >= npc.hullMaxHp) return 'defer';
  const fraction = Math.max(0, npc.hullHp / npc.hullMaxHp);
  if (fraction < 0.4) return 'critical';
  if (fraction <= 0.7) return 'affordable';
  const cost = repairCost(npc.hullMaxHp - npc.hullHp, shipyard);
  const fuelReserve = Math.max(200, Math.ceil(npc.fuelCapacity * 2.5));
  return npc.credits >= cost + fuelReserve ? 'affordable' : 'defer';
}

/** A severely damaged worker should head back to its assigned home port instead of mining. */
export function npcNeedsSafeReturn(npc: {
  readonly hullHp?: number;
  readonly hullMaxHp?: number;
}): boolean {
  if (npc.hullHp === undefined || npc.hullMaxHp === undefined) return false;
  return npc.hullMaxHp > 0 && npc.hullHp / npc.hullMaxHp < 0.4;
}
