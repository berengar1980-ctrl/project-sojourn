import { seededLocalGate } from '../../core/local-space-exit';
import { fieldInterceptRange, npcMayInitiateAttack } from '../npcs/npc-combat-ai';
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
  StrategicCombatSnapshot,
} from './strategic-combat-types';

const CONTACT_RANGE = 650;

export type FieldWitness = (
  locationId: string,
  npc: SectorNpcState,
  target: WorldPoint
) => { position: WorldPoint; headingRadians: number; speed?: number } | null;

export interface CareerFleetWorldPose {
  readonly fieldWitness?: FieldWitness;
  readonly fieldOwnsContact?: (npc: SectorNpcState) => boolean;
  /** Authoritative world position; never mutate it from a renderer. */
  readonly positionOf: (npc: SectorNpcState) => WorldPoint;
  readonly headingOf: (npc: SectorNpcState) => number;
  readonly playerPosition?: WorldPoint;
}

export interface CareerFleetEncounter {
  readonly fleet: ParallelNativeDuels;
  readonly combat: StrategicCombatService;
  readonly members: ReadonlyMap<string, SectorNpcState>;
  joinPlayer(
    player: StrategicCombatantSetup,
    targetId: string,
    field: StrategicCombatArenaOptions
  ): StrategicCombatService | null;
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
  const fieldArena =
    arena?.backdropSeed !== undefined && !arena.exitPoint
      ? { ...arena, exitPoint: seededLocalGate(arena.width, arena.height, arena.backdropSeed) }
      : arena;
  const sessionArena = buildCombatArena(firstSetup, enemySetup, seed, fieldArena);
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
        ...(firstNpc && worldPose
          ? { headingRadians: arena?.attackerHeadingRadians ?? worldPose.headingOf(firstNpc) }
          : {}),
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
  const primary = fleet.duels[0]!;
  let playerResult: StrategicCombatSnapshot | null = null;
  const capturePlayerExit = () => {
    const state = primary.getSnapshot();
    if (state.attacker.id !== firstSetup.id) return;
    if (state.attacker.hullHp <= 0) {
      playerResult = { ...state, winner: 'defender', outcomeReason: 'destruction' };
    } else if (state.winner === 'defender' && state.outcomeReason === 'escape') {
      playerResult = state;
    }
  };
  const activeActors = () => [
    ...fleet.duels.flatMap((service) => [
      service.getParallelActor!('attacker'),
      service.getParallelActor!('defender'),
    ]),
    ...fleet.supporters.map((service) => service.getParallelActor!('attacker')),
  ];
  function nearbyContact(
    npc: SectorNpcState,
    opponents: ReturnType<typeof activeActors>,
    witness: FieldWitness
  ) {
    const range = fieldInterceptRange(npc.id, npc.pirate === true);
    for (const actor of opponents) {
      const id = actor.setup.id;
      if (!conflict.isHostile(npc.id, id) && (npc.pirate || (id !== initiator && id !== victim)))
        continue;
      const contact = witness(enemy.locationId, npc, actor.position);
      if (
        contact &&
        Math.hypot(contact.position.x - actor.position.x, contact.position.y - actor.position.y) <=
          range
      )
        return contact;
    }
    return null;
  }
  return {
    fleet,
    combat: firstIsPlayer
      ? { ...primary, getSnapshot: () => playerResult ?? primary.getSnapshot() }
      : primary,
    members,
    joinPlayer(player, targetId, field) {
      const state = fleet.getSnapshot();
      const target = fleet.getActor(targetId);
      if (
        field.backdropSeed === undefined ||
        field.backdropSeed !== arena?.backdropSeed ||
        !field.attackerPosition ||
        !target ||
        target.hullHp <= 0 ||
        state.finished ||
        state.escapedShipIds.includes(targetId) ||
        fleet.getActor(player.id)
      )
        return null;
      conflict.include({ id: player.id, role: 'player' });
      conflict.recordAttack({ attackerId: player.id, victimId: targetId, witnessedBy: [] });
      const joined = fleet.addShip(
        {
          id: player.id,
          team: 'player',
          setup: player,
          position: field.attackerPosition,
          ...(field.attackerVelocity && { velocity: field.attackerVelocity }),
          ...(field.attackerHeadingRadians !== undefined && {
            headingRadians: field.attackerHeadingRadians,
          }),
        },
        player.id,
        targetId
      );
      if (!joined) return null;
      const service = fleet.supporters[fleet.supporters.length - 1]!;
      return {
        ...service,
        getSnapshot() {
          const duel = service.getSnapshot();
          if (duel.winner !== null) return duel;
          const result = fleet.getSnapshot();
          if (!result.finished) return duel;
          // The shared opponent can depart through the original NPC duel.
          if (result.escapedShipIds.includes(duel.defender.id))
            return { ...duel, winner: 'attacker', outcomeReason: 'escape' };
          if (duel.defender.hullHp <= 0)
            return { ...duel, winner: 'attacker', outcomeReason: 'destruction' };
          return duel;
        },
      };
    },
    // Reinforcements use the same campaign sensory, hostility and actor ownership rules.
    // eslint-disable-next-line complexity
    joinNearby(position, npcs, npcPosition, onJoin) {
      const snapshot = fleet.getSnapshot();
      if (snapshot.finished) return;
      const opponents = [...new Set(activeActors())].filter(
        (actor) => actor.hullHp > 0 && !snapshot.escapedShipIds.includes(actor.setup.id)
      );
      for (const npc of npcs) {
        if (
          members.has(npc.id) ||
          npc.hullHp <= 0 ||
          npc.combatMovement ||
          (npc.combatRecoverySeconds ?? 0) > 0
        )
          continue;
        const kind = npcConflictParticipant(npc);
        if (
          kind.role !== 'pirate' &&
          kind.role !== 'drone' &&
          !(kind.role === 'npc' && kind.civilianRole === 'patrol')
        )
          continue;
        const localWitness = arena && worldPose?.fieldWitness;
        if (!arena && worldPose?.fieldOwnsContact?.(npc)) continue;
        // Field pirates already pursue prey. The sector's aggression threshold
        // governs starting a hunt, not joining a fight they physically reach.
        if (
          kind.role !== 'drone' &&
          !(localWitness && kind.role === 'pirate') &&
          !npcMayInitiateAttack(npc)
        )
          continue;
        conflict.include(kind);
        const contact = localWitness ? nearbyContact(npc, opponents, localWitness) : null;
        if (localWitness && !contact) continue;
        const spot = contact?.position ?? npcPosition(npc);
        if (!localWitness && Math.hypot(spot.x - position.x, spot.y - position.y) > CONTACT_RANGE)
          continue;
        // A nearby patrol or drone can now observe the already ongoing attack.
        conflict.recordAttack({
          attackerId: initiator,
          victimId: victim,
          witnessedBy: [npc.id],
        });
        if (!opponents.some((actor) => conflict.isHostile(npc.id, actor.setup.id))) continue;
        const setup = npcCombatant(npc);
        if (!setup) continue;
        const anchorActor = fleet.getActor(enemy.id);
        const anchorWorld = worldPose?.positionOf(enemy);
        const arrival =
          contact?.position ??
          (worldPose && anchorActor && anchorWorld
            ? {
                x: anchorActor.position.x + spot.x - anchorWorld.x,
                y: anchorActor.position.y + spot.y - anchorWorld.y,
              }
            : undefined);
        if (
          fleet.addShip(
            {
              id: npc.id,
              team: kind.role,
              setup,
              ...(arrival ? { position: arrival } : {}),
              ...(contact && {
                velocity: {
                  x: Math.cos(contact.headingRadians) * (contact.speed ?? 0),
                  y: Math.sin(contact.headingRadians) * (contact.speed ?? 0),
                },
              }),
              ...(worldPose
                ? { headingRadians: contact?.headingRadians ?? worldPose.headingOf(npc) }
                : {}),
            },
            npc.id
          )
        ) {
          const actor = fleet.getActor(npc.id);
          if (actor && worldPose)
            worldOffsets.set(npc.id, {
              x: npcPosition(npc).x - actor.position.x,
              y: npcPosition(npc).y - actor.position.y,
            });
          members.set(npc.id, npc);
          onJoin?.(npc);
        }
      }
    },
    tick(deltaSeconds) {
      const trackExit = firstIsPlayer && !playerResult && fleet.supporters.length > 0;
      fleet.tick(deltaSeconds, trackExit ? capturePlayerExit : undefined);
      for (const npc of members.values()) {
        const actor = fleet.getActor(npc.id);
        if (!actor) continue;
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
