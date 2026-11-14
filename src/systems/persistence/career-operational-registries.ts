import { AsteroidClaimRegistry } from '../operations/asteroid-claim-registry';
import { SectorLegalRegistry } from '../operations/sector-legal-registry';
import type { AsteroidFieldWorld } from '../operations/asteroid-field-world';
import { cloneCareerJson } from './career-save-contract';

export interface CareerLegalAndClaims {
  readonly claims: ReturnType<AsteroidClaimRegistry['exportState']>;
  readonly legal: ReturnType<SectorLegalRegistry['exportState']>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function validFinite(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum;
}

function verifyClaims(value: unknown): void {
  if (!isRecord(value) || value.version !== 1) throw new Error('Unbekanntes Konzessionsformat.');
  for (const key of ['claims', 'disputes', 'remainingOre', 'surveyLevels', 'fieldSeeds', 'extraction']) {
    if (!Array.isArray(value[key])) throw new Error('Beschädigte Konzessionsdaten: ' + key);
  }
  const seen = new Set<string>();
  for (const entry of value.extraction as unknown[]) {
    if (!isRecord(entry) ||
      !['locationId', 'asteroidId', 'intruderId'].every((key) =>
        typeof entry[key] === 'string' && entry[key] !== '') ||
      !validFinite(entry.tons) || !validFinite(entry.value) ||
      !validFinite(entry.billedTons) || !validFinite(entry.billedValue) ||
      entry.billedTons > entry.tons || entry.billedValue > entry.value) {
      throw new Error('Ungültiger oder doppelt abgerechneter Erzvorfall.');
    }
    const id = JSON.stringify([entry.locationId, entry.asteroidId, entry.intruderId]);
    if (seen.has(id)) throw new Error('Doppelte Erzvorfallkennung.');
    seen.add(id);
  }
  for (const pair of value.fieldSeeds as unknown[]) {
    if (!Array.isArray(pair) || pair.length !== 2 ||
      typeof pair[0] !== 'string' || !validFinite(pair[1])) {
      throw new Error('Ungültiger Asteroidenfeld-Seed.');
    }
  }
  for (const pair of value.remainingOre as unknown[]) {
    if (!Array.isArray(pair) || pair.length !== 2 ||
      typeof pair[0] !== 'string' || !isRecord(pair[1]) ||
      Object.values(pair[1]).some((quantity) => !validFinite(quantity))) {
      throw new Error('Ungültiger gespeicherter Erzbestand.');
    }
  }
}

function verifyLegal(value: unknown): void {
  if (!isRecord(value) || ![1, 2].includes(value.version as number) ||
    !Array.isArray(value.registrations) || !Array.isArray(value.charges) ||
    !Array.isArray(value.sightings) || !Array.isArray(value.warrants) ||
    !Array.isArray(value.custodies) || !validFinite(value.sequence)) {
    throw new Error('Ungültige gespeicherte Rechtsakte.');
  }
  const registrations = new Set<string>();
  for (const item of value.registrations as unknown[]) {
    if (!isRecord(item) || typeof item.shipId !== 'string' || !item.shipId ||
      typeof item.ownerId !== 'string' || !item.ownerId ||
      typeof item.transponder !== 'string' || typeof item.originalTransponder !== 'string' ||
      registrations.has(item.shipId)) throw new Error('Ungültige Schiffskennung.');
    registrations.add(item.shipId);
  }
  const ids = new Set<string>();
  const incidents = new Set<string>();
  for (const item of value.charges as unknown[]) {
    if (!isRecord(item) || typeof item.id !== 'string' || ids.has(item.id) ||
      !registrations.has(item.shipId as string) ||
      typeof item.creditorId !== 'string' || !item.creditorId ||
      !validFinite(item.amount, 1) || !validFinite(item.paid) ||
      item.paid > item.amount || !validFinite(item.day)) {
      throw new Error('Ungültige Forderung oder Zahlung.');
    }
    ids.add(item.id);
    if (typeof item.incidentId === 'string') {
      if (incidents.has(item.incidentId)) throw new Error('Doppelter Strafvorfall.');
      incidents.add(item.incidentId);
    }
  }
  for (const entry of value.warrants as unknown[]) {
    if (typeof entry !== 'string' || !registrations.has(entry)) {
      throw new Error('Fahndung ohne Schiffsregistrierung.');
    }
  }
  for (const entry of value.custodies as unknown[]) {
    if (typeof entry !== 'string' || !(value.warrants as string[]).includes(entry)) {
      throw new Error('Haft ohne Fahndung.');
    }
  }
}

/** Records depleted ore before exporting, including fields the player never mounted. */
export function captureCareerLegalAndClaims(
  claims: AsteroidClaimRegistry,
  legal: SectorLegalRegistry,
  fields: AsteroidFieldWorld
): CareerLegalAndClaims {
  fields.forEachField((field) => claims.rememberField(field.locationId, field.instance.asteroids));
  return cloneCareerJson({ claims: claims.exportState(), legal: legal.exportState() });
}

/**
 * Build independent domain authorities. Neither the existing economy nor
 * existing field objects are touched when validation fails.
 */
export function stageCareerLegalAndClaims(candidate: unknown): {
  readonly claims: AsteroidClaimRegistry;
  readonly legal: SectorLegalRegistry;
} {
  const saved = cloneCareerJson(candidate);
  if (!isRecord(saved)) throw new Error('Fehlende Konzessions- und Rechtsdaten.');
  verifyClaims(saved.claims);
  verifyLegal(saved.legal);
  const claims = new AsteroidClaimRegistry();
  const legal = new SectorLegalRegistry();
  if (!claims.restoreState(saved.claims as CareerLegalAndClaims['claims']) ||
    !legal.restoreState(saved.legal as CareerLegalAndClaims['legal'])) {
    throw new Error('Speicherdaten des Rechts- oder Konzessionssystems unvollständig.');
  }
  return { claims, legal };
}
