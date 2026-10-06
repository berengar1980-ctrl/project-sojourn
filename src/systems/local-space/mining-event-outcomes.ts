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

export function resolveMiningEventEffect(
  type: MiningEventType,
  choiceId: string,
  rolls: readonly number[],
  primaryResourceId: string
): MiningEventEffect | null {
  const title = eventTitle(type);
  const outcome = rolls[0] ?? 0;
  const secondary = rolls[1] ?? 0;
  const rareId = rareResource(rolls[2] ?? 0);

  if (type === 'unstable') {
    if (choiceId === 'stabilize') {
      return {
        ...baseEffect(
          title,
          'Die Matrix hält. Der sichere Schnitt läuft langsamer weiter.'
        ),
        recoverySeconds: 2.5,
        cycleMultiplier: 1.08,
      };
    }
    if (choiceId === 'push' && outcome < 0.62) {
      return {
        ...baseEffect(
          title,
          'Der aggressive Schnitt sitzt. Der Materialstrom beschleunigt sich.'
        ),
        cycleMultiplier: 0.78,
      };
    }
    if (choiceId === 'push') {
      return {
        ...baseEffect(title, 'Die Matrix bricht früher als berechnet.'),
        hullDamageFraction: 0.04 + secondary * 0.05,
        depositLossFraction: 0.1 + secondary * 0.1,
        cycleMultiplier: 1.12,
      };
    }
    if (choiceId === 'abort') {
      return { ...baseEffect(title, 'Die Laser werden eingefahren.'), abort: true };
    }
  }

  if (type === 'machine') {
    if (choiceId === 'repair') {
      return {
        ...baseEffect(
          title,
          'Der Förderkopf wird neu ausgerichtet und sauber hochgefahren.'
        ),
        recoverySeconds: 4,
      };
    }
    if (choiceId === 'bypass' && outcome < 0.68) {
      return {
        ...baseEffect(title, 'Die Überbrückung hält. Der Förderstrom läuft wieder.'),
        recoverySeconds: 1.2,
        cycleMultiplier: 0.92,
      };
    }
    if (choiceId === 'bypass') {
      return {
        ...baseEffect(title, 'Die Überbrückung schlägt zurück und belastet die Anlage.'),
        recoverySeconds: 4.5,
        hullDamageFraction: 0.02 + secondary * 0.02,
        cycleMultiplier: 1.18,
      };
    }
    if (choiceId === 'abort') {
      return { ...baseEffect(title, 'Die Mining-Anlage wird abgeschaltet.'), abort: true };
    }
  }

  if (type === 'rich') {
    if (choiceId === 'follow') {
      return {
        ...baseEffect(
          title,
          'Die dichtere Zone wird kontrolliert verfolgt. Der Abbau beschleunigt sich.'
        ),
        recoverySeconds: 1.5,
        cycleMultiplier: 0.78,
      };
    }
    if (choiceId === 'exploit' && outcome < 0.7) {
      return {
        ...baseEffect(title, 'Die aggressive Schnittfolge zahlt sich aus.'),
        recoverySeconds: 0.8,
        cycleMultiplier: 0.65,
      };
    }
    if (choiceId === 'exploit') {
      return {
        ...baseEffect(title, 'Die Ader zerbricht unter der Last.'),
        depositLossFraction: 0.1 + secondary * 0.08,
        hullDamageFraction: 0.015 + secondary * 0.02,
        cycleMultiplier: 1.1,
      };
    }
    if (choiceId === 'plan') {
      return baseEffect(title, 'Die Crew bleibt beim ursprünglichen Schnittplan.');
    }
  }

  if (type === 'cavity') {
    if (choiceId === 'detour') {
      return {
        ...baseEffect(title, 'Die Schnittlinie wird um den Hohlraum gelegt.'),
        recoverySeconds: 2.5,
        cycleMultiplier: 1.05,
      };
    }
    if (choiceId === 'survey' && outcome < 0.82) {
      return {
        ...baseEffect(
          title,
          'Die Sondierung findet verwertbares Sondermaterial hinter der Wand.'
        ),
        recoverySeconds: 4,
        bonusResourceId: rareId,
        bonusAmount: 4 + Math.floor(secondary * 8),
      };
    }
    if (choiceId === 'survey') {
      return {
        ...baseEffect(title, 'Der Hohlraum ist leer und instabil.'),
        recoverySeconds: 4,
        cycleMultiplier: 1.12,
      };
    }
    if (choiceId === 'ignore' && outcome < 0.74) {
      return baseEffect(title, 'Der Schnitt passiert den Hohlraum ohne Zwischenfall.');
    }
    if (choiceId === 'ignore') {
      return {
        ...baseEffect(title, 'Ein Teil der Hohlraumdecke gibt nach.'),
        hullDamageFraction: 0.025 + secondary * 0.025,
        cycleMultiplier: 1.08,
      };
    }
  }

  if (type === 'rare') {
    if (choiceId === 'careful') {
      return {
        ...baseEffect(title, 'Die Einschlüsse werden getrennt aus der Matrix gelöst.'),
        recoverySeconds: 4,
        bonusResourceId: rareId,
        bonusAmount: 8 + Math.floor(secondary * 9),
      };
    }
    if (choiceId === 'rip' && outcome < 0.6) {
      return {
        ...baseEffect(title, 'Der grobe Schnitt funktioniert und löst die Einschlüsse.'),
        recoverySeconds: 1.5,
        bonusResourceId: rareId,
        bonusAmount: 6 + Math.floor(secondary * 8),
      };
    }
    if (choiceId === 'rip') {
      return {
        ...baseEffect(title, 'Der Einschluss zerbricht und schlägt gegen die Anlage.'),
        hullDamageFraction: 0.02 + secondary * 0.03,
        cycleMultiplier: 1.12,
      };
    }
    if (choiceId === 'leave') {
      return baseEffect(title, 'Der Einschluss bleibt unangetastet.');
    }
  }

  if (type === 'deeper') {
    if (choiceId === 'stop') {
      return baseEffect(title, 'Der tiefere Verlauf wird markiert, aber nicht angeschnitten.');
    }
    if (choiceId === 'drill' && outcome < 0.6) {
      return {
        ...baseEffect(
          title,
          'Der zusätzliche Vortrieb findet Anschluss an eine tiefere Tasche.'
        ),
        recoverySeconds: 3.5,
        cycleMultiplier: 0.88,
        bonusResourceId: primaryResourceId,
        bonusAmount: 12 + Math.floor(secondary * 20),
      };
    }
    if (choiceId === 'drill') {
      return {
        ...baseEffect(title, 'Der tiefere Schnitt destabilisiert den Körper.'),
        recoverySeconds: 3.5,
        hullDamageFraction: 0.03 + secondary * 0.035,
        depositLossFraction: 0.08 + secondary * 0.1,
        cycleMultiplier: 1.15,
      };
    }
    if (choiceId === 'abort') {
      return {
        ...baseEffect(
          title,
          'Der tiefe Verlauf bleibt für eine spätere Rückkehr markiert.'
        ),
        abort: true,
      };
    }
  }

  return null;
}
