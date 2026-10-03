import { tutorialCluster } from '../data/maps/tutorial-cluster';
import { createNavigationService } from '../systems/navigation';
import { getShipDefinition } from '../systems/ships';
import { createGameController } from './game-controller';

export function bootstrap(root: HTMLElement | null): void {
  if (!root) throw new Error('SOJOURN app root is missing.');

  const ship = getShipDefinition('miner-80m-standard');
  if (!ship) throw new Error('SOJOURN starting ship is missing.');

  const navigation = createNavigationService(
    tutorialCluster,
    tutorialCluster.startLocationId,
    ship.navigation.cruiseSpeed
  );
  const game = createGameController({ root, ship, navigation });

  let previousTime = performance.now();
  const frame = (time: number): void => {
    const deltaSeconds = (time - previousTime) / 1000;
    previousTime = time;
    game.tick(deltaSeconds);
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}
