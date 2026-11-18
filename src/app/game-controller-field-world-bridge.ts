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

/** Install the already staged field authority instead of generating new ore/NPCs. */
export function bindCareerFieldWorld(
  context: ControllerRuntimeContext,
  fields: AsteroidFieldWorld
): void {
  if (fieldWorlds.has(context)) throw new Error('Field world already installed');
  fieldWorlds.set(context, fields);
  for (const location of narrowsSector.locations) {
    const field = fields.field(location.id);
    if (!field) continue;
    context.economy.securityDrones.set(location.id, field.drone);
    context.economy.localPirates.set(location.id, field.pirates);
  }
}

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
          // The duel owns the player pose and collisions during embedded combat.
          if (state.embeddedCombat === 'local-space') return undefined;
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
  const combat =
    context.state.embeddedCombat === 'local-space'
      ? (context.engagements.activePlayerCombat()?.getSnapshot() ?? null)
      : null;
  fieldWorldFor(context).tick(deltaSeconds, localId, (field, seconds) => {
    const activeCombat = field.locationId === localId ? combat : null;
    if (activeCombat) {
      // The duel advances physical asteroids; copy their authoritative poses
      // instead of integrating the same bodies a second time.
      const bodies = new Map(
        (activeCombat.arena.asteroids ?? []).map((body) => [body.id, body])
      );
      for (let index = field.instance.asteroids.length - 1; index >= 0; index -= 1) {
        const asteroid = field.instance.asteroids[index]!;
        const body = bodies.get(asteroid.id);
        if (!body) {
          // Thrown or destroyed bodies must not remain as ghost obstacles.
          field.instance.asteroids.splice(index, 1);
          continue;
        }
        asteroid.position = { ...body.position };
        asteroid.rotation = body.rotation;
        asteroid.physics.velocity = { ...body.velocity };
        asteroid.physics.angularVelocity =
          body.angularVelocity ?? asteroid.physics.angularVelocity;
      }
      context.state.localSpace?.syncCombatPose(
        activeCombat.attacker.position,
        activeCombat.attacker.headingRadians,
        activeCombat.attacker.speed
      );
    }
    field.miners.tick(seconds, activeCombat?.defender.id);
    if (activeCombat?.defender.id.startsWith('security-drone:')) {
      field.drone.restore(activeCombat.defender.position, activeCombat.defender.hullHp > 0);
    }
    if (
      activeCombat &&
      field.pirates
        .snapshot(context.economy.sectorNpcs.npcs)
        .some((pirate) => pirate.npcId === activeCombat.defender.id)
    ) {
      field.pirates.syncCombatPose(
        activeCombat.defender.id,
        activeCombat.defender.position,
        activeCombat.defender.headingRadians
      );
    }
    tickFieldPirates(context, seconds, field, activeCombat?.defender.id);
    if (!activeCombat?.defender.id.startsWith('security-drone:')) {
      tickFieldSecurity(context, seconds, field);
    }
  });
}
