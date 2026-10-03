import { tutorialCluster } from '../data/maps/tutorial-cluster';
import { createStarMapViewModel } from '../features/star-map/star-map-view-model';
import { createNavigationService } from '../systems/navigation';
import { getShipDefinition } from '../systems/ships';
import { createStarMapPanel } from '../ui/map/star-map-panel';

export function bootstrap(root: HTMLElement | null): void {
  if (!root) throw new Error('SOJOURN app root is missing.');

  const ship = getShipDefinition('miner-80m-standard');
  if (!ship) throw new Error('SOJOURN starting ship is missing.');

  const navigation = createNavigationService(
    tutorialCluster,
    tutorialCluster.startLocationId,
    ship.navigation.cruiseSpeed
  );
  const buildModel = () =>
    createStarMapViewModel(tutorialCluster, navigation.getSnapshot(), ship);

  const panel = createStarMapPanel({
    root,
    model: buildModel(),
    onSelectLocation: (id) => {
      navigation.selectDestination(id);
      panel.update(buildModel());
    },
    onStartTravel: () => {
      navigation.startTravel();
      panel.update(buildModel());
    },
  });

  let previousTime = performance.now();
  const frame = (time: number): void => {
    const deltaSeconds = (time - previousTime) / 1000;
    previousTime = time;
    navigation.tick(deltaSeconds);
    panel.update(buildModel());
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}
