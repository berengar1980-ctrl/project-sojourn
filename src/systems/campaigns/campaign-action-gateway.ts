import type { CampaignAction, CampaignActionPort } from '../../core/campaign-types';
import type { ShipDefinition } from '../../core/ship-types';
import { economyResourceById } from '../../data/economy/economy-resources';
import type { CrewRosterService } from '../crew/crew-roster-service';
import type { PlayerTradeService } from '../economy/player-trade-service';
import { resolveShipGameplayStats } from '../ships/ship-stats';
import type { FactionReputationService } from '../reputation/faction-reputation-service';
import type { CampaignShipActions } from './campaign-ship-actions';
import type { CampaignCombatActions } from './campaign-combat-actions';
import type { CampaignWorldService } from './campaign-world-service';

type WorldAction = Extract<CampaignAction, { readonly type: `world.${string}` }>;
type CargoAction = Extract<CampaignAction, { readonly type: 'cargo.grant' | 'cargo.take' }>;

export interface CampaignActionServices {
  readonly trade: PlayerTradeService;
  readonly crew: CrewRosterService;
  readonly reputation: FactionReputationService;
  readonly equipment: CampaignShipActions;
  readonly combat: CampaignCombatActions;
  readonly world?: CampaignWorldService;
  getShip(): ShipDefinition;
}

function positiveAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function applyWorldAction(
  action: WorldAction,
  campaignId: string | undefined,
  world: CampaignWorldService | undefined
): boolean {
  if (!campaignId || !world) return false;
  switch (action.type) {
    case 'world.location.add':
      return world.addLocation(campaignId, action.location);
    case 'world.system.add':
      return world.addSystem(campaignId, {
        map: action.map,
        entryLocationId: action.entryLocationId,
        exitLocationId: action.exitLocationId,
      });
    case 'world.system.enter':
      return world.enterSystem(campaignId, action.systemId);
    case 'world.system.return':
      return world.returnFromSystem(campaignId);
  }
}

function applyCargoAction(
  action: CargoAction,
  trade: PlayerTradeService,
  ship: ShipDefinition
): boolean {
  if (!positiveAmount(action.quantity) || !economyResourceById(action.resourceId)) {
    return false;
  }
  if (action.type === 'cargo.take') return trade.removeCargo(action.resourceId, action.quantity);
  return trade.grantCargo(
    action.resourceId,
    action.quantity,
    resolveShipGameplayStats(ship).cargoCapacityTons
  );
}

/** Only domain owners can mutate gameplay. Failures must leave state unchanged. */
export function createCampaignActionGateway(services: CampaignActionServices): CampaignActionPort {
  const { trade, crew, getShip } = services;
  return {
    releaseCampaign: (campaignId) => services.world?.releaseCampaign(campaignId),
    apply(action: CampaignAction, campaignId?: string): boolean {
      switch (action.type) {
        case 'credits.grant':
          return positiveAmount(action.amount) && trade.grantCredits(action.amount);
        case 'credits.take':
          return positiveAmount(action.amount) && trade.takeCredits(action.amount);
        case 'cargo.grant':
        case 'cargo.take':
          return applyCargoAction(action, trade, getShip());
        case 'reputation.change':
          return services.reputation.change(action.factionId, action.delta);
        case 'component.grant':
          return services.equipment.grant(action.componentType, action.componentId);
        case 'component.install':
          return services.equipment.install(action.componentUid, action.slotIndex);
        case 'combat.start':
          return services.combat.startExistingNpcEncounter(action.npcId);
        case 'world.location.add':
        case 'world.system.add':
        case 'world.system.enter':
        case 'world.system.return':
          return applyWorldAction(action, campaignId, services.world);
        case 'crew.hire':
          return (
            crew.availableDefinitions().some((entry) => entry.id === action.crewId) &&
            crew.hire(action.crewId, getShip()) !== null
          );
        case 'crew.dismiss':
          return action.crewId !== 'player' && crew.dismiss(action.crewId) !== null;
        case 'crew.assign':
          return crew.assign(getShip(), action.stationId, action.crewId);
      }
    },
  };
}
