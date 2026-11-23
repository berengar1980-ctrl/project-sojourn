import type { SectorNpcState } from '../../core/npc-types';
import type { WorldPoint } from '../../core/world-types';
import { getShipDefinition } from '../../systems/ships';
import {
  resolveShipShieldCollisions,
  type LocalShieldShipBody,
} from '../../systems/local-space/ship-shield-collision';
import type { createFleetWorldShieldContacts } from './fleet-world-shield-contacts';

interface WorldShipState {
  readonly npc: SectorNpcState;
}

/** The sole neutral-contact solver for the shared physical FleetCombat world. */
export function resolveFleetWorldNeutralCollisions(
  ships: ReadonlyMap<string, WorldShipState>,
  active: (id: string) => boolean,
  stateFor: (id: string) => { position: WorldPoint; headingRadians: number } | null,
  shieldEffects: ReturnType<typeof createFleetWorldShieldContacts>,
  player?: {
    id: string;
    shipId: string;
    position: WorldPoint;
    headingRadians: number;
    onDisplaced: (position: WorldPoint) => void;
  }
): void {
  const bodies: LocalShieldShipBody[] = [...ships].flatMap(([id, moving]) => {
    if (!active(id) || moving.npc.hullHp <= 0) return [];
    const ship = getShipDefinition(moving.npc.shipId);
    const state = stateFor(id);
    return ship && state ? [{ id, ship, state }] : [];
  });
  if (player) {
    const ship = getShipDefinition(player.shipId);
    if (ship) bodies.push({ id: player.id, ship, state: player, pushWeight: 3 });
  }
  const headings = new Map(bodies.map((body) => [body.id, body.state.headingRadians] as const));
  const collisions = resolveShipShieldCollisions(bodies);
  const playerBody = bodies.find((body) => body.id === player?.id);
  if (player && playerBody) {
    const moved = collisions.some((hit) => hit.firstId === player.id || hit.secondId === player.id);
    if (moved) player.onDisplaced(playerBody.state.position);
  }
  shieldEffects.register(collisions, (id) => headings.get(id) ?? 0);
}
