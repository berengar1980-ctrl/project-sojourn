import type { PlayerProfile } from '../core/player-profile';
import type { CampaignEventBus } from '../systems/campaigns/campaign-event-bus';
import { createCampaignEventBus } from '../systems/campaigns/campaign-event-bus';
import { createCampaignRuntime, type CampaignDefinition } from '../systems/campaigns/campaign-runtime';
import { campaignPackages } from '../data/campaigns/manifest';
import type { NavigationSnapshot } from '../systems/navigation/navigation-types';
import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-types';

/**
 * Observes authoritative navigation snapshots across game frames. Unlike a before/after
 * comparison around navigation.tick(), this catches departures started by UI callbacks.
 */
export function createCampaignNavigationTracker(
  events: CampaignEventBus,
  initial: NavigationSnapshot
): { observe(next: NavigationSnapshot): void } {
  let wasTravelling = initial.isTravelling;
  let lastKnownLocationId = initial.currentLocationId;

  return {
    observe(next) {
      if (!wasTravelling && next.isTravelling && !next.isPursuing && next.destinationId) {
        events.emit({
          type: 'travel.started',
          fromLocationId: lastKnownLocationId,
          destinationId: next.destinationId,
        });
      }
      if (!next.isTravelling && next.currentLocationId !== lastKnownLocationId) {
        if (next.currentLocationId) {
          events.emit({
            type: 'location.arrived',
            fromLocationId: lastKnownLocationId,
            locationId: next.currentLocationId,
          });
        }
        lastKnownLocationId = next.currentLocationId;
      }
      wasTravelling = next.isTravelling;
    },
  };
}

export function createControllerCampaignServices(
  profile: PlayerProfile,
  shipId: string,
  navigation: NavigationSnapshot,
  packages: readonly CampaignDefinition[] = campaignPackages
) {
  const campaignEvents = createCampaignEventBus();
  const campaigns = createCampaignRuntime(campaignEvents);
  for (const campaign of packages) campaigns.register(campaign);
  const campaignNavigation = createCampaignNavigationTracker(campaignEvents, navigation);
  campaignEvents.emit({
    type: 'game.initialized',
    captainName: profile.captainName,
    portraitId: profile.portraitId,
    shipId,
    stationId: profile.stationId,
  });
  return { campaignEvents, campaigns, campaignNavigation };
}

export function emitCampaignCombatEnded(
  events: CampaignEventBus,
  snapshot: StrategicCombatSnapshot
): void {
  events.emit({
    type: 'combat.ended',
    attackerId: snapshot.attacker.id,
    defenderId: snapshot.defender.id,
    winner: snapshot.winner,
    outcomeReason: snapshot.outcomeReason ?? null,
  });
}
