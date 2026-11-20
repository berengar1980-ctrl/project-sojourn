import type { SectorNpcState } from '../../core/npc-types';
import type { WorldPoint } from '../../core/world-types';
import type { NpcLocalMiningService } from '../npcs/npc-local-mining-service';
import { createFleetCareerNpcParticipant } from './fleet-career-npc-adapter';
import { npcDefenseReaction } from '../npcs/npc-combat-ai';
import type { FleetCombatShipSnapshot } from './fleet-combat-service';
import type { FleetCombatParticipant, FleetCombatWorldOptions } from './fleet-combat-service';

/** Attach the actual campaign local-miner world, not a PvP mining simulation.
 * The career world remains the sole movement, navigation, scanning, ore,
 * cargo, event and collision authority. Use the returned tickWorld as the
 * SINGLE owner of the miner service tick while the fleet scene is active.
 */
export function createFleetCareerMiningBridge(
  mining: NpcLocalMiningService,
  miners: readonly SectorNpcState[],
  options: {
    readonly spawnAtSeconds?: ReadonlyMap<string, number>;
    readonly spawnPositions?: ReadonlyMap<string, WorldPoint>;
  } = {}
): {
  readonly participants: readonly FleetCombatParticipant[];
  readonly world: FleetCombatWorldOptions;
} {
  const threatenedBy = (npc: SectorNpcState, ships: readonly FleetCombatShipSnapshot[]) => {
    const local = mining.ships.find((ship) => ship.npcId === npc.id);
    if (!local || npc.hullHp <= 0) return null;
    return ships
      .filter((entry) =>
        (entry.factionId === 'pirate-a' || entry.factionId === 'pirate-b') &&
        entry.ship.hullHp > 0 &&
        entry.targetId === npc.id
      )
      .sort((a, b) =>
        Math.hypot(a.ship.position.x - local.position.x, a.ship.position.y - local.position.y) -
          Math.hypot(b.ship.position.x - local.position.x, b.ship.position.y - local.position.y)
      )[0] ?? null;
  };
  const beginDefense = (npc: SectorNpcState, ships: readonly FleetCombatShipSnapshot[]) => {
    const pirate = threatenedBy(npc, ships);
    const local = mining.ships.find((ship) => ship.npcId === npc.id);
    if (!local || !pirate) {
      if (npc.combatMovement && npc.combatMovement.targetKind === 'npc') {
        delete npc.combatMovement;
      }
      return;
    }
    const setup = participants.find((entry) => entry.setup.id === npc.id)?.setup;
    if (!setup) return;
    // The career combat policy (including armed/unarmed civilian doctrine) is
    // authoritative. FleetCombat only notices the existing hostile target lock.
    const canFight = setup.preferredTactic !== 'flee' &&
      npcDefenseReaction(npc) === 'fight';
    const mode = canFight ? 'engaged' : 'flee';
    npc.combatMovement = {
      mode,
      targetKind: 'npc',
      targetId: pirate.ship.id,
      position: { ...local.position },
      headingRadians: local.headingRadians,
      speed: local.speed,
    };
  };
  const participants = miners.map((npc) => {
    if (npc.job !== 'miner') throw new Error('Fleet miner bridge requires career miners');
    const local = mining.ships.find((ship) => ship.npcId === npc.id);
    const arrival = options.spawnAtSeconds?.get(npc.id) ?? 0;
    const entry = local?.position ?? options.spawnPositions?.get(npc.id);
    if (!entry || (!local && arrival === 0))
      throw new Error('Career miner is not present in local field: ' + npc.id);
    let lastPosition = { ...entry };
    let lastHeading = local?.headingRadians ?? 0;
    let hasArrived = Boolean(local);
    const participant = createFleetCareerNpcParticipant(npc, entry, {
      headingRadians: lastHeading,
      targetId: null,
      spawnAtSeconds: arrival,
    });
    return {
      ...participant,
      externalMovement(_dt: number) {
        const ship = mining.ships.find((candidate) => candidate.npcId === npc.id);
        if (!ship && !hasArrived)
          throw new Error('Scheduled career miner did not enter local field: ' + npc.id);
        if (!ship) {
          return {
            position: { ...lastPosition },
            headingRadians: lastHeading,
            targetId: null,
            active: false,
          };
        }
        hasArrived = true;
        lastPosition = { ...ship.position };
        lastHeading = ship.headingRadians;
        const battle = npc.combatMovement;
        if (battle && battle.targetKind === 'npc') {
          const defending = battle.mode !== 'flee';
          return {
            position: { ...lastPosition },
            headingRadians: lastHeading,
            targetId: defending ? battle.targetId : null,
            combatMotionTargetId: battle.targetId,
            combatTactic: defending ? 'fight' as const : 'flee' as const,
            afterCombatMotion(position: WorldPoint, heading: number, speed: number) {
              mining.syncCombatPose(npc.id, position, heading, speed);
              if (!npc.combatMovement) return;
              npc.combatMovement.position = { ...position };
              npc.combatMovement.headingRadians = heading;
              npc.combatMovement.speed = speed;
            },
          };
        }
        return {
          position: { ...lastPosition },
          headingRadians: lastHeading,
          targetId: null,
        };
      },
    };
  });
  return {
    participants,
    world: {
      beforeWorldTick(ships) {
        for (const npc of miners) beginDefense(npc, ships);
      },
      tickWorld: (dt) => mining.tick(dt),
      afterCombatTick(ships) {
        for (const npc of miners) {
          const current = ships.find((entry) => entry.ship.id === npc.id);
          if (current) npc.hullHp = Math.max(0, Math.min(npc.hullMaxHp, current.ship.hullHp));
        }
      },
    },
  };
}
