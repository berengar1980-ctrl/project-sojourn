import type { WorldLocation, WorldMap } from './world-types';
import type { ShipComponentType } from './ship-types';

/** Public, serializable contract shared by campaign packages and the game. */
export type CampaignValue =
  | null
  | boolean
  | number
  | string
  | readonly CampaignValue[]
  | { readonly [key: string]: CampaignValue };

export type CampaignStatus = 'inactive' | 'active' | 'completed';
export type CampaignCategory = 'core' | 'optional' | 'development';

export interface CampaignPackageInfo {
  readonly id: string;
  readonly title: string;
  readonly version: number;
  readonly category: CampaignCategory;
  readonly defaultEnabled: boolean;
}

export type CampaignEvent =
  | {
      readonly type: 'game.initialized';
      readonly captainName: string;
      readonly portraitId: number;
      readonly shipId: string;
      readonly stationId: string;
    }
  | {
      readonly type: 'travel.started';
      readonly fromLocationId: string | null;
      readonly destinationId: string;
    }
  | {
      readonly type: 'location.arrived';
      readonly fromLocationId: string | null;
      readonly locationId: string;
    }
  | {
      readonly type: 'combat.ended';
      readonly attackerId: string;
      readonly defenderId: string;
      readonly winner: 'attacker' | 'defender' | null;
      readonly outcomeReason: 'destruction' | 'escape' | 'boarding' | 'surrender' | null;
    }
  | {
      readonly type: 'dialogue.choice';
      readonly campaignId: string;
      readonly dialogueId: string;
      readonly choiceId: string;
      readonly locationId: string;
    }
  | {
      readonly type: 'boarding.ended';
      readonly outcome: 'player_win' | 'enemy_win' | 'draw';
    };

/** An individual, validated game-domain operation; not an arbitrary state mutation. */
export type CampaignAction =
  | { readonly type: 'credits.grant' | 'credits.take'; readonly amount: number }
  | {
      readonly type: 'cargo.grant' | 'cargo.take';
      readonly resourceId: string;
      readonly quantity: number;
    }
  | { readonly type: 'reputation.change'; readonly factionId: string; readonly delta: number }
  | {
      readonly type: 'component.grant';
      readonly componentType: ShipComponentType;
      readonly componentId: string;
    }
  | {
      readonly type: 'component.install';
      readonly componentUid: string;
      readonly slotIndex: number;
    }
  | { readonly type: 'combat.start'; readonly npcId: string }
  | { readonly type: 'world.location.add'; readonly location: WorldLocation }
  | {
      readonly type: 'world.system.add';
      readonly map: WorldMap;
      readonly entryLocationId: string;
      readonly exitLocationId: string;
    }
  | { readonly type: 'world.system.enter'; readonly systemId: string }
  | { readonly type: 'world.system.return' }
  | { readonly type: 'crew.hire' | 'crew.dismiss'; readonly crewId: string }
  | {
      readonly type: 'crew.assign';
      readonly stationId: string;
      readonly crewId: string | null;
    };

export type CampaignActionResult = 'applied' | 'already_applied' | 'rejected';

export interface CampaignActionPort {
  apply(action: CampaignAction, campaignId?: string): boolean;
  releaseCampaign?(campaignId: string): void;
}

export interface CampaignProgress {
  /** In-memory receipt identifiers scoped to this package; never a standalone save file. */
  readonly appliedActionIds?: readonly string[];
  readonly version: number;
  readonly status: CampaignStatus;
  readonly data: Readonly<Record<string, CampaignValue>>;
  readonly outcome?: string;
}

export interface CampaignContext {
  readonly id: string;
  status(): CampaignStatus;
  start(): boolean;
  complete(outcome: string): boolean;
  get(key: string): CampaignValue | null;
  set(key: string, value: CampaignValue): void;
  applyAction(actionId: string, action: CampaignAction): CampaignActionResult;
}

export interface CampaignDialogueChoice {
  readonly id: string;
  readonly label: string;
}

export interface CampaignDialogue {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
  readonly choices: readonly CampaignDialogueChoice[];
}

export interface CampaignJournalView {
  readonly chapter: string;
  readonly objective: string;
  readonly detail: string;
  readonly targetLocationId?: string;
  readonly dialogue?: CampaignDialogue;
}

export interface CampaignJournalEntry extends CampaignJournalView {
  readonly id: string;
  readonly title: string;
  readonly status: CampaignStatus;
}

export interface CampaignDefinition {
  readonly id: string;
  readonly title: string;
  readonly version: number;
  readonly category?: CampaignCategory;
  readonly defaultEnabled?: boolean;
  readonly description?: string;
  readonly onEvent?: (event: CampaignEvent, campaign: CampaignContext) => void;
  /** Pure projection from campaign progress; UI never owns quest progression. */
  readonly present?: (
    progress: CampaignProgress,
    currentLocationId: string | null
  ) => CampaignJournalView | null;
  /** Converts an earlier package's data, without accessing game services. */
  readonly migrate?: (previous: CampaignProgress) => CampaignProgress;
}

/** Detached in-memory domain snapshot, not a game-save file format. */
export interface CampaignSnapshot {
  readonly snapshotVersion: 1;
  readonly enabled: Readonly<Record<string, boolean>>;
  readonly campaigns: Readonly<Record<string, CampaignProgress>>;
}
