import { createInitialState } from '../core/state';
import { tutorialCluster } from '../data/maps/tutorial-cluster';
import { createStarMapViewModel } from '../features/star-map/star-map-view-model';
import { createStarMapPanel } from '../ui/map/star-map-panel';

export function bootstrap(root: HTMLElement | null): void {
  if (!root) throw new Error('SOJOURN app root is missing.');

  const state = createInitialState();
  const buildModel = () =>
    createStarMapViewModel(
      tutorialCluster,
      state.player.locationId,
      state.player.selectedLocationId
    );

  const panel = createStarMapPanel({
    root,
    model: buildModel(),
    onSelectLocation: (id) => {
      state.player.selectedLocationId = id;
      panel.update(buildModel());
    },
  });
}
