import type { CombatLogEntry, StrategicCombatSide } from './strategic-combat-types';

export interface CombatLogAnalysis {
  readonly durationSeconds: number;
  readonly winner: string | null;
  readonly plans: Readonly<Record<StrategicCombatSide, number>>;
  readonly phaseChanges: Readonly<Record<StrategicCombatSide, number>>;
  readonly hits: Readonly<Record<StrategicCombatSide, number>>;
  readonly shieldHits: number;
  readonly hullHits: number;
  readonly totalDamage: number;
}

export function analyzeCombatLog(events: readonly CombatLogEntry[]): CombatLogAnalysis {
  const plans = { attacker: 0, defender: 0 };
  const phaseChanges = { attacker: 0, defender: 0 };
  const hits = { attacker: 0, defender: 0 };
  let shieldHits = 0;
  let hullHits = 0;
  let totalDamage = 0;
  let winner: string | null = null;
  for (const event of events) {
    if (event.event === 'result') winner = event.detail;
    if (event.side === 'system') continue;
    if (event.event === 'plan') plans[event.side] += 1;
    if (event.event === 'phase') phaseChanges[event.side] += 1;
    if (event.event !== 'impact') continue;
    hits[event.side] += 1;
    if (event.detail.startsWith('shield')) shieldHits += 1;
    if (event.detail.startsWith('hull')) hullHits += 1;
    const match = /([\d.]+) HP/.exec(event.detail);
    if (match) totalDamage += Number(match[1]);
  }
  return {
    durationSeconds: events.at(-1)?.timeSeconds ?? 0,
    winner,
    plans,
    phaseChanges,
    hits,
    shieldHits,
    hullHits,
    totalDamage,
  };
}
