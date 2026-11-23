import { getShipDefinition } from '../../systems/ships';
import type { SectorNpcState } from '../../core/npc-types';
import type { WorldPoint } from '../../core/world-types';

/** Physical traffic shared by career miners, salvagers and FleetCombat navigation. */
export function createFleetWorldTraffic(
  states: ReadonlyMap<string, { readonly npc: SectorNpcState }>,
  position: (id: string) => WorldPoint | null,
  isActive: (id: string) => boolean,
  player: () => { readonly shipId: string; readonly position: WorldPoint }
) {
  return (id: string) => {
    const traffic = [...states].flatMap(([otherId, entry]) => {
      if (otherId === id || !isActive(otherId) || entry.npc.hullHp <= 0) return [];
      const point = position(otherId);
      const ship = getShipDefinition(entry.npc.shipId);
      return point && ship
        ? [{ id: 'traffic:' + otherId, position: point, radius: ship.nominalLengthMeters * 0.5 }]
        : [];
    });
    const currentPlayer = player();
    const playerShip = getShipDefinition(currentPlayer.shipId);
    if (playerShip && id !== 'player')
      traffic.push({
        id: 'traffic:player',
        position: currentPlayer.position,
        radius: playerShip.nominalLengthMeters * 0.5,
      });
    return traffic;
  };
}
