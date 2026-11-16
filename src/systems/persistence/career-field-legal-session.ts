import type { SectorNpcState } from '../../core/npc-types';
import type { WorldLocation } from '../../core/world-types';
import {
  AsteroidFieldWorld,
  type CareerAsteroidFieldCheckpoint,
  type CareerMinerFactory,
} from '../operations/asteroid-field-world';
import {
  captureCareerLegalAndClaims,
  stageCareerLegalAndClaims,
  type CareerLegalAndClaims,
} from './career-operational-registries';

export interface CareerFieldLegalCheckpoint {
  readonly version: 1;
  readonly fields: CareerAsteroidFieldCheckpoint;
  readonly claims: CareerLegalAndClaims['claims'];
  readonly legal: CareerLegalAndClaims['legal'];
}

export interface StagedCareerFieldLegalSession {
  readonly fields: AsteroidFieldWorld;
  readonly claims: ReturnType<typeof stageCareerLegalAndClaims>['claims'];
  readonly legal: ReturnType<typeof stageCareerLegalAndClaims>['legal'];
}

/** Commit off-screen remaining ore before taking a unified physical field checkpoint. */
export function captureCareerFieldLegalSession(
  fields: AsteroidFieldWorld,
  claims: StagedCareerFieldLegalSession['claims'],
  legal: StagedCareerFieldLegalSession['legal']
): CareerFieldLegalCheckpoint {
  const registries = captureCareerLegalAndClaims(claims, legal, fields);
  return {
    version: 1,
    fields: fields.exportState(),
    claims: registries.claims,
    legal: registries.legal,
  };
}

/**
 * Construct claims first; regenerated asteroids inherit remaining ore and scan
 * levels before any mining service or physical drone is restored.
 */
export function stageCareerFieldLegalSession(
  checkpoint: CareerFieldLegalCheckpoint,
  locations: readonly WorldLocation[],
  minerFactory: CareerMinerFactory,
  npcs: readonly SectorNpcState[]
): StagedCareerFieldLegalSession {
  if (
    !checkpoint ||
    checkpoint.version !== 1 ||
    !checkpoint.fields ||
    !checkpoint.claims ||
    !checkpoint.legal
  ) {
    throw new Error('Invalid field and legal session checkpoint');
  }
  const registries = stageCareerLegalAndClaims({
    claims: checkpoint.claims,
    legal: checkpoint.legal,
  });
  const fields = new AsteroidFieldWorld(
    locations,
    registries.claims,
    minerFactory,
    checkpoint.fields,
    npcs
  );
  return { fields, ...registries };
}
