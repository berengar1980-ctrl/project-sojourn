import { npcMayInitiateAttack } from '../npcs/npc-combat-ai';
import type { SectorNpcState } from '../../core/npc-types';
import type { WorldPoint } from '../../core/world-types';
import { createConflictManager, npcConflictParticipant } from './fleet-conflict-manager';
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

export interface CareerFleetWorldPose {
  /** Authoritative world position; never mutate it from a renderer. */
  readonly positionOf: (npc: SectorNpcState) => WorldPoint;
  readonly headingOf: (npc: SectorNpcState) => number;
  readonly playerPosition?: WorldPoint;
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
// The campaign adapter owns the original combat services and real NPC references.
// eslint-disable-next-line max-lines-per-function, complexity
function createSectorFleetEncounter(
  firstSetup: StrategicCombatantSetup,
  enemy: SectorNpcState,
  allNpcs: readonly SectorNpcState[],
  initiator: string,
  victim: string,
  firstIsPlayer: boolean,
  arena?: StrategicCombatArenaOptions,
  worldPose?: CareerFleetWorldPose
): CareerFleetEncounter {
  const enemySetup = npcCombatant(enemy);
  if (!enemySetup) throw new Error('Campaign enemy lacks a combat setup');
  const seed = hashSeed(firstSetup.id + ':' + enemy.id);
  const sessionArena = buildCombatArena(firstSetup, enemySetup, seed, arena);
  const conflict = createConflictManager([
    ...(firstIsPlayer ? [{ id: firstSetup.id, role: 'player' as const }] : []),
    ...allNpcs
      .filter((npc) => npc.id !== firstSetup.id || !firstIsPlayer)
      .map(npcConflictParticipant),
  ]);
  conflict.recordAttack({ attackerId: initiator, victimId: victim, witnessedBy: [] });
  // Native combat uses the existing field coordinates when supplied. In the
  // strategic sector, project both ships into one arena without changing the
  // world-space separation or the original NPC position.
  const firstNpc = allNpcs.find((npc) => npc.id === firstSetup.id);
  const firstWorld = firstIsPlayer
    ? worldPose?.playerPosition
    : firstNpc && worldPose?.positionOf(firstNpc);
  const enemyWorld = worldPose?.positionOf(enemy);
  const anchor = { x: sessionArena.width * 0.5, y: sessionArena.height * 0.5 };
  const firstPosition =
    arena?.attackerPosition ??
    (firstWorld && enemyWorld
      ? {
          x: anchor.x + (firstWorld.x - enemyWorld.x) * 0.5,
          y: anchor.y + (firstWorld.y - enemyWorld.y) * 0.5,
        }
      : undefined);
  const enemyPosition =
    arena?.defenderPosition ??
    (firstWorld && enemyWorld
      ? {
          x: anchor.x + (enemyWorld.x - firstWorld.x) * 0.5,
          y: anchor.y + (enemyWorld.y - firstWorld.y) * 0.5,
        }
      : undefined);
  const keys = new Map([
    [firstSetup.id, firstSetup.id],
    [enemy.id, enemy.id],
  ]);
  const fleet = createDynamicFleetCombat(
    [
      {
        id: firstSetup.id,
        team: 'a',
        setup: firstSetup,
        ...(firstPosition ? { position: firstPosition } : {}),
        ...(firstNpc && worldPose ? { headingRadians: worldPose.headingOf(firstNpc) } : {}),
      },
      {
        id: enemy.id,
        team: 'b',
        setup: enemySetup,
        ...(enemyPosition ? { position: enemyPosition } : {}),
        ...(worldPose ? { headingRadians: worldPose.headingOf(enemy) } : {}),
        ...(arena?.defenderHeadingRadians === undefined
          ? {}
          : { headingRadians: arena.defenderHeadingRadians }),
      },
    ],
    sessionArena,
    seed,
    conflict.hostility(),
    keys
  );
  const worldOffsets = new Map<string, WorldPoint>();
  for (const npc of [firstNpc, enemy]) {
    if (!npc || !worldPose) continue;
    const actor = fleet.getActor(npc.id);
    if (!actor) continue;
    const original = worldPose.positionOf(npc);
    worldOffsets.set(npc.id, {
      x: original.x - actor.position.x,
      y: original.y - actor.position.y,
    });
  }
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
    // Reinforcements use the same campaign sensory, hostility and actor ownership rules.
    // eslint-disable-next-line complexity
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
        const kind = npcConflictParticipant(npc);
        if (
          kind.role !== 'pirate' &&
          kind.role !== 'drone' &&
          !(kind.role === 'npc' && kind.civilianRole === 'patrol')
        )
          continue;
        if (kind.role !== 'drone' && !npcMayInitiateAttack(npc)) continue;
        // A nearby patrol or drone can now observe the already ongoing attack.
        conflict.recordAttack({
          attackerId: initiator,
          victimId: victim,
          witnessedBy: [npc.id],
        });
        if (!activeActors().some((actor) => conflict.isHostile(npc.id, actor.setup.id))) continue;
        const setup = npcCombatant(npc);
        if (!setup) continue;
        const anchorActor = fleet.getActor(enemy.id);
        const anchorWorld = worldPose?.positionOf(enemy);
        const arrival =
          worldPose && anchorActor && anchorWorld
            ? {
                x: anchorActor.position.x + spot.x - anchorWorld.x,
                y: anchorActor.position.y + spot.y - anchorWorld.y,
              }
            : undefined;
        if (
          fleet.addShip(
            {
              id: npc.id,
              team: kind.role,
              setup,
              ...(arrival ? { position: arrival } : {}),
              ...(worldPose ? { headingRadians: worldPose.headingOf(npc) } : {}),
            },
            npc.id
          )
        ) {
          const actor = fleet.getActor(npc.id);
          if (actor && worldPose)
            worldOffsets.set(npc.id, {
              x: spot.x - actor.position.x,
              y: spot.y - actor.position.y,
            });
          members.set(npc.id, npc);
          onJoin?.(npc);
        }
      }
    },
    tick(deltaSeconds) {
      fleet.tick(deltaSeconds);
      for (const actor of activeActors()) {
        const npc = members.get(actor.setup.id);
        if (!npc) continue;
        npc.hullHp = Math.max(0, Math.min(npc.hullMaxHp, Math.round(actor.hullHp)));
        // The native 1v1 AI owns position/heading/velocity for engaged ships.
        // Sector navigation observes that same pose instead of integrating a
        // competing movement or returning to the pre-combat contact point.
        if (npc.combatMovement?.mode === 'engaged') {
          const offset = worldOffsets.get(npc.id) ?? { x: 0, y: 0 };
          npc.combatMovement.position = {
            x: actor.position.x + offset.x,
            y: actor.position.y + offset.y,
          };
          npc.combatMovement.headingRadians = actor.headingRadians;
          npc.combatMovement.speed = actor.speed;
        }
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
  arena?: StrategicCombatArenaOptions,
  worldPose?: CareerFleetWorldPose
): CareerFleetEncounter {
  return createSectorFleetEncounter(
    player,
    enemy,
    allNpcs,
    playerInitiated ? player.id : enemy.id,
    playerInitiated ? enemy.id : player.id,
    true,
    arena,
    worldPose
  );
}

/** NPC-only battles use the same fleet coordinator and reinforcement policy. */
export function createNpcFleetEncounter(
  attacker: SectorNpcState,
  defender: SectorNpcState,
  allNpcs: readonly SectorNpcState[],
  arena?: StrategicCombatArenaOptions,
  worldPose?: CareerFleetWorldPose
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
    arena,
    worldPose
  );
}
