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
      readonly componentType: import('./ship-types').ShipComponentType;
      readonly componentId: string;
    }
  | {
      readonly type: 'component.install';
      readonly componentUid: string;
      readonly slotIndex: number;
    }
  | { readonly type: 'combat.start'; readonly npcId: string }
  | { readonly type: 'crew.hire' | 'crew.dismiss'; readonly crewId: string }
  | {
      readonly type: 'crew.assign';
      readonly stationId: string;
      readonly crewId: string | null;
    };

export type CampaignActionResult = 'applied' | 'already_applied' | 'rejected';

export interface CampaignActionPort {
  apply(action: CampaignAction): boolean;
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

export interface CampaignDefinition {
  readonly id: string;
  readonly title: string;
  readonly version: number;
  readonly category?: CampaignCategory;
  readonly defaultEnabled?: boolean;
  readonly onEvent?: (event: CampaignEvent, campaign: CampaignContext) => void;
  /** Converts an earlier package's data, without accessing game services. */
  readonly migrate?: (previous: CampaignProgress) => CampaignProgress;
}

/** Detached in-memory domain snapshot, not a game-save file format. */
export interface CampaignSnapshot {
  readonly snapshotVersion: 1;
  readonly enabled: Readonly<Record<string, boolean>>;
  readonly campaigns: Readonly<Record<string, CampaignProgress>>;
}
