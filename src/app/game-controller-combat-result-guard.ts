import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { tickLegalDetention } from './game-controller-law-enforcement';
import { tickCustoms } from './game-controller-customs';

/** Combat results are modal: no background attacks or scene transitions. */
export function skipControllerTickForCombatResult(
  context: ControllerRuntimeContext,
  deltaSeconds: number
): boolean {
  const { state } = context;
  if (state.combatResultPending) return true;
  state.combatReengageSeconds = Math.max(
    0,
    state.combatReengageSeconds - Math.max(0, deltaSeconds)
  );
  return tickLegalDetention(context, deltaSeconds) || tickCustoms(context);
}
