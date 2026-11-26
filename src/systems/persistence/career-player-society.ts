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

function validSmugglingValues(value: Record<string, unknown>): boolean {
  return (
    typeof value.hiddenHoldIntel === 'boolean' &&
    typeof value.hiddenHoldIntelContacted === 'boolean' &&
    typeof value.suspicion === 'number' &&
    Number.isFinite(value.suspicion) &&
    value.suspicion >= 0 &&
    value.suspicion <= 100 &&
    typeof value.totalProtectionFees === 'number' &&
    Number.isFinite(value.totalProtectionFees) &&
    value.totalProtectionFees >= 0 &&
    (value.protectionFaction === undefined ||
      ['pirates', 'pirates2'].includes(value.protectionFaction as string))
  );
}

function validSmugglingHolds(
  holds: Record<string, unknown>,
  shipIds: ReadonlySet<string>
): boolean {
  return Object.entries(holds).every(
    ([id, hold]) =>
      shipIds.has(id) && record(hold) && hold.shipId === id && typeof hold.installedAt === 'string'
  );
}

function validSmugglingInspection(value: unknown): boolean {
  if (value === null) return true;
  if (!record(value)) return false;
  return (
    ['harbor', 'patrol'].includes(value.source as string) &&
    typeof value.locationId === 'string' &&
    ['request', 'result'].includes(value.stage as string) &&
    typeof value.papersTried === 'boolean' &&
    typeof value.bribeTried === 'boolean' &&
    typeof value.strength === 'number' &&
    Number.isFinite(value.strength)
  );
}

function validSmuggling(value: unknown, shipIds: ReadonlySet<string>): boolean {
  return (
    record(value) &&
    record(value.holds) &&
    validSmugglingValues(value) &&
    validSmugglingHolds(value.holds, shipIds) &&
    validSmugglingInspection(value.inspection)
  );
}

export function stageCareerPlayerSociety(
  candidate: unknown,
  player: PlayerEconomyState,
  npcs: readonly SectorNpcState[],
  shipIds: readonly string[],
  factionIds: readonly string[],
  recordLoss?: (resourceId: string, amount: number) => void
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
  const smuggling = createSmugglingService(player, npcs, recordLoss);
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
