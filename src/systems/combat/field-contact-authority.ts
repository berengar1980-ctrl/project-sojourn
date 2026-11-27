import type { MutableCombatant, SharedFieldCombatWorld } from './strategic-combat-types';

type ActorSource = readonly MutableCombatant[];
type IsEscaped = (id: string) => boolean;

interface FieldContactStep {
  readonly sources: Map<ActorSource, IsEscaped>;
  readonly claimed: Set<string>;
  revision: number;
}

const steps = new WeakMap<SharedFieldCombatWorld, FieldContactStep>();

function step(world: SharedFieldCombatWorld): FieldContactStep {
  let entry = steps.get(world);
  if (!entry) {
    entry = { sources: new Map(), claimed: new Set(), revision: 0 };
    steps.set(world, entry);
  }
  return entry;
}

export function contactPairKey(first: string, second: string): string {
  return JSON.stringify(first < second ? [first, second] : [second, first]);
}

export function claimContactPair(pairs: Set<string>, first: string, second: string): boolean {
  const key = contactPairKey(first, second);
  if (pairs.has(key)) return false;
  pairs.add(key);
  return true;
}

export function resetFieldContactStep(world: SharedFieldCombatWorld): void {
  const entry = step(world);
  entry.sources.clear();
  entry.claimed.clear();
}

export function registerFieldCombatActors(
  world: SharedFieldCombatWorld,
  actors: ActorSource,
  escaped: IsEscaped
): void {
  step(world).sources.set(actors, escaped);
}

/** Return owning actors, never field mirrors or copies. */
export function fieldCombatActors(
  world: SharedFieldCombatWorld
): ReadonlyMap<string, MutableCombatant> {
  const result = new Map<string, MutableCombatant>();
  for (const [actors, escaped] of step(world).sources) {
    for (const actor of actors) {
      const id = actor.setup.id;
      if (actor.hullHp <= 0 || escaped(id)) continue;
      result.set(id, actor);
    }
  }
  return result;
}

export function claimFieldContact(
  world: SharedFieldCombatWorld,
  first: string,
  second: string
): boolean {
  return claimContactPair(step(world).claimed, first, second);
}

export function fieldContactRevision(world?: SharedFieldCombatWorld): number {
  return world ? step(world).revision : 0;
}

export function recordForeignContact(world: SharedFieldCombatWorld): void {
  step(world).revision += 1;
}
