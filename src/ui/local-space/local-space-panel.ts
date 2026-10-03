import type { LocalSpaceViewModel } from '../../features/local-space/local-space-view-model';
import { bindLocalSpaceInput } from './local-space-input';
import { LocalSpaceRenderer } from './local-space-renderer';

export interface LocalSpacePanel {
  update(model: LocalSpaceViewModel): void;
  destroy(): void;
}

interface LocalSpacePanelOptions {
  readonly root: HTMLElement;
  readonly model: LocalSpaceViewModel;
  readonly onSelectAsteroid: (id: string | null) => void;
  readonly onStartMining: () => void;
  readonly onReturnToStarMap: () => void;
}

function miningStatus(model: LocalSpaceViewModel): string {
  if (model.miningPhase === 'approaching') return 'ANFLUG AUF ABBAUPOSITION';
  if (model.miningPhase === 'extracting') return 'MINING AKTIV';
  return '';
}

export function createLocalSpacePanel(options: LocalSpacePanelOptions): LocalSpacePanel {
  const shell = document.createElement('section');
  shell.className = 'local-space-shell';
  shell.innerHTML = [
    '<canvas class="local-space-canvas" aria-label="Lokales Abbaugebiet"></canvas>',
    '<div class="local-space-title">',
    '<span>GREYROCK BELT</span>',
    '<strong>' + options.model.title + '</strong>',
    '</div>',
    '<button class="return-map-button" type="button">ZUR STERNKARTE</button>',
    '<div class="local-mining-status" hidden></div>',
    '<div class="local-ore-counter">ERZ · <strong>0</strong></div>',
    '<div class="local-selection-card" hidden>',
    '<div class="local-selection-kind">ASTEROID</div>',
    '<div class="local-selection-name"></div>',
    '<div class="local-selection-meta"></div>',
    '<div class="local-ore-bar"><div></div></div>',
    '<button class="mine-button" type="button">MINING</button>',
    '</div>',
  ].join('');
  options.root.replaceChildren(shell);

  const canvas = shell.querySelector<HTMLCanvasElement>('.local-space-canvas');
  const card = shell.querySelector<HTMLElement>('.local-selection-card');
  const name = shell.querySelector<HTMLElement>('.local-selection-name');
  const meta = shell.querySelector<HTMLElement>('.local-selection-meta');
  const oreBar = shell.querySelector<HTMLElement>('.local-ore-bar > div');
  const mineButton = shell.querySelector<HTMLButtonElement>('.mine-button');
  const backButton = shell.querySelector<HTMLButtonElement>('.return-map-button');
  const status = shell.querySelector<HTMLElement>('.local-mining-status');
  const oreCounter = shell.querySelector<HTMLElement>('.local-ore-counter strong');

  if (!canvas || !card || !name || !meta || !oreBar || !mineButton) {
    throw new Error('Local-space selection UI is incomplete.');
  }
  if (!backButton || !status || !oreCounter) {
    throw new Error('Local-space controls are incomplete.');
  }

  let model = options.model;
  const renderer = new LocalSpaceRenderer(canvas, model);

  const updateOverlay = (): void => {
    const selected = model.selectedAsteroid;
    card.hidden = !selected;
    oreCounter.textContent = Math.round(model.collectedOre).toString();

    const statusText = miningStatus(model);
    status.hidden = statusText.length === 0;
    status.textContent = statusText;

    if (!selected) return;
    name.textContent = selected.oreType;
    meta.textContent =
      Math.round(selected.oreRemaining) +
      ' / ' +
      Math.round(selected.oreCapacity) +
      ' ERZ';
    oreBar.style.width =
      Math.max(0, (selected.oreRemaining / selected.oreCapacity) * 100) + '%';
    mineButton.disabled =
      selected.oreRemaining <= 0 ||
      model.miningPhase === 'approaching' ||
      model.miningPhase === 'extracting';
  };

  const observer = new ResizeObserver(() => renderer.resize());
  observer.observe(canvas);
  const unbindInput = bindLocalSpaceInput({
    canvas,
    renderer,
    onSelectAsteroid: options.onSelectAsteroid,
  });

  mineButton.addEventListener('click', options.onStartMining);
  backButton.addEventListener('click', options.onReturnToStarMap);
  updateOverlay();

  return {
    update(nextModel): void {
      model = nextModel;
      renderer.update(model);
      updateOverlay();
    },
    destroy(): void {
      unbindInput();
      observer.disconnect();
      shell.remove();
    },
  };
}
