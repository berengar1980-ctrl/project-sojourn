import type { SectorNpcState } from '../../core/npc-types';
import { resolveShipFieldDebrisContacts } from '../local-space/field-debris-contact';
import { solidFieldRockObstacles } from '../local-space/local-asteroid-footprint';
import {
  resolveShipShieldCollisions,
  resolveShipShieldObstacleCollisions,
  type LocalShieldShipBody,
} from '../local-space/ship-shield-collision';
import { getShipDefinition } from '../ships';
import type { NpcLocalMiningOptions, LocalNpcMinerState } from './npc-mining-targets';

/** The field moves only non-engaged workers. Native fighters retain one owner. */
export function resolveMinerCollisions(
  ships: readonly LocalNpcMinerState[],
  byId: ReadonlyMap<string, SectorNpcState>,
  options: NpcLocalMiningOptions,
  combatantId?: string
): void {
  const playerState = options.getPlayerShipState?.();
  const bodies: LocalShieldShipBody[] = ships.flatMap((local) => {
    const npc = byId.get(local.npcId);
    // Native combat exclusively moves engaged NPCs. Only free field traffic
    // participates in the local contact solver.
    if (local.npcId === combatantId || npc?.combatMovement || (npc?.hullHp ?? 0) <= 0) return [];
    const definition = getShipDefinition(local.shipId);
    return definition ? [{ id: local.npcId, ship: definition, state: local, pushWeight: 1 }] : [];
  });
  // With no free NPC body, neither pair contacts nor NPC/rock contacts can occur.
  if (bodies.length === 0) return;
  const playerShip = options.getPlayerShip?.() ?? options.playerShip;
  if (playerState && playerShip) {
    bodies.unshift({
      id: 'player',
      ship: playerShip,
      state: playerState,
      pushWeight: 2.4,
    });
  }
  resolveShipShieldCollisions(bodies);
  const rocks = options.getAsteroids();
  // The route planner ignores movable debris on purpose. Give it the same
  // physical displacement response as the patrol drone, rather than pushing
  // miners backwards each frame and making their routes impassable.
  for (const body of bodies) {
    if (body.id === 'player') continue;
    const miner = ships.find((ship) => ship.npcId === body.id);
    if (!miner) continue;
    resolveShipFieldDebrisContacts(body.ship, miner, rocks);
  }
  resolveShipShieldObstacleCollisions(
    bodies.filter((body) => body.id !== 'player'),
    solidFieldRockObstacles(rocks)
  );
}
