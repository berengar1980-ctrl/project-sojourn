import type { ShipDefinition } from '../core/ship-types';
import type { WorldLocation } from '../core/world-types';
import type { MiningEconomyService } from '../systems/economy/mining-economy-service';
import {
  createLocalSpaceService,
  generateMiningSpace,
  type LocalSpaceService,
} from '../systems/local-space';
import {
  resolveShipLocalCruiseSpeed,
  engineSpeedMultiplier,
  resolveShipRuntimeSetup,
  type ShipRuntimeOptions,
} from '../systems/ships';

export function createMiningLocalSpace(
  ship: ShipDefinition,
  seed: number,
  mining: MiningEconomyService,
  location: WorldLocation,
  runtimeOptions: ShipRuntimeOptions = {},
  currentHullHp?: number
): LocalSpaceService {
  const runtime = resolveShipRuntimeSetup(ship, runtimeOptions);

  return createLocalSpaceService({
    instance: generateMiningSpace(location.id, seed, location.minedResourceIds),
    approachSpeed: resolveShipLocalCruiseSpeed(
      ship,
      runtime.installed,
      runtime.stationSkills.piloting
    ),
    turnRateMultiplier:
      engineSpeedMultiplier(runtime.installed) * runtime.crewEffects.piloting.turnRateMultiplier,
    hardpoints: ship.sprite.hardpoints,
    nominalLengthMeters: ship.nominalLengthMeters,
    mining: {
      enabled: runtime.mining.available,
      cycleSeconds: runtime.mining.cycleSeconds * runtime.crewEffects.mining.workTimeMultiplier,
      yieldMultiplier: runtime.mining.yieldMultiplier * runtime.crewEffects.mining.yieldMultiplier,
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
      shieldRegenMultiplier: runtime.crewEffects.engineering.shieldRegenMultiplier,
    },
    onMiningChunkCollected: (resourceId, amount) =>
      mining.collect(resourceId, amount, runtime.cargoCapacityTons, location.id),
  });
}
