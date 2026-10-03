import type { LocalSpaceViewModel } from '../../features/local-space/local-space-view-model';
import { bindLocalSpaceInput } from './local-space-input';
import { LocalSpaceRenderer } from './local-space-renderer';
import type { SystemLogService } from '../../core/system-log-types';
import { createSystemLogPanel, type SystemLogPanel } from '../system-log/system-log-panel';

export interface LocalSpacePanel {
  update(model: LocalSpaceViewModel): void;
  destroy(): void;
}

interface LocalSpacePanelOptions {
  readonly root: HTMLElement;
  readonly model: LocalSpaceViewModel;
  readonly onSelectAsteroid: (id: string | null) => void;
  readonly log: SystemLogService;
  readonly onStartMining: () => Promise<void>;
  readonly onLongRangeScan: () => void;
  readonly onShortRangeScan: () => Promise<void>;
  readonly onCancelMining: () => void;
  readonly onReturnToStarMap: () => void;
}

function miningStatus(model: LocalSpaceViewModel): string {
  if (model.scanTarget && model.miningPhase === 'approaching') return 'ANFLUG FÜR NAHBEREICHSSCAN';
  if (model.miningPhase === 'approaching') return 'ANFLUG AUF ABBAUPOSITION';
  if (model.miningPhase === 'extracting') return 'MINING AKTIV';
  return '';
}

function asteroidStatus(model: LocalSpaceViewModel): string {
  const asteroid = model.selectedAsteroid;
  if (!asteroid) return '';
  if (asteroid.scanLevel === 'unscanned') return 'NICHT GESCANNT';
  if (asteroid.scanLevel === 'surveyed') {
    return asteroid.surveyResult === 'deposit' ? 'RESSOURCE ERKANNT' : 'KEINE RESSOURCE ERKANNT';
  }
  if (!asteroid.resourceName) return 'ANALYSE · KEINE RESSOURCE';
  return (
    asteroid.resourceName +
    ' · ' +
    Math.round(asteroid.resourceAmount ?? 0) +
    ' / ' +
    Math.round(asteroid.resourceCapacity ?? 0)
  );
}

function shieldPercent(model: LocalSpaceViewModel): number {
  return Math.max(0, Math.round((model.shield.currentHp / model.shield.maxHp) * 100));
}

function bindRoutePlanning(
  button: HTMLButtonElement,
  systemLog: SystemLogService,
  logPanel: SystemLogPanel,
  startMining: () => Promise<void>,
  updateOverlay: () => void
): void {
  let planning = false;
  button.addEventListener('click', async () => {
    if (planning) return;
    planning = true;
    button.disabled = true;
    systemLog.write('NAV > ROUTENBERECHNUNG...');
    logPanel.update();

    try {
      await startMining();
      systemLog.write('NAV > ANFLUGROUTE BEREIT');
    } catch {
      systemLog.write('NAV > ROUTENBERECHNUNG FEHLER');
    } finally {
      planning = false;
      logPanel.update();
      updateOverlay();
    }
  });
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
    '<button class="long-scan-button" type="button">LANGREICHWEITENSCAN</button>',
    '<div class="local-mining-status" hidden></div>',
    '<button class="cancel-mining-button" type="button" hidden>ABBRECHEN</button>',
    '<div class="local-ore-counter">ERZ · <strong>0</strong></div>',
    '<div class="local-selection-card" hidden>',
    '<div class="local-selection-kind">ASTEROID</div>',
    '<div class="local-selection-name"></div>',
    '<div class="local-selection-meta"></div>',
    '<div class="local-ore-bar"><div></div></div>',
    '<button class="short-scan-button" type="button">NAHBEREICHSSCAN</button>',
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
  const shortScanButton = shell.querySelector<HTMLButtonElement>('.short-scan-button');
  const longScanButton = shell.querySelector<HTMLButtonElement>('.long-scan-button');
  const cancelButton = shell.querySelector<HTMLButtonElement>('.cancel-mining-button');
  const backButton = shell.querySelector<HTMLButtonElement>('.return-map-button');
  const status = shell.querySelector<HTMLElement>('.local-mining-status');
  const oreCounter = shell.querySelector<HTMLElement>('.local-ore-counter strong');

  if (!canvas || !card || !name || !meta || !oreBar || !mineButton || !shortScanButton) {
    throw new Error('Local-space selection UI is incomplete.');
  }
  if (!longScanButton || !cancelButton || !backButton || !status || !oreCounter) {
    throw new Error('Local-space controls are incomplete.');
  }

  let model = options.model;
  let lastShieldPercent = shieldPercent(model);
  const renderer = new LocalSpaceRenderer(canvas, model);
  const systemLog = createSystemLogPanel({
    root: shell,
    log: options.log,
    header: 'SYS // LOCAL OPS',
    placementClass: 'local-system-log',
  });
  options.log.write('SCHILD-INTEGRITÄT ' + lastShieldPercent + ' %');
  systemLog.update();

  const updateOverlay = (): void => {
    const selected = model.selectedAsteroid;
    const miningActive = model.miningPhase !== 'idle';
    card.hidden = !selected;
    cancelButton.hidden = !miningActive;
    oreCounter.textContent = Math.round(model.collectedOre).toString();

    const currentShieldPercent = shieldPercent(model);
    if (currentShieldPercent !== lastShieldPercent) {
      options.log.write('SCHILD-INTEGRITÄT ' + currentShieldPercent + ' %');
      systemLog.update();
      lastShieldPercent = currentShieldPercent;
    }

    const statusText = miningStatus(model);
    status.hidden = statusText.length === 0;
    status.textContent = statusText;

    if (!selected) return;
    name.textContent = selected.scanLevel === 'analyzed' ? selected.resourceName ?? 'LEER' : 'ASTEROID';
    meta.textContent = asteroidStatus(model);
    const remaining =
      selected.resourceCapacity && selected.resourceAmount != null
        ? (selected.resourceAmount / selected.resourceCapacity) * 100
        : 0;
    oreBar.style.width = Math.max(0, remaining) + '%';
    shortScanButton.disabled = miningActive || selected.scanLevel === 'analyzed';
    const knownEmpty = selected.scanLevel !== 'unscanned' && selected.surveyResult === 'empty';
    const depleted =
      selected.scanLevel === 'analyzed' && (selected.resourceAmount ?? 0) <= 0;
    mineButton.disabled = knownEmpty || depleted || (selected.isMiningTarget && miningActive);
  };

  const observer = new ResizeObserver(() => renderer.resize());
  observer.observe(canvas);
  const unbindInput = bindLocalSpaceInput({
    canvas,
    renderer,
    onSelectAsteroid: options.onSelectAsteroid,
  });

  bindRoutePlanning(mineButton, options.log, systemLog, options.onStartMining, updateOverlay);
  bindRoutePlanning(
    shortScanButton,
    options.log,
    systemLog,
    async () => {
      options.log.write('SCAN > NAHBEREICHSANALYSE');
      await options.onShortRangeScan();
    },
    updateOverlay
  );
  longScanButton.addEventListener('click', () => {
    options.log.write('SCAN > LANGREICHWEITENSCAN');
    options.onLongRangeScan();
    systemLog.update();
    updateOverlay();
  });
  cancelButton.addEventListener('click', options.onCancelMining);
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
      systemLog.destroy();
      shell.remove();
    },
  };
}
