import type { SalvageField } from '../core/salvage-types';
import type { CampaignEventBus } from '../systems/campaigns/campaign-event-bus';
import type { CampaignRuntime } from '../systems/campaigns/campaign-runtime';
import type { CampaignWorldService } from '../systems/campaigns/campaign-world-service';
import type { FactionReputationService } from '../systems/reputation/faction-reputation-service';
import type { createCampaignNavigationTracker } from './game-controller-campaign-events';
import type { ShipDefinition } from '../core/ship-types';
import type { PlayerProfile } from '../core/player-profile';
import type { SystemLogService } from '../core/system-log-types';
import type { GameAudioService } from '../systems/audio/game-audio-service';
import type { StarMapEngagementService } from '../systems/combat';
import type { CrewRosterService } from '../systems/crew';
import type { LocalSpaceService } from '../systems/local-space';
import type { NavigationService } from '../systems/navigation';
import type { NpcLocalMiningService } from '../systems/npcs/npc-local-mining-service';
import type { ShipLoadoutService } from '../systems/ships';
import type { BoardingTacticalPanel } from '../ui/boarding/boarding-tactical-panel';
import type { StrategicCombatPanel } from '../ui/combat/strategic-combat-panel';
import type { LocalSpacePanel } from '../ui/local-space/local-space-panel';
import type { StarMapPanel } from '../ui/map/star-map-panel';
import type { PortPanel } from '../ui/port/port-panel';
import type { ControllerEconomy } from './game-controller-economy';
import type { SalvageSceneController } from './game-controller-salvage';
import type { ShipTestSwitcher } from './game-controller-ship-switcher';

export type SceneMode =
  'star-map' | 'local-space' | 'salvage-space' | 'port' | 'combat' | 'boarding';

export interface ControllerPanels {
  star: StarMapPanel | null;
  local: LocalSpacePanel | null;
  port: PortPanel | null;
}

export interface ControllerRuntimeState {
  activeShip: ShipDefinition;
  readonly starterShipId: string;
  readonly playerProfile: PlayerProfile;
  ownedShipIds: Set<string>;
  mode: SceneMode;
  readonly panels: ControllerPanels;
  shipSwitcher: ShipTestSwitcher | null;
  localSpace: LocalSpaceService | null;
  localNpcMining: NpcLocalMiningService | null;
  salvageScene: SalvageSceneController | null;
  combatPanel: StrategicCombatPanel | null;
  boardingPanel: BoardingTacticalPanel | null;
  embeddedCombat: 'local-space' | 'salvage-space' | null;
  selectedNpcId: string | null;
  localSpaceSeed: number;
  salvageSpaceSeed: number;
  readonly salvageEventFields: Map<string, SalvageField>;
  visitCounter: number;
  previousLocationId: string | null;
  displayedWorldId: string;
}

export interface ControllerRuntimeContext {
  readonly root: HTMLElement;
  readonly navigation: NavigationService;
  readonly systemLog: SystemLogService;
  readonly economy: ControllerEconomy;
  readonly crew: CrewRosterService;
  readonly loadouts: ShipLoadoutService;
  readonly audio: GameAudioService;
  readonly engagements: StarMapEngagementService;
  readonly campaignEvents: CampaignEventBus;
  readonly campaigns: CampaignRuntime;
  readonly world: CampaignWorldService;
  readonly reputation: FactionReputationService;
  readonly campaignNavigation: ReturnType<typeof createCampaignNavigationTracker>;
  readonly state: ControllerRuntimeState;
}
