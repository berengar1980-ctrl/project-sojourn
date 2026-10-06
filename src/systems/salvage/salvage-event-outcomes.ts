import type { EconomyResourceId } from '../../core/economy-types';
import type { SalvageEventType, SalvageWreck } from '../../core/salvage-types';

export interface SalvageEventEffect {
  readonly title: string;
  readonly resultText: string;
  readonly recoverySeconds: number;
  readonly resourceLossFraction: number;
  readonly bonusResourceId: EconomyResourceId | null;
  readonly bonusAmount: number;
  readonly destroyComponent: boolean;
}

interface EventContext {
  readonly wreck: SalvageWreck;
  readonly outcome: number;
  readonly secondary: number;
}

function baseEffect(title: string, resultText: string): SalvageEventEffect {
  return {
    title,
    resultText,
    recoverySeconds: 0,
    resourceLossFraction: 0,
    bonusResourceId: null,
    bonusAmount: 0,
    destroyComponent: false,
  };
}

function resolveUnstableFrame(choiceId: string, context: EventContext): SalvageEventEffect | null {
  const title = 'Instabiles Wrackgerüst';
  if (choiceId === 'stabilize') {
    return {
      ...baseEffect(title, 'Die Crew verspannt den Rumpf und sichert die Arbeitszone.'),
      recoverySeconds: 3.5,
    };
  }
  if (choiceId === 'force' && context.outcome < 0.62) {
    return {
      ...baseEffect(title, 'Der schnelle Zugang gelingt und legt zusätzliche Bauteile frei.'),
      recoverySeconds: 1.2,
      bonusResourceId: 'ship-parts',
      bonusAmount: 4 + Math.floor(context.secondary * 7),
    };
  }
  if (choiceId === 'force') {
    return {
      ...baseEffect(title, 'Ein Rumpfsegment kollabiert und zerquetscht einen Teil der Bergung.'),
      recoverySeconds: 2.5,
      resourceLossFraction: 0.12 + context.secondary * 0.12,
      destroyComponent: context.secondary > 0.72,
    };
  }
  if (choiceId === 'leave') {
    return baseEffect(title, 'Die instabile Sektion bleibt unangetastet.');
  }
  return null;
}

function resolveResidualPower(choiceId: string, context: EventContext): SalvageEventEffect | null {
  const title = 'Restspannung im Energienetz';
  if (choiceId === 'isolate') {
    return {
      ...baseEffect(title, 'Die Crew trennt die Busleitungen sauber und erdet die Sektion.'),
      recoverySeconds: 2.8,
    };
  }
  if (choiceId === 'bridge' && context.outcome < 0.7) {
    return {
      ...baseEffect(title, 'Die Restladung stabilisiert die Diagnose und legt Reaktorteile frei.'),
      recoverySeconds: 1.5,
      bonusResourceId: context.wreck.kind === 'patrol' ? 'reactor-parts' : 'electronics',
      bonusAmount: 3 + Math.floor(context.secondary * 8),
    };
  }
  if (choiceId === 'bridge') {
    return {
      ...baseEffect(
        title,
        'Ein Lichtbogen fährt durch die Sektion und verschmort verwertbare Systeme.'
      ),
      recoverySeconds: 3.2,
      resourceLossFraction: 0.08 + context.secondary * 0.1,
      destroyComponent: context.secondary > 0.58,
    };
  }
  if (choiceId === 'disconnect') {
    return baseEffect(title, 'Die Sektion wird vollständig abgeklemmt.');
  }
  return null;
}

function resolveSealedCompartment(
  choiceId: string,
  context: EventContext
): SalvageEventEffect | null {
  const title = 'Versiegeltes Abteil';
  if (choiceId === 'cut') {
    return {
      ...baseEffect(
        title,
        'Der Zugang wird kontrolliert geöffnet. Dahinter liegen brauchbare Ersatzteile.'
      ),
      recoverySeconds: 3.5,
      bonusResourceId: context.wreck.quality >= 3 ? 'rare-tech' : 'ship-parts',
      bonusAmount: 4 + context.wreck.quality * 2 + Math.floor(context.secondary * 5),
    };
  }
  if (choiceId === 'breach' && context.outcome < 0.58) {
    return {
      ...baseEffect(title, 'Die schnelle Öffnung funktioniert und spart Zeit.'),
      recoverySeconds: 1.2,
      bonusResourceId: 'processor-modules',
      bonusAmount: 3 + Math.floor(context.secondary * 6),
    };
  }
  if (choiceId === 'breach') {
    return {
      ...baseEffect(title, 'Die Drucktür schlägt durch das Abteil und zerstört Teile der Ladung.'),
      recoverySeconds: 2.4,
      resourceLossFraction: 0.1 + context.secondary * 0.14,
    };
  }
  if (choiceId === 'skip') {
    return baseEffect(title, 'Das Abteil wird markiert und nicht geöffnet.');
  }
  return null;
}

function resolveVolatileCargo(choiceId: string, context: EventContext): SalvageEventEffect | null {
  const title = 'Flüchtige Gefahrgutreste';
  if (choiceId === 'vent') {
    return {
      ...baseEffect(
        title,
        'Die Crew entlüftet die Sektion. Ein Teil der Ladung geht kontrolliert verloren.'
      ),
      recoverySeconds: 2.6,
      resourceLossFraction: 0.05,
    };
  }
  if (choiceId === 'recover' && context.outcome < 0.55) {
    return {
      ...baseEffect(title, 'Die Gefahrgutbehälter werden unbeschädigt aus dem Wrack gelöst.'),
      recoverySeconds: 3.4,
      bonusResourceId: 'explosives',
      bonusAmount: 2 + Math.floor(context.secondary * 5),
    };
  }
  if (choiceId === 'recover') {
    return {
      ...baseEffect(title, 'Ein Behälter reißt. Die Crew muss die Sektion sofort aufgeben.'),
      recoverySeconds: 4.2,
      resourceLossFraction: 0.16 + context.secondary * 0.12,
      destroyComponent: context.secondary > 0.75,
    };
  }
  if (choiceId === 'mark') {
    return baseEffect(title, 'Die Gefahrgutsektion bleibt versiegelt.');
  }
  return null;
}

function resolveDataCore(choiceId: string, context: EventContext): SalvageEventEffect | null {
  const title = 'Abgeschirmter Datenkern';
  if (choiceId === 'extract') {
    return {
      ...baseEffect(
        title,
        'Der Datenkern wird physisch getrennt. Die Archive sind verwertbar, aber illegal.'
      ),
      recoverySeconds: 3,
      bonusResourceId: 'stolen-data',
      bonusAmount: 1 + Math.floor(context.secondary * 3),
    };
  }
  if (choiceId === 'decrypt' && context.outcome < 0.64) {
    return {
      ...baseEffect(
        title,
        'Die Crew knackt die Sicherung und gewinnt zusätzliche verschlüsselte Archive.'
      ),
      recoverySeconds: 4.5,
      bonusResourceId: 'stolen-data',
      bonusAmount: 3 + Math.floor(context.secondary * 4),
    };
  }
  if (choiceId === 'decrypt') {
    return {
      ...baseEffect(title, 'Die Löschroutine springt an und verbrennt die Datensektion.'),
      recoverySeconds: 2.5,
      resourceLossFraction: 0.04,
    };
  }
  if (choiceId === 'wipe') {
    return baseEffect(title, 'Die Archive werden gelöscht und der Kern bleibt zurück.');
  }
  return null;
}

export function resolveSalvageEventEffect(
  type: SalvageEventType,
  choiceId: string,
  wreck: SalvageWreck,
  rolls: readonly number[]
): SalvageEventEffect | null {
  const context: EventContext = {
    wreck,
    outcome: rolls[0] ?? 0,
    secondary: rolls[1] ?? 0,
  };
  if (type === 'unstable-frame') return resolveUnstableFrame(choiceId, context);
  if (type === 'residual-power') return resolveResidualPower(choiceId, context);
  if (type === 'sealed-compartment') return resolveSealedCompartment(choiceId, context);
  if (type === 'volatile-cargo') return resolveVolatileCargo(choiceId, context);
  return resolveDataCore(choiceId, context);
}
