import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import type { DroneContact } from '../systems/operations/asteroid-security-drone';
import type { AsteroidFieldRuntime } from '../systems/operations/asteroid-field-world';
import { dispatchPatrolToReport } from './game-controller-law-enforcement';
import { localMiningCombatArena } from './game-controller-combat';

const UNAUTHORIZED_MINING_PENALTY = 1500;

function creditOwner(context: ControllerRuntimeContext, ownerId: string, amount: number): void {
  if (ownerId === 'player') {
    context.economy.trade.player.credits += amount;
    context.systemLog.write('KONZESSION > ENTSCHAEDIGUNG EINGEGANGEN: +' + amount + ' CR');
    return;
  }
  const npc = context.economy.sectorNpcs.npcs.find((entry) => entry.id === ownerId);
  if (npc) npc.credits += amount;
}

export function tickFieldPirates(
  context: ControllerRuntimeContext,
  seconds: number,
  field: AsteroidFieldRuntime
): void {
  const { economy, state } = context;
  const locationId = field.locationId;
  const space =
    state.localSpace?.getSnapshot().instance === field.instance ? state.localSpace : null;
  const traffic = field.pirates;
  const pirates = economy.sectorNpcs.npcs.filter(
    (npc) => npc.pirate && npc.locationId === locationId
  );
  traffic.reconcile(pirates);
  traffic.tick(
    seconds,
    pirates,
    space?.getSnapshot().instance.ship.position ?? null,
    field.miners.ships.map((ship) => ({
      npcId: ship.npcId,
      position: ship.position,
    })),
    field.instance.asteroids,
    (pirateId, targetId, piratePosition) => {
      const pirate = economy.sectorNpcs.npcs.find((npc) => npc.id === pirateId);
      if (!pirate) return false;
      const arena = localMiningCombatArena(
        field.instance,
        space?.getShipWorldVelocity() ?? { x: 0, y: 0 }
      );
      if (targetId === 'player') {
        if (!space || context.engagements.activePlayerCombat()) return false;
        const engaged = context.engagements.engageNpcInArena(pirateId, {
          ...arena,
          defenderPosition: piratePosition,
          defenderHeadingRadians: 0,
          defenderVelocity: { x: 0, y: 0 },
        });
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
      if (!minerNpc || minerNpc.hullHp <= 0) return false;
      const drone = field.drone;
      const protector = economy.sectorNpcs.npcs.find(
        (npc) => npc.id === 'security-drone:' + locationId
      );
      const protecting = Boolean(
        drone?.snapshot().operational &&
        protector &&
        protector.hullHp > 0 &&
        drone.detect(piratePosition, field.instance.asteroids)
      );
      const defenderId = protecting ? protector!.id : targetId;
      const defenderPosition = protecting ? drone!.snapshot().position : miner.position;
      const combatArena = {
        ...arena,
        attackerPosition: piratePosition,
        attackerHeadingRadians: 0,
        attackerVelocity: { x: 0, y: 0 },
        defenderPosition,
        defenderHeadingRadians: protecting ? 0 : miner.headingRadians,
        defenderVelocity: { x: 0, y: 0 },
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
    }
  );
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

export function tickFieldSecurity(
  context: ControllerRuntimeContext,
  seconds: number,
  runtime: AsteroidFieldRuntime
): void {
  const scene = context.state.localSpace?.getSnapshot();
  const active = scene?.instance === runtime.instance ? scene : null;
  const { economy } = context;
  const locationId = runtime.locationId;
  const drone = runtime.drone;

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

  for (const key of drone.tick(seconds, runtime.instance.asteroids, contacts)) {
    processDroneContact(context, runtime, key);
  }
}

function handlePlayerDroneFine(
  context: ControllerRuntimeContext,
  locationId: string,
  shipId: string,
  day: number
): void {
  const { economy, state } = context;
  const legal = economy.legal;
  const debt = legal.debt(shipId);
  const pay =
    economy.trade.player.credits >= debt &&
    window.confirm(
      'SEC-01 / KONZESSIONSVERSTOSS\\n' +
        'Ihre Schiffskennung wurde erfasst.\\n' +
        'Offene Forderungen: ' +
        debt +
        ' CR.\\n\\n' +
        'Jetzt bezahlen? ABBRECHEN bedeutet Zahlungsverweigerung und Fahndung.'
    );
  if (pay) {
    const payment = legal.settle(shipId, economy.trade.player.credits);
    economy.trade.player.credits -= payment.paid;
    for (const transfer of payment.transfers)
      creditOwner(context, transfer.creditorId, transfer.amount);
    context.systemLog.write('SEC-01 > ZAHLUNG AKZEPTIERT: ' + payment.paid + ' CR');
    return;
  }
  context.systemLog.write('SEC-01 > NOTRUF ABGESETZT: SCHIFFSKENNUNG ZUR FAHNDUNG AUSGESCHRIEBEN');
  legal.reportSighting(shipId, locationId, day, 'distress');
  dispatchPatrolToReport(context, locationId, null);
  const defender = economy.sectorNpcs.npcs.find(
    (candidate) => candidate.id === 'security-drone:' + locationId
  );
  const drone = economy.securityDrones.get(locationId);
  const space = state.localSpace;
  if (!defender || defender.hullHp <= 0 || !drone?.snapshot().operational || !space) return;
  const arena = localMiningCombatArena(space.getSnapshot().instance, space.getShipWorldVelocity());
  if (
    !context.engagements.engageNpcInArena(defender.id, {
      ...arena,
      defenderPosition: { ...drone.snapshot().position },
      defenderHeadingRadians: 0,
      defenderVelocity: { x: 0, y: 0 },
    })
  )
    return;
  state.embeddedCombat = 'local-space';
  space.cancelMining();
  context.systemLog.write('SEC-01 > GEWALTSAME DURCHSETZUNG · KI-KAMPFMODUS AKTIV');
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
  const debt = legal.debt(shipId);
  if (npc.credits >= debt && npc.aggression < 55) {
    const payment = legal.settle(shipId, npc.credits);
    npc.credits -= payment.paid;
    for (const transfer of payment.transfers)
      creditOwner(context, transfer.creditorId, transfer.amount);
    context.systemLog.write(
      'SEC-01 > ' + npc.name.toUpperCase() + ' ZAHLT ' + payment.paid + ' CR'
    );
    return;
  }
  context.systemLog.write(
    'SEC-01 > NOTRUF: ' + npc.name.toUpperCase() + ' IST ZUR FAHNDUNG AUSGESCHRIEBEN'
  );
  legal.reportSighting(shipId, locationId, day, 'distress');
  dispatchPatrolToReport(context, locationId, null);
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
  const charge = legal.reportOffense(
    shipId,
    claim.ownerId,
    'Unbefugter Konzessionsabbau',
    UNAUTHORIZED_MINING_PENALTY,
    day
  );
  if (!charge) return;
  context.systemLog.write(
    'SEC-01 > ILLEGALER ABBAU ERKANNT: ' +
      (legal.registration(shipId)?.transponder ?? shipId) +
      ' / ASTEROID ' +
      asteroidId
  );
  if (shipId === context.state.activeShip.id)
    handlePlayerDroneFine(context, locationId, shipId, day);
  else handleNpcDroneFine(context, locationId, shipId, day);
}
