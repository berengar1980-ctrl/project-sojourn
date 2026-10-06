import type { WorldPoint } from '../../core/world-types';
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
  readonly onNavigate: (target: WorldPoint) => Promise<'safe' | 'risk' | false>;
  readonly log: SystemLogService;
  readonly onStartMining: () => Promise<void>;
  readonly onLongRangeScan: () => void;
  readonly onShortRangeScan: () => Promise<void>;
  readonly onCancelMining: () => void;
  readonly onReturnToStarMap: () => void;
}

function miningStatus(model: LocalSpaceViewModel): string {
  if (model.longRangeScanProgress != null) {
    return 'LANGREICHWEITENSCAN · ' + Math.round(model.longRangeScanProgress * 100) + ' %';
  }
  if (model.shortRangeScanProgress != null) {
    return 'NAHBEREICHSSCAN · ' + Math.round(model.shortRangeScanProgress * 100) + ' %';
  }
  if (model.navigationTarget) return 'NAVIGATION ZUM ZIELPUNKT';
  if (model.scanTarget && model.miningPhase === 'approaching') {
    return 'ANFLUG FÜR NAHBEREICHSSCAN';
  }
  if (model.miningPhase === 'approaching') return 'ANFLUG AUF ABBAUPOSITION';
  if (model.miningPhase === 'extracting') return 'MINING AKTIV';
  return '';
}

function asteroidStatus(model: LocalSpaceViewModel): string {
  const asteroid = model.selectedAsteroid;
  if (!asteroid) return '';
  if (asteroid.scanLevel === 'unscanned') return 'NICHT GESCANNT';
  if (asteroid.scanLevel === 'surveyed') {
    if (asteroid.surveyResult === 'empty') return 'KEINE RESSOURCE ERKANNT';
    return asteroid.deposits.length + ' VORKOMMEN ERKANNT';
  }
  if (asteroid.deposits.length === 0) return 'ANALYSE · KEINE RESSOURCE';
  return asteroid.deposits
    .map((deposit) => {
      const name = deposit.resourceName ?? '???';
      return name + ' · GESCHÄTZT ~' + Math.round(deposit.estimatedAmount ?? 0);
    })
    .join(' / ');
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

interface LocalSpaceControls {
  readonly canvas: HTMLCanvasElement;
  readonly card: HTMLElement;
  readonly name: HTMLElement;
  readonly meta: HTMLElement;
  readonly oreBar: HTMLElement;
  readonly mineButton: HTMLButtonElement;
  readonly shortScanButton: HTMLButtonElement;
  readonly longScanButton: HTMLButtonElement;
  readonly cancelButton: HTMLButtonElement;
  readonly backButton: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly scanLabelsButton: HTMLButtonElement;
  readonly cargoTotal: HTMLElement;
  readonly cargoList: HTMLElement;
}

function createLocalSpaceShell(options: LocalSpacePanelOptions): HTMLElement {
  const shell = document.createElement('section');
  shell.className = 'local-space-shell';
  shell.innerHTML = [
    '<canvas class="local-space-canvas" aria-label="Lokales Abbaugebiet"></canvas>',
    '<div class="local-space-title"><span>GREYROCK BELT</span>',
    '<strong>' + options.model.title + '</strong></div>',
    '<button class="return-map-button" type="button">ZUR STERNKARTE</button>',
    '<button class="long-scan-button" type="button">LANGREICHWEITENSCAN</button>',
    '<button class="scan-label-toggle is-active" type="button">SCAN-DATEN AN</button>',
    '<div class="local-mining-status" hidden></div>',
    '<button class="cancel-mining-button" type="button" hidden>ABBRECHEN</button>',
    '<div class="local-cargo-panel">',
    '<div class="local-cargo-title">FRACHT // CONTAINER</div>',
    '<div class="local-cargo-total">GESAMT · <strong>0</strong></div>',
    '<div class="local-cargo-list"></div></div>',
    '<div class="local-selection-card" hidden>',
    '<div class="local-selection-kind">ASTEROID</div>',
    '<div class="local-selection-name"></div><div class="local-selection-meta"></div>',
    '<div class="local-ore-bar"><div></div></div>',
    '<button class="short-scan-button" type="button">NAHBEREICHSSCAN</button>',
    '<button class="mine-button" type="button">MINING</button></div>',
  ].join('');
  options.root.replaceChildren(shell);
  return shell;
}

function localSpaceControls(shell: HTMLElement): LocalSpaceControls {
  const query = <T extends Element>(selector: string): T => {
    const element = shell.querySelector<T>(selector);
    if (!element) throw new Error('Local-space UI is incomplete: ' + selector);
    return element;
  };

  return {
    canvas: query<HTMLCanvasElement>('.local-space-canvas'),
    card: query<HTMLElement>('.local-selection-card'),
    name: query<HTMLElement>('.local-selection-name'),
    meta: query<HTMLElement>('.local-selection-meta'),
    oreBar: query<HTMLElement>('.local-ore-bar > div'),
    mineButton: query<HTMLButtonElement>('.mine-button'),
    shortScanButton: query<HTMLButtonElement>('.short-scan-button'),
    longScanButton: query<HTMLButtonElement>('.long-scan-button'),
    cancelButton: query<HTMLButtonElement>('.cancel-mining-button'),
    backButton: query<HTMLButtonElement>('.return-map-button'),
    status: query<HTMLElement>('.local-mining-status'),
    scanLabelsButton: query<HTMLButtonElement>('.scan-label-toggle'),
    cargoTotal: query<HTMLElement>('.local-cargo-total strong'),
    cargoList: query<HTMLElement>('.local-cargo-list'),
  };
}

function bindNavigationInput(
  canvas: HTMLCanvasElement,
  renderer: LocalSpaceRenderer,
  options: LocalSpacePanelOptions,
  systemLog: SystemLogPanel,
  updateOverlay: () => void
): () => void {
  let navigationRequest = 0;

  return bindLocalSpaceInput({
    canvas,
    renderer,
    onSelectAsteroid: options.onSelectAsteroid,
    onNavigate: (x, y) => {
      navigationRequest += 1;
      const request = navigationRequest;
      options.log.write('NAV > PUNKTROUTE WIRD BERECHNET...');
      systemLog.update();

      void options
        .onNavigate({ x, y })
        .then((result) => {
          if (request !== navigationRequest) return;
          if (result === 'risk') {
            options.log.write('NAV > WARNUNG: ROUTE MIT REDUZIERTER SICHERHEIT');
          } else {
            options.log.write(result ? 'NAV > ZIELROUTE BEREIT' : 'NAV > ROUTE FEHLGESCHLAGEN');
          }
          systemLog.update();
          updateOverlay();
        })
        .catch(() => {
          if (request !== navigationRequest) return;
          options.log.write('NAV > ROUTENBERECHNUNG FEHLER');
          systemLog.update();
        });
    },
  });
}

function renderCargo(model: LocalSpaceViewModel, total: HTMLElement, list: HTMLElement): void {
  total.textContent = Math.round(model.collectedOre).toString();
  list.replaceChildren();

  if (model.cargoResources.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'local-cargo-empty';
    empty.textContent = 'LEER';
    list.append(empty);
    return;
  }

  for (const resource of model.cargoResources) {
    const row = document.createElement('div');
    row.className = 'local-cargo-row';
    const name = document.createElement('span');
    const amount = document.createElement('strong');
    name.textContent = resource.name.toUpperCase();
    amount.textContent = Math.round(resource.amount).toString();
    row.append(name, amount);
    list.append(row);
  }
}

function bindScanLabelButton(button: HTMLButtonElement, renderer: LocalSpaceRenderer): void {
  let visible = true;
  button.addEventListener('click', () => {
    visible = !visible;
    renderer.setScanLabelsVisible(visible);
    button.classList.toggle('is-active', visible);
    button.textContent = visible ? 'SCAN-DATEN AN' : 'SCAN-DATEN AUS';
  });
}

function initializeSystemLog(
  log: SystemLogService,
  panel: SystemLogPanel,
  shieldValue: number
): void {
  log.write('SCHILD-INTEGRITÄT ' + shieldValue + ' %');
  panel.update();
}

function observeCanvas(canvas: HTMLCanvasElement, renderer: LocalSpaceRenderer): ResizeObserver {
  const observer = new ResizeObserver(() => renderer.resize());
  observer.observe(canvas);
  return observer;
}

function createScanCompletionTracker(
  log: SystemLogService,
  panel: SystemLogPanel,
  initialModel: LocalSpaceViewModel
): (model: LocalSpaceViewModel) => void {
  let longActive = initialModel.longRangeScanProgress != null;
  let shortActive = initialModel.shortRangeScanProgress != null;

  return (model) => {
    const nextLong = model.longRangeScanProgress != null;
    const nextShort = model.shortRangeScanProgress != null;
    if (longActive && !nextLong) log.write('SCAN > LANGREICHWEITE ABGESCHLOSSEN');
    if (shortActive && !nextShort) log.write('SCAN > NAHBEREICHSANALYSE ABGESCHLOSSEN');
    if ((longActive && !nextLong) || (shortActive && !nextShort)) panel.update();
    longActive = nextLong;
    shortActive = nextShort;
  };
}

function bindLongScanButton(
  button: HTMLButtonElement,
  getModel: () => LocalSpaceViewModel,
  options: LocalSpacePanelOptions,
  systemLog: SystemLogPanel,
  updateOverlay: () => void
): void {
  button.addEventListener('click', () => {
    if (getModel().longRangeScanProgress != null) return;
    options.log.write('SCAN > LANGREICHWEITENSCAN GESTARTET');
    options.onLongRangeScan();
    systemLog.update();
    updateOverlay();
  });
}

function updateMiningButton(
  button: HTMLButtonElement,
  model: LocalSpaceViewModel,
  miningActive: boolean
): void {
  const selected = model.selectedAsteroid;
  if (!selected) return;

  const knownEmpty = selected.scanLevel !== 'unscanned' && selected.surveyResult === 'empty';
  const depleted = selected.scanLevel === 'analyzed' && (selected.totalRemaining ?? 0) <= 0;
  button.textContent = model.miningAvailable ? 'MINING' : 'MINING NICHT VERFÜGBAR';
  button.title = model.miningAvailable
    ? ''
    : 'Dieses Schiff hat kein einsatzfähiges Mining-System.';
  button.disabled =
    !model.miningAvailable || knownEmpty || depleted || (selected.isMiningTarget && miningActive);
}

export function createLocalSpacePanel(options: LocalSpacePanelOptions): LocalSpacePanel {
  const shell = createLocalSpaceShell(options);
  const controls = localSpaceControls(shell);
  const {
    canvas,
    card,
    name,
    meta,
    oreBar,
    mineButton,
    shortScanButton,
    longScanButton,
    cancelButton,
    backButton,
    status,
    scanLabelsButton,
    cargoTotal,
    cargoList,
  } = controls;

  let model = options.model;
  let lastShieldPercent = shieldPercent(model);
  const renderer = new LocalSpaceRenderer(canvas, model);
  const systemLog = createSystemLogPanel({
    root: shell,
    log: options.log,
    header: 'SYS // LOCAL OPS',
    placementClass: 'local-system-log',
  });
  initializeSystemLog(options.log, systemLog, lastShieldPercent);
  const trackScanCompletion = createScanCompletionTracker(options.log, systemLog, model);

  const updateOverlay = (): void => {
    const selected = model.selectedAsteroid;
    const miningActive = model.miningPhase !== 'idle';
    const longScanActive = model.longRangeScanProgress != null;
    trackScanCompletion(model);
    card.hidden = !selected;
    cancelButton.hidden = !miningActive;
    renderCargo(model, cargoTotal, cargoList);
    longScanButton.disabled = longScanActive;

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
    name.textContent =
      selected.scanLevel === 'analyzed' && selected.deposits.length > 0
        ? 'ASTEROID · ' + selected.deposits.length + ' VORKOMMEN'
        : 'ASTEROID';
    meta.textContent = asteroidStatus(model);
    const remaining =
      selected.totalCapacity && selected.totalRemaining != null
        ? (selected.totalRemaining / selected.totalCapacity) * 100
        : 0;
    oreBar.style.width = Math.max(0, remaining) + '%';
    shortScanButton.disabled = miningActive || selected.scanLevel === 'analyzed';
    updateMiningButton(mineButton, model, miningActive);
  };

  const observer = observeCanvas(canvas, renderer);
  const unbindInput = bindNavigationInput(canvas, renderer, options, systemLog, updateOverlay);

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
  bindLongScanButton(longScanButton, () => model, options, systemLog, updateOverlay);
  bindScanLabelButton(scanLabelsButton, renderer);
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
