import { seededLocalGate } from '../core/local-space-exit';
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
import { careerSalvageDrone } from './game-controller-salvage-drone-world';
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
      const { npc, at } = arrivals.shift()!;
      npcs.push(npc);
      context.economy.legal.registerShip(npc.shipId + ':' + npc.id, npc.id);
      if (npc.id === droneId) {
        const drone = siteDrone();
        const field = salvage ?? mining!;
        drone.restore(
          at > 0 ? seededLocalGate(field.width, field.height, seed) : drone.position,
          true
        );
      }
    }
  }
  return {
    ship,
    location,
    exercise: {
      npcs,
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
  scene.style.cssText = 'position:absolute;inset:0';
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
