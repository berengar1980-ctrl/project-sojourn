import { AsteroidClaimRegistry } from '../operations/asteroid-claim-registry';
import { WreckClaimRegistry, type WreckClaimCheckpoint } from '../operations/wreck-claim-registry';
import { SectorLegalRegistry } from '../operations/sector-legal-registry';
import type { AsteroidFieldWorld } from '../operations/asteroid-field-world';
import { cloneCareerJson } from './career-save-contract';

export interface CareerLegalAndClaims {
  readonly claims: ReturnType<AsteroidClaimRegistry['exportState']> & {
    readonly wreckClaims?: WreckClaimCheckpoint;
  };
  readonly legal: ReturnType<SectorLegalRegistry['exportState']>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function validFinite(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum;
}

function verifyExtraction(entries: readonly unknown[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (
      !isRecord(entry) ||
      !['locationId', 'asteroidId', 'intruderId'].every(
        (key) => typeof entry[key] === 'string' && entry[key] !== ''
      ) ||
      !validFinite(entry.tons) ||
      !validFinite(entry.value) ||
      !validFinite(entry.billedTons) ||
      !validFinite(entry.billedValue) ||
      entry.billedTons > entry.tons ||
      entry.billedValue > entry.value
    ) {
      throw new Error('Ungültiger oder doppelt abgerechneter Erzvorfall.');
    }
    const id = JSON.stringify([entry.locationId, entry.asteroidId, entry.intruderId]);
    if (seen.has(id)) throw new Error('Doppelte Erzvorfallkennung.');
    seen.add(id);
  }
}

function verifyFieldSeeds(entries: readonly unknown[]): void {
  for (const pair of entries) {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      typeof pair[0] !== 'string' ||
      !validFinite(pair[1])
    ) {
      throw new Error('Ungültiger Asteroidenfeld-Seed.');
    }
  }
}

function verifyRemainingOre(entries: readonly unknown[]): void {
  for (const pair of entries) {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      typeof pair[0] !== 'string' ||
      !isRecord(pair[1]) ||
      Object.values(pair[1]).some((quantity) => !validFinite(quantity))
    ) {
      throw new Error('Ungültiger gespeicherter Erzbestand.');
    }
  }
}

function validIdentity(entry: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => typeof entry[key] === 'string' && entry[key] !== '');
}

function verifyRegisteredClaims(entries: readonly unknown[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (
      !isRecord(entry) ||
      !validIdentity(entry, ['locationId', 'asteroidId', 'ownerId']) ||
      !validFinite(entry.registeredDay) ||
      !isRecord(entry.oreAtRegistration) ||
      Object.values(entry.oreAtRegistration).some((ore) => !validFinite(ore))
    ) {
      throw new Error('Ungültige gespeicherte Konzession.');
    }
    const id = JSON.stringify([entry.locationId, entry.asteroidId]);
    if (seen.has(id)) throw new Error('Doppelt registrierte Konzession.');
    seen.add(id);
  }
}

function verifyConflicts(entries: readonly unknown[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (
      !isRecord(entry) ||
      !validIdentity(entry, ['locationId', 'asteroidId', 'rightfulOwnerId', 'intruderId']) ||
      !validFinite(entry.stolenOre) ||
      !validFinite(entry.compensation) ||
      !['detected', 'paid', 'fight', 'escaped'].includes(entry.status as string)
    ) {
      throw new Error('Ungültiger Konzessionskonflikt.');
    }
    const id = JSON.stringify([entry.locationId, entry.asteroidId, entry.intruderId]);
    if (seen.has(id)) throw new Error('Doppelter Konzessionskonflikt.');
    seen.add(id);
  }
}

function verifySurveyLevels(entries: readonly unknown[]): void {
  for (const pair of entries) {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      typeof pair[0] !== 'string' ||
      !['unscanned', 'surveyed', 'analyzed'].includes(pair[1] as string)
    ) {
      throw new Error('Ungültiger gespeicherter Scanstand.');
    }
  }
}

function verifyWreckClaims(value: unknown): void {
  if (value === undefined) return; // Saves created before wreck registration.
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.claims) ||
    !Array.isArray(value.fields)
  )
    throw new Error('Ungültiges Wrackregister.');
  const seen = new Set<string>();
  for (const entry of value.claims) {
    if (
      !isRecord(entry) ||
      !validIdentity(entry, ['fieldId', 'wreckId', 'ownerId']) ||
      !validFinite(entry.registeredDay) ||
      !validFinite(entry.expiresDay) ||
      entry.expiresDay <= entry.registeredDay
    )
      throw new Error('Ungültiger Wrackanspruch.');
    const key = JSON.stringify([entry.fieldId, entry.wreckId]);
    if (seen.has(key)) throw new Error('Doppelter Wrackanspruch.');
    seen.add(key);
  }
  const fields = new Set<string>();
  for (const pair of value.fields) {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      typeof pair[0] !== 'string' ||
      fields.has(pair[0]) ||
      !isRecord(pair[1]) ||
      pair[1].locationId !== pair[0] ||
      !validFinite(pair[1].seed) ||
      !Array.isArray(pair[1].wrecks)
    )
      throw new Error('Ungültiges Wrackfeld.');
    fields.add(pair[0]);
    const ids = new Set<string>();
    for (const wreck of pair[1].wrecks) {
      if (
        !isRecord(wreck) ||
        typeof wreck.id !== 'string' ||
        !wreck.id ||
        ids.has(wreck.id) ||
        !isRecord(wreck.resources) ||
        Object.values(wreck.resources).some((quantity) => !validFinite(quantity)) ||
        !['none', 'available', 'recovered', 'destroyed'].includes(
          wreck.componentStatus as string
        ) ||
        typeof wreck.inspected !== 'boolean' ||
        !['unscanned', 'surveyed', 'analyzed'].includes(wreck.scanLevel as string)
      ) {
        throw new Error('Ungültiger Wrackzustand.');
      }
      ids.add(wreck.id);
    }
  }
}

function verifyClaims(value: unknown): void {
  if (!isRecord(value) || value.version !== 1) throw new Error('Unbekanntes Konzessionsformat.');
  for (const key of ['claims', 'disputes', 'remainingOre', 'surveyLevels', 'fieldSeeds']) {
    if (!Array.isArray(value[key])) throw new Error('Beschädigte Konzessionsdaten: ' + key);
  }
  if (value.extraction !== undefined && !Array.isArray(value.extraction)) {
    throw new Error('Beschädigte Konzessionsdaten: extraction');
  }
  verifyRegisteredClaims(value.claims as unknown[]);
  verifyConflicts(value.disputes as unknown[]);
  verifyExtraction((value.extraction as unknown[] | undefined) ?? []);
  verifyFieldSeeds(value.fieldSeeds as unknown[]);
  verifyRemainingOre(value.remainingOre as unknown[]);
  verifySurveyLevels(value.surveyLevels as unknown[]);
  verifyWreckClaims(value.wreckClaims);
}

function verifyRegistrations(values: readonly unknown[]): Set<string> {
  const registrations = new Set<string>();
  for (const item of values) {
    if (
      !isRecord(item) ||
      typeof item.shipId !== 'string' ||
      !item.shipId ||
      typeof item.ownerId !== 'string' ||
      !item.ownerId ||
      typeof item.transponder !== 'string' ||
      typeof item.originalTransponder !== 'string' ||
      registrations.has(item.shipId)
    ) {
      throw new Error('Ungültige Schiffskennung.');
    }
    registrations.add(item.shipId);
  }
  return registrations;
}

function verifyCharges(values: readonly unknown[], registrations: ReadonlySet<string>): void {
  const ids = new Set<string>();
  const incidents = new Set<string>();
  for (const item of values) {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      ids.has(item.id) ||
      !registrations.has(item.shipId as string) ||
      typeof item.creditorId !== 'string' ||
      !item.creditorId ||
      !validFinite(item.amount, 1) ||
      !validFinite(item.paid) ||
      item.paid > item.amount ||
      !validFinite(item.day)
    ) {
      throw new Error('Ungültige Forderung oder Zahlung.');
    }
    ids.add(item.id);
    if (typeof item.incidentId === 'string') {
      if (incidents.has(item.incidentId)) throw new Error('Doppelter Strafvorfall.');
      incidents.add(item.incidentId);
    }
  }
}

function verifyWarrants(
  warrants: readonly unknown[],
  custodies: readonly unknown[],
  registrations: ReadonlySet<string>
): void {
  const wanted = new Set<string>();
  for (const id of warrants) {
    if (typeof id !== 'string' || !registrations.has(id) || wanted.has(id)) {
      throw new Error('Fahndung ohne gültige Schiffsregistrierung.');
    }
    wanted.add(id);
  }
  for (const id of custodies) {
    if (typeof id !== 'string' || !wanted.has(id)) {
      throw new Error('Haft ohne Fahndung.');
    }
  }
}

function verifyLegal(value: unknown): void {
  if (
    !isRecord(value) ||
    ![1, 2].includes(value.version as number) ||
    !Array.isArray(value.registrations) ||
    !Array.isArray(value.charges) ||
    !Array.isArray(value.sightings) ||
    !validFinite(value.sequence)
  ) {
    throw new Error('Ungültige gespeicherte Rechtsakte.');
  }
  // Legacy v1 debts were automatically wanted; restoreState handles migration.
  const oldFormat = value.version === 1;
  if (
    (!oldFormat && (!Array.isArray(value.warrants) || !Array.isArray(value.custodies))) ||
    (value.warrants !== undefined && !Array.isArray(value.warrants)) ||
    (value.custodies !== undefined && !Array.isArray(value.custodies))
  ) {
    throw new Error('Ungültige Fahndungsakten.');
  }
  const registrations = verifyRegistrations(value.registrations);
  verifyCharges(value.charges, registrations);
  verifyWarrants(value.warrants ?? [], value.custodies ?? [], registrations);
}

/** Records depleted ore before exporting, including fields the player never mounted. */
export function captureCareerLegalAndClaims(
  claims: AsteroidClaimRegistry,
  legal: SectorLegalRegistry,
  fields: AsteroidFieldWorld,
  wreckClaims: WreckClaimRegistry = new WreckClaimRegistry()
): CareerLegalAndClaims {
  fields.forEachField((field) => claims.rememberField(field.locationId, field.instance.asteroids));
  return cloneCareerJson({
    claims: { ...claims.exportState(), wreckClaims: wreckClaims.exportState() },
    legal: legal.exportState(),
  });
}

/**
 * Build independent domain authorities. Neither the existing economy nor
 * existing field objects are touched when validation fails.
 */
export function stageCareerLegalAndClaims(candidate: unknown): {
  readonly claims: AsteroidClaimRegistry;
  readonly legal: SectorLegalRegistry;
  readonly wreckClaims: WreckClaimRegistry;
} {
  const saved = cloneCareerJson(candidate);
  if (!isRecord(saved)) throw new Error('Fehlende Konzessions- und Rechtsdaten.');
  verifyClaims(saved.claims);
  verifyLegal(saved.legal);
  // Wreck state lives inside the existing claims section of the 14-part save.
  const claims = new AsteroidClaimRegistry();
  const legal = new SectorLegalRegistry();
  const wreckClaims = new WreckClaimRegistry();
  if (
    !claims.restoreState(saved.claims as CareerLegalAndClaims['claims']) ||
    !legal.restoreState(saved.legal as CareerLegalAndClaims['legal'])
  ) {
    throw new Error('Speicherdaten des Rechts- oder Konzessionssystems unvollständig.');
  }
  const savedClaims = saved.claims as CareerLegalAndClaims['claims'];
  if (savedClaims.wreckClaims) wreckClaims.restoreState(savedClaims.wreckClaims);
  return { claims, legal, wreckClaims };
}
