import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import type { SalvageField } from '../core/salvage-types';
import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-types';
import { combatResultMessage } from '../systems/combat/combat-result-summary';
import { showCampaignCombatSummary } from '../ui/combat/campaign-combat-summary';
import { mountCombatScene } from './game-controller-combat-scene';
import { recordPlayerCombatHull } from './game-controller-ship-service';
import { startCombatBoarding } from './game-controller-combat-boarding';
import { emitCampaignCombatEnded } from './game-controller-campaign-events';

export interface CombatReturnScenes {
  starMap(): void;
  mining(reuseSeed: boolean, preserveField: boolean): void;
  salvage(reuseSeed: boolean, field?: SalvageField, combat?: StrategicCombatSnapshot): void;
}

function synchronizeLocalDefender(
  context: ControllerRuntimeContext,
  defender: {
    id: string;
    position: { x: number; y: number };
    headingRadians: number;
    speed: number;
    hullHp: number;
  }
): void {
  if (defender.id.startsWith('security-drone:')) {
    const locationId = defender.id.slice('security-drone:'.length);
    const drone = context.economy.securityDrones.get(locationId);
    if (drone) {
      drone.restore(defender.position, defender.hullHp > 0);
      if (defender.hullHp <= 0) {
        context.economy.legal.reportOffense(
          context.state.activeShip.id,
          'directorate',
          'Zerstörung einer Sicherheitsdrohne',
          12000,
          context.economy.situations.currentDay
        );
        context.systemLog.write(
          'DIREKTORUM > SICHERHEITSDROHNE ZERSTOERT · SCHWERE STRAFTAT REGISTRIERT'
        );
      }
    }
    return;
  }
  const localId = context.state.localSpace?.getSnapshot().instance.sourceLocationId;
  if (
    localId &&
    context.economy.localPirates
      .get(localId)
      ?.snapshot(context.economy.sectorNpcs.npcs)
      .some((ship) => ship.npcId === defender.id)
  ) {
    context.economy.localPirates
      .get(localId)
      ?.syncCombatPose(defender.id, defender.position, defender.headingRadians);
    return;
  }
  context.state.localNpcMining?.syncCombatPose(
    defender.id,
    defender.position,
    defender.headingRadians,
    defender.speed
  );
}
export function resolveControllerCombat(
  context: ControllerRuntimeContext,
  scenes: CombatReturnScenes
): void {
  const { state } = context;
  const activeCombat = context.engagements.activePlayerCombat();
  if (
    activeCombat &&
    state.mode !== 'combat' &&
    state.mode !== 'boarding' &&
    state.embeddedCombat === null
  ) {
    mountCombatScene(context, () => scenes.starMap());
  }
  if (!activeCombat?.getSnapshot().winner || state.embeddedCombat === null) return;
  const snapshot = activeCombat.getSnapshot();
  recordPlayerCombatHull(context, snapshot);
  if (snapshot.boardingInitiator) {
    const origin = state.embeddedCombat;
    const preservedSalvageField =
      origin === 'salvage-space' ? state.salvageScene?.getField() : undefined;
    if (origin === 'local-space') {
      state.localSpace?.syncCombatPose(
        snapshot.attacker.position,
        snapshot.attacker.headingRadians,
        snapshot.attacker.speed
      );
      synchronizeLocalDefender(context, snapshot.defender);
    }
    startCombatBoarding(context, snapshot, (boardingOutcome) => {
      if (boardingOutcome === 'enemy_win') return scenes.starMap();
      if (origin === 'local-space') scenes.mining(true, true);
      else if (origin === 'salvage-space')
        scenes.salvage(true, preservedSalvageField, snapshot);
      else scenes.starMap();
    });
    return;
  }
  context.systemLog.write(combatResultMessage(snapshot));
  context.systemLog.write('COMBAT > ' + snapshot.lastEvent.toUpperCase());
  if (state.embeddedCombat === 'local-space') {
    state.localSpace?.syncCombatPose(
      snapshot.attacker.position,
      snapshot.attacker.headingRadians,
      snapshot.attacker.speed
    );
    synchronizeLocalDefender(context, snapshot.defender);
  } else {
    state.salvageScene?.finishCombat(snapshot);
  }
  emitCampaignCombatEnded(context.campaignEvents, snapshot);
  context.engagements.finishPlayerCombat();
  if (snapshot.defender.id.startsWith('security-drone:') && snapshot.defender.hullHp > 0) {
    const securityNpc = context.economy.sectorNpcs.npcs.find(
      (npc) => npc.id === snapshot.defender.id
    );
    if (securityNpc) {
      securityNpc.locationId = snapshot.defender.id.slice('security-drone:'.length);
      delete securityNpc.travel;
      delete securityNpc.combatMovement;
      securityNpc.activityId = 'patrol';
      securityNpc.activity = 'Lokale Konzessionsüberwachung';
    }
  }
  state.embeddedCombat = null;
  showCampaignCombatSummary(context.root, snapshot, () => {
    if (snapshot.attacker.hullHp <= 0) scenes.starMap();
  });
}
