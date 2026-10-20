import type { StarMapEngagementService } from '../combat/star-map-engagement-service';
import type { NavigationService } from '../navigation';
import type { NpcSectorService } from '../npcs/npc-sector-service';

const MISSION_CONTACT_RANGE = 650;

export interface CampaignCombatActions {
  startExistingNpcEncounter(npcId: string): boolean;
}

/** Reuses the real strategic-combat service and the controller's existing scene lifecycle. */
export function createCampaignCombatActions(
  engagements: StarMapEngagementService,
  npcs: NpcSectorService,
  navigation: NavigationService,
  getMode: () => string
): CampaignCombatActions {
  return {
    startExistingNpcEncounter(npcId) {
      if (getMode() !== 'star-map' || engagements.activePlayerCombat()) return false;
      const nav = navigation.getSnapshot();
      if (nav.isTravelling || nav.isPursuing) return false;
      const npc = npcs.npcs.find((target) => target.id === npcId && target.hullHp > 0);
      if (!npc || npc.combatMovement) return false;
      const position = npcs.livePosition(npc);
      const distance = Math.hypot(
        position.x - nav.currentPosition.x,
        position.y - nav.currentPosition.y
      );
      if (distance > MISSION_CONTACT_RANGE) return false;
      return engagements.engageNpcNow(npcId);
    },
  };
}
