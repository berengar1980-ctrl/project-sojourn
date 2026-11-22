/**
 * Situational combat hostility independent of ship movement and the native 1v1 AI.
 * All combatants are addressed by unique ship IDs (not a generic "npc" faction).
 * Call recordAttack only when the attack was actually observed/registered by the
 * world; this service does not grant omniscient sensor knowledge.
 */
export type ConflictRole = 'player' | 'npc' | 'drone' | 'pirate';
export type CivilianRole = 'miner' | 'freighter' | 'scavenger' | 'patrol' | 'escort' | 'other';

export interface ConflictParticipant {
  readonly id: string;
  readonly role: ConflictRole;
  /** Pirate ships belonging to the same crew/group do not attack one another. */
  readonly pirateGroup?: string;
  /** For civilian intervention, not a separate combat faction. */
  readonly civilianRole?: CivilianRole;
  readonly armed?: boolean;
}

export interface ConflictAttack {
  readonly attackerId: string;
  readonly victimId: string;
  /** Ship IDs which detected or received a reliable report of this attack. */
  readonly witnessedBy: readonly string[];
}

export interface ConflictManager {
  isHostile(sourceId: string, targetId: string): boolean;
  recordAttack(event: ConflictAttack): void;
  /** Replace event-specific state when a combat encounter ends. */
  clearEncounter(): void;
  /** A predicate usable by FleetCombat when its faction keys are ship IDs. */
  hostility(): (sourceId: string, targetId: string) => boolean;
}

export function createConflictManager(participants: readonly ConflictParticipant[]): ConflictManager {
  const members = new Map<string, ConflictParticipant>();
  for (const participant of participants) {
    if (!participant.id || members.has(participant.id))
      throw new Error('Conflict participant ship IDs must be nonempty and unique');
    if (participant.role === 'pirate' && !participant.pirateGroup)
      throw new Error('Every pirate must have a pirateGroup');
    members.set(participant.id, participant);
  }

  const directed = new Map<string, Set<string>>();
  const mark = (sourceId: string, targetId: string): void => {
    if (sourceId === targetId) return;
    const targets = directed.get(sourceId) ?? new Set<string>();
    targets.add(targetId);
    directed.set(sourceId, targets);
  };
  const member = (id: string): ConflictParticipant => {
    const found = members.get(id);
    if (!found) throw new Error('Unknown conflict participant: ' + id);
    return found;
  };
  const baseHostile = (source: ConflictParticipant, target: ConflictParticipant): boolean => {
    if (source.id === target.id) return false;
    if (source.role === 'pirate' || target.role === 'pirate') {
      return !(
        source.role === 'pirate' &&
        target.role === 'pirate' &&
        source.pirateGroup === target.pirateGroup
      );
    }
    return false;
  };
  const isHostile = (sourceId: string, targetId: string): boolean => {
    const source = member(sourceId);
    const target = member(targetId);
    return baseHostile(source, target) || (directed.get(sourceId)?.has(targetId) ?? false);
  };

  return {
    isHostile,
    recordAttack({ attackerId, victimId, witnessedBy }: ConflictAttack): void {
      const attacker = member(attackerId);
      const victim = member(victimId);
      if (attackerId === victimId) return;
      // An actual attack always establishes immediate mutual self-defence.
      mark(attackerId, victimId);
      mark(victimId, attackerId);
      const witnesses = new Set(witnessedBy);
      for (const witnessId of witnesses) {
        const witness = member(witnessId);
        if (witnessId === attackerId || witnessId === victimId) continue;
        if (witness.role === 'drone') {
          // Security drones protect attacked civilians and players, including
          // a player attacked by a civilian NPC. They do not join pirate sides.
          if (victim.role === 'player' || victim.role === 'npc') {
            mark(witness.id, attackerId);
            mark(attackerId, witness.id);
          }
        } else if (
          witness.role === 'npc' &&
          attacker.role === 'pirate' &&
          (victim.role === 'player' || victim.role === 'npc') &&
          (witness.civilianRole === 'patrol' ||
            witness.civilianRole === 'escort' ||
            witness.armed === true)
        ) {
          // Armed NPCs can aid either the player or another civilian NPC
          // against a pirate. Unarmed miners/freighters do not suicide-charge.
          mark(witness.id, attackerId);
          mark(attackerId, witness.id);
        }
      }
    },
    clearEncounter(): void {
      directed.clear();
    },
    hostility: () => isHostile,
  };
}
