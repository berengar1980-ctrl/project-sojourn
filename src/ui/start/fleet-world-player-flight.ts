import type { WorldPoint } from '../../core/world-types';
import type { DuelField } from '../../systems/combat/duel-arena-presets';
import { createLocalSpaceService } from '../../systems/local-space/local-space-service';
import { planPointRoute } from '../../systems/local-space/local-space-navigation';
import { createSalvageLocalSpaceService } from '../../systems/salvage/salvage-local-space-service';
import {
  getShipDefinition,
  resolveShipLocalCruiseSpeed,
  resolveShipRuntimeSetup,
} from '../../systems/ships';
import { duelInstalledComponents, type DuelDraft } from './duel-combatant-setup';

/** The laboratory supplies its loadout and field to the usual career scene services. */
export function createFleetWorldPlayerFlight(field: DuelField, draft: DuelDraft, seed: number) {
  const ship = getShipDefinition(draft.shipId);
  if (!ship) throw new Error('Unknown scenario player ship: ' + draft.shipId);
  const installed = duelInstalledComponents(draft);
  const runtime = resolveShipRuntimeSetup(ship, { installed });
  const approachSpeed = resolveShipLocalCruiseSpeed(
    ship,
    installed,
    runtime.stationSkills.piloting
  );
  const { width, height } = field.arena;
  const position = field.arena.attackerPosition ?? { x: width / 2, y: height / 2 };
  const heading = field.arena.attackerHeadingRadians ?? 0;
  if (field.salvage) {
    const service = createSalvageLocalSpaceService({
      field: field.salvage,
      setup: runtime.salvage,
      crewSkill: runtime.stationSkills.salvage,
      collect: () => 0,
      approachSpeed,
      hardpoints: ship.sprite.hardpoints,
      shipLengthMeters: ship.nominalLengthMeters,
    });
    const state = service.syncCombatPose(position, heading, 0).ship;
    return {
      state,
      navigate: (point: WorldPoint) => service.startNavigation(point),
      navigation: () => service.getSnapshot(),
      restore: (point: WorldPoint, angle: number, speed: number) =>
        service.syncCombatPose(point, angle, speed),
      tick: (dt: number, combatOwnsBodies: boolean) => service.tick(dt, combatOwnsBodies),
      velocity: () => ({
        x: Math.cos(state.headingRadians) * state.speed,
        y: Math.sin(state.headingRadians) * state.speed,
      }),
    };
  }
  const instance = field.mining ?? {
    id: 'empty',
    sourceLocationId: 'duel',
    seed,
    width,
    height,
    asteroids: [],
    chunks: [],
    ship: {
      position,
      headingRadians: heading,
      speed: 0,
      turnRateRadiansPerSecond: 0,
      angularThrust: 0,
      lateralThrust: 0,
    },
  };
  const service = createLocalSpaceService({
    instance,
    approachSpeed,
    hardpoints: ship.sprite.hardpoints,
    nominalLengthMeters: ship.nominalLengthMeters,
  });
  service.syncCombatPose(position, heading, 0);
  return {
    state: instance.ship,
    navigate(point: WorldPoint) {
      const plan = planPointRoute(service.getPointRouteOptions(point));
      service.startNavigation(point, plan.route);
    },
    navigation: () => service.getSnapshot(),
    restore: (point: WorldPoint, angle: number, speed: number) =>
      service.syncCombatPose(point, angle, speed),
    tick: (dt: number, combatOwnsBodies: boolean) => service.tick(dt, combatOwnsBodies),
    velocity: () => service.getShipWorldVelocity(),
  };
}
