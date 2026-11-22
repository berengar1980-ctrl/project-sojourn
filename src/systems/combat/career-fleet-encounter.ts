import type { SectorNpcState } from '../../core/npc-types';
import type { WorldPoint } from '../../core/world-types';
import { createConflictManager, type ConflictParticipant } from './fleet-conflict-manager';
import { createDynamicFleetCombat } from './dynamic-fleet-combat';
import { buildCombatArena } from './strategic-combat-arena';
import { hashSeed } from './strategic-combat-geometry';
import { npcCombatant } from './npc-combatant-setup';
import type { ParallelNativeDuels } from './parallel-native-duels';
import type {
  StrategicCombatantSetup,
  StrategicCombatArenaOptions,
  StrategicCombatService,
} from './strategic-combat-types';

const CONTACT_RANGE = 650;

function participant(npc: SectorNpcState): ConflictParticipant {
  if (npc.id.startsWith('security-drone:')) return { id: npc.id, role: 'drone', armed: true };
  if (npc.pirate || npc.job === 'pirate') {
    return {
      id: npc.id,
      role: 'pirate',
      pirateGroup: npc.factionId ?? npc.pirateMark ?? 'pirates',
    };
  }
  return {
    id: npc.id,
    role: 'npc',
    civilianRole: npc.job === 'salvager' ? 'scavenger' : npc.job,
    armed: npc.job === 'patrol' || (npc.installedComponents?.weapon?.length ?? 0) > 0,
  };
}

export interface CareerFleetEncounter {
  readonly fleet: ParallelNativeDuels;
  readonly combat: StrategicCombatService;
  readonly members: ReadonlyMap<string, SectorNpcState>;
  /** Witnessed reinforcements enter without cloning or reticking any ship. */
  joinNearby(
    position: WorldPoint,
    npcs: readonly SectorNpcState[],
    npcPosition: (npc: SectorNpcState) => WorldPoint,
    onJoin?: (npc: SectorNpcState) => void
  ): void;
  tick(deltaSeconds: number): void;
}

/** Player/NPC campaign encounter backed by exactly the same native PvP fleet core. */
function createSectorFleetEncounter(
  firstSetup: StrategicCombatantSetup,
  enemy: SectorNpcState,
  allNpcs: readonly SectorNpcState[],
  initiator: string,
  victim: string,
  firstIsPlayer: boolean,
  arena?: StrategicCombatArenaOptions
): CareerFleetEncounter {
  const enemySetup = npcCombatant(enemy);
  if (!enemySetup) throw new Error('Campaign enemy lacks a combat setup');
  const seed = hashSeed(firstSetup.id + ':' + enemy.id);
  const sessionArena = buildCombatArena(firstSetup, enemySetup, seed, arena);
  const conflict = createConflictManager([
    ...(firstIsPlayer ? [{ id: firstSetup.id, role: 'player' as const }] : []),
    ...allNpcs.filter((npc) => npc.id !== firstSetup.id || !firstIsPlayer).map(participant),
  ]);
  conflict.recordAttack({ attackerId: initiator, victimId: victim, witnessedBy: [] });
  const keys = new Map([
    [firstSetup.id, firstSetup.id],
    [enemy.id, enemy.id],
  ]);
  const fleet = createDynamicFleetCombat(
    [
      { id: firstSetup.id, team: 'a', setup: firstSetup },
      { id: enemy.id, team: 'b', setup: enemySetup },
    ],
    sessionArena,
    seed,
    conflict.hostility(),
    keys
  );
  const firstNpc = allNpcs.find((npc) => npc.id === firstSetup.id);
  const members = new Map<string, SectorNpcState>([
    [enemy.id, enemy],
    ...(firstNpc ? [[firstNpc.id, firstNpc] as const] : []),
  ]);
  const activeActors = () => [
    ...fleet.duels.flatMap((service) => [
      service.getParallelActor!('attacker'),
      service.getParallelActor!('defender'),
    ]),
    ...fleet.supporters.map((service) => service.getParallelActor!('attacker')),
  ];
  return {
    fleet,
    combat: fleet.duels[0]!,
    members,
    joinNearby(position, npcs, npcPosition, onJoin) {
      if (fleet.getSnapshot().finished) return;
      for (const npc of npcs) {
        if (
          members.has(npc.id) ||
          npc.hullHp <= 0 ||
          npc.combatMovement ||
          (npc.combatRecoverySeconds ?? 0) > 0
        )
          continue;
        const spot = npcPosition(npc);
        if (Math.hypot(spot.x - position.x, spot.y - position.y) > CONTACT_RANGE) continue;
        const kind = participant(npc);
        if (
          kind.role !== 'pirate' &&
          kind.role !== 'drone' &&
          !(kind.role === 'npc' && kind.civilianRole === 'patrol')
        )
          continue;
        if (kind.role === 'pirate' && npc.aggression < 60) continue;
        // A nearby patrol or drone can now observe the already ongoing attack.
        conflict.recordAttack({
          attackerId: initiator,
          victimId: victim,
          witnessedBy: [npc.id],
        });
        if (!activeActors().some((actor) => conflict.isHostile(npc.id, actor.setup.id))) continue;
        const setup = npcCombatant(npc);
        if (!setup) continue;
        if (fleet.addShip({ id: npc.id, team: kind.role, setup }, npc.id)) {
          members.set(npc.id, npc);
          onJoin?.(npc);
        }
      }
    },
    tick(deltaSeconds) {
      fleet.tick(deltaSeconds);
      for (const actor of activeActors()) {
        const npc = members.get(actor.setup.id);
        if (npc) npc.hullHp = Math.max(0, Math.round(actor.hullHp));
      }
    },
  };
}

/** Player-started or pirate-started encounter, using the identical fleet core. */
export function createCareerFleetEncounter(
  player: StrategicCombatantSetup,
  enemy: SectorNpcState,
  allNpcs: readonly SectorNpcState[],
  playerInitiated: boolean,
  arena?: StrategicCombatArenaOptions
): CareerFleetEncounter {
  return createSectorFleetEncounter(
    player,
    enemy,
    allNpcs,
    playerInitiated ? player.id : enemy.id,
    playerInitiated ? enemy.id : player.id,
    true,
    arena
  );
}

/** NPC-only battles use the same fleet coordinator and reinforcement policy. */
export function createNpcFleetEncounter(
  attacker: SectorNpcState,
  defender: SectorNpcState,
  allNpcs: readonly SectorNpcState[],
  arena?: StrategicCombatArenaOptions
): CareerFleetEncounter {
  const setup = npcCombatant(attacker);
  if (!setup) throw new Error('NPC attacker lacks a combat setup');
  return createSectorFleetEncounter(
    setup,
    defender,
    allNpcs,
    attacker.id,
    defender.id,
    false,
    arena
  );
}
