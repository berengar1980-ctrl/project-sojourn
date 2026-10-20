import type { CampaignAction, CampaignActionPort } from '../../core/campaign-types';
import type { ShipDefinition } from '../../core/ship-types';
import { economyResourceById } from '../../data/economy/economy-resources';
import type { CrewRosterService } from '../crew/crew-roster-service';
import type { PlayerTradeService } from '../economy/player-trade-service';
import { resolveShipGameplayStats } from '../ships/ship-stats';

export interface CampaignActionServices {
  readonly trade: PlayerTradeService;
  readonly crew: CrewRosterService;
  getShip(): ShipDefinition;
}

function positiveAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/** Only domain owners can mutate gameplay. Failures must leave state unchanged. */
export function createCampaignActionGateway(services: CampaignActionServices): CampaignActionPort {
  const { trade, crew, getShip } = services;
  return {
    apply(action: CampaignAction): boolean {
      switch (action.type) {
        case 'credits.grant':
          return positiveAmount(action.amount) && trade.grantCredits(action.amount);
        case 'credits.take':
          return positiveAmount(action.amount) && trade.takeCredits(action.amount);
        case 'cargo.grant':
          return (
            positiveAmount(action.quantity) &&
            !!economyResourceById(action.resourceId) &&
            trade.grantCargo(
              action.resourceId,
              action.quantity,
              resolveShipGameplayStats(getShip()).cargoCapacityTons
            )
          );
        case 'cargo.take':
          return (
            positiveAmount(action.quantity) &&
            !!economyResourceById(action.resourceId) &&
            trade.removeCargo(action.resourceId, action.quantity)
          );
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
