import type { ShipDefinition } from '../core/ship-types';
import type { WorldLocation } from '../core/world-types';
import type { MiningEconomyService } from '../systems/economy/mining-economy-service';
import {
  createLocalSpaceService,
  generateMiningSpace,
  type LocalSpaceService,
} from '../systems/local-space';
import { stationReduction } from '../systems/ships';
import { resolveShipRuntimeSetup, type ShipRuntimeOptions } from '../systems/ships';

export function createMiningLocalSpace(
  ship: ShipDefinition,
  seed: number,
  mining: MiningEconomyService,
  location: WorldLocation,
  runtimeOptions: ShipRuntimeOptions = {}
): LocalSpaceService {
  const runtime = resolveShipRuntimeSetup(ship, runtimeOptions);

  return createLocalSpaceService({
    instance: generateMiningSpace(location.id, seed, location.minedResourceIds),
    approachSpeed: 85,
    hardpoints: ship.sprite.hardpoints,
    nominalLengthMeters: ship.nominalLengthMeters,
    mining: {
      enabled: runtime.mining.available,
      cycleSeconds:
        runtime.mining.cycleSeconds * stationReduction(runtime.miningCrewSkill, 0.25),
    },
    systems: {
      shieldMaxHp: runtime.shieldMaxHp,
      shieldModifier: runtime.shieldModifier,
      hullMaxHp: runtime.hullMaxHp,
      scanAvailable: runtime.scanAvailable,
      sensorModifier: runtime.sensorModifier,
      sensorCrewSkill: runtime.sensorCrewSkill,
      reactorOutput: runtime.energy.output,
      reactorContinuousUsed: runtime.energy.baseUsed,
    },
    onMiningChunkCollected: (resourceId, amount) =>
      mining.collect(resourceId, amount, runtime.cargoCapacityTons, location.id),
  });
}
