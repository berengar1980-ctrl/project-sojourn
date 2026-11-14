/**
 * Sector legal register. The physical ship ID is immutable, while the public
 * transponder can be forged. Reports contain intelligence, not omniscient
 * positions. NPCs and the player share the same legal rules.
 */
export interface ShipRegistration {
  readonly shipId: string;
  readonly ownerId: string;
  readonly transponder: string;
  readonly originalTransponder: string;
}
export interface LegalCharge {
  readonly id: string;
  readonly shipId: string;
  readonly creditorId: string;
  readonly offense: string;
  readonly amount: number;
  readonly day: number;
  paid: number;
  /** Stable external event key prevents repeated billing of the same incident. */
  readonly incidentId?: string;
}
export interface ShipSighting {
  readonly shipId: string;
  readonly transponder: string;
  readonly locationId: string;
  readonly destinationId: string | null;
  readonly day: number;
  readonly kind: 'arrival' | 'departure' | 'distress';
}
export interface DetentionResult {
  readonly detained: boolean;
  readonly confiscated: number;
  readonly days: number;
  readonly laborCredits: number;
  readonly released: boolean;
  readonly remainingDebt: number;
}
export const PENAL_LABOR_CREDITS_PER_DAY = 350;
export type LegalCaseStatus = 'clear' | 'demand' | 'wanted' | 'custody';

function shipCode(shipId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < shipId.length; i++) {
    hash ^= shipId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 'TD-' + (hash >>> 0).toString(36).toUpperCase().padStart(7, '0');
}

export class SectorLegalRegistry {
  private readonly registrations = new Map<string, ShipRegistration>();
  private readonly charges: LegalCharge[] = [];
  private readonly sightings: ShipSighting[] = [];
  private readonly warrants = new Set<string>();
  private readonly custody = new Set<string>();
  private sequence = 0;

  registerShip(shipId: string, ownerId: string): ShipRegistration {
    const previous = this.registrations.get(shipId);
    if (previous) return previous;
    const transponder = shipCode(shipId);
    const registration = { shipId, ownerId, transponder, originalTransponder: transponder };
    this.registrations.set(shipId, registration);
    return registration;
  }

  registration(shipId: string): ShipRegistration | null {
    return this.registrations.get(shipId) ?? null;
  }

  /** A new public signal never changes the immutable ship ID or erases charges. */
  forgeTransponder(shipId: string, alias: string): boolean {
    const previous = this.registrations.get(shipId);
    if (
      !previous ||
      !alias.trim() ||
      [...this.registrations.values()].some(
        (other) => other.shipId !== shipId && other.transponder === alias
      )
    )
      return false;
    this.registrations.set(shipId, { ...previous, transponder: alias.trim() });
    return true;
  }

  reportOffense(
    shipId: string,
    creditorId: string,
    offense: string,
    amount: number,
    day: number,
    incidentId?: string
  ): LegalCharge | null {
    if (!this.registrations.has(shipId) || !Number.isFinite(amount) || amount <= 0) return null;
    if (incidentId) {
      const duplicate = this.charges.find((entry) => entry.incidentId === incidentId);
      if (duplicate) return null;
    }
    const charge: LegalCharge = {
      id: 'charge-' + ++this.sequence,
      shipId,
      creditorId,
      offense,
      amount: Math.ceil(amount),
      paid: 0,
      day: Math.floor(day),
      ...(incidentId ? { incidentId } : {}),
    };
    this.charges.push(charge);
    return { ...charge };
  }

  debt(shipId: string): number {
    return this.charges
      .filter((c) => c.shipId === shipId)
      .reduce((sum, c) => sum + (c.amount - c.paid), 0);
  }

  status(shipId: string): LegalCaseStatus {
    if (this.debt(shipId) <= 0) return 'clear';
    if (this.custody.has(shipId)) return 'custody';
    return this.warrants.has(shipId) ? 'wanted' : 'demand';
  }

  /** Unpaid civil demands are not automatically criminal warrants. */
  isWanted(shipId: string): boolean {
    return this.status(shipId) === 'wanted' || this.status(shipId) === 'custody';
  }

  /** Refusing a demand or a confirmed distress call authorizes pursuit. */
  declareWanted(shipId: string): boolean {
    if (!this.registrations.has(shipId) || this.debt(shipId) <= 0) return false;
    if (this.warrants.has(shipId)) return false;
    this.warrants.add(shipId);
    return true;
  }

  beginCustody(shipId: string): boolean {
    if (!this.isWanted(shipId) || this.custody.has(shipId)) return false;
    this.custody.add(shipId);
    return true;
  }

  /** A forged transponder hides a warrant from ordinary scans. Only a
   * positive deep identification connects it to the immutable hull record. */
  isRecognizedWanted(shipId: string, deepIdentification = false): boolean {
    const registration = this.registration(shipId);
    if (!registration || !this.isWanted(shipId)) return false;
    return registration.transponder === registration.originalTransponder || deepIdentification;
  }

  /** Creditors receive the paid principal once, not on every encounter. */
  settle(
    shipId: string,
    availableCredits: number
  ): {
    readonly paid: number;
    readonly transfers: ReadonlyArray<{ creditorId: string; amount: number }>;
  } {
    let remaining = Number.isFinite(availableCredits) ? Math.max(0, Math.floor(availableCredits)) : 0;
    const transfers: { creditorId: string; amount: number }[] = [];
    for (const charge of this.charges) {
      if (charge.shipId !== shipId || remaining <= 0) continue;
      const paid = Math.min(remaining, charge.amount - charge.paid);
      if (paid <= 0) continue;
      charge.paid += paid;
      remaining -= paid;
      transfers.push({ creditorId: charge.creditorId, amount: paid });
    }
    const paid = (Number.isFinite(availableCredits) ? Math.max(0, Math.floor(availableCredits)) : 0) - remaining;
    if (this.debt(shipId) === 0) {
      this.warrants.delete(shipId);
      this.custody.delete(shipId);
    }
    return { paid, transfers };
  }

  /** Docking at a Directorate installation results in compulsory settlement. */
  detain(
    shipId: string,
    availableCredits: number,
    onAdvanceDay: () => void,
    onTransfer: (creditorId: string, amount: number) => void,
    perDay = PENAL_LABOR_CREDITS_PER_DAY
  ): DetentionResult {
    if (!this.isWanted(shipId)) {
      return {
        detained: false,
        confiscated: 0,
        days: 0,
        laborCredits: 0,
        released: true,
        remainingDebt: 0,
      };
    }
    this.beginCustody(shipId);
    const first = this.settle(shipId, availableCredits);
    for (const transfer of first.transfers) onTransfer(transfer.creditorId, transfer.amount);
    let days = 0;
    let laborCredits = 0;
    const wage = Math.max(1, Math.floor(perDay));
    // The limit guards against pathological balances or invalid callbacks.
    while (this.debt(shipId) > 0 && days < 100000) {
      onAdvanceDay();
      days++;
      const payment = this.settle(shipId, wage);
      laborCredits += payment.paid;
      for (const transfer of payment.transfers) onTransfer(transfer.creditorId, transfer.amount);
    }
    return {
      detained: true,
      confiscated: first.paid,
      days,
      laborCredits,
      released: !this.isWanted(shipId),
      remainingDebt: this.debt(shipId),
    };
  }

  /** Reports are generated only at lawful port encounters and route departures. */
  reportSighting(
    shipId: string,
    locationId: string,
    day: number,
    kind: ShipSighting['kind'],
    destinationId: string | null = null
  ): ShipSighting | null {
    const registration = this.registration(shipId);
    if (!registration || !this.isWanted(shipId)) return null;
    const report = {
      shipId,
      transponder: registration.transponder,
      locationId,
      destinationId,
      day: Math.floor(day),
      kind,
    };
    if (this.sightings.some((entry) =>
      entry.shipId === shipId && entry.locationId === locationId &&
      entry.day === report.day && entry.kind === kind && entry.destinationId === destinationId
    )) return null;
    this.sightings.push(report);
    return report;
  }

  latestSighting(shipId: string): ShipSighting | null {
    return [...this.sightings].reverse().find((s) => s.shipId === shipId) ?? null;
  }

  exportState() {
    return { version: 2 as const, sequence: this.sequence, ...this.snapshot() };
  }

  restoreState(saved: ReturnType<SectorLegalRegistry['exportState']>): boolean {
    if (!saved || (saved.version !== 2 && (saved.version as number) !== 1)) return false;
    this.registrations.clear();
    this.charges.length = 0;
    this.sightings.length = 0;
    this.warrants.clear();
    this.custody.clear();
    for (const registration of saved.registrations)
      this.registrations.set(registration.shipId, { ...registration });
    for (const charge of saved.charges) this.charges.push({ ...charge });
    for (const sighting of saved.sightings) this.sightings.push({ ...sighting });
    for (const shipId of saved.warrants ?? []) if (this.debt(shipId) > 0) this.warrants.add(shipId);
    for (const shipId of saved.custodies ?? []) if (this.isWanted(shipId)) this.custody.add(shipId);
    this.sequence = Math.max(
      saved.sequence,
      ...this.charges.map((charge) => Number(charge.id.replace(/^charge-/, '')) || 0),
      0
    );
    return true;
  }

  snapshot() {
    return {
      registrations: [...this.registrations.values()].map((r) => ({ ...r })),
      charges: this.charges.map((c) => ({ ...c })),
      sightings: this.sightings.map((s) => ({ ...s })),
      warrants: [...this.warrants],
      custodies: [...this.custody],
    };
  }
}
