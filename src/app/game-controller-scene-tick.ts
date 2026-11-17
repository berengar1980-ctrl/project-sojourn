import { measurePerformance } from './game-performance-diagnostics';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { controllerLocalModel, controllerStarModel } from './game-controller-models';

// The simulation still runs every animation frame. The full-resolution canvas
// and sensor/market view-model need not be rebuilt 60+ times per second.
const STAR_MAP_MIN_FRAME_MS = 1000 / 20;
const LOCAL_MAP_MIN_FRAME_MS = 1000 / 24;
const COMBAT_MAP_MIN_FRAME_MS = 1000 / 30;
const lastStarMapUpdate = new WeakMap<ControllerRuntimeContext, number>();
const lastLocalUpdate = new WeakMap<ControllerRuntimeContext, number>();
const lastCombatUpdate = new WeakMap<ControllerRuntimeContext, number>();

function shouldUpdate(
  previous: WeakMap<ControllerRuntimeContext, number>,
  context: ControllerRuntimeContext,
  interval: number
): boolean {
  const now = performance.now();
  if (now - (previous.get(context) ?? -Infinity) < interval) return false;
  previous.set(context, now);
  return true;
}

/** Presentation tick: the campaign engine never owns or mutates these scene services. */
export function tickControllerScene(context: ControllerRuntimeContext, deltaSeconds: number): void {
  const { state } = context;
  if (state.mode === 'combat') {
    if (shouldUpdate(lastCombatUpdate, context, COMBAT_MAP_MIN_FRAME_MS))
      measurePerformance('scene.combat.update', () => state.combatPanel?.update());
    return;
  }
  if (state.mode === 'star-map') {
    if (shouldUpdate(lastStarMapUpdate, context, STAR_MAP_MIN_FRAME_MS))
      measurePerformance('scene.star.update', () => {
        const model = measurePerformance('scene.star.model', () => controllerStarModel(context));
        state.panels.star?.update(model);
      });
    return;
  }
  if (state.mode === 'salvage-space') {
    measurePerformance('scene.salvage.tick', () => state.salvageScene?.tick(deltaSeconds));
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
  }
  if (shouldUpdate(lastLocalUpdate, context, LOCAL_MAP_MIN_FRAME_MS))
    measurePerformance('scene.local.update', () => {
      const model = measurePerformance('scene.local.model', () => controllerLocalModel(context));
      state.panels.local?.update(model);
    });
}
