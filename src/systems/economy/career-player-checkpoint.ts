import type { EconomyResourceDefinition, PlayerEconomyState } from '../../core/economy-types';
import type { EconomyMarketService } from './market-service';
import { createPlayerTradeService, type PlayerTradeService } from './player-trade-service';

export interface CareerPlayerCargoCheckpoint {
  readonly qty: number;
  readonly totalCost: number;
  readonly hiddenQty: number;
  readonly lastOriginId?: string;
}

export interface CareerPlayerCheckpoint {
  readonly version: 1;
  readonly credits: number;
  readonly reservedCargoTons: number;
  readonly smugglingNormalPenalty: number;
  readonly cargo: Readonly<Record<string, CareerPlayerCargoCheckpoint>>;
}

const PLAYER_KEYS = new Set([
  'version',
  'credits',
  'reservedCargoTons',
  'smugglingNormalPenalty',
  'cargo',
]);

const nonnegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function ownRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Capture detached player economy authority, including cargo cost basis and hidden tons. */
export function captureCareerPlayer(player: PlayerEconomyState): CareerPlayerCheckpoint {
  const cargo: Record<string, CareerPlayerCargoCheckpoint> = Object.create(null);
  for (const [id, lot] of Object.entries(player.cargo)) {
    cargo[id] = {
      qty: lot.qty,
      totalCost: lot.totalCost,
      hiddenQty: lot.hiddenQty ?? 0,
      ...(lot.lastOriginId === undefined ? {} : { lastOriginId: lot.lastOriginId }),
    };
  }
  return {
    version: 1,
    credits: player.credits,
    reservedCargoTons: player.reservedCargoTons ?? 0,
    smugglingNormalPenalty: player.smugglingNormalPenalty ?? 0,
    cargo,
  };
}

function assertPlayerCheckpoint(checkpoint: CareerPlayerCheckpoint): void {
  if (
    !ownRecord(checkpoint) ||
    checkpoint.version !== 1 ||
    !nonnegativeInteger(checkpoint.credits) ||
    !nonnegativeInteger(checkpoint.reservedCargoTons) ||
    !nonnegativeInteger(checkpoint.smugglingNormalPenalty) ||
    !ownRecord(checkpoint.cargo) ||
    Object.keys(checkpoint).some((key) => !PLAYER_KEYS.has(key))
  ) {
    throw new Error('Invalid career player checkpoint');
  }
}

/** Physical cargo can originate outside a market, including an expired salvage event. */
function validCargoOrigin(
  originId: unknown,
  markets: EconomyMarketService,
  worldLocationIds?: ReadonlySet<string>
): boolean {
  if (typeof originId !== 'string') return false;
  if (markets.getMarket(originId)) return true;
  if (!worldLocationIds) return false;
  return worldLocationIds.has(originId) || /^salvage-(special|distress)-\d+-\d+$/.test(originId);
}

function assertPlayerCargo(
  resourceId: string,
  value: CareerPlayerCargoCheckpoint,
  resourceIds: ReadonlySet<string>,
  markets: EconomyMarketService,
  worldLocationIds?: ReadonlySet<string>
): void {
  if (
    !resourceIds.has(resourceId) ||
    !ownRecord(value) ||
    !nonnegativeInteger(value.qty) ||
    value.qty === 0 ||
    !nonnegativeInteger(value.hiddenQty) ||
    value.hiddenQty > value.qty ||
    typeof value.totalCost !== 'number' ||
    !Number.isFinite(value.totalCost) ||
    value.totalCost < 0 ||
    (value.lastOriginId !== undefined &&
      !validCargoOrigin(value.lastOriginId, markets, worldLocationIds)) ||
    Object.keys(value).some(
      (key) => !['qty', 'hiddenQty', 'totalCost', 'lastOriginId'].includes(key)
    )
  ) {
    throw new Error('Invalid career player cargo');
  }
}

/** Validate all cargo before constructing a new player authority; never modify the active player. */
export function stageCareerPlayer(
  checkpoint: CareerPlayerCheckpoint,
  markets: EconomyMarketService,
  resources: readonly EconomyResourceDefinition[],
  worldLocationIds?: ReadonlySet<string>
): PlayerTradeService {
  assertPlayerCheckpoint(checkpoint);
  const resourceIds = new Set(resources.map((resource) => resource.id));
  if (resourceIds.size !== resources.length) throw new Error('Duplicate resource definitions');
  const cargo: PlayerEconomyState['cargo'] = Object.create(null) as PlayerEconomyState['cargo'];
  for (const [resourceId, value] of Object.entries(checkpoint.cargo)) {
    assertPlayerCargo(resourceId, value, resourceIds, markets, worldLocationIds);
    cargo[resourceId] = {
      qty: value.qty,
      totalCost: value.totalCost,
      ...(value.hiddenQty ? { hiddenQty: value.hiddenQty } : {}),
      ...(value.lastOriginId === undefined ? {} : { lastOriginId: value.lastOriginId }),
    };
  }
  const service = createPlayerTradeService(markets, checkpoint.credits);
  service.player.reservedCargoTons = checkpoint.reservedCargoTons;
  service.player.smugglingNormalPenalty = checkpoint.smugglingNormalPenalty;
  Object.assign(service.player.cargo, cargo);
  return service;
}
