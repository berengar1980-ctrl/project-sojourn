import type { NpcJob, SectorNpcState } from '../../core/npc-types';
import { createSectorNpcEconomyStates } from '../../data/economy/sector-npc-economy';
import { getShipDefinition } from '../../systems/ships';
import { duelCombatant, duelInstalledComponents } from './duel-combatant-setup';
import { campaignCombatPreset } from './campaign-combat-preset';
import { equipSecurityDroneMk3 } from '../../systems/ships/security-drone-weapon-loadout';
import type { FleetScenarioShip } from './fleet-scenario-roster';
export function scenarioArrivals(roster: readonly FleetScenarioShip[], location: string) {
  const arrivals: { at: number; npc: SectorNpcState }[] = [];
  let droneCount = 0;
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
    const preset = ship.draft.campaignNpcId ? campaignCombatPreset(ship.draft.campaignNpcId) : null;
    const template =
      preset ??
      templates.find(
        (candidate) => candidate.job === job && candidate.shipId === ship.draft.shipId
      ) ??
      templates.find((candidate) => candidate.job === job);
    if (!template) throw new Error('Missing career NPC template for ' + job);
    const hull =
      preset?.hullHp ?? duelCombatant(0, ship.draft, getShipDefinition(ship.draft.shipId)!).hullHp;
    const npc: SectorNpcState = {
      ...structuredClone(template),
      id:
        ship.group === 'drone'
          ? 'security-drone:' + location + (++droneCount === 1 ? '' : ':escort-' + droneCount)
          : ship.id,
      name: ship.name,
      shipId: ship.draft.shipId,
      job,
      role: job === 'pirate' || job === 'patrol' ? 'patrol' : job,
      locationId: location,
      workLocationId: location,
      cargo: {},
      hullHp: hull,
      hullMaxHp: hull,
      installedComponents: preset?.installedComponents ?? duelInstalledComponents(ship.draft),
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
              phase: 'working' as const,
              secondsRemaining: 0,
              lastLocationId: location,
              wasTravelling: false,
            },
          }
        : {}),
    };
    delete npc.travel;
    delete npc.combatMovement;
    delete npc.orbit;
    if (!npc.pirate) delete npc.pirateMark;
    if (ship.group === 'drone') equipSecurityDroneMk3(npc);
    arrivals.push({ at: ship.arrivalSeconds, npc });
  }
  return arrivals.sort((a, b) => a.at - b.at);
}
