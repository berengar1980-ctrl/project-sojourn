import type { WorldMap } from '../core/world-types';
import type { ControllerEconomy } from './game-controller-economy';
import type { NpcShipMapView, StarMapWorldEvent } from '../features/star-map/star-map-view-model';

function locationName(world: WorldMap, id: string): string {
  return world.locations.find((entry) => entry.id === id)?.name ?? id;
}

function tradeReports(economy: ControllerEconomy): StarMapWorldEvent[] {
  return economy.situations.active().map((situation) => ({
    id: 'trade:' + situation.id,
    kind: 'trade' as const,
    title: situation.name,
    detail: situation.description,
    locationId: situation.locationId ?? null,
    dangerLevel: 0,
  }));
}

function blockadeReports(
  economy: ControllerEconomy,
  world: WorldMap,
  visible: ReadonlySet<string>
): StarMapWorldEvent[] {
  return economy.blockades
    .snapshot()
    .orders.filter((order) => ['assembling', 'active'].includes(order.phase))
    .filter((order) => order.ownerId === 'player' || order.pirateIds.some((id) => visible.has(id)))
    .map((order) => ({
      id: 'blockade:' + order.id,
      kind: 'blockade' as const,
      title: 'Blockade · ' + locationName(world, order.locationId),
      detail: order.phase === 'active' ? 'Handelsblockade aktiv' : 'Korsaren im Anflug',
      locationId: order.locationId,
      dangerLevel: 2,
    }));
}

function patrolReports(
  economy: ControllerEconomy,
  world: WorldMap,
  visibleNpcs: readonly NpcShipMapView[]
): StarMapWorldEvent[] {
  return economy.patrol
    .snapshot()
    .assignments.filter((assignment) => ['active', 'completed'].includes(assignment.status))
    .map((assignment) => {
      const location = world.locations.find((entry) => entry.id === assignment.targetId);
      const name =
        location?.name ??
        visibleNpcs.find((npc) => npc.id === assignment.targetId)?.name ??
        'Korsarenkontakt';
      return {
        id: 'patrol:' + assignment.id,
        kind: 'patrol' as const,
        title: 'Patrouillenauftrag · ' + name,
        detail:
          assignment.status === 'completed'
            ? 'Erledigt · Belohnung abholen'
            : 'Laufender Auftrag · Frist Tag ' + assignment.deadline,
        locationId: location?.id ?? null,
        dangerLevel: location?.dangerLevel ?? 2,
      };
    });
}

function miningReports(economy: ControllerEconomy, world: WorldMap): StarMapWorldEvent[] {
  const counts = new Map<string, number>();
  for (const claim of economy.asteroidClaims.snapshot().claims) {
    counts.set(claim.locationId, (counts.get(claim.locationId) ?? 0) + 1);
  }
  return [...counts].map(([locationId, count]) => ({
    id: 'mining:' + locationId,
    kind: 'mining' as const,
    title: 'Bergbaukonzession · ' + locationName(world, locationId),
    detail: count + ' registrierte Abbaurechte',
    locationId,
    dangerLevel: world.locations.find((location) => location.id === locationId)?.dangerLevel ?? 1,
  }));
}

function wreckReports(economy: ControllerEconomy, world: WorldMap): StarMapWorldEvent[] {
  const counts = new Map<string, number>();
  for (const claim of economy.wreckClaims.snapshot(economy.situations.currentDay)) {
    counts.set(claim.fieldId, (counts.get(claim.fieldId) ?? 0) + 1);
  }
  return [...counts].map(([locationId, count]) => {
    const location = world.locations.find((entry) => entry.id === locationId);
    return {
      id: 'salvage-claim:' + locationId,
      kind: 'salvage' as const,
      title: 'Registrierte Wrackansprüche',
      detail: count + ' Ansprüche · ' + (location?.name ?? 'Wrackfeld'),
      locationId: location?.id ?? null,
      dangerLevel: location?.dangerLevel ?? 1,
    };
  });
}

function visiblePatrolReports(visibleNpcs: readonly NpcShipMapView[]): StarMapWorldEvent[] {
  return visibleNpcs
    .filter((npc) => npc.job === 'patrol' && !npc.combatMode)
    .map((npc) => ({
      id: 'patrol-contact:' + npc.id,
      kind: 'patrol' as const,
      title: 'Patrouillenaktivität · ' + npc.name,
      detail: npc.activity,
      locationId: null,
      dangerLevel: 1,
    }));
}

/** Only real persisted operational states and visible NPCs, not generated placeholder missions. */
export function controllerWorldEvents(
  economy: ControllerEconomy,
  world: WorldMap,
  visibleNpcs: readonly NpcShipMapView[]
): StarMapWorldEvent[] {
  const visible = new Set(visibleNpcs.map((npc) => npc.id));
  return [
    ...tradeReports(economy),
    ...blockadeReports(economy, world, visible),
    ...patrolReports(economy, world, visibleNpcs),
    ...miningReports(economy, world),
    ...wreckReports(economy, world),
    ...visiblePatrolReports(visibleNpcs),
  ];
}
