import type { PlayerEconomyState, EconomyResourceId } from '../../core/economy-types';
import { economyResourceById, isIllegalResource } from '../../data/economy/economy-resources';

export const HIDDEN_CARGO_HOLD = {
  id: 'concealed_cargo_hold',
  name: 'Verdeckter Frachtraum',
  capacity: 24,
  normalCargoPenalty: 12,
  concealment: 0.68,
  cost: 750000,
} as const;
export const HIDDEN_HOLD_INTEL_COST = 300000;
export const HIDDEN_HOLD_INTEL_DAY = 21;
export const PIRATE_PROTECTION_RATE = 0.05;
export type PirateFaction = 'pirates' | 'pirates2';
export type CustomsSource = 'harbor' | 'patrol';
export type CustomsAction = 'papers' | 'bribe' | 'comply' | 'flee' | 'fight' | 'ack';
export type CustomsOutcome = 'papers' | 'bribe' | 'clear' | 'seized' | 'escaped' | 'resisted';

export interface HiddenCargoHold {
  readonly shipId: string;
  readonly installedAt: string;
}
export interface CustomsInspection {
  readonly source: CustomsSource;
  readonly locationId: string;
  readonly patrolId?: string;
  readonly strength: number;
  stage: 'request' | 'result';
  papersTried: boolean;
  bribeTried: boolean;
  outcome?: CustomsOutcome;
  summary?: string;
}
export interface SmugglingState {
  hiddenHoldIntel: boolean;
  hiddenHoldIntelContacted: boolean;
  holds: Record<string, HiddenCargoHold>;
  suspicion: number;
  protectionFaction?: PirateFaction;
  totalProtectionFees: number;
  inspection: CustomsInspection | null;
}
export interface ContrabandDetection {
  readonly id: EconomyResourceId;
  readonly visibleQty: number;
  readonly hiddenQty: number;
  readonly qty: number;
}
export interface SmugglingService {
  readonly state: SmugglingState;
  hiddenCapacity(shipId: string): number;
  normalPenalty(shipId: string): number;
  hiddenUsed(): number;
  hiddenFree(shipId: string): number;
  learnIntel(day: number): boolean;
  install(shipId: string, locationId: string, normalCapacity: number): boolean;
  conceal(resourceId: string, qty: number, shipId: string): number;
  reveal(resourceId: string, qty: number, shipId: string, normalCapacity: number): number;
  protect(faction: PirateFaction, locationId: string): boolean;
  protectionFee(resourceId: string, gross: number): number;
  recordSale(resourceId: string, gross: number): number;
  inspectionChance(source: CustomsSource, security: 'low' | 'medium' | 'high', shipId: string): number;
  startInspection(source: CustomsSource, locationId: string, strength: number, patrolId?: string): boolean;
  decide(action: CustomsAction, shipId: string, normalCapacity: number, rng?: () => number): CustomsInspection | null;
  scan(strength: number, shipId: string, rng?: () => number): readonly ContrabandDetection[];
  bribeQuote(normalCapacity: number): number;
}
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
function cargoVisible(player: PlayerEconomyState, id: string): number {
  const lot = player.cargo[id];
  return Math.max(0, (lot?.qty ?? 0) - (lot?.hiddenQty ?? 0));
}
function pirateBase(locationId: string): PirateFaction | null {
  if (locationId === 'blackjaw-outpost') return 'pirates';
  if (locationId === 'gallows-anchor') return 'pirates2';
  return null;
}
export function createSmugglingService(player: PlayerEconomyState): SmugglingService {
  const state: SmugglingState = {
    hiddenHoldIntel: false,
    hiddenHoldIntelContacted: false,
    holds: {},
    suspicion: 0,
    totalProtectionFees: 0,
    inspection: null,
  };
  const installed = (shipId: string): boolean => Boolean(state.holds[shipId]);
  const hiddenUsed = (): number =>
    Object.values(player.cargo).reduce((total, lot) => total + (lot.hiddenQty ?? 0), 0);
  const hiddenCapacity = (shipId: string): number =>
    installed(shipId) ? HIDDEN_CARGO_HOLD.capacity : 0;
  const hiddenFree = (shipId: string): number =>
    Math.max(0, hiddenCapacity(shipId) - hiddenUsed());
  const adjustSuspicion = (delta: number): void => {
    state.suspicion = clamp(state.suspicion + delta, 0, 100);
  };
  const entries = (): ContrabandDetection[] =>
    Object.entries(player.cargo)
      .filter(([id, lot]) => isIllegalResource(id) && lot.qty > 0)
      .map(([id, lot]) => {
        const hiddenQty = clamp(lot.hiddenQty ?? 0, 0, lot.qty);
        const visibleQty = Math.max(0, lot.qty - hiddenQty);
        return { id, hiddenQty, visibleQty, qty: hiddenQty + visibleQty };
      });
  const scan = (strength: number, shipId: string, rng: () => number = Math.random) => {
    const detected: ContrabandDetection[] = [];
    const concealment = installed(shipId) ? HIDDEN_CARGO_HOLD.concealment : 0;
    for (const entry of entries()) {
      const visibleQty =
        rng() < clamp(0.58 + strength * 0.36 + state.suspicion * 0.002, 0.45, 0.99)
          ? entry.visibleQty
          : 0;
      const hiddenQty =
        rng() <
        clamp(
          0.16 + strength * 0.5 - concealment * 0.4 + state.suspicion * 0.0015,
          0.03,
          0.58
        )
          ? entry.hiddenQty
          : 0;
      if (visibleQty + hiddenQty > 0) {
        detected.push({
          id: entry.id,
          visibleQty,
          hiddenQty,
          qty: visibleQty + hiddenQty,
        });
      }
    }
    return detected;
  };
  function confiscate(detected: readonly ContrabandDetection[], obstruction: boolean): string {
    let totalValue = 0;
    let seized = 0;
    let hiddenFound = false;
    for (const item of detected) {
      const lot = player.cargo[item.id];
      if (!lot) continue;
      const visible = Math.min(cargoVisible(player, item.id), item.visibleQty);
      const hidden = Math.min(lot.hiddenQty ?? 0, item.hiddenQty);
      const quantity = Math.min(lot.qty, visible + hidden);
      if (quantity <= 0) continue;
      hiddenFound ||= hidden > 0;
      const averageCost = lot.qty > 0 ? lot.totalCost / lot.qty : 0;
      lot.qty -= quantity;
      lot.hiddenQty = Math.max(0, (lot.hiddenQty ?? 0) - hidden);
      lot.totalCost = Math.max(0, lot.totalCost - averageCost * quantity);
      if (lot.qty <= 0) delete player.cargo[item.id];
      totalValue += quantity * (economyResourceById(item.id)?.basePrice ?? 0);
      seized += quantity;
    }
    const fine = Math.round((50000 + totalValue * 1.5) * (1 + (hiddenFound ? 0.5 : 0) + (obstruction ? 0.25 : 0)));
    player.credits -= fine;
    adjustSuspicion(8 + (hiddenFound ? 12 : 0) + (obstruction ? 18 : 0));
    return `${seized} t Kontrabande beschlagnahmt · Geldstrafe ${fine.toLocaleString('de-DE')} CR`;
  }
  return {
    state,
    hiddenCapacity,
    normalPenalty: (shipId) => (installed(shipId) ? HIDDEN_CARGO_HOLD.normalCargoPenalty : 0),
    hiddenUsed,
    hiddenFree,
    learnIntel(day) {
      if (state.hiddenHoldIntel) return true;
      if (day < HIDDEN_HOLD_INTEL_DAY || player.credits < HIDDEN_HOLD_INTEL_COST) return false;
      player.credits -= HIDDEN_HOLD_INTEL_COST;
      state.hiddenHoldIntel = true;
      state.hiddenHoldIntelContacted = true;
      return true;
    },
    install(shipId, locationId, normalCapacity) {
      if (!state.hiddenHoldIntel || installed(shipId) || !pirateBase(locationId)) return false;
      const normalUsed = Object.values(player.cargo).reduce((sum, lot) => sum + cargoVisible(player, lot === undefined ? '' : Object.keys(player.cargo).find((key) => player.cargo[key] === lot) ?? ''), player.reservedCargoTons ?? 0);
      if (
        player.credits < HIDDEN_CARGO_HOLD.cost ||
        normalCapacity < HIDDEN_CARGO_HOLD.normalCargoPenalty ||
        normalUsed > normalCapacity - HIDDEN_CARGO_HOLD.normalCargoPenalty
      ) return false;
      player.credits -= HIDDEN_CARGO_HOLD.cost;
      state.holds[shipId] = { shipId, installedAt: locationId };
      return true;
    },
    conceal(resourceId, qty, shipId) {
      if (!installed(shipId) || !isIllegalResource(resourceId)) return 0;
      const lot = player.cargo[resourceId];
      if (!lot) return 0;
      const moved = Math.min(Math.max(0, Math.floor(qty)), cargoVisible(player, resourceId), hiddenFree(shipId));
      if (moved > 0) lot.hiddenQty = (lot.hiddenQty ?? 0) + moved;
      return moved;
    },
    reveal(resourceId, qty, shipId, normalCapacity) {
      if (!installed(shipId)) return 0;
      const lot = player.cargo[resourceId];
      if (!lot) return 0;
      const visibleUsed = Object.values(player.cargo).reduce(
        (sum, entry) => sum + Math.max(0, entry.qty - (entry.hiddenQty ?? 0)),
        player.reservedCargoTons ?? 0
      );
      const moved = Math.min(
        Math.max(0, Math.floor(qty)),
        lot.hiddenQty ?? 0,
        Math.max(0, normalCapacity - HIDDEN_CARGO_HOLD.normalCargoPenalty - visibleUsed)
      );
      if (moved > 0) lot.hiddenQty = (lot.hiddenQty ?? 0) - moved;
      return moved;
    },
    protect(faction, locationId) {
      if (pirateBase(locationId) !== faction) return false;
      state.protectionFaction = faction;
      return true;
    },
    protectionFee(resourceId, gross) {
      return state.protectionFaction && isIllegalResource(resourceId)
        ? Math.max(0, Math.round(gross * PIRATE_PROTECTION_RATE))
        : 0;
    },
    recordSale(resourceId, gross) {
      const fee = state.protectionFaction && isIllegalResource(resourceId)
        ? Math.max(0, Math.round(gross * PIRATE_PROTECTION_RATE))
        : 0;
      if (fee > 0) {
        player.credits -= fee;
        state.totalProtectionFees += fee;
      }
      if (isIllegalResource(resourceId)) adjustSuspicion(2);
      return fee;
    },
    inspectionChance(source, security, shipId) {
      const strength = security === 'high' ? 0.76 : security === 'medium' ? 0.52 : 0.3;
      const cargo = entries();
      const count = cargo.reduce((sum, item) => sum + item.qty, 0);
      const visible = cargo.reduce((sum, item) => sum + item.visibleQty, 0);
      const hidden = cargo.reduce((sum, item) => sum + item.hiddenQty, 0);
      const exposure = count === 0 ? 0 : clamp(
        (visible + hidden * (1 - (installed(shipId) ? HIDDEN_CARGO_HOLD.concealment : 0) * 0.78)) / count,
        0.1,
        1
      );
      if (count === 0) return clamp(0.03 * (0.65 + strength * 0.45) + state.suspicion * 0.00035, 0.008, 0.14);
      return source === 'harbor'
        ? clamp((0.05 + strength * 0.38 + state.suspicion * 0.0035) * (0.55 + 0.45 * exposure), 0.03, 0.8)
        : clamp((0.07 + strength * 0.3 + state.suspicion * 0.003) * (0.55 + 0.45 * exposure), 0.05, 0.68);
    },
    startInspection(source, locationId, strength, patrolId) {
      if (state.inspection) return false;
      state.inspection = {
        source,
        locationId,
        ...(patrolId ? { patrolId } : {}),
        strength: clamp(strength, 0, 1),
        stage: 'request',
        papersTried: false,
        bribeTried: false,
      };
      return true;
    },
    scan,
    bribeQuote(normalCapacity) {
      return Math.max(4000, Math.round(
        (5500 + normalCapacity * 110 + state.suspicion * 260) / 500
      ) * 500);
    },
    decide(action, shipId, normalCapacity, rng = Math.random) {
      const inspection = state.inspection;
      if (!inspection) return null;
      if (action === 'ack' && inspection.stage === 'result') {
        state.inspection = null;
        return null;
      }
      if (inspection.stage !== 'request') return inspection;
      const finish = (outcome: CustomsOutcome, summary: string): CustomsInspection => {
        inspection.stage = 'result';
        inspection.outcome = outcome;
        inspection.summary = summary;
        return inspection;
      };
      if (action === 'papers' && !inspection.papersTried) {
        inspection.papersTried = true;
        const chance = clamp(
          0.38 - inspection.strength * 0.16 - state.suspicion * 0.003,
          0.08,
          0.76
        );
        if (rng() < chance) {
          adjustSuspicion(-2);
          return finish('papers', 'Frachtpapiere akzeptiert · keine Durchsuchung');
        }
        adjustSuspicion(4);
        return inspection;
      }
      if (action === 'bribe' && inspection.source === 'harbor' && !inspection.bribeTried) {
        inspection.bribeTried = true;
        const quote = this.bribeQuote(normalCapacity);
        if (player.credits >= quote && rng() < clamp(
          0.56 - inspection.strength * 0.25 - state.suspicion * 0.0022, 0.08, 0.62
        )) {
          player.credits -= quote;
          adjustSuspicion(3);
          return finish('bribe', 'Diskrete Zahlung von ' + quote + ' CR akzeptiert');
        }
        adjustSuspicion(15);
      }
      if (action === 'flee' && inspection.source === 'patrol') {
        if (rng() < 0.5) {
          adjustSuspicion(20);
          return finish('escaped', 'Flucht vor der Patrouille gelungen');
        }
        adjustSuspicion(18);
      }
      if (action === 'fight' && inspection.source === 'patrol') {
        adjustSuspicion(35);
        return finish('resisted', 'Widerstand gegen die Flottenkontrolle');
      }
      if (action === 'comply' || action === 'bribe' || action === 'flee') {
        const detected = scan(
          clamp(inspection.strength + (inspection.papersTried ? 0.05 : 0) + (action === 'bribe' ? 0.14 : 0) + (action === 'flee' ? 0.18 : 0), 0, 1),
          shipId,
          rng
        );
        if (detected.length > 0) {
          return finish('seized', confiscate(detected, action !== 'comply'));
        }
        adjustSuspicion(-2);
        return finish('clear', 'Kontrolle ohne Befund · Schiff freigegeben');
      }
      return inspection;
    },
  };
}
