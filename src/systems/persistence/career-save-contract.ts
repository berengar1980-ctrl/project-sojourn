/**
 * Persist only canonical JSON data, never references to live services or DOM nodes.
 * Sections are mandatory so an incomplete game state cannot masquerade as a career save.
 */
export const CAREER_SAVE_SECTIONS = [
  'navigation',
  'player',
  'ships',
  'crew',
  'economy',
  'npcs',
  'operations',
  'fields',
  'claims',
  'legal',
  'custody',
  'combat',
  'campaigns',
  'world',
] as const;

export type CareerSaveSection = (typeof CAREER_SAVE_SECTIONS)[number];
export type CareerJson =
  | null
  | boolean
  | string
  | number
  | CareerJson[]
  | {
      readonly [key: string]: CareerJson;
    };

export interface CareerSnapshot {
  readonly version: 1;
  readonly sections: Readonly<Record<CareerSaveSection, CareerJson>>;
}

export const MAX_CAREER_SAVE_BYTES = 12_000_000;
const MAX_DEPTH = 48;
const MAX_ENTRIES = 250_000;

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

interface CloneBudget {
  nodes: number;
  readonly ancestors: Set<object>;
}

function copyJson(value: unknown, depth: number, budget: CloneBudget): CareerJson {
  if (++budget.nodes > MAX_ENTRIES || depth > MAX_DEPTH) {
    throw new Error('Spielstand zu tief verschachtelt oder zu umfangreich.');
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || budget.ancestors.has(value)) {
    throw new Error('Spielstand enthält nicht serialisierbare Daten.');
  }
  budget.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) {
        throw new Error('Spielstand enthält ungültige Arrayeinträge.');
      }
      return value.map((entry) => copyJson(entry, depth + 1, budget));
    }
    if (!record(value)) throw new Error('Spielstand enthält ein Laufzeitobjekt.');
    const result: Record<string, CareerJson> = Object.create(null) as Record<string, CareerJson>;
    for (const [key, entry] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) {
        throw new Error('Spielstand enthält einen unzulässigen Feldnamen.');
      }
      result[key] = copyJson(entry, depth + 1, budget);
    }
    return result;
  } finally {
    budget.ancestors.delete(value);
  }
}

/** Detached JSON clone for a separately validated domain snapshot. */
export function cloneCareerJson<T>(candidate: T): T {
  return copyJson(candidate, 0, { nodes: 0, ancestors: new Set() }) as T;
}

/** Strict validation plus detached copy, before any live service is touched. */
export function validateCareerSnapshot(candidate: unknown): CareerSnapshot {
  if (!record(candidate) || candidate.version !== 1 || !record(candidate.sections)) {
    throw new Error('Unbekannte oder unvollständige Spielstandversion.');
  }
  const expected = new Set<string>(CAREER_SAVE_SECTIONS);
  const actual = Object.keys(candidate.sections);
  if (actual.length !== CAREER_SAVE_SECTIONS.length || actual.some((key) => !expected.has(key))) {
    throw new Error('Spielstand enthält nicht alle erforderlichen Teilzustände.');
  }
  const budget: CloneBudget = { nodes: 0, ancestors: new Set() };
  const sections: Record<string, CareerJson> = Object.create(null) as Record<string, CareerJson>;
  for (const key of CAREER_SAVE_SECTIONS) {
    sections[key] = copyJson(candidate.sections[key], 0, budget);
  }
  return { version: 1, sections: sections as Record<CareerSaveSection, CareerJson> };
}
