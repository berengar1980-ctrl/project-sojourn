import type { LocalShipState } from '../../core/local-space-types';
import type { SectorNpcState } from '../../core/npc-types';
import { resolveSalvageShieldContacts } from '../salvage/salvage-container-motion';
import {
  resolveShipShieldCollisions,
  resolveShipShieldObstacleCollisions,
  type LocalShieldShipBody,
} from '../local-space/ship-shield-collision';
import { getShipDefinition } from '../ships';
import type { LocalNpcSalvagerState, NpcLocalSalvageOptions } from './npc-local-salvage-types';

export function resolveNpcSalvageLocalContacts(
  options: NpcLocalSalvageOptions,
  ships: readonly LocalNpcSalvagerState[],
  byId: ReadonlyMap<string, SectorNpcState>,
  combatantId?: string,
  skipPlayer = false
): void {
  const playerState = skipPlayer ? undefined : options.getPlayerShipState?.();
  const bodies: LocalShieldShipBody[] = ships.flatMap((local) => {
    const npc = byId.get(local.npcId);
    if (local.npcId === combatantId || npc?.combatMovement || (npc?.hullHp ?? 0) <= 0) return [];
    const definition = getShipDefinition(local.shipId);
    return definition ? [{ id: local.npcId, ship: definition, state: local }] : [];
  });
  if (playerState && options.playerShip)
    bodies.unshift({ id: 'player', ship: options.playerShip, state: playerState });

  for (const contact of resolveShipShieldCollisions(bodies)) {
    if (contact.firstId === 'player') {
      options.onPlayerShieldContact?.(contact.normal, contact.closingDistance);
    } else if (contact.secondId === 'player') {
      options.onPlayerShieldContact?.(
        { x: -contact.normal.x, y: -contact.normal.y },
        contact.closingDistance
      );
    }
  }

  // Only distress-rescue ships remain fixed obstacles. All drift objects use
  // the same impulse-based asteroid shield physics instead of acting as walls.
  const obstacles = options.field.wrecks
    .filter(
      (wreck) =>
        !wreck.containerVariant &&
        !wreck.debrisVariant &&
        !wreck.sectionVariant &&
        !wreck.combatWreckVariant
    )
    .map((wreck) => ({ id: wreck.id, position: wreck.position, radius: wreck.radius }));
  for (const collision of resolveShipShieldObstacleCollisions(bodies, obstacles)) {
    if (collision.shipId === 'player')
      options.onPlayerShieldContact?.(
        { x: -collision.normal.x, y: -collision.normal.y },
        collision.closingDistance
      );
  }
  for (const body of bodies) {
    // The player runtime owns shield hits and visible contact events.
    if (body.id === 'player') continue;
    resolveSalvageShieldContacts(
      options.field,
      body.state as LocalShipState,
      body.ship.sprite.hardpoints,
      body.ship.nominalLengthMeters
    );
  }
}
