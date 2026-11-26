import type { CampaignActionPort } from '../core/campaign-types';
import { createPlayerProfile, withPlayerShipName } from '../core/player-profile';
import { economyResources } from '../data/economy/economy-resources';
import { campaignPackages } from '../data/campaigns/manifest';
import { factionDefinitions } from '../data/factions/faction-manifest';
import { narrowsSector } from '../data/maps/narrows-sector';
import { sectorPorts } from '../data/ports/sector-ports';
import { createCampaignActionGateway } from '../systems/campaigns/campaign-action-gateway';
import { createCampaignCombatActions } from '../systems/campaigns/campaign-combat-actions';
import { createCampaignShipActions } from '../systems/campaigns/campaign-ship-actions';
import { npcCombatant } from '../systems/combat/npc-combatant-setup';
import { createNpcLocalMiningService } from '../systems/npcs/npc-local-mining-service';
import {
  stageCareerFullSession,
  type CareerFullSessionDependencies,
  type CareerPlayerDomainCheckpoint,
  type StagedFullCareerSession,
} from '../systems/persistence/career-full-session';
import type { CareerSnapshot } from '../systems/persistence/career-save-contract';
import { getShipDefinition } from '../systems/ships/ship-registry';
import { servicedPlayerCombatant } from './game-controller-ship-service';
import {
  registerNpcAsteroidClaim,
  recordNpcAsteroidTheft,
} from './game-controller-field-miner-events';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';

export interface PreparedControllerCareer {
  readonly session: StagedFullCareerSession;
  bindController(context: ControllerRuntimeContext): void;
}

function careerDependencies(
  snapshot: CareerSnapshot,
  binding: { context: ControllerRuntimeContext | null; actions: CampaignActionPort | null }
): CareerFullSessionDependencies {
  return {
    baseWorld: narrowsSector,
    ports: sectorPorts,
    resources: economyResources,
    factionIds: factionDefinitions.map((faction) => faction.id),
    economySeed: 41,
    starterShipId: 'salvage-100m-variant-01',
    profile: createPlayerProfile(
      (snapshot.sections.player as unknown as CareerPlayerDomainCheckpoint).profile
    ),
    initialCruiseSpeed: getShipDefinition('salvage-100m-variant-01')!.navigation.cruiseSpeed,
    campaignDefinitions: campaignPackages,
    makeMinerFactory:
      ({ commerce, operations }) =>
      (location, instance, checkpoint) =>
        createNpcLocalMiningService(
          {
            locationId: location.id,
            seed: instance.seed,
            width: instance.width,
            height: instance.height,
            miners: operations.sector.npcs.filter(
              (npc) => npc.job === 'miner' && npc.workLocationId === location.id
            ),
            getAsteroids: () => instance.asteroids,
            mine: (npc, id, amount, asteroidId) =>
              commerce.commerce.economy.npcs.mineLocal(
                npc,
                id,
                amount,
                asteroidId ? JSON.stringify([location.id, asteroidId]) : undefined
              ),
            onAsteroidScanned: (npc, asteroid) => {
              if (binding.context) {
                registerNpcAsteroidClaim(binding.context, location, npc, asteroid);
              }
            },
            onAsteroidMined: (npc, asteroid, id, amount) => {
              if (binding.context) {
                recordNpcAsteroidTheft(binding.context, location, npc, asteroid, id, amount);
              }
            },
            depart: (npc) => commerce.commerce.economy.npcs.dispatchLoadedWorker(npc),
            getPlayerShip: () => binding.context?.state.activeShip,
            getPlayerShipState: () =>
              binding.context?.state.localSpace?.getSnapshot().instance.ship,
          },
          checkpoint
        ),
    campaignActions: () => ({
      apply: (action, id) => binding.actions?.apply(action, id) ?? false,
      releaseCampaign: (id) => binding.actions?.releaseCampaign?.(id),
    }),
    combatSetups: (prepared) => {
      const saved = snapshot.sections.combat as {
        defenderId: string;
        runtime?: { arena?: { width?: number; height?: number } };
      } | null;
      if (!saved) throw new Error('Missing Career combat checkpoint');
      const active = getShipDefinition(prepared.commerce.ships.activeShipId);
      const enemy = prepared.operations.sector.npcs.find((npc) => npc.id === saved.defenderId);
      if (!active || !enemy) throw new Error('Saved Career combatant unavailable');
      const defender = npcCombatant(enemy);
      if (!defender) throw new Error('Saved Career enemy ship unavailable');
      return {
        attacker: servicedPlayerCombatant(
          withPlayerShipName(active, prepared.profile),
          prepared.crew,
          prepared.commerce.ships.loadouts,
          prepared.commerce.ships.operating
        ),
        defender,
        arena: {
          width: saved.runtime?.arena?.width ?? 2400,
          height: saved.runtime?.arena?.height ?? 1600,
        },
      };
    },
  };
}

/** Construct a detached Career before creating any browser/controller UI. */
export function prepareControllerCareer(snapshot: CareerSnapshot): PreparedControllerCareer {
  const binding: { context: ControllerRuntimeContext | null; actions: CampaignActionPort | null } =
    {
      context: null,
      actions: null,
    };
  const session = stageCareerFullSession(snapshot, careerDependencies(snapshot, binding));
  return {
    session,
    bindController(context) {
      if (binding.context) throw new Error('Career controller already bound');
      if (context.navigation !== session.navigationWorld.navigation) {
        throw new Error('Career navigation mismatch');
      }
      binding.context = context;
      binding.actions = createCampaignActionGateway({
        trade: context.economy.trade,
        crew: context.crew,
        reputation: context.reputation,
        world: context.world,
        equipment: createCampaignShipActions(
          context.economy.components,
          context.loadouts,
          () => context.state.activeShip
        ),
        combat: createCampaignCombatActions(
          context.engagements,
          context.economy.sectorNpcs,
          context.navigation,
          () => context.state.mode
        ),
        getShip: () => context.state.activeShip,
      });
    },
  };
}
