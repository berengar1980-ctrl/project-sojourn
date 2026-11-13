import type { RouteProfile } from '../../systems/navigation/route-planner';
import type { StarMapViewModel } from '../../features/star-map/star-map-view-model';
import type { StarMapMenu } from './star-map-menu';
import type { TopdownMapRenderer } from './topdown-map-renderer';

let preferredDangerVisible = true;
const preferredDangerBands = { green: true, yellow: true, red: true };

export function bindDangerAndRouteControls(
  menu: StarMapMenu,
  renderer: TopdownMapRenderer,
  getModel: () => StarMapViewModel,
  onRouteProfileChange?: (profile: RouteProfile) => void
): () => void {
  const hazardControls = document.createElement('div');
  hazardControls.className = 'star-map-danger-controls';
  const hazardMaster = document.createElement('button');
  hazardMaster.type = 'button';
  hazardMaster.className = 'star-map-menu__action';
  hazardMaster.textContent = preferredDangerVisible ? 'GEFAHREN // AN' : 'GEFAHREN // AUS';
  const hazardButtons = (['green', 'yellow', 'red'] as const).map((band) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'star-map-menu__action';
    const refresh = () => {
      button.textContent =
        { green: 'GRÜN', yellow: 'GELB', red: 'ROT' }[band] +
        (preferredDangerBands[band] ? ' ✓' : ' —');
    };
    refresh();
    button.addEventListener('click', () => {
      preferredDangerBands[band] = !preferredDangerBands[band];
      renderer.setDangerBand(band, preferredDangerBands[band]);
      refresh();
    });
    return button;
  });
  hazardMaster.addEventListener('click', () => {
    preferredDangerVisible = !preferredDangerVisible;
    renderer.setDangerOverlay(preferredDangerVisible);
    hazardMaster.textContent = preferredDangerVisible ? 'GEFAHREN // AN' : 'GEFAHREN // AUS';
  });
  hazardControls.append(hazardMaster, ...hazardButtons);
  menu.mapPane.append(hazardControls);
  renderer.setDangerOverlay(preferredDangerVisible);
  for (const band of ['green', 'yellow', 'red'] as const) {
    renderer.setDangerBand(band, preferredDangerBands[band]);
  }
  const routeHelp = document.createElement('p');
  routeHelp.className = 'star-map-menu__help';
  routeHelp.textContent = 'ROUTENWAHL';
  const profileButtons = (['fast', 'balanced', 'safe'] as const).map((profile) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'star-map-menu__action';
    button.dataset.routeProfile = profile;
    button.textContent = { fast: 'SCHNELL', balanced: 'AUSGEWOGEN', safe: 'SICHER' }[profile];
    button.addEventListener('click', () => {
      onRouteProfileChange?.(profile);
      refreshProfileButtons();
    });
    return button;
  });
  const refreshProfileButtons = (): void => {
    for (const button of profileButtons) {
      button.classList.toggle(
        'is-active',
        button.dataset.routeProfile === getModel().navigation.routeProfile
      );
    }
  };
  menu.mapPane.append(routeHelp, ...profileButtons);
  refreshProfileButtons();
  return refreshProfileButtons;
}

