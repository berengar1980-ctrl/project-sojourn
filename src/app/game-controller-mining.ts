import type { ShipDefinition } from '../core/ship-types';
import type { WorldLocation } from '../core/world-types';
import type { AsteroidClaimRegistry } from '../systems/operations/asteroid-claim-registry';
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
  currentHullHp?: number,
  onNavigationNotice?: (message: string) => void,
  claims?: AsteroidClaimRegistry
): LocalSpaceService {
  const runtime = resolveShipRuntimeSetup(ship, runtimeOptions);

  const instance = generateMiningSpace(location.id, seed, location.minedResourceIds);
  claims?.restoreField(location.id, instance.asteroids);
  return createLocalSpaceService({
    instance,
    approachSpeed: resolveShipLocalCruiseSpeed(
      ship,
      runtime.installed,
      runtime.stationSkills.piloting
    ),
    turnRateMultiplier:
      engineSpeedMultiplier(runtime.installed) * runtime.crewEffects.piloting.turnRateMultiplier,
    hardpoints: ship.sprite.hardpoints,
    nominalLengthMeters: ship.nominalLengthMeters,
    hazardCrew: {
      piloting: runtime.stationSkills.piloting,
      sensors: runtime.stationSkills.sensors,
    },
    ...(onNavigationNotice ? { onNavigationNotice } : {}),
    mining: {
      enabled: runtime.mining.available,
      cycleSeconds: runtime.mining.cycleSeconds * runtime.crewEffects.mining.workTimeMultiplier,
      yieldMultiplier: runtime.mining.yieldMultiplier * runtime.crewEffects.mining.yieldMultiplier,
    },
    systems: {
      shieldMaxHp: runtime.shieldMaxHp,
      shieldModifier: runtime.shieldModifier,
      hullMaxHp: runtime.hullMaxHp,
      ...(currentHullHp === undefined ? {} : { hullCurrentHp: currentHullHp }),
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
