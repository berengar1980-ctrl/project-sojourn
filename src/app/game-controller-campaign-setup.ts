import { factionDefinitions } from '../data/factions/faction-manifest';
import type { CrewRosterService } from '../systems/crew/crew-roster-service';
import type { StarMapEngagementService } from '../systems/combat/star-map-engagement-service';
import type { NavigationService } from '../systems/navigation';
import type { ShipLoadoutService } from '../systems/ships/ship-loadout-service';
import { createFactionReputationService } from '../systems/reputation/faction-reputation-service';
import { createCampaignActionGateway } from '../systems/campaigns/campaign-action-gateway';
import { createCampaignCombatActions } from '../systems/campaigns/campaign-combat-actions';
import { createCampaignShipActions } from '../systems/campaigns/campaign-ship-actions';
import type { ControllerEconomy } from './game-controller-economy';
import type { ControllerRuntimeState } from './game-controller-runtime-types';
import { createControllerCampaignServices } from './game-controller-campaign-events';

/** Build all campaign authority only after canonical gameplay services exist. */
export function createControllerCampaignServicesWithActions(
  state: ControllerRuntimeState,
  economy: ControllerEconomy,
  crew: CrewRosterService,
  loadouts: ShipLoadoutService,
  engagements: StarMapEngagementService,
  navigation: NavigationService
) {
  const reputation = createFactionReputationService(
    factionDefinitions.map((faction) => faction.id)
  );
  const actionPort = createCampaignActionGateway({
    trade: economy.trade,
    crew,
    reputation,
    equipment: createCampaignShipActions(economy.components, loadouts, () => state.activeShip),
    combat: createCampaignCombatActions(
      engagements,
      economy.sectorNpcs,
      navigation,
      () => state.mode
    ),
    getShip: () => state.activeShip,
  });
  const campaignServices = createControllerCampaignServices(
    state.playerProfile,
    state.activeShip.id,
    navigation.getSnapshot(),
    undefined,
    actionPort
  );
  return { ...campaignServices, reputation };
}
