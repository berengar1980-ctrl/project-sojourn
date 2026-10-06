import type { MiningEventType } from '../../core/local-space-types';

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

interface OutcomeContext {
  readonly title: string;
  readonly outcome: number;
  readonly secondary: number;
  readonly rareId: string;
  readonly primaryResourceId: string;
}

function resolveUnstable(choiceId: string, context: OutcomeContext): MiningEventEffect | null {
  if (choiceId === 'stabilize') {
    return {
      ...baseEffect(context.title, 'Die Matrix hält. Der sichere Schnitt läuft langsamer weiter.'),
      recoverySeconds: 2.5,
      cycleMultiplier: 1.08,
    };
  }
  if (choiceId === 'push' && context.outcome < 0.62) {
    return {
      ...baseEffect(
        context.title,
        'Der aggressive Schnitt sitzt. Der Materialstrom beschleunigt sich.'
      ),
      cycleMultiplier: 0.78,
    };
  }
  if (choiceId === 'push') {
    return {
      ...baseEffect(context.title, 'Die Matrix bricht früher als berechnet.'),
      hullDamageFraction: 0.04 + context.secondary * 0.05,
      depositLossFraction: 0.1 + context.secondary * 0.1,
      cycleMultiplier: 1.12,
    };
  }
  if (choiceId === 'abort') {
    return { ...baseEffect(context.title, 'Die Laser werden eingefahren.'), abort: true };
  }
  return null;
}

function resolveMachine(choiceId: string, context: OutcomeContext): MiningEventEffect | null {
  if (choiceId === 'repair') {
    return {
      ...baseEffect(context.title, 'Der Förderkopf wird neu ausgerichtet und sauber hochgefahren.'),
      recoverySeconds: 4,
    };
  }
  if (choiceId === 'bypass' && context.outcome < 0.68) {
    return {
      ...baseEffect(context.title, 'Die Überbrückung hält. Der Förderstrom läuft wieder.'),
      recoverySeconds: 1.2,
      cycleMultiplier: 0.92,
    };
  }
  if (choiceId === 'bypass') {
    return {
      ...baseEffect(context.title, 'Die Überbrückung schlägt zurück und belastet die Anlage.'),
      recoverySeconds: 4.5,
      hullDamageFraction: 0.02 + context.secondary * 0.02,
      cycleMultiplier: 1.18,
    };
  }
  if (choiceId === 'abort') {
    return { ...baseEffect(context.title, 'Die Mining-Anlage wird abgeschaltet.'), abort: true };
  }
  return null;
}

function resolveRich(choiceId: string, context: OutcomeContext): MiningEventEffect | null {
  if (choiceId === 'follow') {
    return {
      ...baseEffect(
        context.title,
        'Die dichtere Zone wird kontrolliert verfolgt. Der Abbau beschleunigt sich.'
      ),
      recoverySeconds: 1.5,
      cycleMultiplier: 0.78,
    };
  }
  if (choiceId === 'exploit' && context.outcome < 0.7) {
    return {
      ...baseEffect(context.title, 'Die aggressive Schnittfolge zahlt sich aus.'),
      recoverySeconds: 0.8,
      cycleMultiplier: 0.65,
    };
  }
  if (choiceId === 'exploit') {
    return {
      ...baseEffect(context.title, 'Die Ader zerbricht unter der Last.'),
      depositLossFraction: 0.1 + context.secondary * 0.08,
      hullDamageFraction: 0.015 + context.secondary * 0.02,
      cycleMultiplier: 1.1,
    };
  }
  if (choiceId === 'plan') {
    return baseEffect(context.title, 'Die Crew bleibt beim ursprünglichen Schnittplan.');
  }
  return null;
}

function resolveCavity(choiceId: string, context: OutcomeContext): MiningEventEffect | null {
  if (choiceId === 'detour') {
    return {
      ...baseEffect(context.title, 'Die Schnittlinie wird um den Hohlraum gelegt.'),
      recoverySeconds: 2.5,
      cycleMultiplier: 1.05,
    };
  }
  if (choiceId === 'survey' && context.outcome < 0.82) {
    return {
      ...baseEffect(
        context.title,
        'Die Sondierung findet verwertbares Sondermaterial hinter der Wand.'
      ),
      recoverySeconds: 4,
      bonusResourceId: context.rareId,
      bonusAmount: 4 + Math.floor(context.secondary * 8),
    };
  }
  if (choiceId === 'survey') {
    return {
      ...baseEffect(context.title, 'Der Hohlraum ist leer und instabil.'),
      recoverySeconds: 4,
      cycleMultiplier: 1.12,
    };
  }
  if (choiceId === 'ignore' && context.outcome < 0.74) {
    return baseEffect(context.title, 'Der Schnitt passiert den Hohlraum ohne Zwischenfall.');
  }
  if (choiceId === 'ignore') {
    return {
      ...baseEffect(context.title, 'Ein Teil der Hohlraumdecke gibt nach.'),
      hullDamageFraction: 0.025 + context.secondary * 0.025,
      cycleMultiplier: 1.08,
    };
  }
  return null;
}

function resolveRare(choiceId: string, context: OutcomeContext): MiningEventEffect | null {
  if (choiceId === 'careful') {
    return {
      ...baseEffect(context.title, 'Die Einschlüsse werden getrennt aus der Matrix gelöst.'),
      recoverySeconds: 4,
      bonusResourceId: context.rareId,
      bonusAmount: 8 + Math.floor(context.secondary * 9),
    };
  }
  if (choiceId === 'rip' && context.outcome < 0.6) {
    return {
      ...baseEffect(context.title, 'Der grobe Schnitt funktioniert und löst die Einschlüsse.'),
      recoverySeconds: 1.5,
      bonusResourceId: context.rareId,
      bonusAmount: 6 + Math.floor(context.secondary * 8),
    };
  }
  if (choiceId === 'rip') {
    return {
      ...baseEffect(context.title, 'Der Einschluss zerbricht und schlägt gegen die Anlage.'),
      hullDamageFraction: 0.02 + context.secondary * 0.03,
      cycleMultiplier: 1.12,
    };
  }
  if (choiceId === 'leave') {
    return baseEffect(context.title, 'Der Einschluss bleibt unangetastet.');
  }
  return null;
}

function resolveDeeper(choiceId: string, context: OutcomeContext): MiningEventEffect | null {
  if (choiceId === 'stop') {
    return baseEffect(
      context.title,
      'Der tiefere Verlauf wird markiert, aber nicht angeschnitten.'
    );
  }
  if (choiceId === 'drill' && context.outcome < 0.6) {
    return {
      ...baseEffect(
        context.title,
        'Der zusätzliche Vortrieb findet Anschluss an eine tiefere Tasche.'
      ),
      recoverySeconds: 3.5,
      cycleMultiplier: 0.88,
      bonusResourceId: context.primaryResourceId,
      bonusAmount: 12 + Math.floor(context.secondary * 20),
    };
  }
  if (choiceId === 'drill') {
    return {
      ...baseEffect(context.title, 'Der tiefere Schnitt destabilisiert den Körper.'),
      recoverySeconds: 3.5,
      hullDamageFraction: 0.03 + context.secondary * 0.035,
      depositLossFraction: 0.08 + context.secondary * 0.1,
      cycleMultiplier: 1.15,
    };
  }
  if (choiceId === 'abort') {
    return {
      ...baseEffect(context.title, 'Der tiefe Verlauf bleibt für eine spätere Rückkehr markiert.'),
      abort: true,
    };
  }
  return null;
}

export function resolveMiningEventEffect(
  type: MiningEventType,
  choiceId: string,
  rolls: readonly number[],
  primaryResourceId: string
): MiningEventEffect | null {
  const context: OutcomeContext = {
    title: eventTitle(type),
    outcome: rolls[0] ?? 0,
    secondary: rolls[1] ?? 0,
    rareId: rareResource(rolls[2] ?? 0),
    primaryResourceId,
  };

  if (type === 'unstable') return resolveUnstable(choiceId, context);
  if (type === 'machine') return resolveMachine(choiceId, context);
  if (type === 'rich') return resolveRich(choiceId, context);
  if (type === 'cavity') return resolveCavity(choiceId, context);
  if (type === 'rare') return resolveRare(choiceId, context);
  return resolveDeeper(choiceId, context);
}
