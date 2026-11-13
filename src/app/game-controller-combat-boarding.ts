import { combatResultMessage } from '../systems/combat/combat-result-summary';
import { emitCampaignCombatEnded } from './game-controller-campaign-events';
import { showCampaignCombatSummary } from '../ui/combat/campaign-combat-summary';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { recordPlayerCombatHull } from './game-controller-ship-service';
import type { StrategicCombatService } from '../systems/combat/strategic-combat-service';
import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-types';
import {
  createCrewBoardingEncounter,
  crewBoardingUnits,
} from '../systems/boarding/crew-boarding-adapter';
import { boardingRangedWeapons, boardingMeleeWeapons } from '../data/boarding/boarding-weapons';
import { createBoardingTacticalPanel } from '../ui/boarding/boarding-tactical-panel';
import { createStrategicCombatPanel } from '../ui/combat/strategic-combat-panel';
import { runSceneZoomTransition } from '../ui/scene-transition';

export function startCombatBoarding(
  context: ControllerRuntimeContext,
  snapshot: StrategicCombatSnapshot,
  returnToMap: (boardingOutcome?: string) => void
): void {
  if (!snapshot.boardingInitiator) return;
  context.systemLog.write(combatResultMessage(snapshot));
  const enemyName = snapshot.defender.name;
  const { state } = context;
  state.panels.star?.destroy();
  state.panels.local?.destroy();
  state.panels.port?.destroy();
  state.panels.star = null;
  state.panels.local = null;
  state.panels.port = null;
  state.combatPanel?.destroy();
  state.combatPanel = null;
  state.salvageScene?.destroy();
  state.salvageScene = null;
  state.boardingPanel?.destroy();
  state.boardingPanel = null;
  state.shipSwitcher?.destroy();
  state.shipSwitcher = null;
  state.embeddedCombat = null;
  state.mode = 'boarding';
  context.audio.clearPlayerRcs();
  if (crewBoardingUnits(context.crew).length === 0) {
    context.systemLog.write('BOARDING > KEIN EINSATZFÄHIGES ENTERTEAM');
    context.engagements.finishPlayerCombat();
    runSceneZoomTransition(context.root, returnToMap);
    return;
  }

  const enemyCount = 2 + (Math.floor(snapshot.elapsedSeconds * 10) % 2);
  const enemyUnits = Array.from({ length: enemyCount }, (_, index) => ({
    id: 'ship-boarder-' + index,
    name: 'Entertrupp ' + (index + 1),
    team: 'enemy' as const,
    hp: 10,
    maxHp: 10,
    armor: 2,
    rangedSkill: 48 + index * 5,
    meleeSkill: 46 + index * 5,
    weapon:
      index % 2
        ? { ...boardingRangedWeapons.rifle, id: 'boltgun', name: 'Bolter' }
        : { ...boardingRangedWeapons.sidearm, id: 'off_autopistol', name: 'Kompakte Autopistole' },
    meleeWeapon: boardingMeleeWeapons.baton,
  }));
  const encounter = createCrewBoardingEncounter({
    roster: context.crew,
    seed: Math.floor(snapshot.elapsedSeconds * 1000) ^ enemyName.length,
    enemyUnits,
    allowRetreat: snapshot.boardingInitiator === 'attacker',
  });
  context.systemLog.write(
    'BOARDING > ' +
      (snapshot.boardingInitiator === 'attacker'
        ? 'ENTERANGRIFF AUF ' + enemyName
        : 'VERTEIDIGUNG DES EIGENEN SCHIFFS')
  );
  state.boardingPanel = createBoardingTacticalPanel({
    root: context.root,
    encounter,
    onFinish: (result) => {
      if (result.outcome === 'retreat') {
        const combat = context.engagements.activePlayerCombat();
        if (combat?.resumeAfterBoarding()) {
          context.systemLog.write('BOARDING > RUECKZUG · RAUMKAMPF WIRD FORTGESETZT');
          context.campaignEvents.emit({ type: 'boarding.ended', outcome: 'draw' });
          state.boardingPanel?.destroy();
          state.boardingPanel = null;
          state.mode = 'combat';
          state.combatPanel = createStrategicCombatPanel({
            root: context.root,
            combat,
            onReturn: () => returnFromCombat(context, combat, () => returnToMap()),
          });
          return;
        }
      }
      if (result.outcome === 'player_win') {
        const captured = enemyUnits[0]!.weapon;
        context.crew.grantBoardingEquipment(captured.id);
        context.systemLog.write('BOARDING > AUSRÜSTUNG ERBEUTET: ' + captured.name.toUpperCase());
      } else if (result.outcome === 'enemy_win') {
        context.navigation.recoverToNearestDock();
        context.systemLog.write('BOARDING > VERTEIDIGUNG VERLOREN · BERGUNG ZUR WERFT');
      }
      context.systemLog.write('BOARDING > ' + result.outcome.toUpperCase());
      context.campaignEvents.emit({
        type: 'boarding.ended',
        outcome:
          result.outcome === 'player_win'
            ? 'player_win'
            : result.outcome === 'enemy_win'
              ? 'enemy_win'
              : 'draw',
      });
      if (result.outcome === 'player_win' || result.outcome === 'enemy_win') {
        emitCampaignCombatEnded(context.campaignEvents, {
          ...snapshot,
          winner: result.outcome === 'player_win' ? 'attacker' : 'defender',
          outcomeReason: 'boarding',
        });
      }
      context.engagements.finishPlayerCombat(result.outcome);
      showCampaignCombatSummary(
        context.root,
        snapshot,
        () => {
          runSceneZoomTransition(context.root, () => returnToMap(result.outcome));
        },
        result.outcome
      );
    },
  });
}

export function returnFromCombat(
  context: ControllerRuntimeContext,
  combat: StrategicCombatService,
  returnToMap: () => void
): void {
  const snapshot = combat.getSnapshot();
  recordPlayerCombatHull(context, snapshot);
  if (!snapshot.boardingInitiator) context.systemLog.write(combatResultMessage(snapshot));
  if (snapshot.boardingInitiator) {
    startCombatBoarding(context, snapshot, returnToMap);
    return;
  }
  emitCampaignCombatEnded(context.campaignEvents, snapshot);
  context.engagements.finishPlayerCombat();
  showCampaignCombatSummary(context.root, snapshot, () => {
    runSceneZoomTransition(context.root, returnToMap);
  });
}
