import type {
  LocalAsteroid,
  MiningEventChoice,
  MiningEventState,
  MiningEventType,
} from '../../core/local-space-types';
import { miningResourceById } from '../../data/resources/mining-resources';

const EVENT_RATE = 0.42;
const RARE_RESOURCE_IDS = ['rare-metals', 'elydrase', 'orvessium', 'cyranthite'] as const;

export interface MiningEventEffect {
  readonly title: string;
  readonly resultText: string;
  readonly abort: boolean;
  readonly cycleMultiplier: number;
  readonly recoverySeconds: number;
  readonly hullDamageFraction: number;
  readonly depositLossFraction: number;
  readonly bonusResourceId: string | null;
  readonly bonusAmount: number;
}

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
    rich:
      'Die Spektralanalyse meldet eine deutlich dichtere Zone direkt neben der aktuellen Schnittlinie.',
    cavity:
      'Hinter der Hauptader öffnet sich ein Hohlraum. Die Sensoren liefern dahinter widersprüchliche Echos.',
    rare:
      'Zwischen dem normalen Material sitzen kleine, extrem dichte Einschlüsse, die einen eigenen Schnitt benötigen.',
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

function rareResource(roll: number): string {
  const index = Math.min(RARE_RESOURCE_IDS.length - 1, Math.floor(roll * RARE_RESOURCE_IDS.length));
  return RARE_RESOURCE_IDS[index]!;
}

function baseEffect(title: string, resultText: string): MiningEventEffect {
  return {
    title,
    resultText,
    abort: false,
    cycleMultiplier: 1,
    recoverySeconds: 0,
    hullDamageFraction: 0,
    depositLossFraction: 0,
    bonusResourceId: null,
    bonusAmount: 0,
  };
}

function resolveEffect(session: MiningEventSession, choiceId: string): MiningEventEffect | null {
  const title = eventTitle(session.type);
  const outcome = session.rolls[0] ?? 0;
  const secondary = session.rolls[1] ?? 0;
  const rareId = rareResource(session.rolls[2] ?? 0);

  if (session.type === 'unstable') {
    if (choiceId === 'stabilize')
      return { ...baseEffect(title, 'Die Matrix hält. Der sichere Schnitt läuft langsamer weiter.'), recoverySeconds: 2.5, cycleMultiplier: 1.08 };
    if (choiceId === 'push' && outcome < 0.62)
      return { ...baseEffect(title, 'Der aggressive Schnitt sitzt. Der Materialstrom beschleunigt sich.'), cycleMultiplier: 0.78 };
    if (choiceId === 'push')
      return { ...baseEffect(title, 'Die Matrix bricht früher als berechnet.'), hullDamageFraction: 0.04 + secondary * 0.05, depositLossFraction: 0.1 + secondary * 0.1, cycleMultiplier: 1.12 };
    if (choiceId === 'abort') return { ...baseEffect(title, 'Die Laser werden eingefahren.'), abort: true };
  }

  if (session.type === 'machine') {
    if (choiceId === 'repair')
      return { ...baseEffect(title, 'Der Förderkopf wird neu ausgerichtet und sauber hochgefahren.'), recoverySeconds: 4 };
    if (choiceId === 'bypass' && outcome < 0.68)
      return { ...baseEffect(title, 'Die Überbrückung hält. Der Förderstrom läuft wieder.'), recoverySeconds: 1.2, cycleMultiplier: 0.92 };
    if (choiceId === 'bypass')
      return { ...baseEffect(title, 'Die Überbrückung schlägt zurück und belastet die Anlage.'), recoverySeconds: 4.5, hullDamageFraction: 0.02 + secondary * 0.02, cycleMultiplier: 1.18 };
    if (choiceId === 'abort') return { ...baseEffect(title, 'Die Mining-Anlage wird abgeschaltet.'), abort: true };
  }

  if (session.type === 'rich') {
    if (choiceId === 'follow')
      return { ...baseEffect(title, 'Die dichtere Zone wird kontrolliert verfolgt. Der Abbau beschleunigt sich.'), recoverySeconds: 1.5, cycleMultiplier: 0.78 };
    if (choiceId === 'exploit' && outcome < 0.7)
      return { ...baseEffect(title, 'Die aggressive Schnittfolge zahlt sich aus.'), recoverySeconds: 0.8, cycleMultiplier: 0.65 };
    if (choiceId === 'exploit')
      return { ...baseEffect(title, 'Die Ader zerbricht unter der Last.'), depositLossFraction: 0.1 + secondary * 0.08, hullDamageFraction: 0.015 + secondary * 0.02, cycleMultiplier: 1.1 };
    if (choiceId === 'plan') return baseEffect(title, 'Die Crew bleibt beim ursprünglichen Schnittplan.');
  }

  if (session.type === 'cavity') {
    if (choiceId === 'detour')
      return { ...baseEffect(title, 'Die Schnittlinie wird um den Hohlraum gelegt.'), recoverySeconds: 2.5, cycleMultiplier: 1.05 };
    if (choiceId === 'survey' && outcome < 0.82)
      return { ...baseEffect(title, 'Die Sondierung findet verwertbares Sondermaterial hinter der Wand.'), recoverySeconds: 4, bonusResourceId: rareId, bonusAmount: 4 + Math.floor(secondary * 8) };
    if (choiceId === 'survey')
      return { ...baseEffect(title, 'Der Hohlraum ist leer und instabil.'), recoverySeconds: 4, cycleMultiplier: 1.12 };
    if (choiceId === 'ignore' && outcome < 0.74)
      return baseEffect(title, 'Der Schnitt passiert den Hohlraum ohne Zwischenfall.');
    if (choiceId === 'ignore')
      return { ...baseEffect(title, 'Ein Teil der Hohlraumdecke gibt nach.'), hullDamageFraction: 0.025 + secondary * 0.025, cycleMultiplier: 1.08 };
  }

  if (session.type === 'rare') {
    if (choiceId === 'careful')
      return { ...baseEffect(title, 'Die Einschlüsse werden getrennt aus der Matrix gelöst.'), recoverySeconds: 4, bonusResourceId: rareId, bonusAmount: 8 + Math.floor(secondary * 9) };
    if (choiceId === 'rip' && outcome < 0.6)
      return { ...baseEffect(title, 'Der grobe Schnitt funktioniert und löst die Einschlüsse.'), recoverySeconds: 1.5, bonusResourceId: rareId, bonusAmount: 6 + Math.floor(secondary * 8) };
    if (choiceId === 'rip')
      return { ...baseEffect(title, 'Der Einschluss zerbricht und schlägt gegen die Anlage.'), hullDamageFraction: 0.02 + secondary * 0.03, cycleMultiplier: 1.12 };
    if (choiceId === 'leave') return baseEffect(title, 'Der Einschluss bleibt unangetastet.');
  }

  if (session.type === 'deeper') {
    if (choiceId === 'stop') return baseEffect(title, 'Der tiefere Verlauf wird markiert, aber nicht angeschnitten.');
    if (choiceId === 'drill' && outcome < 0.6)
      return { ...baseEffect(title, 'Der zusätzliche Vortrieb findet Anschluss an eine tiefere Tasche.'), recoverySeconds: 3.5, cycleMultiplier: 0.88, bonusResourceId: session.primaryResourceId, bonusAmount: 12 + Math.floor(secondary * 20) };
    if (choiceId === 'drill')
      return { ...baseEffect(title, 'Der tiefere Schnitt destabilisiert den Körper.'), recoverySeconds: 3.5, hullDamageFraction: 0.03 + secondary * 0.035, depositLossFraction: 0.08 + secondary * 0.1, cycleMultiplier: 1.15 };
    if (choiceId === 'abort') return { ...baseEffect(title, 'Der tiefe Verlauf bleibt für eine spätere Rückkehr markiert.'), abort: true };
  }

  return null;
}

export function createMiningEventController(seed: number, random = createRandom(seed ^ 0x4d494e45)) {
  let sessionCounter = 0;
  let session: MiningEventSession | null = null;
  let pending: MiningEventState | null = null;

  return {
    get pending(): MiningEventState | null {
      return pending;
    },

    begin(asteroid: LocalAsteroid): void {
      sessionCounter += 1;
      const initialOre = totalOre(asteroid);
      const type = eventType(random());
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

    resolve(choiceId: string): MiningEventEffect | null {
      if (!session || !pending) return null;
      const effect = resolveEffect(session, choiceId);
      if (!effect) return null;
      pending = null;
      return effect;
    },

    clear(): void {
      session = null;
      pending = null;
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
