import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import {
  beginControllerFieldFleet,
  controllerFieldFleetFor,
  controllerFieldFleetLocation,
  endControllerFieldFleet,
  fieldWorldFor,
} from './game-controller-field-world-bridge';
import { servicedPlayerCombatant } from './game-controller-ship-service';
import type { FleetCombatParticipant } from '../systems/combat/fleet-combat-service';

/** Testing override uses the normal running career field; it spawns no ships and
 * creates no PvP map. Natural multi-pirate encounters work without this flag. */
function fleetPreviewEnabled(): boolean {
  return typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('fleet') === '1';
}

function currentCareerField(context: ControllerRuntimeContext) {
  const local = context.state.localSpace?.getSnapshot();
  if (context.state.mode !== 'local-space' || !local ||
      context.state.embeddedCombat !== null || context.engagements.activePlayerCombat()) {
    return null;
  }
  const locationId = local.instance.sourceLocationId;
  const field = fieldWorldFor(context).field(locationId);
  if (!field || local.instance !== field.instance) return null;
  return { field, local, locationId };
}

function tryBeginFieldFleet(context: ControllerRuntimeContext): void {
  const current = currentCareerField(context);
  if (!current) return;
  const { field, local, locationId } = current;
  if (context.engagements.activeNpcCombatSnapshots?.().some((duel) =>
    [duel.attacker.id, duel.defender.id].some((id) =>
      context.economy.sectorNpcs.npcs.some((npc) =>
        npc.id === id && npc.locationId === locationId
      )
    )
  )) return;
  const npcs = context.economy.sectorNpcs.npcs;
  const localPirates = npcs.filter((npc) =>
    npc.pirate && npc.locationId === locationId && npc.hullHp > 0
  );
  field.pirates.reconcile(localPirates);
  const presentPirates = field.pirates.snapshot(localPirates);
  if (presentPirates.length < (fleetPreviewEnabled() ? 1 : 2)) return;
  const miners = field.miners.ships.filter((entry) =>
    npcs.some((npc) => npc.id === entry.npcId && npc.hullHp > 0 && npc.locationId === locationId)
  );
  const drone = npcs.some((npc) =>
    npc.id === 'security-drone:' + locationId && npc.hullHp > 0
  ) && field.drone.snapshot().operational;
  if (1 + presentPirates.length + miners.length + Number(drone) < 3) return;

  const setup = servicedPlayerCombatant(
    context.state.activeShip,
    context.crew,
    context.loadouts,
    context.shipOperations
  );
  const player: FleetCombatParticipant = {
    setup: {
      ...setup,
      hullHp: local.hull.currentHp,
      shieldHp: local.shield.currentHp,
    },
    factionId: 'player',
    position: { ...local.instance.ship.position },
    headingRadians: local.instance.ship.headingRadians,
    targetId: fleetPreviewEnabled() ? (presentPirates[0]?.npcId ?? null) : null,
  };
  const fleet = beginControllerFieldFleet(context, locationId, [player]);
  context.systemLog.write(
    'FLEETCOMBAT > ' + fleet.getSnapshot().ships.length +
    ' SCHIFFE · BESTEHENDES ASTEROIDENFELD'
  );
}

function endFinishedFleet(context: ControllerRuntimeContext, locationId: string): boolean {
  const fleet = controllerFieldFleetFor(context, locationId);
  if (!fleet) return false;
  const ships = fleet.getSnapshot().ships;
  const activePirates = ships.some((entry) =>
    entry.ship.hullHp > 0 && (entry.factionId === 'pirate-a' || entry.factionId === 'pirate-b')
  );
  if (activePirates && currentCareerField(context)?.locationId === locationId) return false;
  endControllerFieldFleet(context, locationId, fleet);
  context.systemLog.write('FLEETCOMBAT > FELD-AUTORITÄT AN KAMPAGNE ZURÜCKGEGEBEN');
  return true;
}

/** Attach the shared combat coordinator to the ALREADY mounted local field.
 * No additional scene, independent NPCs or graphics pipeline are constructed.
 */
export function advanceControllerFleetIntegration(context: ControllerRuntimeContext): void {
  const current = controllerFieldFleetLocation(context);
  if (current && !endFinishedFleet(context, current)) return;
  tryBeginFieldFleet(context);
}

/** The normal existing "attack selected ship" button works in FleetCombat. */
export function targetControllerFleetShip(
  context: ControllerRuntimeContext,
  targetId: string
): boolean {
  const fleet = controllerFieldFleetFor(context);
  if (!fleet) return false;
  fleet.setTarget('player', targetId);
  context.systemLog.write('FLEETCOMBAT > ZIEL ' + targetId.toUpperCase());
  return true;
}
