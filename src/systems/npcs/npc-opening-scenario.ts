import type { EconomyResourceId } from '../../core/economy-types';
import type { SectorNpcState } from '../../core/npc-types';
import type { EconomyMarketService } from '../economy/market-service';
import { buyFromMarket } from '../economy/npc-trade-actions';
import type { NpcEconomyService } from '../economy/npc-economy-types';
import {
  beginNpcAutonomyPhase,
  ensureNpcAutonomy,
  markNpcTravelStarted,
} from './npc-autonomy';
import type { NpcSectorService } from './npc-sector-types';

export interface NpcOpeningScenarioReport {
  readonly freightersInFlight: number;
  readonly minersWorking: number;
  readonly salvagersWorking: number;
  readonly patrolsInFlight: number;
  readonly piratesInFlight: number;
}

interface Shipment {
  readonly destinationId: string;
  readonly resourceId: EconomyResourceId;
  readonly units: number;
  readonly margin: number;
  readonly score: number;
}

function setWaiting(npc: SectorNpcState, index: number): void {
  const phase = npc.job === 'patrol' || npc.pirate ? 'patrol-rest' : 'resting';
  beginNpcAutonomyPhase(npc, phase, 9 + (index % 4) * 4);
}

function seedWorkingCrew(
  ships: readonly SectorNpcState[],
  count: number,
  economy: NpcEconomyService
): number {
  let started = 0;
  for (const [index, npc] of ships.entries()) {
    if (index >= count || !npc.workLocationId) {
      setWaiting(npc, index);
      continue;
    }
    npc.locationId = npc.workLocationId;
    delete npc.orbit;
    const autonomy = ensureNpcAutonomy(npc);
    autonomy.lastLocationId = npc.locationId;
    autonomy.wasTravelling = false;
    beginNpcAutonomyPhase(npc, 'working', 0);
    const resourceId = npc.workResourceIds[0];
    if (resourceId) {
      // The same allocator used in the live game accounts for the first work cycle.
      const moved =
        npc.job === 'miner'
          ? economy.mineLocal(npc, resourceId, 2)
          : economy.salvageLocal(npc, resourceId, 2);
      npc.activityId = npc.job === 'miner' ? 'mining' : 'salvage';
      npc.activity = moved > 0 ? 'Im Arbeitseinsatz · erste Förderung' : 'Im Arbeitseinsatz';
    }
    started += 1;
  }
  return started;
}

function shipmentCandidates(
  npc: SectorNpcState,
  markets: EconomyMarketService
): Shipment[] {
  const origin = markets.getMarket(npc.locationId);
  if (!origin) return [];
  const choices: Shipment[] = [];
  for (const destination of markets.snapshot()) {
    if (destination.locationId === npc.locationId) continue;
    for (const id of origin.produces) {
      const source = origin.entries[id];
      const target = destination.entries[id];
      if (!source || !target || source.stock < 5) continue;
      const salePrice = Math.round(target.price * 0.94);
      const margin = salePrice - source.price;
      if (margin <= 0) continue;
      const units = Math.min(
        32,
        Math.floor(source.stock),
        Math.floor(npc.cargoCapacity),
        Math.floor(npc.credits / Math.max(1, source.price))
      );
      if (units < 5) continue;
      choices.push({
        destinationId: destination.locationId,
        resourceId: id,
        units,
        margin,
        score: margin * units + (destination.needs.has(id) ? 250 : 0),
      });
    }
  }
  return choices.sort(
    (first, second) =>
      second.score - first.score ||
      first.destinationId.localeCompare(second.destinationId) ||
      first.resourceId.localeCompare(second.resourceId)
  );
}

function startLoadedFreighter(
  npc: SectorNpcState,
  index: number,
  sector: NpcSectorService,
  markets: EconomyMarketService
): boolean {
  for (const shipment of shipmentCandidates(npc, markets)) {
    const quote = sector.quoteTravel(npc, shipment.destinationId);
    if (!quote) continue;
    const source = markets.getEntry(npc.locationId, shipment.resourceId);
    if (!source || source.price <= 0) continue;
    const units = Math.min(
      shipment.units,
      Math.floor((npc.credits - quote.refuelCost - 500) / source.price)
    );
    if (units < 5 || shipment.margin * units <= quote.fuelExpense) continue;

    const sourceId = npc.locationId;
    const purchased = buyFromMarket(npc, markets, sourceId, shipment.resourceId, units, 0);
    if (purchased <= 0) continue;
    if (!sector.requestTravel(npc, shipment.destinationId, 'Handelsflug · Fracht an Bord')) {
      // Keep purchased cargo on board; the regular trader AI can sell it later.
      beginNpcAutonomyPhase(npc, 'thinking', 0);
      return false;
    }
    const travel = npc.travel;
    if (!travel) return false;
    const progress = 0.18 + (index % 5) * 0.105;
    travel.distanceTravelled = travel.routeDistance * progress;
    npc.fuel = Math.max(0, npc.fuel - travel.fuelRequired * progress);
    markNpcTravelStarted(npc);
    return true;
  }
  return false;
}

function seedPatrols(
  npcs: readonly SectorNpcState[],
  sector: NpcSectorService,
  activeCount: number
): number {
  let count = 0;
  for (const [index, npc] of npcs.entries()) {
    if (index < activeCount && sector.requestPatrol(npc)) {
      markNpcTravelStarted(npc);
      count += 1;
    } else {
      setWaiting(npc, index);
    }
  }
  return count;
}

/**
 * Deterministic in-progress sector. No fast-forward and no fake travel:
 * goods are purchased from markets; real routes, fuel and worker allocators
 * are used before the normal simulation resumes.
 */
export function initializeNpcOpeningScenario(
  npcs: readonly SectorNpcState[],
  sector: NpcSectorService,
  economy: NpcEconomyService,
  markets: EconomyMarketService
): NpcOpeningScenarioReport {
  const freighters = npcs.filter((npc) => npc.job === 'freighter');
  const miners = npcs.filter((npc) => npc.job === 'miner');
  const salvagers = npcs.filter((npc) => npc.job === 'salvager');
  const patrols = npcs.filter((npc) => npc.job === 'patrol');
  const pirates = npcs.filter((npc) => npc.pirate);

  let freightersInFlight = 0;
  for (const [index, npc] of freighters.entries()) {
    const shouldDepart = index < Math.floor(freighters.length * 0.75);
    if (shouldDepart && startLoadedFreighter(npc, index, sector, markets)) {
      freightersInFlight += 1;
    } else {
      setWaiting(npc, index);
    }
  }

  const minersWorking = seedWorkingCrew(miners, Math.ceil(miners.length / 2), economy);
  const salvagersWorking = seedWorkingCrew(salvagers, Math.ceil(salvagers.length / 2), economy);
  const patrolsInFlight = seedPatrols(patrols, sector, 2);
  const piratesInFlight = seedPatrols(pirates, sector, 2);

  return {
    freightersInFlight,
    minersWorking,
    salvagersWorking,
    patrolsInFlight,
    piratesInFlight,
  };
}
