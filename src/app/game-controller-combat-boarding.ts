import { combatResultMessage } from './combat-result-summary';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import type { StrategicCombatService } from '../systems/combat/strategic-combat-service';
import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-types';
import {
  createCrewBoardingEncounter,
  crewBoardingUnits,
} from '../systems/boarding/crew-boarding-adapter';
import { boardingRangedWeapons, boardingMeleeWeapons } from '../data/boarding/boarding-weapons';
import { createBoardingTacticalPanel } from '../ui/boarding/boarding-tactical-panel';
import { runSceneZoomTransition } from '../ui/scene-transition';

export function startCombatBoarding(
  context: ControllerRuntimeContext,
  snapshot: StrategicCombatSnapshot,
  returnToMap: () => void
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
  state.localSpace = null;
  state.localNpcMining = null;
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
      if (result.outcome === 'player_win') {
        const captured = enemyUnits[0]!.weapon;
        context.crew.grantBoardingEquipment(captured.id);
        context.systemLog.write('BOARDING > AUSRÜSTUNG ERBEUTET: ' + captured.name.toUpperCase());
      } else if (result.outcome === 'enemy_win') {
        context.navigation.recoverToNearestDock();
        context.systemLog.write('BOARDING > VERTEIDIGUNG VERLOREN · BERGUNG ZUR WERFT');
      }
      context.systemLog.write('BOARDING > ' + result.outcome.toUpperCase());
      context.engagements.finishPlayerCombat();
      runSceneZoomTransition(context.root, returnToMap);
    },
  });
}

export function returnFromCombat(
  context: ControllerRuntimeContext,
  combat: StrategicCombatService,
  returnToMap: () => void
): void {
  const snapshot = combat.getSnapshot();
  if (!snapshot.boardingInitiator) context.systemLog.write(combatResultMessage(snapshot));
  if (snapshot.boardingInitiator) {
    startCombatBoarding(context, snapshot, returnToMap);
    return;
  }
  context.engagements.finishPlayerCombat();
  runSceneZoomTransition(context.root, returnToMap);
}
