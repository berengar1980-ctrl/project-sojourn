import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { controllerLocalModel, controllerStarModel } from './game-controller-models';

/** Presentation tick: the campaign engine never owns or mutates these scene services. */
export function tickControllerScene(context: ControllerRuntimeContext, deltaSeconds: number): void {
  const { state } = context;
  if (state.mode === 'combat') {
    state.combatPanel?.update();
    return;
  }
  if (state.mode === 'star-map') {
    state.panels.star?.update(controllerStarModel(context));
    return;
  }
  if (state.mode === 'salvage-space') {
    state.salvageScene?.tick(deltaSeconds);
    return;
  }
  if (state.mode !== 'local-space' || !state.localSpace) return;
  if (state.embeddedCombat !== 'local-space') {
    state.localSpace.tick(deltaSeconds);
    const localSnapshot = state.localSpace.getSnapshot();
    context.audio.updatePlayerRcs(
      state.activeShip.sprite.hardpoints,
      localSnapshot.instance.ship,
      performance.now() / 1000
    );
    state.localNpcMining?.tick(deltaSeconds);
  }
  state.panels.local?.update(controllerLocalModel(context));
}
