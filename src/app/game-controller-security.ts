import { fieldBattleMotion } from './game-controller-field-combat-pose';
import type { SectorNpcState } from '../core/npc-types';
import { distance } from '../systems/local-space/local-space-motion';
import { fieldInterceptRange, localArmedTraffic } from '../systems/npcs/npc-combat-ai';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import {
  detectedSecurityPirate,
  interceptSecurityPirate,
  securityPirateApproach,
} from './game-controller-drone-pirate-response';
import type { DroneContact } from '../systems/operations/asteroid-security-drone';
import type { FieldRouteObstacle } from '../systems/navigation/field-ship-routing';
import type { AsteroidFieldRuntime } from '../systems/operations/asteroid-field-world';
import { dispatchPatrolToReport } from './game-controller-law-enforcement';
import { localMiningCombatArena } from './game-controller-combat';
import { settleLegalDebt } from './game-controller-legal-ledger';
import { resolvePirateFieldShipContacts } from './game-controller-pirate-ship-contacts';
import { offerLegalDemand } from './game-controller-legal-decisions';

function canLocalPiratesTargetPlayer(context: ControllerRuntimeContext): boolean {
  return (
    !context.state.combatResultPending &&
    context.state.combatReengageSeconds <= 0 &&
    !context.engagements.activePlayerCombat()
  );
}

function pirateMiningContacts(context: ControllerRuntimeContext, field: AsteroidFieldRuntime) {
  const npcs = context.economy.sectorNpcs.npcs;
  return field.miners.ships.map((ship) => {
    const npc = npcs.find((entry) => entry.id === ship.npcId);
    return {
      npcId: ship.npcId,
      position: ship.position,
      inCombat: Boolean(npc?.combatMovement || npc?.combatRecoverySeconds),
    };
  });
}

function engagePatrolContact(
  context: ControllerRuntimeContext,
  field: AsteroidFieldRuntime,
  pirateId: string,
  targetId: string,
  piratePosition: { x: number; y: number },
  arena: ReturnType<typeof localMiningCombatArena>
): boolean {
  const enemy = field.pirates
    .snapshot(context.economy.sectorNpcs.npcs)
    .find((ship) => ship.npcId === targetId);
  return (
    !!enemy &&
    context.engagements.engageNpcsInArena(pirateId, targetId, {
      ...arena,
      attackerPosition: piratePosition,
      defenderPosition: enemy.position,
      defenderHeadingRadians: enemy.headingRadians,
      ...fieldBattleMotion(context, field.locationId, pirateId, targetId),
    })
  );
}

function droneCanProtectMiner(
  field: AsteroidFieldRuntime,
  protector: SectorNpcState | undefined,
  piratePosition: { x: number; y: number }
): boolean {
  const drone = field.drone;
  return Boolean(
    drone.snapshot().operational &&
    protector &&
    protector.hullHp > 0 &&
    !protector.combatMovement &&
    distance(drone.snapshot().position, piratePosition) <=
      fieldInterceptRange(protector.id, false) &&
    drone.detect(piratePosition, field.instance.asteroids)
  );
}

export function tickFieldPirates(
  context: ControllerRuntimeContext,
  seconds: number,
  field: AsteroidFieldRuntime,
  combatantId?: string
): void {
  const { economy, state } = context;
  const locationId = field.locationId;
  const space =
    state.localSpace?.getSnapshot().instance === field.instance ? state.localSpace : null;
  const traffic = field.pirates;
  const pirates = economy.sectorNpcs.npcs.filter(
    (npc) => localArmedTraffic(npc) && npc.locationId === locationId
  );
  // Keep the active duel defender rendered, even when strategic combat marks
  // it as combatMovement. Other combatants still use normal sector transitions.
  traffic.reconcile(pirates, combatantId);
  traffic.tick(
    seconds,
    pirates,
    state.embeddedCombat === 'local-space' || canLocalPiratesTargetPlayer(context)
      ? (space?.getSnapshot().instance.ship.position ?? null)
      : null,
    pirateMiningContacts(context, field),
    field.instance.asteroids,
    (pirateId, targetId, piratePosition) => {
      const pirate = economy.sectorNpcs.npcs.find((npc) => npc.id === pirateId);
      if (!pirate) return false;
      const arena = localMiningCombatArena(
        field.instance,
        space?.getShipWorldVelocity() ?? { x: 0, y: 0 },
        field.combatWrecks
      );
      if (traffic.body(targetId))
        return engagePatrolContact(context, field, pirateId, targetId, piratePosition, arena);
      if (targetId === 'player') {
        if (!space || !canLocalPiratesTargetPlayer(context)) return false;
        const engaged = context.engagements.engageNpcInArena(
          pirateId,
          {
            ...arena,
            defenderPosition: piratePosition,
            defenderHeadingRadians: 0,
            ...fieldBattleMotion(context, locationId, 'player', pirateId),
          },
          false
        );
        if (engaged) {
          state.embeddedCombat = 'local-space';
          space.cancelMining();
          context.systemLog.write('PIRATEN > UEBERFALL IM ASTEROIDENFELD · KI-KAMPFMODUS');
        }
        return engaged;
      }
      const miner = field.miners.ships.find((ship) => ship.npcId === targetId);
      if (!miner) return false;
      const minerNpc = economy.sectorNpcs.npcs.find((npc) => npc.id === targetId);
      if (!minerNpc || minerNpc.combatMovement || minerNpc.hullHp <= 0) return false;
      const drone = field.drone;
      const protector = economy.sectorNpcs.npcs.find(
        (npc) => npc.id === 'security-drone:' + locationId
      );
      const protecting = droneCanProtectMiner(field, protector, piratePosition);
      const defenderId = protecting ? protector!.id : targetId;
      const defenderPosition = protecting ? drone.snapshot().position : miner.position;
      const combatArena = {
        ...arena,
        attackerPosition: piratePosition,
        attackerHeadingRadians: 0,
        attackerVelocity: { x: 0, y: 0 },
        defenderPosition,
        defenderHeadingRadians: protecting ? drone.headingRadians : miner.headingRadians,
        ...fieldBattleMotion(context, locationId, pirateId, defenderId),
      };
      const started = context.engagements.engageNpcsInArena(pirateId, defenderId, combatArena);
      if (started) {
        context.systemLog.write(
          'PIRATEN > ' +
            pirate.name.toUpperCase() +
            (protecting
              ? ' VON SICHERHEITSDROHNE ABGEFANGEN'
              : ' GREIFT MINER ' + minerNpc.name.toUpperCase() + ' AN')
        );
      }
      return started;
    },
    combatantId,
    (npc) => {
      if (npc.homePortId)
        economy.sectorNpcs.requestTravel(npc, npc.homePortId, 'Rückflug zum Heimathafen');
    }
  );
  resolvePirateFieldShipContacts(context, field);
  recoverFieldDrone(context, field);
}

function recoverFieldDrone(context: ControllerRuntimeContext, field: AsteroidFieldRuntime): void {
  const { economy } = context;
  const locationId = field.locationId;
  const drone = field.drone;
  const defender = economy.sectorNpcs.npcs.find((npc) => npc.id === 'security-drone:' + locationId);
  if (drone && defender && defender.hullHp <= 0 && drone.snapshot().operational) {
    drone.destroy();
    context.systemLog.write('SEC-01 > SICHERHEITSDROHNE IM GEFECHT ZERSTOERT');
  } else if (drone && defender && defender.hullHp > 0 && defender.travel) {
    // Strategic combat recovery may request a return trip. A surviving field
    // defense drone instead remains assigned to its existing field.
    delete defender.travel;
    delete defender.combatMovement;
    defender.locationId = locationId;
    defender.activityId = 'patrol';
    defender.activity = 'Lokale Konzessionsüberwachung';
  }
}

function securityDroneObstacleShips(
  context: ControllerRuntimeContext,
  runtime: AsteroidFieldRuntime,
  playerPosition: { readonly x: number; readonly y: number } | null
) {
  const ships = [
    ...runtime.miners.ships.map((ship) => ({
      id: ship.npcId,
      position: ship.position,
      radius: 35,
    })),
    ...(runtime.pirates?.snapshot(context.economy.sectorNpcs.npcs) ?? []).map((ship) => ({
      id: ship.npcId,
      position: ship.position,
      radius: 35,
    })),
  ];
  if (playerPosition) {
    ships.push({
      id: 'player',
      position: playerPosition,
      radius: Math.max(18, context.state.activeShip.nominalLengthMeters * 0.35),
    });
  }
  return ships;
}

function reportVisibleDroneContacts(
  context: ControllerRuntimeContext,
  runtime: AsteroidFieldRuntime,
  contacts: readonly DroneContact[]
): void {
  for (const contact of contacts) {
    if (!runtime.drone.detect(contact.position, runtime.instance.asteroids)) continue;
    processDroneContact(context, runtime, JSON.stringify([contact.shipId, contact.asteroidId]));
  }
}

function moveSecurityDroneAndIntercept(
  context: ControllerRuntimeContext,
  runtime: AsteroidFieldRuntime,
  seconds: number,
  contacts: readonly DroneContact[],
  nearbyShips: readonly FieldRouteObstacle[]
): void {
  const pirate = detectedSecurityPirate(context, runtime);
  const drone = runtime.drone;
  drone.tick(
    seconds,
    runtime.instance.asteroids,
    contacts,
    nearbyShips,
    pirate ? securityPirateApproach(drone.position, pirate.position) : undefined
  );
  if (pirate) interceptSecurityPirate(context, runtime, pirate);
}

export function tickFieldSecurity(
  context: ControllerRuntimeContext,
  seconds: number,
  runtime: AsteroidFieldRuntime
): void {
  const scene = context.state.localSpace?.getSnapshot();
  const active = scene?.instance === runtime.instance ? scene : null;
  const { economy } = context;
  const locationId = runtime.locationId;
  const contacts: DroneContact[] = [];
  if (active?.laserActive && active.miningTargetId) {
    const asteroid = runtime.instance.asteroids.find((entry) => entry.id === active.miningTargetId);
    const claim = asteroid ? economy.asteroidClaims.claim(locationId, asteroid) : null;
    if (claim && claim.ownerId !== 'player') {
      contacts.push({
        shipId: context.state.activeShip.id,
        asteroidId: asteroid!.id,
        position: active.instance.ship.position,
      });
    }
  }
  for (const ship of runtime.miners.ships) {
    if (!ship.laserActive || !ship.targetAsteroidId) continue;
    const asteroid = runtime.instance.asteroids.find((entry) => entry.id === ship.targetAsteroidId);
    const claim = asteroid ? economy.asteroidClaims.claim(locationId, asteroid) : null;
    if (claim && claim.ownerId !== ship.npcId) {
      const npc = economy.sectorNpcs.npcs.find((entry) => entry.id === ship.npcId);
      if (npc)
        contacts.push({
          shipId: npc.shipId + ':' + npc.id,
          asteroidId: asteroid!.id,
          position: ship.position,
        });
    }
  }

  const nearbyShips = securityDroneObstacleShips(
    context,
    runtime,
    active?.instance.ship.position ?? null
  );
  moveSecurityDroneAndIntercept(context, runtime, seconds, contacts, nearbyShips);
  reportVisibleDroneContacts(context, runtime, contacts);
}

function handlePlayerDroneFine(
  context: ControllerRuntimeContext,
  field: AsteroidFieldRuntime,
  locationId: string,
  shipId: string,
  day: number
): void {
  offerLegalDemand(context, shipId, 'SEC-01 / KONZESSIONSVERSTOSS', () => {
    context.systemLog.write('SEC-01 > NOTRUF ABGESETZT: SCHIFFSKENNUNG ZUR FAHNDUNG');
    const report = context.economy.legal.reportSighting(shipId, locationId, day, 'distress');
    if (report) dispatchPatrolToReport(context, locationId, null);
    const defender = context.economy.sectorNpcs.npcs.find(
      (candidate) => candidate.id === 'security-drone:' + locationId
    );
    const drone = context.economy.securityDrones.get(locationId);
    const space = context.state.localSpace;
    if (!defender || defender.hullHp <= 0 || !drone?.snapshot().operational || !space) return;
    const arena = localMiningCombatArena(
      space.getSnapshot().instance,
      space.getShipWorldVelocity(),
      field.combatWrecks
    );
    if (
      !context.engagements.engageNpcInArena(
        defender.id,
        {
          ...arena,
          defenderPosition: { ...drone.snapshot().position },
          defenderHeadingRadians: 0,
          defenderVelocity: { x: 0, y: 0 },
        },
        false
      )
    )
      return;
    context.state.embeddedCombat = 'local-space';
    space.cancelMining();
    context.systemLog.write('SEC-01 > GEWALTSAME DURCHSETZUNG · KI-KAMPFMODUS AKTIV');
  });
}

function handleNpcDroneFine(
  context: ControllerRuntimeContext,
  locationId: string,
  shipId: string,
  day: number
): void {
  const { economy } = context;
  const npc = economy.sectorNpcs.npcs.find((entry) => entry.shipId + ':' + entry.id === shipId);
  if (!npc) return;
  const legal = economy.legal;
  if (npc.credits >= legal.debt(shipId) && npc.aggression < 55) {
    const payment = settleLegalDebt(context, shipId, npc);
    context.systemLog.write(
      'SEC-01 > ' + npc.name.toUpperCase() + ' ZAHLT ' + payment.paid + ' CR'
    );
    return;
  }
  legal.declareWanted(shipId);
  const report = legal.reportSighting(shipId, locationId, day, 'distress');
  if (report) {
    context.systemLog.write('SEC-01 > NOTRUF: ' + npc.name.toUpperCase() + ' ZUR FAHNDUNG');
    dispatchPatrolToReport(context, locationId, null);
  }
}

function processDroneContact(
  context: ControllerRuntimeContext,
  runtime: AsteroidFieldRuntime,
  contact: string
): void {
  const locationId = runtime.locationId;
  const [shipId, asteroidId] = JSON.parse(contact) as [string, string];
  const asteroid = runtime.instance.asteroids.find((entry) => entry.id === asteroidId);
  const { economy } = context;
  const claim = asteroid ? economy.asteroidClaims.claim(locationId, asteroid) : null;
  if (!claim) return;
  const day = economy.situations.currentDay;
  const legal = economy.legal;
  const intruderId =
    shipId === context.state.activeShip.id
      ? 'player'
      : economy.sectorNpcs.npcs.find((npc) => npc.shipId + ':' + npc.id === shipId)?.id;
  if (!intruderId) return;
  const evidence = economy.asteroidClaims.unbilledExtraction(locationId, asteroidId, intruderId);
  if (!evidence) return;
  const previouslyWanted = legal.isWanted(shipId);
  const charge = legal.reportOffense(
    shipId,
    claim.ownerId,
    'Unbefugter Konzessionsabbau',
    Math.ceil(evidence.value * 1.5),
    day,
    evidence.incidentId
  );
  if (!charge) return;
  economy.asteroidClaims.markExtractionBilled(locationId, asteroidId, intruderId);
  context.systemLog.write(
    'SEC-01 > ILLEGALER ABBAU ERKANNT: ' +
      (legal.registration(shipId)?.transponder ?? shipId) +
      ' / ASTEROID ' +
      asteroidId
  );
  if (previouslyWanted) return;
  if (shipId === context.state.activeShip.id)
    handlePlayerDroneFine(context, runtime, locationId, shipId, day);
  else handleNpcDroneFine(context, locationId, shipId, day);
}
