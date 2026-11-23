import type { NpcJob, SectorNpcState } from '../../core/npc-types';
import type { WorldPoint } from '../../core/world-types';
import { createSectorNpcEconomyStates } from '../../data/economy/sector-npc-economy';
import { getShipDefinition } from '../../systems/ships';
import { edgePoint, hashId } from '../../systems/npcs/npc-mining-targets';
import type { StrategicCombatArenaOptions } from '../../systems/combat/strategic-combat-types';
import { duelInstalledComponents } from './duel-combatant-setup';
import type { FleetScenarioShip } from './fleet-scenario-roster';
import type { FieldRouteShip } from '../../systems/navigation/field-ship-routing';
export interface MovingNpc extends FieldRouteShip {
  readonly npc: SectorNpcState;
}
const WORLD_LOCATION = 'duel';
export function seedScenarioNpcs(
  states: Map<string, MovingNpc>,
  roster: readonly FleetScenarioShip[],
  arena: StrategicCombatArenaOptions,
  playerStart: WorldPoint,
  hullById: ReadonlyMap<string, number>,
  seed: number
): void {
  const templates = createSectorNpcEconomyStates();
  const jobFor = (ship: FleetScenarioShip): NpcJob => {
    if (ship.group === 'pirates-yellow' || ship.group === 'pirates-red') return 'pirate';
    if (ship.group === 'drone') return 'patrol';
    const role = getShipDefinition(ship.draft.shipId)?.role;
    if (role === 'mining') return 'miner';
    if (role === 'salvage') return 'salvager';
    if (role === 'freighter') return 'freighter';
    return 'patrol';
  };
  for (const ship of roster) {
    if (ship.group === 'player') continue;
    const job = jobFor(ship);
    const template =
      templates.find(
        (candidate) => candidate.job === job && candidate.shipId === ship.draft.shipId
      ) ?? templates.find((candidate) => candidate.job === job);
    if (!template) throw new Error('Missing career NPC template for ' + job);
    const npc: SectorNpcState = {
      ...structuredClone(template),
      id: ship.id,
      name: ship.name,
      shipId: ship.draft.shipId,
      job,
      role: job === 'pirate' || job === 'patrol' ? 'patrol' : job,
      locationId: WORLD_LOCATION,
      workLocationId: WORLD_LOCATION,
      workResourceIds: [],
      hullHp: hullById.get(ship.id) ?? template.hullMaxHp,
      hullMaxHp: hullById.get(ship.id) ?? template.hullMaxHp,
      installedComponents: duelInstalledComponents(ship.draft),
      pirate: job === 'pirate',
      ...(ship.group === 'pirates-yellow'
        ? { factionId: 'pirates' as const, pirateMark: 'broken-spear' as const }
        : {}),
      ...(ship.group === 'pirates-red'
        ? { factionId: 'pirates2' as const, pirateMark: 'black-tide' as const }
        : {}),
      ...(job === 'miner' || job === 'salvager'
        ? {
            autonomy: {
              phase: 'ready' as const,
              secondsRemaining: 0,
              lastLocationId: WORLD_LOCATION,
              wasTravelling: false,
            },
          }
        : {}),
    };
    const code = hashId(ship.id + ':' + seed);
    const angle = ((code % 6283) / 1000) % (Math.PI * 2);
    const radius = 200 + ((code >>> 7) % 260);
    const initial = {
      x: Math.max(180, Math.min(arena.width - 180, playerStart.x + Math.cos(angle) * radius)),
      y: Math.max(180, Math.min(arena.height - 180, playerStart.y + Math.sin(angle) * radius)),
    };
    if (!npc.pirate) delete npc.pirateMark;
    states.set(ship.id, {
      npc,
      position: ship.arrivalSeconds > 0 ? edgePoint(ship.id, arena.width, arena.height) : initial,
      headingRadians: angle + Math.PI,
      speed: 0,
    });
  }
}
