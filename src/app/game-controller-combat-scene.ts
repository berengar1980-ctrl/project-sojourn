import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { createStrategicCombatPanel } from '../ui/combat/strategic-combat-panel';
import { createFleetNativeCombatPanel } from '../ui/combat/fleet-native-combat-panel';
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
  const fleet = context.engagements.activePlayerFleet();
  const onReturn = () => returnFromCombat(context, combat, returnToMap);
  state.combatPanel = fleet
    ? createFleetNativeCombatPanel({
        root: context.root,
        combat,
        onReturn,
        parallelDuels: () => [
          ...fleet.getSnapshot().duels.slice(1),
          ...fleet.getSnapshot().supporters,
        ],
        parallelSupportStartIndex: fleet.duels.length - 1,
        parallelEscapedShipIds: () => fleet.getSnapshot().escapedShipIds,
        fleetEngagements: () => fleet.getSnapshot().engagements,
        isComplete: () => fleet.getSnapshot().finished,
      })
    : createStrategicCombatPanel({ root: context.root, combat, onReturn });
  state.shipSwitcher?.destroy();
  state.shipSwitcher = null;
}
