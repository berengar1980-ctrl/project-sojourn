import type { ShipDefinition } from '../core/ship-types';

import type { SystemLogService } from '../core/system-log-types';

import {
  engineSpeedMultiplier,
  resolveShipRuntimeSetup,
  type ShipRuntimeOptions,
} from '../systems/ships';

import { createSystemLogService } from '../systems/system-log/system-log-service';

import { runSceneZoomTransition } from '../ui/scene-transition';

import { createControllerStarModel } from './game-controller-star-map';

import type { ControllerRuntimeContext, SceneMode } from './game-controller-runtime-types';

import {
  createControllerLocalModel,
  miningLocationById,
  salvageLocationById,
} from './game-controller-local-model';

export function createControllerLog(): SystemLogService {
  const log = createSystemLogService();
  log.write('SYSTEM ONLINE');
  return log;
}

export function createStarMapReturnAction(
  root: HTMLElement,
  systemLog: SystemLogService,
  mountStarMap: () => void
): () => void {
  return () => {
    systemLog.write('NAV > STERNKARTE');
    runSceneZoomTransition(root, mountStarMap);
  };
}

export function localSeed(visit: number): number {
  return (Date.now() + visit * 2654435761) >>> 0;
}

export function enteredMiningLocation(
  mode: SceneMode,
  previousId: string | null,
  currentId: string | null
): boolean {
  return mode === 'star-map' && previousId !== currentId && miningLocationById(currentId) !== null;
}

export function enteredSalvageLocation(
  mode: SceneMode,
  previousId: string | null,
  currentId: string | null
): boolean {
  return mode === 'star-map' && previousId !== currentId && salvageLocationById(currentId) !== null;
}

export function controllerShipRuntimeOptions(
  context: ControllerRuntimeContext,
  ship: ShipDefinition = context.state.activeShip
): ShipRuntimeOptions {
  return {
    ...context.crew.runtimeOptions(ship),
    installed: context.loadouts.get(ship),
  };
}

export function syncControllerNavigationCrewPerformance(context: ControllerRuntimeContext): void {
  const ship = context.state.activeShip;
  const runtime = resolveShipRuntimeSetup(ship, controllerShipRuntimeOptions(context, ship));
  const drive = engineSpeedMultiplier(runtime.installed);
  context.navigation.setCruiseSpeed(
    ship.navigation.cruiseSpeed * drive * runtime.crewEffects.piloting.travelSpeedMultiplier,
    drive
  );
}

export function controllerStarModel(context: ControllerRuntimeContext) {
  const runtime = resolveShipRuntimeSetup(
    context.state.activeShip,
    controllerShipRuntimeOptions(context)
  );
  return createControllerStarModel(
    context.navigation,
    context.state.activeShip,
    context.economy,
    context.state.selectedNpcId,
    runtime.sensorCrewSkill,
    runtime.sensorModifier
  );
}

export function controllerLocalModel(context: ControllerRuntimeContext) {
  return createControllerLocalModel(
    context.state.localSpace,
    context.state.activeShip,
    context.navigation,
    context.state.localNpcMining,
    context.state.selectedNpcId,
    context.state.embeddedCombat === 'local-space'
      ? (context.engagements.activePlayerCombat()?.getSnapshot() ?? null)
      : null
  );
}
