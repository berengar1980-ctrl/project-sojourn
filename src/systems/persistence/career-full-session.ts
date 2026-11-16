import type { CampaignActionPort, CampaignDefinition, CampaignSnapshot } from '../../core/campaign-types';
import type { EconomyResourceDefinition, NpcEconomyState } from '../../core/economy-types';
import type { PlayerProfile } from '../../core/player-profile';
import type { PortDefinition } from '../../core/port-types';
import type { WorldMap } from '../../core/world-types';
import type { SectorNpcState } from '../../core/npc-types';
import { createCrewRosterService, type CrewRosterService } from '../crew/crew-roster-service';
import type { CareerCrewCheckpoint } from '../crew/career-crew-checkpoint';
import type { CareerEconomySessionCheckpoint } from '../economy/career-economy-session';
import type { CareerPlayerCheckpoint } from '../economy/career-player-checkpoint';
import {
  createStrategicCombatService,
  type StrategicCombatService,
} from '../combat/strategic-combat-service';
import type {
  StrategicCombatantSetup,
  StrategicCombatArenaOptions,
} from '../combat/strategic-combat-types';
import type { CareerStrategicCombatCheckpoint } from '../combat/career-strategic-combat-checkpoint';
import type { CareerNpcCheckpoint } from './career-npc-checkpoint';
import type { CareerPlayerShipCheckpoint } from '../ships/career-player-ship-session';
import type { CareerOperationsCheckpoint, StagedCareerOperationsSession } from './career-operations-session';
import {
  stageCareerOperationsSession,
} from './career-operations-session';
import type { CareerAsteroidFieldCheckpoint, CareerMinerFactory } from '../operations/asteroid-field-world';
import type { CareerCampaignWorldCheckpoint } from '../campaigns/career-campaign-world-checkpoint';
import type { NavigationCheckpoint } from '../navigation/navigation-persistence';
import {
  stageCareerNavigationWorld,
  type StagedCareerNavigationWorld,
} from './career-navigation-world-session';
import {
  stageCareerCommerceShipSession,
  type StagedCareerCommerceShipSession,
} from './career-commerce-ship-session';
import {
  stageCareerFieldLegalSession,
  type StagedCareerFieldLegalSession,
} from './career-field-legal-session';
import {
  stageCareerCustody,
  type StagedCareerCustody,
} from './career-custody-checkpoint';
import type { CareerCustodyCheckpoint } from './career-custody-checkpoint';
import {
  stageCareerCampaigns,
  type StagedCareerCampaignSession,
} from './career-campaign-session';
import {
  validateCareerSnapshot,
  type CareerJson,
  type CareerSnapshot,
} from './career-save-contract';

export interface CareerCombatSetup {
  readonly attacker: StrategicCombatantSetup;
  readonly defender: StrategicCombatantSetup;
  readonly arena?: StrategicCombatArenaOptions;
}

export interface StagedFullCareerSession {
  readonly navigationWorld: StagedCareerNavigationWorld;
  readonly commerce: StagedCareerCommerceShipSession;
  readonly crew: CrewRosterService;
  readonly operations: StagedCareerOperationsSession;
  readonly fieldsLegal: StagedCareerFieldLegalSession;
  readonly custody: StagedCareerCustody;
  readonly campaigns: StagedCareerCampaignSession;
  readonly combat: StrategicCombatService | null;
  /** Call only after the single active-session pointer is swapped. */
  activate(): void;
}

export interface CareerFullSessionDependencies {
  readonly baseWorld: WorldMap;
  readonly ports: readonly PortDefinition[];
  readonly resources: readonly EconomyResourceDefinition[];
  readonly economySeed: number;
  readonly starterShipId: string;
  readonly profile: PlayerProfile;
  readonly initialCruiseSpeed: number;
  readonly campaignDefinitions: readonly CampaignDefinition[];
  readonly makeMinerFactory: (session: {
    readonly commerce: StagedCareerCommerceShipSession;
    readonly operations: StagedCareerOperationsSession;
  }) => CareerMinerFactory;
  readonly campaignActions: (
    prepared: Omit<StagedFullCareerSession, 'campaigns' | 'combat' | 'activate'>
  ) => CampaignActionPort;
  readonly combatSetups: (
    prepared: Omit<StagedFullCareerSession, 'campaigns' | 'combat' | 'activate'>
  ) => CareerCombatSetup;
}

function section<T>(value: CareerJson): T {
  return value as unknown as T;
}

function validateCrewShips(
  crew: CrewRosterService,
  commerce: StagedCareerCommerceShipSession
): void {
  const owned = new Set(commerce.ships.ownership.snapshot().ownedShipIds);
  const assignments = crew.exportState().assignments;
  for (const shipId of Object.keys(assignments)) {
    if (!owned.has(shipId)) throw new Error('Crew assigned to an unowned saved ship');
  }
}

/**
 * Restore the 14 canonical save sections against one isolated dependency
 * graph. It cannot update or replace a live game until the caller commits it.
 */
export function stageCareerFullSession(
  candidate: CareerSnapshot,
  deps: CareerFullSessionDependencies
): StagedFullCareerSession {
  const { sections } = validateCareerSnapshot(candidate);
  const navigationWorld = stageCareerNavigationWorld(
    deps.baseWorld,
    section<NavigationCheckpoint>(sections.navigation),
    section<CareerCampaignWorldCheckpoint>(sections.world),
    deps.initialCruiseSpeed
  );
  let operations: StagedCareerOperationsSession | null = null;
  const commerce = stageCareerCommerceShipSession(
    {
      version: 1,
      commerce: {
        version: 1,
        player: section<CareerPlayerCheckpoint>(sections.player),
        sector: {
          version: 1,
          npcs: section<CareerNpcCheckpoint>(sections.npcs),
          economy: section<CareerEconomySessionCheckpoint>(sections.economy),
        },
      },
      ships: section<CareerPlayerShipCheckpoint>(sections.ships),
    },
    deps.baseWorld,
    deps.ports,
    deps.resources,
    deps.economySeed,
    deps.starterShipId,
    ({ markets, simulation, player, npcs }) => {
      operations = stageCareerOperationsSession(
        section<CareerOperationsCheckpoint>(sections.operations),
        deps.baseWorld,
        npcs as readonly SectorNpcState[],
        markets,
        simulation,
        player,
        () => navigationWorld.navigation.getSnapshot().currentPosition
      );
      return {
        positions: Object.fromEntries(
          deps.baseWorld.locations.map((location) => [location.id, location.position])
        ),
        travel: {
          requestTravel: (npc, destinationId, reason) =>
            operations!.sector.requestTravel(npc as SectorNpcState, destinationId, reason),
          requestPatrol: (npc) =>
            operations!.sector.requestPatrol(npc as SectorNpcState),
          isTravelling: (npc) =>
            operations!.sector.isTravelling(npc as SectorNpcState),
          quoteTravel: (npc, destinationId, credits) =>
            operations!.blockades.blocksTrader(npc.id, destinationId)
              ? null
              : operations!.sector.quoteTravel(npc as SectorNpcState, destinationId, credits),
        },
        onSale: (_npc: NpcEconomyState, _resourceId: string, _quantity: number, gross: number) =>
          operations!.population.collectTradeCommission(Math.max(0, Math.round((gross * 0.06) / 0.94))),
      };
    }
  );
  if (!operations) throw new Error('Missing staged career operations');
  const crew = createCrewRosterService(
    deps.profile,
    section<CareerCrewCheckpoint>(sections.crew)
  );
  validateCrewShips(crew, commerce);
  const fieldsLegal = stageCareerFieldLegalSession(
    {
      version: 1,
      fields: section<CareerAsteroidFieldCheckpoint>(sections.fields),
      claims: sections.claims as never,
      legal: sections.legal as never,
    },
    deps.baseWorld.locations,
    deps.makeMinerFactory({ commerce, operations }),
    commerce.commerce.npcs
  );
  const custody = stageCareerCustody(
    section<CareerCustodyCheckpoint>(sections.custody),
    fieldsLegal.legal,
    commerce.commerce.npcs,
    commerce.ships.activeShipId
  );
  const prepared = { navigationWorld, commerce, crew, operations, fieldsLegal, custody };
  const campaigns = stageCareerCampaigns(
    section<CampaignSnapshot>(sections.campaigns),
    deps.campaignDefinitions,
    deps.campaignActions(prepared)
  );
  try {
    const savedCombat = sections.combat;
    const combat = savedCombat === null
      ? null
      : (() => {
          const setups = deps.combatSetups(prepared);
          const saved = section<CareerStrategicCombatCheckpoint>(savedCombat);
          return createStrategicCombatService(
            setups.attacker,
            setups.defender,
            saved.seed,
            setups.arena,
            saved
          );
        })();
    return {
      ...prepared,
      campaigns,
      combat,
      activate: () => campaigns.activate(),
    };
  } catch (error) {
    campaigns.campaigns.destroy();
    throw error;
  }
}
