import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { tickFieldSecurity, tickFieldPirates } from './game-controller-security';
import { controllerLocalModel, controllerStarModel } from './game-controller-models';

// The simulation still runs every animation frame. The full-resolution canvas
// and sensor/market view-model need not be rebuilt 60+ times per second.
const STAR_MAP_MIN_FRAME_MS = 1000 / 24;
const lastStarMapUpdate = new WeakMap<ControllerRuntimeContext, number>();

/** Presentation tick: the campaign engine never owns or mutates these scene services. */
export function tickControllerScene(context: ControllerRuntimeContext, deltaSeconds: number): void {
  const { state } = context;
  if (state.mode === 'combat') {
    state.combatPanel?.update();
    return;
  }
  if (state.mode === 'star-map') {
    const now = performance.now();
    const previous = lastStarMapUpdate.get(context) ?? -Infinity;
    if (now - previous >= STAR_MAP_MIN_FRAME_MS) {
      lastStarMapUpdate.set(context, now);
      state.panels.star?.update(controllerStarModel(context));
    }
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
    context.shipOperations.recordHull(
      state.activeShip,
      localSnapshot.hull.currentHp,
      localSnapshot.hull.maxHp
    );
    context.audio.updatePlayerRcs(
      state.activeShip.sprite.hardpoints,
      localSnapshot.instance.ship,
      performance.now() / 1000
    );
    state.localNpcMining?.tick(deltaSeconds);
    tickFieldPirates(context, deltaSeconds);
    tickFieldSecurity(context, deltaSeconds);
  }
  state.panels.local?.update(controllerLocalModel(context));
}
