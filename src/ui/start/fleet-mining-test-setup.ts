import type { SectorNpcState } from '../../core/npc-types';
import type { LocalSpaceInstance } from '../../core/local-space-types';
import { seededLocalGate } from '../../core/local-space-exit';
import { createSectorNpcEconomyStates } from '../../data/economy/sector-npc-economy';
import { economyResources } from '../../data/economy/economy-resources';
import { sectorPorts } from '../../data/ports/sector-ports';
import { createEconomyMarketService } from '../../systems/economy/market-service';
import { createNpcEconomyService } from '../../systems/economy/npc-economy-service';
import { createNpcLocalMiningService } from '../../systems/npcs/npc-local-mining-service';
import { createFleetCareerMiningBridge } from '../../systems/combat/fleet-career-mining-bridge';
import type { FleetCombatWorldOptions } from '../../systems/combat/fleet-combat-service';

interface MinerScenarioEntry {
  readonly id: string;
  readonly name: string;
  readonly spawnAtSeconds: number;
}

/** The PvP screen provisions a detached copy of real career NPCs and the real
 * local-field + NPC economy services. Only the test roster/timing is synthetic;
 * no mining, steering, cargo or collision behavior is reimplemented here.
 */
export function createFleetMiningTestSetup(
  entries: readonly MinerScenarioEntry[],
  field: LocalSpaceInstance
) {
  const templates = createSectorNpcEconomyStates().filter((npc) => npc.job === 'miner');
  if (!templates.length) throw new Error('Campaign miner templates missing');
  const miners: SectorNpcState[] = entries.map((entry, index) => {
    const template = templates[index % templates.length]!;
    return {
      ...template,
      id: entry.id,
      name: entry.name,
      locationId: field.sourceLocationId,
      workLocationId: field.sourceLocationId,
      cargo: {},
      autonomy: {
        phase: 'working',
        secondsRemaining: 0,
        lastLocationId: field.sourceLocationId,
        wasTravelling: false,
      },
    };
  });
  const market = createEconomyMarketService(sectorPorts, economyResources);
  // This is the ordinary campaign economy's mineLocal() transaction,
  // rather than a separate PvP cargo implementation.
  const economy = createNpcEconomyService(
    market,
    {
      createMinedResource: (_resourceId, amount) => amount,
      allocatePhysicalResource: (_resourceId, amount) => amount,
    },
    economyResources,
    miners,
    { isManaged: () => true }
  );
  const arrivals = new Map(entries.map((entry) => [entry.id, entry.spawnAtSeconds] as const));
  for (const npc of miners) {
    const arrival = arrivals.get(npc.id) ?? 0;
    if (npc.autonomy) npc.autonomy.phase = arrival > 0 ? 'ready' : 'working';
  }
  const mining = createNpcLocalMiningService({
    locationId: field.sourceLocationId,
    seed: field.seed,
    width: field.width,
    height: field.height,
    miners,
    getAsteroids: () => field.asteroids,
    mine: (npc, resourceId, amount) => economy.mineLocal(npc, resourceId, amount),
    depart: (npc) => economy.dispatchLoadedWorker(npc),
  });
  const initialGate = seededLocalGate(field.width, field.height, field.seed);
  const spawnPositions = new Map(entries.map((item) => [item.id, initialGate] as const));
  const bridge = createFleetCareerMiningBridge(mining, miners, {
    spawnAtSeconds: arrivals,
    spawnPositions,
  });
  let elapsed = 0;
  const world: FleetCombatWorldOptions = {
    tickWorld(dt) {
      elapsed += dt;
      for (const npc of miners) {
        const arrival = arrivals.get(npc.id) ?? 0;
        if (arrival > 0 && elapsed >= arrival && npc.autonomy?.phase === 'ready')
          npc.autonomy.phase = 'working';
      }
      bridge.world.tickWorld?.(dt);
    },
  };
  return { participants: bridge.participants, world, mining, miners };
}
