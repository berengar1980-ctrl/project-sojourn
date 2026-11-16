import type { SectorNpcState } from '../../core/npc-types';
import type { WorldMap } from '../../core/world-types';
import type { BlockadeOptions, BlockadeOrder } from './blockade-service';
import type { PatrolAssignment } from './patrol-career-service';
import { cloneCareerJson } from '../persistence/career-save-contract';

export interface CareerBlockadeCheckpoint {
  readonly version: 1;
  readonly sequence: number;
  readonly day: number;
  readonly orders: readonly BlockadeOrder[];
  readonly houseAlarm: Readonly<Record<string, number>>;
}

export interface CareerPatrolCheckpoint {
  readonly version: 1;
  readonly sequence: number;
  readonly mandate: boolean;
  readonly reputation: number;
  readonly completed: number;
  readonly day: number;
  readonly assignments: readonly PatrolAssignment[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function count(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function validBlockadeOrder(value: unknown, options: BlockadeOptions): boolean {
  if (!record(value) || !Array.isArray(value.pirateIds)) return false;
  const pirates = options.sector.npcs.filter((npc) => value.pirateIds.includes(npc.id));
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.ownerId !== 'string' ||
    !value.ownerId ||
    !options.markets.getEntry(value.locationId as string, value.resourceId as string) ||
    !count(value.duration) ||
    !count(value.fee) ||
    !count(value.orderedDay) ||
    !count(value.removedStock) ||
    !['assembling', 'active', 'completed', 'defeated', 'cancelled'].includes(value.phase as string)
  ) {
    return false;
  }
  if (value.startedDay !== null && !count(value.startedDay)) return false;
  if (value.startPrice !== null && !count(value.startPrice)) return false;
  return (
    value.pirateIds.length > 0 &&
    value.pirateIds.length <= 3 &&
    new Set(value.pirateIds).size === value.pirateIds.length &&
    pirates.length === value.pirateIds.length &&
    pirates.every((npc) => npc.pirate) &&
    (value.ownerId === 'player' ||
      options.sector.npcs.some((npc) => npc.id === value.ownerId))
  );
}

/** Keep orders and recorded stock losses without charging owners or raiding again. */
export function stageCareerBlockades(
  candidate: unknown,
  options: BlockadeOptions
): CareerBlockadeCheckpoint {
  const saved = cloneCareerJson(candidate);
  if (
    !record(saved) ||
    saved.version !== 1 ||
    !count(saved.sequence) ||
    !count(saved.day) ||
    !Array.isArray(saved.orders) ||
    saved.orders.length > 10000 ||
    !record(saved.houseAlarm) ||
    !Object.values(saved.houseAlarm).every(count)
  ) {
    throw new Error('Invalid blockade checkpoint');
  }
  const ids = new Set<string>();
  for (const order of saved.orders) {
    if (!validBlockadeOrder(order, options) || ids.has(order.id)) {
      throw new Error('Invalid or duplicate saved blockade order');
    }
    ids.add(order.id);
  }
  return saved as unknown as CareerBlockadeCheckpoint;
}

function validPatrolAssignment(value: unknown, world: WorldMap, npcs: readonly SectorNpcState[]): boolean {
  if (!record(value) || !Array.isArray(value.visited)) return false;
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    !['route', 'bounty'].includes(value.kind as string) ||
    !['active', 'completed', 'failed', 'paid'].includes(value.status as string) ||
    !count(value.reward) ||
    !count(value.acceptedDay) ||
    !count(value.deadline) ||
    !Number.isFinite(value.clearSeconds) ||
    (value.clearSeconds as number) < 0 ||
    value.deadline < value.acceptedDay ||
    !value.visited.every((id: unknown) => world.locations.some((loc) => loc.id === id))
  ) {
    return false;
  }
  return value.kind === 'route'
    ? world.locations.some((loc) => loc.id === value.targetId)
    : npcs.some((npc) => npc.id === value.targetId && npc.pirate);
}

export function stageCareerPatrol(
  candidate: unknown,
  world: WorldMap,
  npcs: readonly SectorNpcState[]
): CareerPatrolCheckpoint {
  const saved = cloneCareerJson(candidate);
  if (
    !record(saved) ||
    saved.version !== 1 ||
    !count(saved.sequence) ||
    !count(saved.day) ||
    !count(saved.completed) ||
    typeof saved.mandate !== 'boolean' ||
    !Number.isFinite(saved.reputation) ||
    (saved.reputation as number) < -100 ||
    (saved.reputation as number) > 100 ||
    !Array.isArray(saved.assignments) ||
    saved.assignments.length > 10000
  ) {
    throw new Error('Invalid patrol career checkpoint');
  }
  const ids = new Set<string>();
  for (const job of saved.assignments) {
    if (!validPatrolAssignment(job, world, npcs) || ids.has(job.id)) {
      throw new Error('Invalid or duplicate patrol assignment');
    }
    ids.add(job.id);
  }
  return saved as unknown as CareerPatrolCheckpoint;
}
