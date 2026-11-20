/**
 * Authoritative combat membership for one shared local world.
 *
 * This service owns engagement topology only; physics, damage and AI remain
 * owned by the chosen combat runtime. It never invokes 1vs1 methods.
 * A fleet-tagged engagement requires a FleetCombatService before simulation.
 */
export type EngagementKind = 'duel' | 'fleet';
export type EngagementId = string;
export type CombatShipId = string;

export interface EngagementSnapshot {
  readonly id: EngagementId;
  readonly kind: EngagementKind;
  readonly memberIds: readonly CombatShipId[];
}

export interface CombatEngagementManager {
  engage(shipA: CombatShipId, shipB: CombatShipId): EngagementSnapshot;
  disengage(shipId: CombatShipId): void;
  engagementFor(shipId: CombatShipId): EngagementSnapshot | null;
  engagements(): readonly EngagementSnapshot[];
  isEngaged(shipId: CombatShipId): boolean;
  clear(): void;
}

interface MutableEngagement {
  readonly id: EngagementId;
  readonly members: Set<CombatShipId>;
  kind: EngagementKind;
}

export function createCombatEngagementManager(): CombatEngagementManager {
  const active = new Map<EngagementId, MutableEngagement>();
  const shipOwner = new Map<CombatShipId, EngagementId>();
  let nextId = 1;

  const view = (engagement: MutableEngagement): EngagementSnapshot => ({
    id: engagement.id,
    kind: engagement.kind,
    memberIds: [...engagement.members],
  });

  const validate = (id: CombatShipId): void => {
    if (!id.trim()) throw new Error('Combat ship ID cannot be empty');
  };

  const join = (engagement: MutableEngagement, shipId: CombatShipId): void => {
    const previous = shipOwner.get(shipId);
    if (previous && previous !== engagement.id)
      throw new Error('Ship already has a different combat authority: ' + shipId);
    engagement.members.add(shipId);
    shipOwner.set(shipId, engagement.id);
    if (engagement.members.size > 2) engagement.kind = 'fleet';
  };

  const combine = (target: MutableEngagement, source: MutableEngagement): void => {
    for (const shipId of source.members) {
      source.members.delete(shipId);
      shipOwner.delete(shipId);
      join(target, shipId);
    }
    active.delete(source.id);
    target.kind = 'fleet';
  };

  return {
    engage(shipA, shipB) {
      validate(shipA);
      validate(shipB);
      if (shipA === shipB) throw new Error('A ship cannot engage itself');
      const ownerA = shipOwner.get(shipA);
      const ownerB = shipOwner.get(shipB);
      if (ownerA && ownerB && ownerA === ownerB) return view(active.get(ownerA)!);

      const a = ownerA ? active.get(ownerA)! : null;
      const b = ownerB ? active.get(ownerB)! : null;
      if (a && b) {
        // Direct hostile interaction connects otherwise independent encounters.
        combine(a, b);
        return view(a);
      }
      if (a || b) {
        const existing = (a ?? b)!;
        join(existing, a ? shipB : shipA);
        return view(existing);
      }
      const encounter: MutableEngagement = {
        id: 'engagement-' + nextId++,
        members: new Set(),
        kind: 'duel',
      };
      active.set(encounter.id, encounter);
      join(encounter, shipA);
      join(encounter, shipB);
      return view(encounter);
    },
    disengage(shipId) {
      const id = shipOwner.get(shipId);
      if (!id) return;
      const engagement = active.get(id);
      shipOwner.delete(shipId);
      if (!engagement) return;
      engagement.members.delete(shipId);
      // Fleets do NOT silently downgrade to 1vs1.
      if (engagement.members.size < 2) {
        for (const remaining of engagement.members) shipOwner.delete(remaining);
        active.delete(id);
      }
    },
    engagementFor(shipId) {
      const id = shipOwner.get(shipId);
      return id ? view(active.get(id)!) : null;
    },
    engagements() {
      return [...active.values()].map(view);
    },
    isEngaged(shipId) {
      return shipOwner.has(shipId);
    },
    clear() {
      active.clear();
      shipOwner.clear();
      nextId = 1;
    },
  };
}
