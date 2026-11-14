import { narrowsSector } from '../data/maps/narrows-sector';
import { createNpcLocalMiningService } from '../systems/npcs/npc-local-mining-service';
import { AsteroidFieldWorld } from '../systems/operations/asteroid-field-world';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import {
  registerNpcAsteroidClaim,
  recordNpcAsteroidTheft,
} from './game-controller-field-miner-events';
import { tickFieldPirates, tickFieldSecurity } from './game-controller-security';

const fieldWorlds = new WeakMap<ControllerRuntimeContext, AsteroidFieldWorld>();

/** Create once per campaign; world state lives independently of mounted scenes. */
export function fieldWorldFor(context: ControllerRuntimeContext): AsteroidFieldWorld {
  const previous = fieldWorlds.get(context);
  if (previous) return previous;
  const { economy, state } = context;
  const fields = new AsteroidFieldWorld(
    narrowsSector.locations,
    economy.asteroidClaims,
    (location, instance) =>
      createNpcLocalMiningService({
        locationId: location.id,
        seed: instance.seed,
        width: instance.width,
        height: instance.height,
        miners: economy.sectorNpcs.npcs.filter(
          (npc) => npc.job === 'miner' && npc.workLocationId === location.id
        ),
        getAsteroids: () => instance.asteroids,
        mine: (npc, resourceId, requested) => economy.npcs.mineLocal(npc, resourceId, requested),
        onAsteroidScanned: (npc, asteroid) =>
          registerNpcAsteroidClaim(context, location, npc, asteroid),
        onAsteroidMined: (npc, asteroid, resourceId, amount) =>
          recordNpcAsteroidTheft(context, location, npc, asteroid, resourceId, amount),
        depart: (npc) => economy.npcs.dispatchLoadedWorker(npc),
        getPlayerShip: () => state.activeShip,
        getPlayerShipState: () => {
          const scene = state.localSpace?.getSnapshot().instance;
          return scene?.sourceLocationId === location.id ? scene.ship : undefined;
        },
      })
  );
  fieldWorlds.set(context, fields);
  for (const location of narrowsSector.locations) {
    const field = fields.field(location.id);
    if (!field) continue;
    economy.securityDrones.set(location.id, field.drone);
    economy.localPirates.set(location.id, field.pirates);
  }
  return fields;
}

/** All field operations advance on the campaign clock, not only during local rendering. */
export function advanceControllerFieldWorld(
  context: ControllerRuntimeContext,
  deltaSeconds: number
): void {
  const scene = context.state.localSpace?.getSnapshot();
  const localId =
    context.state.mode === 'local-space' ? (scene?.instance.sourceLocationId ?? null) : null;
  const frozen = context.state.embeddedCombat === 'local-space' ? localId : null;
  fieldWorldFor(context).tick(deltaSeconds, frozen ? null : localId, (field, seconds) => {
    if (field.locationId === frozen) return;
    field.miners.tick(seconds);
    tickFieldPirates(context, seconds, field);
    tickFieldSecurity(context, seconds, field);
  });
}
