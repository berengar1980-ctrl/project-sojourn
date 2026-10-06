import type {
  LocalAsteroid,
  MiningEventChoice,
  MiningEventResolution,
  MiningEventState,
  MiningEventType,
} from '../../core/local-space-types';
import { miningResourceById } from '../../data/resources/mining-resources';
import { resolveMiningEventEffect, type MiningEventEffect } from './mining-event-outcomes';

const EVENT_RATE = 0.42;

export interface MiningEventDepositResult {
  readonly lostTons: number;
  readonly bonusTons: number;
  readonly bonusResourceName: string;
}

interface MiningEventSession {
  readonly initialOre: number;
  readonly triggerProgress: number;
  readonly scheduled: boolean;
  readonly primaryResourceId: string;
  readonly type: MiningEventType;
  readonly rolls: readonly number[];
  readonly id: string;
  triggered: boolean;
}

function createRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function totalOre(asteroid: LocalAsteroid): number {
  return asteroid.deposits.reduce((sum, deposit) => sum + Math.max(0, deposit.oreRemaining), 0);
}

function primaryResource(asteroid: LocalAsteroid): string {
  const deposit = [...asteroid.deposits].sort((a, b) => b.oreRemaining - a.oreRemaining)[0];
  return deposit?.resourceId ?? 'ferrite';
}

function eventType(roll: number): MiningEventType {
  const weighted: readonly [MiningEventType, number][] = [
    ['unstable', 18],
    ['machine', 18],
    ['rich', 19],
    ['cavity', 14],
    ['rare', 13],
    ['deeper', 10],
  ];
  const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = Math.max(0, Math.min(0.999999, roll)) * total;
  for (const [type, weight] of weighted) {
    cursor -= weight;
    if (cursor < 0) return type;
  }
  return 'deeper';
}

function eventTitle(type: MiningEventType): string {
  return {
    unstable: 'Instabile Gesteinsmatrix',
    machine: 'Förderkopf blockiert',
    rich: 'Ungewöhnlich dichte Ader',
    cavity: 'Hohlraum hinter der Ader',
    rare: 'Seltene Einschlüsse',
    deeper: 'Tiefere Signatur',
  }[type];
}

function eventDescription(type: MiningEventType): string {
  return {
    unstable:
      'Spannungsrisse laufen durch den Asteroiden. Ein aggressiver Schnitt kann Material freilegen oder die Matrix kollabieren lassen.',
    machine:
      'Eine Lastspitze hat den Förderkopf blockiert. Eine saubere Reparatur kostet Zeit; eine Überbrückung belastet die Anlage.',
    rich: 'Die Spektralanalyse meldet eine deutlich dichtere Zone direkt neben der aktuellen Schnittlinie.',
    cavity:
      'Hinter der Hauptader öffnet sich ein Hohlraum. Die Sensoren liefern dahinter widersprüchliche Echos.',
    rare: 'Zwischen dem normalen Material sitzen kleine, extrem dichte Einschlüsse, die einen eigenen Schnitt benötigen.',
    deeper:
      'Die Ader fällt steiler in den Körper ab als erwartet. Mehr Vortrieb kann zusätzliche Reserven öffnen.',
  }[type];
}

function riskLabel(risk: MiningEventChoice['risk']): string {
  return {
    safe: 'SICHER',
    controlled: 'KONTROLLIERT',
    risky: 'RISIKO',
    high_risk: 'HOHES RISIKO',
  }[risk];
}

function choice(id: string, label: string, risk: MiningEventChoice['risk']): MiningEventChoice {
  return { id, label, risk, riskLabel: riskLabel(risk) };
}

function eventChoices(type: MiningEventType): readonly MiningEventChoice[] {
  return {
    unstable: [
      choice('stabilize', 'Matrix sichern', 'safe'),
      choice('push', 'Schnitt durchdrücken', 'high_risk'),
      choice('abort', 'Abbau abbrechen', 'safe'),
    ],
    machine: [
      choice('repair', 'Förderkopf sauber reparieren', 'safe'),
      choice('bypass', 'Sicherung überbrücken', 'risky'),
      choice('abort', 'Abbau abbrechen', 'safe'),
    ],
    rich: [
      choice('follow', 'Dichte Zone verfolgen', 'controlled'),
      choice('exploit', 'Ader aggressiv ausreizen', 'high_risk'),
      choice('plan', 'Beim Schnittplan bleiben', 'safe'),
    ],
    cavity: [
      choice('detour', 'Hohlraum umgehen', 'safe'),
      choice('survey', 'Hohlraum sondieren', 'risky'),
      choice('ignore', 'Geradeaus weiter', 'risky'),
    ],
    rare: [
      choice('careful', 'Einschlüsse vorsichtig lösen', 'controlled'),
      choice('rip', 'Einschlüsse herausbrechen', 'high_risk'),
      choice('leave', 'Liegen lassen', 'safe'),
    ],
    deeper: [
      choice('stop', 'Bei der aktuellen Tiefe bleiben', 'safe'),
      choice('drill', 'Tiefer weiterschneiden', 'high_risk'),
      choice('abort', 'Abbau abbrechen', 'safe'),
    ],
  }[type];
}

interface AppliedMiningEventResult {
  readonly resolution: MiningEventResolution;
  readonly cycleMultiplier: number;
  readonly recoverySeconds: number;
}

function applyMiningEventResult(
  asteroid: LocalAsteroid,
  effect: MiningEventEffect,
  damageHullFraction: (fraction: number) => number
): AppliedMiningEventResult {
  const deposit = applyMiningEventDepositEffects(asteroid, effect);
  const hullDamage = damageHullFraction(effect.hullDamageFraction);
  const consequences = [
    hullDamage > 0 ? `Hülle -${hullDamage}.` : '',
    deposit.lostTons > 0 ? `Lagerstätte -${deposit.lostTons} t.` : '',
    deposit.bonusTons > 0
      ? `${deposit.bonusTons} t ${deposit.bonusResourceName} zusätzlich lokalisiert.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    resolution: {
      title: effect.title,
      resultText: consequences ? effect.resultText + ' ' + consequences : effect.resultText,
      aborted: effect.abort,
    },
    cycleMultiplier: effect.cycleMultiplier,
    recoverySeconds: effect.recoverySeconds,
  };
}

export function createMiningEventController(
  seed: number,
  random = createRandom(seed ^ 0x4d494e45)
) {
  let sessionCounter = 0;
  let session: MiningEventSession | null = null;
  let pending: MiningEventState | null = null;
  let cycleModifier = 1;
  let recoverySeconds = 0;
  return {
    get pending(): MiningEventState | null {
      return pending;
    },
    get recoverySeconds(): number {
      return recoverySeconds;
    },
    get extractionPaused(): boolean {
      return pending !== null || recoverySeconds > 0;
    },
    cycleSeconds(baseSeconds: number): number {
      return Math.max(0.05, baseSeconds * cycleModifier);
    },
    begin(asteroid: LocalAsteroid): void {
      sessionCounter += 1;
      const initialOre = totalOre(asteroid);
      const type = eventType(random());
      cycleModifier = 1;
      recoverySeconds = 0;
      session = {
        initialOre,
        triggerProgress: 0.22 + random() * 0.34,
        scheduled: initialOre > 0 && random() < EVENT_RATE,
        primaryResourceId: primaryResource(asteroid),
        type,
        rolls: [random(), random(), random()],
        id: `mineevt-${seed}-${sessionCounter}-${Math.floor(random() * 1e6)}`,
        triggered: false,
      };
      pending = null;
    },
    update(asteroid: LocalAsteroid): MiningEventState | null {
      if (!session || pending || session.triggered || !session.scheduled) return pending;
      const progress =
        session.initialOre <= 0 ? 0 : 1 - totalOre(asteroid) / Math.max(1, session.initialOre);
      if (progress < session.triggerProgress) return null;

      session.triggered = true;
      pending = {
        id: session.id,
        type: session.type,
        title: eventTitle(session.type),
        description: eventDescription(session.type),
        extractionProgress: Math.max(0, Math.min(1, progress)),
        choices: eventChoices(session.type),
      };
      return pending;
    },
    pauseExtraction(asteroid: LocalAsteroid, deltaSeconds: number): boolean {
      if (pending || this.update(asteroid)) return true;
      if (recoverySeconds <= 0) return false;
      recoverySeconds = Math.max(0, recoverySeconds - Math.max(0, deltaSeconds));
      return true;
    },
    resolve(
      asteroid: LocalAsteroid,
      choiceId: string,
      damageHullFraction: (fraction: number) => number
    ): MiningEventResolution | null {
      if (!session || !pending) return null;
      const effect = resolveMiningEventEffect(
        session.type,
        choiceId,
        session.rolls,
        session.primaryResourceId
      );
      if (!effect) return null;
      pending = null;
      const applied = applyMiningEventResult(asteroid, effect, damageHullFraction);
      cycleModifier = Math.max(0.5, Math.min(1.8, cycleModifier * applied.cycleMultiplier));
      recoverySeconds = Math.max(recoverySeconds, applied.recoverySeconds);
      return applied.resolution;
    },
    clear(): void {
      session = null;
      pending = null;
      cycleModifier = 1;
      recoverySeconds = 0;
    },
  };
}

function loseDeposit(asteroid: LocalAsteroid, fraction: number): number {
  let target = Math.max(0, Math.round(totalOre(asteroid) * Math.max(0, fraction)));
  let lost = 0;
  for (const deposit of [...asteroid.deposits].sort((a, b) => b.oreRemaining - a.oreRemaining)) {
    if (target <= 0) break;
    const amount = Math.min(target, deposit.oreRemaining);
    deposit.oreRemaining -= amount;
    target -= amount;
    lost += amount;
  }
  return lost;
}

function addBonusDeposit(asteroid: LocalAsteroid, resourceId: string, amount: number): number {
  const bonus = Math.max(0, Math.round(amount));
  if (bonus <= 0) return 0;
  const existing = asteroid.deposits.find((deposit) => deposit.resourceId === resourceId);
  if (existing) {
    existing.oreRemaining += bonus;
    existing.oreCapacity += bonus;
    return bonus;
  }

  asteroid.deposits.push({
    resourceId,
    oreType: miningResourceById(resourceId)?.name ?? resourceId,
    oreRemaining: bonus,
    oreCapacity: bonus,
  });
  return bonus;
}

export function applyMiningEventDepositEffects(
  asteroid: LocalAsteroid,
  effect: MiningEventEffect
): MiningEventDepositResult {
  const lostTons = loseDeposit(asteroid, effect.depositLossFraction);
  const bonusTons = effect.bonusResourceId
    ? addBonusDeposit(asteroid, effect.bonusResourceId, effect.bonusAmount)
    : 0;
  return {
    lostTons,
    bonusTons,
    bonusResourceName: effect.bonusResourceId
      ? (miningResourceById(effect.bonusResourceId)?.name ?? effect.bonusResourceId)
      : '',
  };
}
