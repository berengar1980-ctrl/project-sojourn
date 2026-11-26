import type { SectorNpcState } from '../../core/npc-types';
import { isIllegalResource } from '../../data/economy/economy-resources';
import type { NpcSectorService } from '../npcs/npc-sector-service';
import {
  resolveNpcSmugglingInspection,
  smugglingInspectorStrength,
} from './npc-smuggling-inspection';

export {
  npcSmugglingScan,
  resolveNpcSmugglingInspection,
  smugglingInspectorStrength,
} from './npc-smuggling-inspection';

export interface NpcSmugglingStats {
  inspections: number;
  cleanInspections: number;
  confiscatedUnits: number;
  finesPaid: number;
  escaped: number;
  resisted: number;
  illegalUnitsSold: number;
  protectionFees: number;
}

interface Runtime {
  readonly npcs: readonly SectorNpcState[];
  readonly sector: Pick<NpcSectorService, 'livePosition'>;
  readonly log: (message: string) => void;
  readonly random: () => number;
  readonly stats: NpcSmugglingStats;
  readonly recordLoss: (resourceId: string, amount: number) => void;
  day: number;
}

export interface NpcSmugglingService {
  readonly stats: NpcSmugglingStats;
  tick(deltaSeconds: number): void;
  advanceDay(day: number): void;
  recordSale(npc: SectorNpcState, resourceId: string, quantity: number, gross: number): void;
}

function inspect(
  ctx: Runtime,
  target: SectorNpcState,
  patrol: SectorNpcState | null,
  strength: number
): void {
  const beforeSeized = target.smugglingConfiscated ?? 0;
  const beforeFines = target.smugglingFinesPaid ?? 0;
  const cargoBefore = { ...target.cargo };
  const result = resolveNpcSmugglingInspection(target, patrol, strength, ctx.random);
  if (result === 'seized') {
    for (const [id, amount] of Object.entries(cargoBefore)) {
      const lost = amount - (target.cargo[id] ?? 0);
      if (lost > 0) ctx.recordLoss(id, lost);
    }
  }
  target.smugglingInspectionCooldownSeconds = result === 'clear' ? 12 : 24;
  ctx.stats.inspections++;
  ctx.stats.confiscatedUnits += (target.smugglingConfiscated ?? 0) - beforeSeized;
  ctx.stats.finesPaid += (target.smugglingFinesPaid ?? 0) - beforeFines;
  if (result === 'clear') ctx.stats.cleanInspections++;
  if (result === 'escaped') ctx.stats.escaped++;
  if (result === 'resisted') ctx.stats.resisted++;
  if (result !== 'clear') {
    ctx.log('SEKTOR-ZOLL > ' + target.name.toUpperCase() + ' · ' + target.activity.toUpperCase());
  }
}

function harborStrength(id: string): number {
  if (id === 'blackjaw-outpost' || id === 'gallows-anchor') return 0;
  return id === 'haven' || id === 'karth-industrial' || id === 'vigil-station' ? 0.76 : 0.48;
}

function checkHarborArrival(ctx: Runtime, target: SectorNpcState): void {
  const at = target.travel || target.combatMovement ? '' : target.locationId;
  const previous = target.smugglingLastArrivalId;
  if (!at) {
    target.smugglingLastArrivalId = '';
    return;
  }
  if (previous === at) return;
  target.smugglingLastArrivalId = at;
  const strength = harborStrength(at);
  const chance = 0.05 + strength * 0.38 + (target.smugglingSuspicion ?? 0) * 0.0035;
  if (strength > 0 && ctx.random() < chance) inspect(ctx, target, null, strength);
}

function nearestPatrol(
  ctx: Runtime,
  target: SectorNpcState,
  patrols: readonly SectorNpcState[]
): SectorNpcState | null {
  const position = ctx.sector.livePosition(target);
  return (
    patrols
      .map((patrol) => ({
        patrol,
        distance: Math.hypot(
          ctx.sector.livePosition(patrol).x - position.x,
          ctx.sector.livePosition(patrol).y - position.y
        ),
      }))
      .filter((result) => result.distance <= 650)
      .sort((a, b) => a.distance - b.distance)[0]?.patrol ?? null
  );
}

function checkPatrol(
  ctx: Runtime,
  target: SectorNpcState,
  patrols: readonly SectorNpcState[],
  dt: number
): void {
  if (!target.travel || target.combatMovement) return;
  const elapsed = (target.smugglingPatrolElapsedSeconds ?? 0) + dt;
  if (elapsed < 4) {
    target.smugglingPatrolElapsedSeconds = elapsed;
    return;
  }
  target.smugglingPatrolElapsedSeconds = 0;
  const patrol = nearestPatrol(ctx, target, patrols);
  const inspectionChance = 0.07 + (target.smugglingSuspicion ?? 0) * 0.003;
  if (patrol && ctx.random() < inspectionChance) {
    inspect(ctx, target, patrol, smugglingInspectorStrength(patrol));
  }
}

function tickSmuggling(ctx: Runtime, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const patrols = ctx.npcs.filter(
    (npc) => npc.job === 'patrol' && !npc.combatMovement && npc.hullHp > 0
  );
  for (const target of ctx.npcs) {
    if (!target.smuggler || target.pirate || target.hullHp <= 0) continue;
    target.smugglingInspectionCooldownSeconds = Math.max(
      0,
      (target.smugglingInspectionCooldownSeconds ?? 0) - dt
    );
    if (target.smugglingInspectionCooldownSeconds > 0) continue;
    checkHarborArrival(ctx, target);
    checkPatrol(ctx, target, patrols, dt);
  }
}

function settleProtectionFee(ctx: Runtime, npc: SectorNpcState, gross: number): void {
  if (!npc.smugglingProtectionFaction) return;
  const fee = Math.max(0, Math.round(gross * 0.05));
  npc.credits = Math.max(0, npc.credits - fee);
  npc.smugglingProtectionFees = (npc.smugglingProtectionFees ?? 0) + fee;
  ctx.stats.protectionFees += fee;
  const fleet = ctx.npcs.filter(
    (pirate) => pirate.pirate && pirate.factionId === npc.smugglingProtectionFaction
  );
  if (fleet.length === 0) return;
  const distributed = Math.round(fee * 0.65);
  fleet.forEach((pirate, index) => {
    pirate.credits +=
      Math.floor(distributed / fleet.length) + (index < distributed % fleet.length ? 1 : 0);
  });
}

export function createNpcSmugglingService(
  npcs: readonly SectorNpcState[],
  sector: Pick<NpcSectorService, 'livePosition'>,
  log: (message: string) => void = () => {},
  random: () => number = Math.random,
  initialDay = 0,
  recordLoss: (resourceId: string, amount: number) => void = () => {}
): NpcSmugglingService {
  const ctx: Runtime = {
    npcs,
    sector,
    log,
    random,
    recordLoss,
    stats: {
      inspections: 0,
      cleanInspections: 0,
      confiscatedUnits: 0,
      finesPaid: 0,
      escaped: 0,
      resisted: 0,
      illegalUnitsSold: 0,
      protectionFees: 0,
    },
    day: Math.max(0, Math.floor(initialDay)),
  };
  return {
    stats: ctx.stats,
    advanceDay(nextDay) {
      const days = Math.max(0, Math.floor(nextDay) - ctx.day);
      if (days === 0) return;
      ctx.day += days;
      for (const npc of ctx.npcs) {
        npc.smugglingSuspicion = Math.max(0, (npc.smugglingSuspicion ?? 0) - days * 0.5);
      }
    },
    recordSale(npc, resourceId, quantity, gross) {
      if (!npc.smuggler || !isIllegalResource(resourceId) || quantity <= 0) return;
      ctx.stats.illegalUnitsSold += quantity;
      npc.smugglingSuspicion = Math.min(100, (npc.smugglingSuspicion ?? 0) + 2);
      settleProtectionFee(ctx, npc, gross);
    },
    tick(dt) {
      tickSmuggling(ctx, dt);
    },
  };
}
