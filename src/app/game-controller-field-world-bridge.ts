import { localFieldDuels } from '../systems/combat/dynamic-fleet-combat';
import { syncMiningCombatField } from '../systems/combat/field-combat-arena';
import { narrowsSector } from '../data/maps/narrows-sector';
import { createNpcLocalMiningService } from '../systems/npcs/npc-local-mining-service';
import {
  AsteroidFieldWorld,
  type AsteroidFieldRuntime,
} from '../systems/operations/asteroid-field-world';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import {
  registerNpcAsteroidClaim,
  recordNpcAsteroidTheft,
} from './game-controller-field-miner-events';
import { tickFieldPirates, tickFieldSecurity } from './game-controller-security';
import type {
  CombatVisualAsteroid,
  StrategicCombatSnapshot,
} from '../systems/combat/strategic-combat-types';

import type { FieldWitness } from '../systems/combat/career-fleet-encounter';
import { salvageDroneCanSee } from './game-controller-salvage-drone';
import { careerSalvageDrone } from './game-controller-salvage-drone-world';

export function fieldWitnessFor(
  context: ControllerRuntimeContext | null,
  ...[locationId, npc, target]: Parameters<FieldWitness>
): ReturnType<FieldWitness> {
  if (!context || npc.locationId !== locationId || npc.travel) return null;
  const salvage = context.state.salvageScene?.getField();
  const field = fieldWorldFor(context).field(locationId);
  if (npc.id.startsWith('security-drone:')) {
    if (npc.id !== 'security-drone:' + locationId) return null;
    if (salvage?.sourceLocationId === locationId) {
      const drone = careerSalvageDrone(context, salvage);
      return salvageDroneCanSee(drone, salvage, target) ? drone : null;
    }
    return field?.drone.detect(target, field.instance.asteroids) ? field.drone : null;
  }
  return context.economy.localPirates.get(locationId)?.snapshot([npc])[0] ?? null;
}

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

/** NPC versus NPC duels have one PvP movement authority; mirror those poses
 * into the local world so civilians never freeze at the combat start point.
 */
function syncNpcDuelFieldPoses(
  context: ControllerRuntimeContext,
  field: AsteroidFieldRuntime,
  duels: readonly StrategicCombatSnapshot[]
): void {
  for (const duel of duels) {
    for (const combatant of [duel.attacker, duel.defender]) {
      const npc = context.economy.sectorNpcs.npcs.find((entry) => entry.id === combatant.id);
      if (npc?.locationId !== field.locationId) continue;
      field.miners.syncCombatPose(
        combatant.id,
        combatant.position,
        combatant.headingRadians,
        combatant.speed
      );
      field.pirates.syncCombatPose(combatant.id, combatant.position, combatant.headingRadians);
      if (combatant.id === 'security-drone:' + field.locationId) {
        field.drone.restore(combatant.position, combatant.hullHp > 0);
        field.drone.headingRadians = combatant.headingRadians;
      }
    }
  }
}

function syncCombatWreckPoses(
  field: AsteroidFieldRuntime,
  bodies: ReadonlyMap<string, CombatVisualAsteroid>
): void {
  for (const wreck of field.combatWrecks) {
    const body = bodies.get(wreck.id);
    if (!body) continue;
    wreck.position = { ...body.position };
    wreck.driftVelocity = { ...body.velocity };
    wreck.rotation = body.rotation;
    if (wreck.rotation3d) wreck.rotation3d = { ...wreck.rotation3d, z: body.rotation };
  }
}

function setFieldBystanders(
  context: ControllerRuntimeContext,
  field: AsteroidFieldRuntime,
  activeCombat: StrategicCombatSnapshot
): void {
  const fighters = new Set([activeCombat.attacker.id, activeCombat.defender.id]);
  const bystanders = [
    ...field.miners.ships.map((ship) => ({
      id: ship.npcId,
      shipId: ship.shipId,
      position: { ...ship.position },
      headingRadians: ship.headingRadians,
    })),
    ...field.pirates.snapshot(context.economy.sectorNpcs.npcs).map((ship) => ({
      id: ship.npcId,
      shipId: ship.shipId,
      position: ship.position,
      headingRadians: ship.headingRadians,
    })),
    ...context.economy.sectorNpcs.npcs
      .filter((npc) => npc.id === 'security-drone:' + field.locationId)
      .filter((npc) => npc.hullHp > 0 && field.drone.snapshot().operational)
      .map((npc) => ({
        id: npc.id,
        shipId: npc.shipId,
        position: field.drone.snapshot().position,
        headingRadians: field.drone.headingRadians,
      })),
  ].filter((ship) => !fighters.has(ship.id));
  const fleet = context.engagements.activePlayerFleet?.();
  if (fleet) fleet.setBystanders(bystanders);
  else context.engagements.activePlayerCombat()?.setBystanders(bystanders);
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
  const background = context.engagements.activeNpcCombatSnapshots?.() ?? [];
  const fleet = combat ? context.engagements.activePlayerFleet?.()?.getSnapshot() : null;
  const localDuels = localFieldDuels(background, fleet);
  const fieldWorld = fieldWorldFor(context);
  fieldWorld.tick(deltaSeconds, localId, (field, seconds) => {
    const activeCombat = field.locationId === localId ? combat : null;
    if (activeCombat) {
      // NPC miners and passing pirates are solid ship bodies inside embedded
      // combat, but they are not combat targets or alternate PvP combatants.
      setFieldBystanders(context, field, activeCombat);
      // The duel advances physical asteroids; copy their authoritative poses
      // instead of integrating the same bodies a second time.
      const combatAsteroids = activeCombat.arena.asteroids ?? [];
      const bodies = new Map(combatAsteroids.map((body) => [body.id, body]));
      syncMiningCombatField(field.instance.asteroids, bodies);
      syncCombatWreckPoses(field, bodies);
      context.state.localSpace?.syncCombatPose(
        activeCombat.attacker.position,
        activeCombat.attacker.headingRadians,
        activeCombat.attacker.speed
      );
    }
    const duels = activeCombat ? localDuels : background;
    syncNpcDuelFieldPoses(context, field, duels);
    field.miners.tick(seconds, activeCombat?.defender.id);
    if (activeCombat?.defender.id.startsWith('security-drone:')) {
      field.drone.restore(activeCombat.defender.position, activeCombat.defender.hullHp > 0);
    }
    const defenderId = activeCombat?.defender.id;
    const isPirateDefender = field.pirates
      .snapshot(context.economy.sectorNpcs.npcs)
      .some((pirate) => pirate.npcId === defenderId);
    if (activeCombat && isPirateDefender) {
      field.pirates.syncCombatPose(
        activeCombat.defender.id,
        activeCombat.defender.position,
        activeCombat.defender.headingRadians
      );
    }
    tickFieldPirates(context, seconds, field, activeCombat?.defender.id);
    // The combat engine owns drone motion while it is fighting.
    // A second patrol tick would jump its sprite away from the hitbox.
    const droneId = 'security-drone:' + field.locationId;
    const droneFightingNpc = duels.some(
      (duel) => duel.attacker.id === droneId || duel.defender.id === droneId
    );
    if (activeCombat?.defender.id !== droneId && !droneFightingNpc) {
      tickFieldSecurity(context, seconds, field);
    }
  });
  const salvageLocation =
    context.state.mode === 'salvage-space'
      ? context.state.salvageScene?.getField().sourceLocationId
      : null;
  fieldWorld.advanceCombatWreckMotion(
    deltaSeconds,
    context.state.embeddedCombat === 'local-space' ? localId : salvageLocation
  );
}
