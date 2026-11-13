import { miningResourceById } from '../data/resources/mining-resources';
import { AsteroidSecurityDrone } from '../systems/operations/asteroid-security-drone';
import { LocalPirateTraffic } from '../systems/npcs/npc-local-pirate-service';
import type { WorldLocation } from '../core/world-types';
import { createNpcLocalMiningService } from '../systems/npcs/npc-local-mining-service';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { controllerShipRuntimeOptions } from './game-controller-models';
import { createMiningLocalSpace } from './game-controller-mining';
import { resolveShipRuntimeSetup } from '../systems/ships';

/** Keep original mutable field/traffic objects when returning from boarding. */
export function ensureMiningCombatWorld(
  context: ControllerRuntimeContext,
  location: WorldLocation,
  preserveField: boolean
): void {
  const { state, economy } = context;
  if (preserveField && state.localSpace && state.localNpcMining) return;
  state.localSpace = createMiningLocalSpace(
    state.activeShip,
    state.localSpaceSeed,
    economy.mining,
    location,
    controllerShipRuntimeOptions(context, state.activeShip),
    context.shipOperations.snapshot(
      state.activeShip,
      resolveShipRuntimeSetup(
        state.activeShip,
        controllerShipRuntimeOptions(context, state.activeShip)
      ).hullMaxHp
    ).hullHp,
    (message) => context.systemLog.write(message),
    economy.asteroidClaims,
    (ownerId) => {
      const owner = state.localNpcMining?.ships.find((ship) => ship.npcId === ownerId);
      const player = state.localSpace?.getSnapshot().instance.ship;
      return Boolean(
        owner &&
        player &&
        Math.hypot(owner.position.x - player.position.x, owner.position.y - player.position.y) < 650
      );
    }
  );
  if (!economy.securityDrones.has(location.id)) {
    const field = state.localSpace.getSnapshot().instance;
    economy.securityDrones.set(
      location.id,
      new AsteroidSecurityDrone(field.width, field.height, field.asteroids)
    );
  }
  if (!economy.localPirates.has(location.id)) {
    const field = state.localSpace.getSnapshot().instance;
    economy.localPirates.set(
      location.id,
      new LocalPirateTraffic(field.width, field.height, field.seed)
    );
  }
  state.localNpcMining = createNpcLocalMiningService({
    locationId: location.id,
    seed: state.localSpaceSeed,
    width: state.localSpace.getSnapshot().instance.width,
    height: state.localSpace.getSnapshot().instance.height,
    miners: economy.sectorNpcs.npcs.filter(
      (npc) => npc.job === 'miner' && npc.workLocationId === location.id
    ),
    getAsteroids: () => state.localSpace?.getSnapshot().instance.asteroids ?? [],
    mine: (npc, resourceId, requested) => economy.npcs.mineLocal(npc, resourceId, requested),
    onAsteroidScanned: (npc, asteroid) => {
      if (economy.asteroidClaims.claim(location.id, asteroid)) return;
      const oreValue = asteroid.deposits.reduce(
        (sum, deposit) =>
          sum + deposit.oreRemaining * (miningResourceById(deposit.resourceId)?.baseValue ?? 0),
        0
      );
      if (oreValue < 15000 || npc.credits < 2500) return;
      const result = economy.asteroidClaims.register(
        location.id,
        { ...asteroid, scanLevel: 'analyzed' },
        npc.id,
        economy.situations.currentDay,
        npc.credits
      );
      if (result.ok) npc.credits -= result.fee;
    },
    onAsteroidMined: (npc, asteroid, resourceId, amount) => {
      const claim = economy.asteroidClaims.claim(location.id, asteroid);
      if (!claim || claim.ownerId === npc.id) return;
      const player = state.localSpace?.getSnapshot().instance.ship;
      const observer = state.localNpcMining?.ships.find((ship) => ship.npcId === npc.id);
      const detected =
        claim.ownerId === 'player' &&
        Boolean(
          player &&
          observer &&
          Math.hypot(
            player.position.x - observer.position.x,
            player.position.y - observer.position.y
          ) < 650
        );
      const wasDetected = economy.asteroidClaims
        .snapshot()
        .conflicts.some(
          (c) =>
            c.locationId === location.id &&
            c.asteroidId === asteroid.id &&
            c.intruderId === npc.id &&
            c.status === 'detected'
        );
      if (!detected) return;
      const conflict = economy.asteroidClaims.recordTheft(
        location.id,
        asteroid.id,
        npc.id,
        amount,
        true,
        miningResourceById(resourceId)?.baseValue ?? 1
      );
      if (conflict && !wasDetected)
        context.systemLog.write(
          'MINING > FREMDER MINER BAUT DEINE KONZESSION UNBEFUGT AB: ' + npc.name
        );
    },
    depart: (npc) => economy.npcs.dispatchLoadedWorker(npc),
    playerShip: state.activeShip,
    getPlayerShipState: () => state.localSpace!.getSnapshot().instance.ship,
  });
}
