import type { ShipDefinition } from '../core/ship-types';
import type { WorldLocation } from '../core/world-types';
import type { MiningEconomyService } from '../systems/economy/mining-economy-service';
import {
  createLocalSpaceService,
  generateMiningSpace,
  type LocalSpaceService,
} from '../systems/local-space';
import { resolveShipRuntimeSetup } from '../systems/ships';

export function createMiningLocalSpace(
  ship: ShipDefinition,
  seed: number,
  mining: MiningEconomyService,
  location: WorldLocation
): LocalSpaceService {
  const runtime = resolveShipRuntimeSetup(ship);
  return createLocalSpaceService({
    instance: generateMiningSpace(location.id, seed, location.minedResourceIds),
    approachSpeed: 85,
    hardpoints: ship.sprite.hardpoints,
    nominalLengthMeters: ship.nominalLengthMeters,
    mining: {
      enabled: runtime.mining.available,
      cycleSeconds: runtime.mining.cycleSeconds,
    },
    defense: {
      hullMaxHp: runtime.hullMaxHp,
      shieldMaxHp: runtime.shieldMaxHp,
      shieldDamageModifier: runtime.shieldDamageModifier,
      shieldPowered: runtime.shieldPowered,
    },
    sensors: {
      modifier: runtime.sensorModifier,
      crewSkill: runtime.sensorCrewSkill,
    },
    onMiningChunkCollected: (resourceId, amount) =>
      mining.collect(resourceId, amount, runtime.cargo.totalCapacityTons, location.id),
  });
}
