import type { SalvageField, SalvageWreck } from '../core/salvage-types';
import type { WorldLocation } from '../core/world-types';
import type { NpcEconomyState } from '../core/economy-types';
import { hashId } from '../systems/npcs/npc-mining-targets';
import { generateSalvageField } from '../systems/salvage';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import type { EconomySimulationService } from '../systems/economy/economy-simulation-service';
import { salvageStockId } from '../systems/salvage/salvage-stock-id';

export function registerPermanentSalvageStocks(
  simulation: EconomySimulationService,
  field: SalvageField
): void {
  for (const wreck of field.wrecks) {
    if (wreck.combatWreckVariant) continue;
    const sourceId = salvageStockId(field, wreck);
    for (const deposit of wreck.resources) {
      const { resourceId, remainingAmount } = deposit;
      simulation.registerInitialPhysicalStock(resourceId, sourceId, remainingAmount);
    }
  }
}

export function balancePermanentSalvageStocks(
  simulation: EconomySimulationService,
  field: SalvageField,
  canRefill: (wreckId: string) => boolean
): void {
  for (const wreck of field.wrecks) {
    if (wreck.combatWreckVariant) continue;
    const sourceId = salvageStockId(field, wreck);
    for (const deposit of wreck.resources) {
      const stock = simulation.getPhysicalStock(deposit.resourceId, sourceId);
      if (stock === undefined) continue;
      if (stock > deposit.remainingAmount) {
        const loss = stock - deposit.remainingAmount;
        simulation.losePhysicalStock(deposit.resourceId, sourceId, loss);
      }
      if (stock < deposit.remainingAmount) deposit.remainingAmount = stock;
      if (!canRefill(wreck.id)) continue;
      const deficit = deposit.initialAmount - deposit.remainingAmount;
      const funded = simulation.fundPhysicalStock(deposit.resourceId, sourceId, deficit);
      deposit.remainingAmount += funded;
    }
  }
}

const COMMON = ['steel', 'alloys', 'industry-parts', 'composite-plate', 'machine-parts'];
const MID = ['industrial-ceramics', 'electronics', 'armor-plate', 'plasma-fuel'];
const PREMIUM = ['processor-modules', 'reactor-parts', 'ship-parts', 'rare-tech', 'antiquities'];
const ILLEGAL = ['narcotics', 'stolen-data', 'alien-artifacts'];

function regionalResourcePool(danger: number, index: number, roll: number): readonly string[] {
  if (danger <= 1) return COMMON;
  if (danger >= 3) return index % 3 === 1 ? ILLEGAL : PREMIUM;
  if (roll % 12 === 0) return ILLEGAL;
  if (index % 3 === 2) return PREMIUM;
  return index % 3 === 1 ? COMMON : MID;
}

function applyRegionalStockProfile(wreck: SalvageWreck, danger: number): void {
  const used = new Set<string>();
  for (let index = 0; index < wreck.resources.length; index++) {
    const deposit = wreck.resources[index]!;
    const roll = hashId(wreck.id + ':regional-stock:' + index);
    const pool = regionalResourcePool(danger, index, roll).filter((id) => !used.has(id));
    const resourceId = pool[roll % pool.length] ?? deposit.resourceId;
    used.add(resourceId);
    wreck.resources[index] = { ...deposit, resourceId };
  }
}

/** New career fields use a stable, versioned seed; legacy seeds retain their original loot. */
export function permanentSalvageField(
  context: ControllerRuntimeContext,
  location: WorldLocation,
  preferredSeed?: number
): SalvageField {
  const canonicalSeed = hashId('sojourn-salvage-regional-v1:' + location.id);
  const { wreckClaims, simulation } = context.economy;
  const seed = wreckClaims.seedFor(location.id, preferredSeed ?? canonicalSeed);
  const field = generateSalvageField(location.id, seed, location.dangerLevel);
  if (seed === canonicalSeed) {
    for (const wreck of field.wrecks) applyRegionalStockProfile(wreck, location.dangerLevel);
  }
  wreckClaims.restoreField(field);
  registerPermanentSalvageStocks(simulation, field);
  return field;
}

export function recoverBackgroundSalvage(
  context: ControllerRuntimeContext,
  npc: NpcEconomyState,
  field: SalvageField,
  day: number
): void {
  const { wreckClaims, npcs } = context.economy;
  for (const wreck of field.wrecks) {
    if (wreck.combatWreckVariant || (wreck.boardingHostiles && !wreck.boardingCleared)) continue;
    const claim = wreckClaims.claim(field.id, wreck.id, day);
    if (claim && claim.ownerId !== npc.id) continue;
    const deposit = wreck.resources.find((entry) => entry.remainingAmount > 0);
    if (!deposit) continue;
    if (!claim) {
      wreck.inspected = true;
      wreck.scanLevel = 'analyzed';
      const registered = wreckClaims.register(field, wreck, npc.id, day, npc.credits);
      if (!registered.ok) continue;
      npc.credits -= registered.fee;
    }
    const requested = Math.min(5, deposit.remainingAmount);
    const sourceId = salvageStockId(field, wreck);
    const accepted = npcs.salvageLocal(npc, deposit.resourceId, requested, sourceId);
    deposit.remainingAmount -= accepted;
    if (accepted > 0) {
      wreckClaims.rememberField(field);
      return;
    }
  }
  npcs.dispatchLoadedWorker(npc);
}
