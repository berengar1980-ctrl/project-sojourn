import type { ShipRole } from '../../core/ship-types';
import type { WorldMap } from '../../core/world-types';
import type { ControllerEconomy } from './game-controller-economy';
import type { NpcShipMapView, StarMapWorldEvent } from '../features/star-map/star-map-view-model';

function locationName(world: WorldMap, id: string): string {
  return world.locations.find((entry) => entry.id === id)?.name ?? id;
}

/** Reports real operational state; does not generate missions or reveal hidden NPCs. */
export function controllerWorldEvents(
  economy: ControllerEconomy,
  world: WorldMap,
  visibleNpcs: readonly NpcShipMapView[],
  role: ShipRole
): StarMapWorldEvent[] {
  const events: StarMapWorldEvent[] = [];
  const visible = new Set(visibleNpcs.map((npc) => npc.id));
  const day = economy.situations.currentDay;
  for (const situation of economy.situations.active()) {
    const target = situation.locationId;
    events.push({
      id: 'trade:' + situation.id,
      kind: 'trade',
      title: situation.name,
      detail: situation.description,
      locationId: target ?? null,
      dangerLevel: 0,
    });
  }
  for (const blockade of economy.blockades.snapshot().orders) {
    if (!['assembling', 'active'].includes(blockade.phase)) continue;
    if (blockade.ownerId !== 'player' && !blockade.pirateIds.some((id) => visible.has(id)))
      continue;
    events.push({
      id: 'blockade:' + blockade.id,
      kind: 'blockade',
      title: 'Blockade · ' + locationName(world, blockade.locationId),
      detail: blockade.phase === 'active' ? 'Handelsblockade aktiv' : 'Korsaren im Anflug',
      locationId: blockade.locationId,
      dangerLevel: 2,
    });
  }
  for (const assignment of economy.patrol.snapshot().assignments) {
    if (!['active', 'completed'].includes(assignment.status)) continue;
    const targetLocation = world.locations.find((location) => location.id === assignment.targetId);
    events.push({
      id: 'patrol:' + assignment.id,
      kind: 'patrol',
      title: 'Patrouillenauftrag · ' +
        (targetLocation?.name ?? visibleNpcs.find((npc) => npc.id === assignment.targetId)?.name ??
        'Korsarenkontakt'),
      detail: assignment.status === 'completed' ? 'Erledigt · Belohnung abholen' :
        'Laufender Auftrag · Frist Tag ' + assignment.deadline,
      locationId: targetLocation?.id ?? null,
      dangerLevel: targetLocation?.dangerLevel ?? 2,
    });
  }
  const grouped = new Map<string, number>();
  for (const claim of economy.asteroidClaims.snapshot().claims) {
    grouped.set(claim.locationId, (grouped.get(claim.locationId) ?? 0) + 1);
  }
  for (const [locationId, count] of grouped) {
    events.push({
      id: 'mining:' + locationId,
      kind: 'mining',
      title: 'Bergbaukonzession · ' + locationName(world, locationId),
      detail: count + ' registrierte Abbaurechte',
      locationId,
      dangerLevel: world.locations.find((location) => location.id === locationId)?.dangerLevel ?? 1,
    });
  }
  const wreckFields = new Map<string, number>();
  for (const claim of economy.wreckClaims.snapshot(day)) {
    wreckFields.set(claim.fieldId, (wreckFields.get(claim.fieldId) ?? 0) + 1);
  }
  for (const [locationId, count] of wreckFields) {
    const location = world.locations.find((entry) => entry.id === locationId);
    events.push({
      id: 'salvage-claim:' + locationId,
      kind: 'salvage',
      title: 'Registrierte Wrackansprüche',
      detail: count + ' Ansprüche · ' + (location?.name ?? 'Wrackfeld'),
      locationId: location?.id ?? null,
      dangerLevel: location?.dangerLevel ?? 1,
    });
  }
  // Visible NPC patrols can be followed via the contacts pane. No false mission is issued.
  for (const npc of visibleNpcs) {
    if (npc.job !== 'patrol' || npc.combatMode) continue;
    events.push({
      id: 'patrol-contact:' + npc.id,
      kind: 'patrol',
      title: 'Patrouillenaktivität · ' + npc.name,
      detail: npc.activity,
      locationId: null,
      dangerLevel: 1,
    });
  }
  return events;
}
