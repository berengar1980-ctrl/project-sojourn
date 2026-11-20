import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import type { AsteroidFieldRuntime } from '../systems/operations/asteroid-field-world';
import type { LocalShieldShipBody } from '../systems/local-space/ship-shield-collision';
import { getShipDefinition } from '../systems/ships';

/** Keep normal traffic collision on the field authority, never on PvP combatants. */
export function resolvePirateFieldShipContacts(
  context: ControllerRuntimeContext,
  field: AsteroidFieldRuntime
): void {
  const npcs = context.economy.sectorNpcs.npcs;
  const byId = new Map(npcs.map((npc) => [npc.id, npc]));
  const bodies: LocalShieldShipBody[] = [];
  for (const miner of field.miners.ships) {
    const npc = byId.get(miner.npcId);
    if (!npc || npc.hullHp <= 0 || npc.combatMovement || npc.combatRecoverySeconds) continue;
    const ship = getShipDefinition(miner.shipId);
    if (ship) bodies.push({ id: miner.npcId, ship, state: miner, pushWeight: 1 });
  }

  const playerField = context.state.localSpace?.getSnapshot().instance;
  if (
    playerField?.sourceLocationId === field.locationId &&
    context.state.embeddedCombat !== 'local-space'
  ) {
    bodies.push({
      id: 'player',
      ship: context.state.activeShip,
      state: playerField.ship,
      pushWeight: 2.4,
    });
  }

  const droneId = 'security-drone:' + field.locationId;
  const defender = byId.get(droneId);
  const drone = field.drone.snapshot();
  if (drone.operational && defender && defender.hullHp > 0 && !defender.combatMovement) {
    const ship = getShipDefinition(defender.shipId);
    if (ship) {
      // Patrol drone position is owned by its patrol service, not normal traffic.
      bodies.push({
        id: droneId,
        ship,
        state: { position: { ...drone.position }, headingRadians: field.drone.headingRadians },
        pushWeight: 100000,
      });
    }
  }

  const contacts = field.pirates.resolveShipContacts(npcs, bodies);
  if (contacts.length === 0) return;
  const hitIds = new Set(contacts.flatMap((impact) => [impact.firstId, impact.secondId]));
  for (const miner of field.miners.ships) {
    if (hitIds.has(miner.npcId)) delete miner.routeState;
  }
}
