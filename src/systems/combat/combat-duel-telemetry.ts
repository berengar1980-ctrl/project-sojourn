import type {
  CombatLogEntry,
  StrategicCombatArenaOptions,
  StrategicCombatantSetup,
  StrategicCombatSide,
} from './strategic-combat-types';
import { createStrategicCombatService } from './strategic-combat-service';

export interface DuelAnalysisInput {
  readonly name: string;
  readonly seed: number;
  readonly attacker: StrategicCombatantSetup;
  readonly defender: StrategicCombatantSetup;
  readonly arena: StrategicCombatArenaOptions;
  readonly maximumSeconds?: number;
}
export interface DuelTelemetry {
  readonly name: string;
  readonly seed: number;
  readonly durationSeconds: number;
  readonly winner: StrategicCombatSide | null;
  readonly timedOut: boolean;
  readonly exchanges: number;
  readonly planChanges: number;
  readonly shieldHits: number;
  readonly hullHits: number;
  readonly subsystemHits: number;
  readonly subsystemFailures: number;
  readonly obstacleEvents: number;
  readonly reactions: Readonly<Record<string, number>>;
  readonly minimumSeparation: number;
  readonly maximumSeparation: number;
  readonly finalShields: readonly [number, number];
  readonly finalHulls: readonly [number, number];
  readonly log: readonly CombatLogEntry[];
}
export const DUEL_ANALYSIS_STEP = 0.08;
export const DUEL_TARGET_MIN_SECONDS = 45;
export const DUEL_TARGET_MAX_SECONDS = 60;

/** Fixed-step replay, isolated from browser frame rates. Never alters combat balance. */
export function analyzeReproducibleDuel(input: DuelAnalysisInput): DuelTelemetry {
  const combat = createStrategicCombatService(
    input.attacker,
    input.defender,
    input.seed,
    input.arena
  );
  const limit = input.maximumSeconds ?? 90;
  const steps = Math.ceil(limit / DUEL_ANALYSIS_STEP);
  let closest = Infinity;
  let farthest = 0;
  for (let index = 0; index < steps; index += 1) {
    const frame = combat.getSnapshot();
    const separation = Math.hypot(
      frame.attacker.position.x - frame.defender.position.x,
      frame.attacker.position.y - frame.defender.position.y
    );
    closest = Math.min(closest, separation);
    farthest = Math.max(farthest, separation);
    if (frame.winner || frame.elapsedSeconds + DUEL_ANALYSIS_STEP > limit + 0.00001) break;
    combat.tick(DUEL_ANALYSIS_STEP);
  }
  const final = combat.getSnapshot();
  const reactions: Record<string, number> = {};
  const log = combat.getCombatLog();
  for (const entry of log) {
    if (!entry.detail.startsWith('REACTIVE_')) continue;
    const kind = entry.detail.split(' ')[0]!;
    reactions[kind] = (reactions[kind] ?? 0) + 1;
  }
  return {
    name: input.name,
    seed: input.seed,
    durationSeconds: Number(final.elapsedSeconds.toFixed(2)),
    winner: final.winner,
    timedOut: final.winner === null,
    planChanges: log.filter((entry) => entry.event === 'plan').length,
    shieldHits: log.filter((entry) => entry.event === 'impact' && entry.detail.startsWith('shield')).length,
    hullHits: log.filter((entry) => entry.event === 'impact' && entry.detail.startsWith('hull')).length,
    subsystemHits: log.filter((entry) => entry.event === 'impact' && /engine|tractor/.test(entry.detail)).length,
    subsystemFailures: log.filter((entry) => entry.event === 'phase' && entry.detail.includes('ausgefallen')).length,
    obstacleEvents: log.filter((entry) => /Hindernis|Asteroid|Kollision/.test(entry.detail)).length,
    exchanges: log.filter(
      (entry) => entry.event === 'result' && entry.detail.startsWith('EXCHANGE_OUTCOME')
    ).length,
    reactions,
    minimumSeparation: Number(closest.toFixed(1)),
    maximumSeparation: Number(farthest.toFixed(1)),
    finalShields: [final.attacker.shieldHp, final.defender.shieldHp],
    finalHulls: [final.attacker.hullHp, final.defender.hullHp],
    log,
  };
}

export function formatDuelTelemetry(result: DuelTelemetry): string {
  const range =
    result.durationSeconds >= DUEL_TARGET_MIN_SECONDS &&
    result.durationSeconds <= DUEL_TARGET_MAX_SECONDS
      ? 'within target'
      : 'outside target';
  const summary = [
    '# ' + result.name,
    'Seed: ' + result.seed,
    'Duration: ' + result.durationSeconds + ' s (' + range + ')',
    'Winner: ' + (result.winner ?? 'none / time limit'),
    'Exchanges: ' + result.exchanges,
    'Plan changes: ' + result.planChanges,
    'Shield hits: ' + result.shieldHits,
    'Hull hits: ' + result.hullHits,
    'Subsystem hits: ' + result.subsystemHits,
    'Subsystem failure alerts: ' + result.subsystemFailures,
    'Obstacle / collision events: ' + result.obstacleEvents,
    'Range: ' + result.minimumSeparation + '–' + result.maximumSeparation + ' m',
    'Reactions: ' + JSON.stringify(result.reactions),
    'Final shields: ' + result.finalShields.join(' / '),
    'Final hulls: ' + result.finalHulls.join(' / '),
    '',
    '## Timestamped events',
    ...result.log.map(
      (entry) =>
        '[' +
        entry.timeSeconds.toFixed(2) +
        's] ' +
        entry.side +
        ' ' +
        entry.event +
        ': ' +
        entry.detail
    ),
  ];
  return summary.join('\n');
}
