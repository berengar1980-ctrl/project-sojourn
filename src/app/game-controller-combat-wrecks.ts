import { wreckCombatBody } from '../systems/combat/field-combat-arena';
import type { SalvageField, SalvageWreck } from '../core/salvage-types';
import type {
  CombatVisualAsteroid,
  StrategicCombatSnapshot,
} from '../systems/combat/strategic-combat-types';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { fieldWorldFor } from './game-controller-field-world-bridge';
import { addDestroyedShipWreck } from '../systems/salvage/combat-destruction-wreck';

const recordedByArena = new WeakMap<
  NonNullable<StrategicCombatSnapshot['arena']['asteroids']>,
  Set<string>
>();

function recordedFleetWrecks(bodies: StrategicCombatSnapshot['arena']['asteroids']): Set<string> {
  const recorded = (bodies && recordedByArena.get(bodies)) ?? new Set<string>();
  if (bodies) recordedByArena.set(bodies, recorded);
  return recorded;
}

function adoptNativeWreckPose(wreck: SalvageWreck, native: CombatVisualAsteroid): void {
  Object.assign(wreck, {
    radius: native.radius,
    effectSeed: native.effectSeed ?? 0,
    position: { ...native.position },
    rotation: native.rotation,
    driftVelocity: { ...native.velocity },
    ...(native.combatWreckVariant && { combatWreckVariant: native.combatWreckVariant }),
    ...(native.rotation3d && { rotation3d: { ...native.rotation3d } }),
    ...(native.spin3d && { spin3d: { ...native.spin3d, z: native.angularVelocity } }),
  });
}

export function controllerCombatWreckHooks(getContext: () => ControllerRuntimeContext | null) {
  return {
    onNpcCombatEnded(snapshot: StrategicCombatSnapshot, attacker: { locationId: string }) {
      const context = getContext();
      if (context) recordCareerCombatWrecks(context, snapshot, attacker.locationId);
    },
    onFieldFleetLosses(
      snapshot: StrategicCombatSnapshot,
      losses: readonly StrategicCombatSnapshot['attacker'][],
      locationId: string
    ) {
      const context = getContext();
      if (context) recordCareerCombatWrecks(context, snapshot, locationId, losses);
    },
  };
}

function fundCombatWreck(context: ControllerRuntimeContext, wreck: SalvageWreck): void {
  const simulation = context.economy.simulation;
  for (const deposit of wreck.resources) {
    // Reserve enough for several comparable wrecks, but never create material.
    simulation.refillCombatBuffer(deposit.resourceId, deposit.initialAmount * 5);
    const funded = simulation.fundPhysicalStock(
      deposit.resourceId,
      wreck.id,
      deposit.initialAmount,
      true
    );
    deposit.initialAmount = funded;
    deposit.remainingAmount = funded;
  }
}

/** Store defeated ships in the authoritative career field, not in a disposable combat scene. */
export function recordCareerCombatWrecks(
  context: ControllerRuntimeContext,
  snapshot: StrategicCombatSnapshot,
  locationId: string | null,
  losses = [snapshot.attacker, snapshot.defender] as readonly StrategicCombatSnapshot['attacker'][]
): readonly SalvageWreck[] {
  if (!locationId) return [];
  const world = fieldWorldFor(context);
  const wrecks = world.combatWrecks(locationId);
  const field: SalvageField = {
    id: 'combat-field-' + locationId,
    sourceLocationId: locationId,
    seed: snapshot.arena.backdropSeed ?? 0,
    width: snapshot.arena.width,
    height: snapshot.arena.height,
    wrecks: [...wrecks],
  };
  const encounterId = [
    locationId,
    snapshot.attacker.id,
    snapshot.defender.id,
    Math.round(snapshot.elapsedSeconds * 1000),
    wrecks.length,
  ].join('-');
  const bodies = snapshot.arena.asteroids;
  const recorded = recordedFleetWrecks(bodies);
  const created: SalvageWreck[] = [];
  for (const ship of losses) {
    if (ship.hullHp > 0) continue;
    const nativeWreck = bodies?.find((body) => body.id === 'fleet-wreck:' + ship.id);
    if (recorded.has(ship.id)) continue;
    const wreck = addDestroyedShipWreck(field, ship, encounterId, snapshot.elapsedSeconds);
    if (wreck) {
      if (nativeWreck) adoptNativeWreckPose(wreck, nativeWreck);
      recorded.add(ship.id);
      fundCombatWreck(context, wreck);
      created.push(wreck);
      if (snapshot.arena.backdropSeed !== undefined) {
        context.engagements?.registerFieldCombatWreck?.(
          locationId,
          snapshot.arena.backdropSeed,
          ship.id,
          wreckCombatBody(wreck)
        );
      }
    }
  }
  world.registerCombatWrecks(locationId, created);
  const liveField = context.state.salvageScene?.getField();
  if (liveField?.sourceLocationId === locationId) {
    const ids = new Set(liveField.wrecks.map((wreck) => wreck.id));
    for (const wreck of created) {
      if (ids.has(wreck.id)) continue;
      liveField.wrecks.push(wreck);
      ids.add(wreck.id);
    }
  }
  for (const wreck of created) {
    context.systemLog.write('BERGUNG > NEUES KAMPFWRACK: ' + wreck.name.toUpperCase());
  }
  return created;
}
