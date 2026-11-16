import type { WorldMap } from '../../core/world-types';
import {
  createCampaignWorldService,
  type CampaignWorldService,
} from '../campaigns/campaign-world-service';
import {
  stageCareerCampaignWorldCheckpoint,
  type CareerCampaignWorldCheckpoint,
} from '../campaigns/career-campaign-world-checkpoint';
import { createNavigationService } from '../navigation/navigation-service';
import type { NavigationCheckpoint } from '../navigation/navigation-persistence';
import type { NavigationService } from '../navigation/navigation-types';

export interface StagedCareerNavigationWorld {
  readonly navigation: NavigationService;
  readonly world: CampaignWorldService;
}

function navigationWorld(
  base: WorldMap,
  saved: CareerCampaignWorldCheckpoint
): WorldMap {
  if (saved.active) {
    const system = saved.snapshot.systems[saved.active.owner]?.find(
      (item) => item.map.id === saved.active?.id
    );
    if (!system) throw new Error('Missing active saved campaign system');
    return system.map;
  }
  const additions = Object.values(saved.snapshot.locations).flat();
  return {
    ...base,
    ...(saved.revision > 0 ? { id: base.id + '-campaign-' + saved.revision } : {}),
    locations: [...base.locations, ...additions],
  };
}

/** Stage the navigation checkpoint against the exact reconstructed world revision. */
export function stageCareerNavigationWorld(
  baseWorld: WorldMap,
  navigationCheckpoint: NavigationCheckpoint,
  worldCheckpoint: CareerCampaignWorldCheckpoint,
  initialCruiseSpeed: number
): StagedCareerNavigationWorld {
  const savedWorld = stageCareerCampaignWorldCheckpoint(worldCheckpoint);
  const map = navigationWorld(baseWorld, savedWorld);
  const navigation = createNavigationService(
    map,
    map.startLocationId,
    initialCruiseSpeed,
    navigationCheckpoint
  );
  const world = createCampaignWorldService(baseWorld, navigation, savedWorld);
  if (world.world().id !== map.id) {
    throw new Error('Career navigation and campaign world identity mismatch');
  }
  return { navigation, world };
}
