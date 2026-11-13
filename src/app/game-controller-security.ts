import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import type { DroneContact } from '../systems/operations/asteroid-security-drone';
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

export function tickFieldPirates(context: ControllerRuntimeContext, seconds: number): void {
  const space = context.state.localSpace;
  const local = space?.getSnapshot();
  if (!space || !local) return;
  const locationId = local.instance.sourceLocationId;
  const { economy, state } = context;
  const traffic = economy.localPirates.get(locationId);
  if (!traffic) return;
  const pirates = economy.sectorNpcs.npcs.filter(
    (npc) => npc.pirate && npc.locationId === locationId
  );
  traffic.reconcile(pirates);
  traffic.tick(
    seconds,
    pirates,
    local.instance.ship.position,
    state.localNpcMining?.ships.map((ship) => ({
      npcId: ship.npcId,
      position: ship.position,
    })) ?? [],
    local.instance.asteroids,
    (pirateId, targetId, piratePosition) => {
      const pirate = economy.sectorNpcs.npcs.find((npc) => npc.id === pirateId);
      if (!pirate || context.engagements.activePlayerCombat()) return false;
      const arena = localMiningCombatArena(local.instance, space.getShipWorldVelocity());
      if (targetId === 'player') {
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
      const miner = state.localNpcMining?.ships.find((ship) => ship.npcId === targetId);
      if (!miner) return false;
      const minerNpc = economy.sectorNpcs.npcs.find((npc) => npc.id === targetId);
      if (!minerNpc || minerNpc.hullHp <= 0) return false;
      const drone = economy.securityDrones.get(locationId);
      const protector = economy.sectorNpcs.npcs.find(
        (npc) => npc.id === 'security-drone:' + locationId
      );
      const protecting = Boolean(
        drone?.snapshot().operational &&
        protector &&
        protector.hullHp > 0 &&
        drone.detect(piratePosition, local.instance.asteroids)
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
  const drone = economy.securityDrones.get(locationId);
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

export function tickFieldSecurity(context: ControllerRuntimeContext, seconds: number): void {
  const field = context.state.localSpace?.getSnapshot();
  if (!field) return;
  const { economy } = context;
  const locationId = field.instance.sourceLocationId;
  const drone = economy.securityDrones.get(locationId);
  if (!drone) return;

  const contacts: DroneContact[] = [];
  if (field.laserActive && field.miningTargetId) {
    const asteroid = field.instance.asteroids.find((entry) => entry.id === field.miningTargetId);
    const claim = asteroid ? economy.asteroidClaims.claim(locationId, asteroid) : null;
    if (claim && claim.ownerId !== 'player') {
      contacts.push({
        shipId: context.state.activeShip.id,
        asteroidId: asteroid!.id,
        position: field.instance.ship.position,
      });
    }
  }
  for (const ship of context.state.localNpcMining?.ships ?? []) {
    if (!ship.laserActive || !ship.targetAsteroidId) continue;
    const asteroid = field.instance.asteroids.find((entry) => entry.id === ship.targetAsteroidId);
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

  for (const key of drone.tick(seconds, field.instance.asteroids, contacts)) {
    processDroneContact(context, locationId, key);
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
        'Offene Forderungen: ' + debt + ' CR.\\n\\n' +
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
  context.systemLog.write(
    'SEC-01 > NOTRUF ABGESETZT: SCHIFFSKENNUNG ZUR FAHNDUNG AUSGESCHRIEBEN'
  );
  legal.reportSighting(shipId, locationId, day, 'distress');
  dispatchPatrolToReport(context, locationId, null);
  const defender = economy.sectorNpcs.npcs.find(
    (candidate) => candidate.id === 'security-drone:' + locationId
  );
  const drone = economy.securityDrones.get(locationId);
  const space = state.localSpace;
  if (!defender || defender.hullHp <= 0 || !drone?.snapshot().operational || !space) return;
  const arena = localMiningCombatArena(
    space.getSnapshot().instance, space.getShipWorldVelocity()
  );
  if (!context.engagements.engageNpcInArena(defender.id, {
    ...arena,
    defenderPosition: { ...drone.snapshot().position },
    defenderHeadingRadians: 0,
    defenderVelocity: { x: 0, y: 0 },
  })) return;
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
  const npc = economy.sectorNpcs.npcs.find(
    (entry) => entry.shipId + ':' + entry.id === shipId
  );
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
  locationId: string,
  contact: string
): void {
  const field = context.state.localSpace?.getSnapshot();
  if (!field) return;
  const [shipId, asteroidId] = JSON.parse(contact) as [string, string];
  const asteroid = field.instance.asteroids.find((entry) => entry.id === asteroidId);
  const { economy } = context;
  const claim = asteroid ? economy.asteroidClaims.claim(locationId, asteroid) : null;
  if (!claim) return;
  const day = economy.situations.currentDay;
  const legal = economy.legal;
  const charge = legal.reportOffense(
    shipId, claim.ownerId, 'Unbefugter Konzessionsabbau',
    UNAUTHORIZED_MINING_PENALTY, day
  );
  if (!charge) return;
  context.systemLog.write(
    'SEC-01 > ILLEGALER ABBAU ERKANNT: ' +
      (legal.registration(shipId)?.transponder ?? shipId) + ' / ASTEROID ' + asteroidId
  );
  if (shipId === context.state.activeShip.id)
    handlePlayerDroneFine(context, locationId, shipId, day);
  else handleNpcDroneFine(context, locationId, shipId, day);
}
