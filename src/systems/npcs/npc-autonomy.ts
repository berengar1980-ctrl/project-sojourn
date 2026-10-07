import type {
  NpcAutonomyPhase,
  NpcAutonomyState,
  NpcEconomyState,
  NpcPersonality,
} from '../../core/economy-types';

const MIN_PHASE_SECONDS = 0.25;

function hashText(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashFraction(id: string, salt: string): number {
  return (hashText(id + ':' + salt) % 10001) / 10000;
}

export function npcPersonalityFromId(id: string): NpcPersonality {
  return {
    riskTolerance: hashFraction(id, 'risk'),
    patience: hashFraction(id, 'patience'),
    profitDrive: hashFraction(id, 'profit'),
    routineBias: hashFraction(id, 'routine'),
  };
}

export function ensureNpcPersonality(npc: NpcEconomyState): NpcPersonality {
  npc.personality ??= npcPersonalityFromId(npc.id);
  return npc.personality;
}

function cargoUnits(npc: NpcEconomyState): number {
  return Object.values(npc.cargo).reduce(
    (sum, value) => sum + Math.max(0, Math.floor(Number(value) || 0)),
    0
  );
}

export function npcAutonomyPhaseDuration(
  npc: NpcEconomyState,
  phase: NpcAutonomyPhase
): number {
  const personality = ensureNpcPersonality(npc);
  const jitter = hashFraction(
    npc.id,
    phase + ':' + (npc.autonomy?.lastLocationId ?? npc.locationId)
  );
  const cargo = cargoUnits(npc);

  if (phase === 'docking') return 4 + jitter * 4;
  if (phase === 'unloading') return 4 + Math.min(8, cargo * 0.18) + jitter * 2;
  if (phase === 'resting') {
    return 8 + personality.patience * 18 + (1 - personality.profitDrive) * 6 + jitter * 4;
  }
  if (phase === 'thinking') {
    return 5 + personality.patience * 14 + (1 - personality.routineBias) * 5 + jitter * 3;
  }
  if (phase === 'loading') return 5 + Math.min(7, cargo * 0.12) + jitter * 3;
  if (phase === 'launch-prep') return 4 + jitter * 4;
  if (phase === 'patrol-rest') {
    return 14 + personality.patience * 20 + (1 - personality.riskTolerance) * 8 + jitter * 6;
  }
  return 0;
}

function activityLabel(phase: NpcAutonomyPhase): string {
  if (phase === 'docking') return 'Andockmanöver';
  if (phase === 'unloading') return 'Entlädt Fracht';
  if (phase === 'resting') return 'Liegezeit';
  if (phase === 'thinking') return 'Prüft Aufträge und Marktinformationen';
  if (phase === 'loading') return 'Belädt Fracht';
  if (phase === 'launch-prep') return 'Startvorbereitung';
  if (phase === 'working') return 'Im Arbeitseinsatz';
  if (phase === 'patrol-rest') return 'Patrouillenpause';
  if (phase === 'ready') return 'Bereit für neuen Auftrag';
  return 'Unterwegs';
}

function applyActivityLabel(npc: NpcEconomyState, phase: NpcAutonomyPhase): void {
  const state = npc as NpcEconomyState & { activityId?: string; activity?: string };
  state.activityId = phase;
  state.activity = activityLabel(phase);
}

export function beginNpcAutonomyPhase(
  npc: NpcEconomyState,
  phase: NpcAutonomyPhase,
  seconds = npcAutonomyPhaseDuration(npc, phase)
): NpcAutonomyState {
  const autonomy = ensureNpcAutonomy(npc);
  autonomy.phase = phase;
  autonomy.secondsRemaining = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  applyActivityLabel(npc, phase);
  return autonomy;
}

export function ensureNpcAutonomy(npc: NpcEconomyState): NpcAutonomyState {
  if (!npc.autonomy) {
    ensureNpcPersonality(npc);
    const initialPhase: NpcAutonomyPhase = npc.role === 'patrol' ? 'patrol-rest' : 'resting';
    npc.autonomy = {
      phase: initialPhase,
      secondsRemaining: 0,
      lastLocationId: npc.locationId,
      wasTravelling: false,
    };
    npc.autonomy.secondsRemaining = npcAutonomyPhaseDuration(npc, initialPhase);
    applyActivityLabel(npc, initialPhase);
  }
  return npc.autonomy;
}

export function advanceNpcAutonomyTimer(npc: NpcEconomyState, deltaSeconds: number): boolean {
  const autonomy = ensureNpcAutonomy(npc);
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return false;
  if (autonomy.secondsRemaining <= 0) return true;
  autonomy.secondsRemaining = Math.max(0, autonomy.secondsRemaining - deltaSeconds);
  return autonomy.secondsRemaining <= MIN_PHASE_SECONDS;
}

export function clearNpcPendingTravel(npc: NpcEconomyState): void {
  const autonomy = ensureNpcAutonomy(npc);
  delete autonomy.pendingDestinationId;
  delete autonomy.pendingReason;
  delete autonomy.pendingTrade;
}

export function scheduleNpcTravel(
  npc: NpcEconomyState,
  destinationId: string,
  reason: string
): void {
  const autonomy = ensureNpcAutonomy(npc);
  autonomy.pendingDestinationId = destinationId;
  autonomy.pendingReason = reason;
  beginNpcAutonomyPhase(npc, 'launch-prep');
}

export function markNpcTravelStarted(npc: NpcEconomyState): void {
  const autonomy = ensureNpcAutonomy(npc);
  autonomy.wasTravelling = true;
  autonomy.phase = 'travel';
  autonomy.secondsRemaining = 0;
  applyActivityLabel(npc, 'travel');
}

export function markNpcArrival(npc: NpcEconomyState): void {
  const autonomy = ensureNpcAutonomy(npc);
  autonomy.wasTravelling = false;
  autonomy.lastLocationId = npc.locationId;
  delete autonomy.pendingDestinationId;
  delete autonomy.pendingReason;
  delete autonomy.pendingTrade;
  beginNpcAutonomyPhase(npc, 'docking');
}

export function npcDecisionThreshold(npc: NpcEconomyState): number {
  const personality = ensureNpcPersonality(npc);
  return 0.45 + personality.patience * 0.35 - personality.profitDrive * 0.2;
}

export function npcPersonalityTradeWeight(
  npc: NpcEconomyState,
  profit: number,
  distance: number,
  intelAgeDays: number,
  destinationId: string
): number {
  const personality = ensureNpcPersonality(npc);
  const profitWeight = 0.7 + personality.profitDrive * 0.9;
  const distancePenalty = Math.max(0, distance) * (0.004 + (1 - personality.riskTolerance) * 0.009);
  const stalePenalty = Math.max(0, intelAgeDays) * (4 + personality.patience * 8);
  const routineBonus =
    npc.autonomy?.lastTradeDestinationId === destinationId
      ? Math.max(0, profit) * personality.routineBias * 0.18
      : 0;
  const preferredMarketBonus =
    personality.preferredMarketId === destinationId
      ? Math.max(0, profit) * (0.05 + personality.routineBias * 0.12)
      : 0;
  return (
    profit * profitWeight +
    routineBonus +
    preferredMarketBonus -
    distancePenalty -
    stalePenalty
  );
}
