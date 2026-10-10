import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { createStrategicCombatPanel } from '../ui/combat/strategic-combat-panel';
import { returnFromCombat } from './game-controller-combat-boarding';
import {
  destroyControllerBoarding,
  destroyControllerCombat,
  destroyControllerSalvage,
  destroyScenePanels,
} from './game-controller-events';

export function mountCombatScene(context: ControllerRuntimeContext, returnToMap: () => void): void {
  const combat = context.engagements.activePlayerCombat();
  if (!combat) return;
  const { state } = context;
  destroyScenePanels(state.panels);
  destroyControllerSalvage(context);
  destroyControllerCombat(context);
  destroyControllerBoarding(context);
  state.localSpace = null;
  state.localNpcMining = null;
  state.embeddedCombat = null;
  state.mode = 'combat';
  context.audio.clearPlayerRcs();
  state.combatPanel = createStrategicCombatPanel({
    root: context.root,
    combat,
    onReturn: () => returnFromCombat(context, combat, returnToMap),
  });
  state.shipSwitcher?.destroy();
  state.shipSwitcher = null;
}
