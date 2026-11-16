import type { PlayerEconomyState } from '../../core/economy-types';
import type { SectorNpcState } from '../../core/npc-types';
import {
  createSmugglingService,
  type SmugglingService,
  type SmugglingState,
} from '../economy/smuggling-service';
import {
  createTradeCharterService,
  type TradeCharterId,
  type TradeCharterService,
} from '../economy/trade-charter-service';
import {
  createFactionReputationService,
  type FactionReputationService,
  type FactionReputationSnapshot,
} from '../reputation/faction-reputation-service';
import { cloneCareerJson } from './career-save-contract';

export interface CareerPlayerSocietyCheckpoint {
  readonly version: 1;
  readonly charter: TradeCharterId | null;
  readonly smuggling: SmugglingState;
  readonly reputation: FactionReputationSnapshot;
}

export interface StagedCareerPlayerSociety {
  readonly charter: TradeCharterService;
  readonly smuggling: SmugglingService;
  readonly reputation: FactionReputationService;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validSmuggling(value: unknown, shipIds: ReadonlySet<string>): boolean {
  if (!record(value) || !record(value.holds)) return false;
  if (
    typeof value.hiddenHoldIntel !== 'boolean' ||
    typeof value.hiddenHoldIntelContacted !== 'boolean' ||
    typeof value.suspicion !== 'number' ||
    !Number.isFinite(value.suspicion) ||
    value.suspicion < 0 ||
    value.suspicion > 100 ||
    typeof value.totalProtectionFees !== 'number' ||
    !Number.isFinite(value.totalProtectionFees) ||
    value.totalProtectionFees < 0
  ) return false;
  if (
    value.protectionFaction !== undefined &&
    !['pirates', 'pirates2'].includes(value.protectionFaction as string)
  ) return false;
  for (const [id, hold] of Object.entries(value.holds)) {
    if (
      !shipIds.has(id) ||
      !record(hold) ||
      hold.shipId !== id ||
      typeof hold.installedAt !== 'string'
    ) return false;
  }
  if (value.inspection !== null) {
    const inspection = value.inspection;
    if (
      !record(inspection) ||
      !['harbor', 'patrol'].includes(inspection.source as string) ||
      typeof inspection.locationId !== 'string' ||
      !['request', 'result'].includes(inspection.stage as string) ||
      typeof inspection.papersTried !== 'boolean' ||
      typeof inspection.bribeTried !== 'boolean' ||
      typeof inspection.strength !== 'number' ||
      !Number.isFinite(inspection.strength)
    ) return false;
  }
  return true;
}

export function stageCareerPlayerSociety(
  candidate: unknown,
  player: PlayerEconomyState,
  npcs: readonly SectorNpcState[],
  shipIds: readonly string[],
  factionIds: readonly string[]
): StagedCareerPlayerSociety {
  const saved = cloneCareerJson(candidate);
  if (
    !record(saved) ||
    saved.version !== 1 ||
    ![null, 'independent', 'veylan', 'mercator'].includes(saved.charter as string | null) ||
    !validSmuggling(saved.smuggling, new Set(shipIds))
  ) {
    throw new Error('Invalid career smuggling or trade charter checkpoint');
  }
  const charter = createTradeCharterService(player, saved.charter as TradeCharterId | null);
  const smuggling = createSmugglingService(player, npcs);
  Object.assign(smuggling.state, saved.smuggling as SmugglingState);
  const reputation = createFactionReputationService(
    factionIds,
    saved.reputation as FactionReputationSnapshot
  );
  return { charter, smuggling, reputation };
}

export function captureCareerPlayerSociety(
  state: StagedCareerPlayerSociety
): CareerPlayerSocietyCheckpoint {
  return cloneCareerJson({
    version: 1 as const,
    charter: state.charter.active,
    smuggling: state.smuggling.state,
    reputation: state.reputation.snapshot(),
  });
}
