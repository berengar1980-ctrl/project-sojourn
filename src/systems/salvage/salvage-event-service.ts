import { createLcgRandom as createRandom } from '../../core/seeded-random';
import type { EconomyResourceId } from '../../core/economy-types';
import type {
  SalvageEventChoice,
  SalvageEventResolution,
  SalvageEventRisk,
  SalvageEventState,
  SalvageEventType,
  SalvageResourceDeposit,
  SalvageWreck,
} from '../../core/salvage-types';
import { economyResourceById } from '../../data/economy/economy-resources';
import { resolveSalvageEventEffect } from './salvage-event-outcomes';

const BASE_EVENT_RATE = 0.52;

interface PendingSession {
  readonly state: SalvageEventState;
  readonly rolls: readonly number[];
}

function eventType(roll: number): SalvageEventType {
  if (roll < 0.23) return 'unstable-frame';
  if (roll < 0.44) return 'residual-power';
  if (roll < 0.65) return 'sealed-compartment';
  if (roll < 0.82) return 'volatile-cargo';
  return 'data-core';
}

function title(type: SalvageEventType): string {
  return {
    'unstable-frame': 'Instabiles Wrackgerüst',
    'residual-power': 'Restspannung im Energienetz',
    'sealed-compartment': 'Versiegeltes Abteil',
    'volatile-cargo': 'Flüchtige Gefahrgutreste',
    'data-core': 'Abgeschirmter Datenkern',
  }[type];
}

function description(type: SalvageEventType): string {
  return {
    'unstable-frame':
      'Die Analyse zeigt Scherkräfte im Wrack. Falsche Belastung kann ganze Sektionen kollabieren lassen.',
    'residual-power':
      'Mehrere Leitungen stehen noch unter Spannung. Die Energie kann helfen oder empfindliche Systeme zerstören.',
    'sealed-compartment':
      'Ein abgeschottetes Abteil ist strukturell intakt. Dahinter könnten wertvolle Baugruppen liegen.',
    'volatile-cargo':
      'Sensoren melden reaktive Stoffe in beschädigten Behältern. Jede Bewegung erhöht das Risiko.',
    'data-core':
      'Ein gepanzerter Datenkern antwortet noch auf Diagnoseimpulse. Sein Inhalt ist nicht registriert.',
  }[type];
}

function riskLabel(risk: SalvageEventRisk): string {
  return {
    safe: 'SICHER',
    controlled: 'KONTROLLIERT',
    risky: 'RISIKO',
    high_risk: 'HOHES RISIKO',
  }[risk];
}

function choice(id: string, label: string, risk: SalvageEventRisk): SalvageEventChoice {
  return { id, label, risk, riskLabel: riskLabel(risk) };
}

function choices(type: SalvageEventType): readonly SalvageEventChoice[] {
  return {
    'unstable-frame': [
      choice('stabilize', 'Rumpf verspannen', 'safe'),
      choice('force', 'Schnellen Zugang erzwingen', 'high_risk'),
      choice('leave', 'Sektion unangetastet lassen', 'safe'),
    ],
    'residual-power': [
      choice('isolate', 'Leitungen isolieren', 'safe'),
      choice('bridge', 'Restspannung nutzen', 'risky'),
      choice('disconnect', 'Sektion abklemmen', 'safe'),
    ],
    'sealed-compartment': [
      choice('cut', 'Kontrolliert aufschneiden', 'controlled'),
      choice('breach', 'Tür gewaltsam öffnen', 'high_risk'),
      choice('skip', 'Abteil überspringen', 'safe'),
    ],
    'volatile-cargo': [
      choice('vent', 'Sektion entlüften', 'safe'),
      choice('recover', 'Gefahrgut bergen', 'high_risk'),
      choice('mark', 'Versiegelt lassen', 'safe'),
    ],
    'data-core': [
      choice('extract', 'Datenkern ausbauen', 'controlled'),
      choice('decrypt', 'Vor Ort entschlüsseln', 'risky'),
      choice('wipe', 'Archive löschen', 'safe'),
    ],
  }[type];
}

function totalRemaining(wreck: SalvageWreck): number {
  return wreck.resources.reduce((sum, entry) => sum + Math.max(0, entry.remainingAmount), 0);
}

function removeResources(wreck: SalvageWreck, fraction: number): number {
  let target = Math.round(totalRemaining(wreck) * Math.max(0, fraction));
  let lost = 0;
  for (const deposit of [...wreck.resources].sort(
    (first, second) => second.remainingAmount - first.remainingAmount
  )) {
    if (target <= 0) break;
    const amount = Math.min(target, deposit.remainingAmount);
    deposit.remainingAmount -= amount;
    target -= amount;
    lost += amount;
  }
  return lost;
}

function addResource(wreck: SalvageWreck, resourceId: EconomyResourceId, amount: number): number {
  const added = Math.max(0, Math.floor(amount));
  if (added <= 0) return 0;
  const existing = wreck.resources.find((entry) => entry.resourceId === resourceId);
  if (existing) {
    existing.initialAmount += added;
    existing.remainingAmount += added;
    return added;
  }
  const deposit: SalvageResourceDeposit = {
    resourceId,
    initialAmount: added,
    remainingAmount: added,
  };
  wreck.resources.push(deposit);
  return added;
}

export interface SalvageEventController {
  readonly pending: SalvageEventState | null;
  readonly recoverySeconds: number;
  readonly blocked: boolean;
  inspect(wreck: SalvageWreck): SalvageEventState | null;
  tick(deltaSeconds: number): void;
  resolve(wreck: SalvageWreck, choiceId: string): SalvageEventResolution | null;
}

export function createSalvageEventController(
  seed: number,
  random = createRandom(seed ^ 0x53414c56)
): SalvageEventController {
  const attempted = new Set<string>();
  let pending: PendingSession | null = null;
  let recoverySeconds = 0;

  return {
    get pending() {
      return pending?.state ?? null;
    },
    get recoverySeconds() {
      return recoverySeconds;
    },
    get blocked() {
      return pending !== null || recoverySeconds > 0;
    },

    inspect(wreck) {
      if (attempted.has(wreck.id)) return pending?.state ?? null;
      attempted.add(wreck.id);
      const type = eventType(random());
      const chance = Math.min(0.78, BASE_EVENT_RATE + wreck.quality * 0.06);
      const scheduled = random() < chance;
      const rolls = [random(), random(), random()];
      if (!scheduled) return null;

      const state: SalvageEventState = {
        id: `salvevt-${seed}-${wreck.id}`,
        wreckId: wreck.id,
        type,
        title: title(type),
        description: description(type),
        choices: choices(type),
      };
      pending = { state, rolls };
      return state;
    },

    tick(deltaSeconds) {
      if (pending || recoverySeconds <= 0) return;
      recoverySeconds = Math.max(0, recoverySeconds - Math.max(0, deltaSeconds));
    },

    resolve(wreck, choiceId) {
      if (!pending || pending.state.wreckId !== wreck.id) return null;
      const effect = resolveSalvageEventEffect(pending.state.type, choiceId, wreck, pending.rolls);
      if (!effect) return null;

      const resourceLostTons = removeResources(wreck, effect.resourceLossFraction);
      const resourceAddedTons =
        effect.bonusResourceId === null
          ? 0
          : addResource(wreck, effect.bonusResourceId, effect.bonusAmount);
      let componentDestroyed = false;
      if (effect.destroyComponent && wreck.componentStatus === 'available') {
        wreck.componentStatus = 'destroyed';
        componentDestroyed = true;
      }

      const bonusName = effect.bonusResourceId
        ? (economyResourceById(effect.bonusResourceId)?.name ?? effect.bonusResourceId)
        : '';
      const detail = [
        resourceLostTons > 0 ? `Bergungsmaterial -${resourceLostTons} t.` : '',
        resourceAddedTons > 0 ? `${resourceAddedTons} t ${bonusName} lokalisiert.` : '',
        componentDestroyed ? 'Die gefundene Schiffskomponente ist unbrauchbar.' : '',
      ]
        .filter(Boolean)
        .join(' ');

      const resolution: SalvageEventResolution = {
        title: effect.title,
        resultText: detail ? effect.resultText + ' ' + detail : effect.resultText,
        resourceLostTons,
        resourceAddedTons,
        bonusResourceId: effect.bonusResourceId,
        componentDestroyed,
      };
      recoverySeconds = Math.max(recoverySeconds, effect.recoverySeconds);
      pending = null;
      return resolution;
    },
  };
}
