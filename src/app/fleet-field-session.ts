import { fleetFieldSpawns } from './fleet-field-spawn-layout';
import {
  miningFieldCombatArena,
  salvageFieldCombatArena,
} from '../systems/combat/field-combat-arena';
import { createPlayerProfile } from '../core/player-profile';
import type { SectorNpcState } from '../core/npc-types';
import { narrowsSector } from '../data/maps/narrows-sector';
import { createNavigationService } from '../systems/navigation';
import { getShipDefinition } from '../systems/ships';
import type { ShipComponentType } from '../core/ship-types';
import { generateMiningSpace } from '../systems/local-space/local-space-generator';
import { generateSalvageField } from '../systems/salvage/salvage-field-generator';
import type { FleetTestConfiguration, LaunchFleetField } from '../ui/start/fleet-test-lobby';
import { scenarioArrivals } from '../ui/start/fleet-scenario-npcs';
import { duelInstalledComponents } from '../ui/start/duel-combatant-setup';
import { createGameController } from './game-controller';
import { startPlayerMiningCombat } from './game-controller-mining-combat-action';
import { careerSalvageDrone, careerSalvagePirates } from './game-controller-salvage-drone-world';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';

export function prepareFleetField(config: FleetTestConfiguration, seed: number) {
  const wreck = config.map === 'scrap_field' || config.map === 'scrap_scattered';
  const location = narrowsSector.locations.find(
    (site) => site.id === (wreck ? 'kestrel-breaker' : 'greyrock-belt')
  )!;
  const mining = wreck
    ? undefined
    : generateMiningSpace(
        location.id,
        seed,
        location.minedResourceIds,
        config.map === 'scattered' ? 'sparse' : 'standard'
      );
  if (config.map === 'empty') mining!.asteroids.length = 0;
  const salvage = wreck
    ? generateSalvageField(
        location.id,
        seed,
        location.dangerLevel,
        config.map === 'scrap_scattered' ? 'moderate' : 'standard'
      )
    : undefined;
  const arrivals = scenarioArrivals(config.ships, location.id);
  const arena = salvage
    ? salvageFieldCombatArena(salvage)
    : miningFieldCombatArena(mining!, { x: 0, y: 0 });
  const spawns = fleetFieldSpawns(arena, arrivals);
  if (mining) mining.ship.position = { ...spawns.get('player')! };
  const npcs: SectorNpcState[] = [];
  let elapsed = 0;
  let incident = config.incident;
  let context: ControllerRuntimeContext;
  const player = config.ships.find((ship) => ship.group === 'player')!;
  const ship = getShipDefinition(player.draft.shipId)!;
  const droneId = 'security-drone:' + location.id;
  const siteDrone = () =>
    salvage
      ? careerSalvageDrone(context, salvage)
      : context.economy.securityDrones.get(location.id)!;
  function deploy() {
    while (arrivals.length && arrivals[0]!.at <= elapsed) {
      const { npc } = arrivals.shift()!;
      npcs.push(npc);
      context.economy.legal.registerShip(npc.shipId + ':' + npc.id, npc.id);
      const spawn = spawns.get(npc.id)!;
      if (npc.id === droneId) siteDrone().restore(spawn, true);
      const traffic = salvage
        ? careerSalvagePirates(context, salvage)
        : context.economy.localPirates.get(location.id)!;
      traffic.reconcile(npcs);
      traffic.syncCombatPose(npc.id, spawn, npc.pirateMark === 'black-tide' ? Math.PI : 0);
    }
  }
  return {
    ship,
    location,
    exercise: {
      npcs,
      spawns,
      ...(mining && { mining }),
      ...(salvage && { salvage }),
      prepare(value: ControllerRuntimeContext) {
        context = value;
        siteDrone().destroy();
        context.crew.hire(player.draft.crewId, ship);
        for (const [key, ids] of Object.entries(duelInstalledComponents(player.draft)))
          ids.forEach((id, index) =>
            context.loadouts.setSlot(ship, key as ShipComponentType, index, id)
          );
        deploy();
      },
    },
    advance(seconds: number) {
      elapsed += seconds;
      deploy();
      if (incident === 'none' || context.engagements.activePlayerCombat()) return;
      const target = npcs.find((npc) => npc.id.startsWith('npc-'));
      if (!target) return;
      const initiated = incident === 'player-attacks-npc';
      if (context.state.localSpace) startPlayerMiningCombat(context, target.id, initiated);
      else context.state.salvageScene?.attackNpc(target.id, initiated);
      if (context.engagements.activePlayerCombat()) incident = 'none';
    },
  };
}

export const launchFleetField: LaunchFleetField = (root, config, onExit) => {
  const session = prepareFleetField(config, Math.floor(Math.random() * 0x7fffffff));
  const scene = document.createElement('div');
  scene.className = 'fleet-field-session';
  const exit = document.createElement('button');
  exit.textContent = 'Test beenden';
  exit.style.cssText = 'position:absolute;bottom:12px;right:12px;z-index:100';
  exit.addEventListener('click', onExit);
  root.replaceChildren(scene, exit);
  const game = createGameController({
    root: scene,
    ship: session.ship,
    navigation: createNavigationService(
      narrowsSector,
      session.location.id,
      session.ship.navigation.cruiseSpeed
    ),
    playerProfile: createPlayerProfile({
      portraitId: 1,
      captainName: 'Testpilot',
      shipName: 'Testschiff',
    }),
    onReturnToMainMenu: onExit,
    fieldExercise: session.exercise,
  });
  let previous = performance.now();
  let frame = 0;
  let active = true;
  function tick(time: number) {
    if (!active) return;
    const seconds = Math.max(0, (time - previous) / 1000);
    previous = time;
    session.advance(seconds);
    game.tick(seconds);
    if (active) frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  return {
    destroy() {
      if (!active) return;
      active = false;
      cancelAnimationFrame(frame);
      game.destroy();
      exit.remove();
      scene.remove();
    },
  };
};
