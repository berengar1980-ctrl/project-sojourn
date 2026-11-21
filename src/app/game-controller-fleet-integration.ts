import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import {
  beginControllerFieldFleet,
  controllerFieldFleetFor,
  controllerFieldFleetLocation,
  endControllerFieldFleet,
  fieldWorldFor,
} from './game-controller-field-world-bridge';
import { servicedPlayerCombatant } from './game-controller-ship-service';
import { isFleetCareerTest } from './game-controller-fleet-test-session';
import type { FleetCombatParticipant } from '../systems/combat/fleet-combat-service';
import { showFleetCombatResult } from '../ui/combat/campaign-combat-summary';

/** Testing override uses the normal running career field; it spawns no ships and
 * creates no PvP map. Natural multi-pirate encounters work without this flag. */
function fleetPreviewEnabled(): boolean {
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('fleet') === '1'
  );
}

/** Preview-only positioning of REAL career pirates in an existing field.
 * This uses native local pirate services, not synthetic test combatants.
 */
const previewStagedFields = new WeakMap<ControllerRuntimeContext, Set<string>>();

function stageExistingPiratesForPreview(
  context: ControllerRuntimeContext,
  locationId: string
): void {
  if (!fleetPreviewEnabled()) return;
  let staged = previewStagedFields.get(context);
  if (!staged) {
    staged = new Set<string>();
    previewStagedFields.set(context, staged);
  }
  if (staged.has(locationId)) return;
  staged.add(locationId);
  const npcs = context.economy.sectorNpcs.npcs;
  const present = npcs.filter(
    (npc) => npc.pirate && npc.locationId === locationId && npc.hullHp > 0
  );
  for (const npc of npcs) {
    if (present.length >= 2) break;
    if (
      !npc.pirate ||
      npc.hullHp <= 0 ||
      npc.locationId === locationId ||
      npc.combatMovement ||
      (npc.combatRecoverySeconds ?? 0) > 0
    )
      continue;
    npc.locationId = locationId;
    delete npc.travel;
    present.push(npc);
  }
  if (present.length) {
    context.systemLog.write(
      'FLEET TEST > ' + present.length + ' ECHTE KARRIERE-PIRATEN IM BESTEHENDEN FELD'
    );
  }
}

function currentCareerField(context: ControllerRuntimeContext) {
  const local = context.state.localSpace?.getSnapshot();
  if (
    context.state.mode !== 'local-space' ||
    !local ||
    context.state.embeddedCombat !== null ||
    context.engagements.activePlayerCombat()
  ) {
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
  if (context.state.combatReengageSeconds > 0) return;
  stageExistingPiratesForPreview(context, locationId);
  if (
    context.engagements
      .activeNpcCombatSnapshots?.()
      .some((duel) =>
        [duel.attacker.id, duel.defender.id].some((id) =>
          context.economy.sectorNpcs.npcs.some(
            (npc) => npc.id === id && npc.locationId === locationId
          )
        )
      )
  )
    return;
  const npcs = context.economy.sectorNpcs.npcs;
  const localPirates = npcs.filter(
    (npc) => npc.pirate && npc.locationId === locationId && npc.hullHp > 0
  );
  field.pirates.reconcile(localPirates);
  const presentPirates = field.pirates.snapshot(localPirates);
  if (presentPirates.length < (fleetPreviewEnabled() || isFleetCareerTest(context) ? 1 : 2)) return;
  const miners = field.miners.ships.filter((entry) =>
    npcs.some((npc) => npc.id === entry.npcId && npc.hullHp > 0 && npc.locationId === locationId)
  );
  const drone =
    npcs.some((npc) => npc.id === 'security-drone:' + locationId && npc.hullHp > 0) &&
    field.drone.snapshot().operational;
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
    // The original local-space runtime owns player navigation and mining.
    // FleetCombat only consumes its live pose and resolves shared combat physics.
    externalMovement(dt, nearby) {
      const scene = context.state.localSpace;
      if (!scene || scene.getSnapshot().instance !== field.instance)
        return {
          position: { ...local.instance.ship.position },
          headingRadians: local.instance.ship.headingRadians,
          targetId: null,
          active: false,
        };
      const state = scene.tickFleetNavigation(dt);
      return {
        position: { ...state.instance.ship.position },
        headingRadians: state.instance.ship.headingRadians,
        targetId: nearby.find((ship) => ship.ship.id === 'player')?.targetId ?? null,
      };
    },
  };
  const fleet = beginControllerFieldFleet(context, locationId, [player]);
  context.systemLog.write(
    'FLEETCOMBAT > ' + fleet.getSnapshot().ships.length + ' SCHIFFE · BESTEHENDES ASTEROIDENFELD'
  );
}

function endFinishedFleet(
  context: ControllerRuntimeContext,
  locationId: string,
  returnToStarMap: () => void
): boolean {
  const fleet = controllerFieldFleetFor(context, locationId);
  if (!fleet) return false;
  const ships = fleet.getSnapshot().ships;
  const activePirates = ships.some(
    (entry) =>
      entry.ship.hullHp > 0 && (entry.factionId === 'pirate-a' || entry.factionId === 'pirate-b')
  );
  // Keep the existing combat world alive until in-flight ordnance resolves.
  // Otherwise a final projectile/mine/tractor throw disappears when the last
  // pirate is destroyed, potentially suppressing a real career-world hit.
  const view = fleet.getSnapshot();
  const activePlayer = ships.some((entry) => entry.ship.id === 'player' && entry.ship.hullHp > 0);
  const pendingOrdnance =
    view.projectiles.length > 0 || view.mines.length > 0 || view.thrownAsteroids.length > 0;
  if (
    activePlayer &&
    (activePirates || pendingOrdnance) &&
    currentCareerField(context)?.locationId === locationId
  )
    return false;
  const defeated = !activePlayer;
  const player = ships.find((entry) => entry.ship.id === 'player')?.ship;
  endControllerFieldFleet(context, locationId, fleet);
  context.state.combatReengageSeconds = 8;
  context.systemLog.write(
    defeated
      ? 'FLEETCOMBAT > EIGENES SCHIFF ZERSTÖRT'
      : 'FLEETCOMBAT > FELD-AUTORITÄT AN KAMPAGNE ZURÜCKGEGEBEN'
  );
  if (player) {
    context.state.combatResultPending = true;
    showFleetCombatResult(context.root, !defeated, player.hullHp, player.hullMaxHp, () => {
      if (defeated) returnToStarMap();
      context.state.combatResultPending = false;
    });
  }
  return true;
}

/** Attach the shared combat coordinator to the ALREADY mounted local field.
 * No additional scene, independent NPCs or graphics pipeline are constructed.
 */
export function advanceControllerFleetIntegration(
  context: ControllerRuntimeContext,
  returnToStarMap: () => void
): void {
  const current = controllerFieldFleetLocation(context);
  if (current && !endFinishedFleet(context, current, returnToStarMap)) return;
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
