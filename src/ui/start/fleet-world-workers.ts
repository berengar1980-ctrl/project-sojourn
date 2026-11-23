import { economyResources } from '../../data/economy/economy-resources';
import { sectorPorts } from '../../data/ports/sector-ports';
import { createEconomyMarketService } from '../../systems/economy/market-service';
import { createPlayerTradeService } from '../../systems/economy/player-trade-service';
import { createEconomySimulationService } from '../../systems/economy/economy-simulation-service';
import { createNpcEconomyService } from '../../systems/economy/npc-economy-service';
import type { SectorNpcState } from '../../core/npc-types';
import type { LocalAsteroid } from '../../core/local-space-types';
import type { SalvageField } from '../../core/salvage-types';
import type { FieldRouteObstacle } from '../../systems/navigation/field-ship-routing';
import { createNpcLocalMiningService } from '../../systems/npcs/npc-local-mining-service';
import { createNpcLocalSalvageService } from '../../systems/npcs/npc-local-salvage-service';

/** Existing campaign workers, wired to the very same FleetCombat world and traffic. */
export function createFleetWorldWorkers(
  states: readonly { readonly npc: SectorNpcState }[],
  rocks: LocalAsteroid[],
  salvageField: SalvageField | null,
  seed: number,
  width: number,
  height: number,
  trafficFor: (id: string) => readonly FieldRouteObstacle[],
  onDeparture: (id: string) => void
) {
  const npcs = states.map((entry) => entry.npc);
  const markets = createEconomyMarketService(sectorPorts, economyResources);
  const trade = createPlayerTradeService(markets);
  const simulation = createEconomySimulationService(
    markets,
    trade.player,
    economyResources,
    seed,
    npcs
  );
  const economy = createNpcEconomyService(markets, simulation, economyResources, npcs);
  const depart = (npc: SectorNpcState) => {
    const dispatched = economy.dispatchLoadedWorker(npc);
    if (dispatched) onDeparture(npc.id);
    return dispatched;
  };
  const miners = createNpcLocalMiningService({
    locationId: 'duel',
    seed,
    width,
    height,
    resolveLocalCollisions: false,
    getTrafficObstacles: (id) => trafficFor(id),
    miners: states.filter((entry) => entry.npc.job === 'miner').map((entry) => entry.npc),
    getAsteroids: () => rocks,
    mine: economy.mineLocal,
    depart,
  });
  const salvagers = salvageField
    ? createNpcLocalSalvageService({
        locationId: 'duel',
        field: salvageField,
        resolveLocalCollisions: false,
        getTrafficObstacles: (id) => trafficFor(id),
        salvagers: states.filter((entry) => entry.npc.job === 'salvager').map((entry) => entry.npc),
        recover: economy.salvageLocal,
        depart,
      })
    : null;
  return { miners, salvagers };
}
