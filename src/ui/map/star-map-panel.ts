import type { StarMapViewModel } from '../../features/star-map/star-map-view-model';
import type { SystemLogService } from '../../core/system-log-types';
import { bindCargoMarketScanner } from './star-map-cargo-scanner';
import { bindStarMapInput } from './star-map-input';
import { TopdownMapRenderer, type StarMapDisplayMode } from './topdown-map-renderer';
import { createSystemLogPanel } from '../system-log/system-log-panel';

export interface StarMapPanel {
  update(model: StarMapViewModel): void;
  destroy(): void;
}

let preferredDisplayMode: StarMapDisplayMode = 'physical';
let preferredLabelsVisible = true;

interface StarMapPanelOptions {
  readonly root: HTMLElement;
  readonly model: StarMapViewModel;
  readonly log: SystemLogService;
  readonly onSelectLocation: (id: string) => void;
  readonly onSelectNpc: (id: string) => void;
  readonly onAttackNpc: (id: string) => void;
  readonly onStartTravel: () => void;
  readonly onDock: () => void;
}

function activityLabels(model: StarMapViewModel): string {
  const selected = model.locations.find((location) => location.isSelected);
  if (!selected) return '';

  return [
    selected.activities.trade ? 'HANDEL' : null,
    selected.activities.mine ? 'MINING' : null,
    selected.activities.salvage ? 'BERGUNG' : null,
    selected.activities.refuel ? 'TREIBSTOFF' : null,
    selected.activities.missions ? 'MISSIONEN' : null,
    selected.activities.shipyard ? 'WERFT' : null,
  ]
    .filter((label): label is string => Boolean(label))
    .join(' · ');
}

function distanceToSelectedNpc(model: StarMapViewModel): number {
  const selected = model.npcShips.find((npc) => npc.isSelected);
  if (!selected) return 0;
  return Math.hypot(
    selected.position.x - model.playerShip.position.x,
    selected.position.y - model.playerShip.position.y
  );
}

function createStarMapControls(options: StarMapPanelOptions) {
  const shell = document.createElement('section');
  shell.className = 'star-map-shell';
  shell.innerHTML = `
    <canvas class="star-map-canvas" aria-label="Sternkarte"></canvas>
    <div class="map-title">
      <span>SOJOURN</span>
      <strong>${options.model.title}</strong>
    </div>
    <div class="travel-status" hidden></div>
    <button class="map-mode-toggle" type="button">ANSICHT // PHYSISCH</button>
    <button class="map-label-toggle" type="button">NAMEN // AN</button>
    <button class="map-cargo-toggle" type="button">FRACHT // AUS</button>
    <div class="map-cargo-scanner" hidden style="position:absolute;right:16px;top:92px;width:min(340px,calc(100% - 32px));max-height:58%;overflow:auto;background:rgba(5,14,23,.94);border:1px solid #526b78;border-radius:7px;padding:14px;color:#dfe8f3;z-index:5;font:12px system-ui;box-shadow:0 12px 32px #0009">
      <strong>FRACHTMARKT // ANALYSE</strong>
      <div style="margin:9px 0"><label for="cargo-resource-select">ANZEIGE </label><select id="cargo-resource-select" class="map-cargo-resource" style="max-width:210px;background:#132531;color:#dfe8f3;border:1px solid #526b78;padding:5px"></select></div>
      <div class="map-cargo-content"></div>
      <small style="display:block;margin-top:8px;color:#9baebb">Prognose auf Basis bekannter Marktdaten. Tatsächliche Preise können sich ändern. Verkauf nur im Hafen.</small>
    </div>
    <div class="map-controls">DOPPELKLICK · ANSICHT ZURÜCKSETZEN &nbsp;&nbsp; MAUSRAD · ZOOM</div>
    <div class="selection-card" hidden>
      <div class="selection-kind"></div>
      <div class="selection-name"></div>
      <div class="selection-description"></div>
      <div class="selection-meta"></div>
      <div class="selection-actions">
        <button class="travel-button" type="button">FLUG STARTEN</button>
        <button class="dock-button" type="button" hidden>ANDOCKEN</button>
        <button class="attack-button" type="button" hidden>ANGREIFEN</button>
      </div>
    </div>
  `;
  options.root.replaceChildren(shell);

  const canvas = shell.querySelector<HTMLCanvasElement>('.star-map-canvas');
  const card = shell.querySelector<HTMLElement>('.selection-card');
  const travelButton = shell.querySelector<HTMLButtonElement>('.travel-button');
  const dockButton = shell.querySelector<HTMLButtonElement>('.dock-button');
  const attackButton = shell.querySelector<HTMLButtonElement>('.attack-button');
  const travelStatus = shell.querySelector<HTMLElement>('.travel-status');
  const modeToggle = shell.querySelector<HTMLButtonElement>('.map-mode-toggle');
  const labelToggle = shell.querySelector<HTMLButtonElement>('.map-label-toggle');
  const cargoToggle = shell.querySelector<HTMLButtonElement>('.map-cargo-toggle');
  const cargoPanel = shell.querySelector<HTMLElement>('.map-cargo-scanner');
  const cargoSelect = shell.querySelector<HTMLSelectElement>('.map-cargo-resource');
  const cargoContent = shell.querySelector<HTMLElement>('.map-cargo-content');
  if (
    !canvas ||
    !card ||
    !travelButton ||
    !dockButton ||
    !attackButton ||
    !travelStatus ||
    !modeToggle ||
    !labelToggle ||
    !cargoToggle ||
    !cargoPanel ||
    !cargoSelect ||
    !cargoContent
  ) {
    throw new Error('Star map UI is incomplete.');
  }

  return {
    shell,
    canvas,
    card,
    travelButton,
    dockButton,
    attackButton,
    travelStatus,
    modeToggle,
    labelToggle,
    cargoToggle,
    cargoPanel,
    cargoSelect,
    cargoContent,
  };
}

function createSelectionUpdater(
  getModel: () => StarMapViewModel,
  card: HTMLElement,
  travelButton: HTMLButtonElement,
  dockButton: HTMLButtonElement,
  attackButton: HTMLButtonElement
) {
  const updateLocationSelection = (): boolean => {
    const model = getModel();
    const selected = model.locations.find((location) => location.isSelected);
    if (!selected) return false;

    const kind = card.querySelector<HTMLElement>('.selection-kind');
    const name = card.querySelector<HTMLElement>('.selection-name');
    const description = card.querySelector<HTMLElement>('.selection-description');
    const meta = card.querySelector<HTMLElement>('.selection-meta');
    if (!kind || !name || !description || !meta) return true;

    kind.textContent = selected.kind.replace('-', ' ').toUpperCase();
    name.textContent = selected.name;
    description.textContent = selected.description;
    const route = model.route ? ` · ROUTE ${Math.round(model.route.distance)}` : '';
    meta.textContent = `GEFAHR ${selected.dangerLevel}/3 · ${activityLabels(model)}${route}`;
    const isCurrent = selected.id === model.navigation.currentLocationId;
    travelButton.hidden = model.navigation.isTravelling || isCurrent;
    dockButton.hidden = model.navigation.isTravelling || !isCurrent || !selected.activities.dock;
    attackButton.hidden = true;
    return true;
  };

  const updateNpcSelection = (): boolean => {
    const model = getModel();
    const selected = model.npcShips.find((npc) => npc.isSelected);
    if (!selected) return false;

    const kind = card.querySelector<HTMLElement>('.selection-kind');
    const name = card.querySelector<HTMLElement>('.selection-name');
    const description = card.querySelector<HTMLElement>('.selection-description');
    const meta = card.querySelector<HTMLElement>('.selection-meta');
    if (!kind || !name || !description || !meta) return true;

    const faction =
      selected.factionId === 'pirates'
        ? 'HARROW-KORSAREN'
        : selected.factionId === 'pirates2'
          ? 'SCHWARZE FLUT'
          : null;
    kind.textContent =
      'SCHIFF // ' + selected.job.toUpperCase() + (faction ? ' // ' + faction : '');
    name.textContent = selected.name;
    description.textContent = selected.activity;
    const status = selected.combatMode ? selected.combatMode.toUpperCase() : 'KONTAKT';
    meta.textContent = `STATUS ${status} · DISTANZ ${Math.round(distanceToSelectedNpc(model))} u`;
    travelButton.hidden = true;
    dockButton.hidden = true;
    attackButton.hidden =
      selected.combatMode !== null || selected.id === model.navigation.pursuitTargetId;
    return true;
  };

  return { updateLocationSelection, updateNpcSelection };
}

function updateTravelStatus(model: StarMapViewModel, travelStatus: HTMLElement): void {
  travelStatus.hidden = !model.navigation.isTravelling;
  if (!model.navigation.isTravelling) return;

  if (model.navigation.isPursuing) {
    const target = model.npcShips.find((npc) => npc.id === model.navigation.pursuitTargetId);
    const distance = target
      ? Math.hypot(
          target.position.x - model.playerShip.position.x,
          target.position.y - model.playerShip.position.y
        )
      : 0;
    travelStatus.textContent =
      'VERFOLGUNG · ' +
      (target?.name.toUpperCase() ?? 'KONTAKT') +
      ' · ' +
      Math.round(distance) +
      ' u';
    return;
  }

  const percent = Math.round(model.navigation.progress * 100);
  travelStatus.textContent =
    'KURS · ' + percent + '% · ' + Math.round(model.navigation.speed) + ' u/s';
}

export function createStarMapPanel(options: StarMapPanelOptions): StarMapPanel {
  const {
    shell,
    canvas,
    card,
    travelButton,
    dockButton,
    attackButton,
    travelStatus,
    modeToggle,
    labelToggle,
    cargoToggle,
    cargoPanel,
    cargoSelect,
    cargoContent,
  } = createStarMapControls(options);

  let model = options.model;
  const renderer = new TopdownMapRenderer(canvas, model);
  const applyDisplayMode = (mode: StarMapDisplayMode): void => {
    preferredDisplayMode = mode;
    shell.classList.toggle('is-nav-mode', mode === 'nav');
    modeToggle.textContent = mode === 'nav' ? 'ANSICHT // NAV' : 'ANSICHT // PHYSISCH';
    renderer.setDisplayMode(mode);
  };
  modeToggle.addEventListener('click', () =>
    applyDisplayMode(preferredDisplayMode === 'physical' ? 'nav' : 'physical')
  );
  labelToggle.addEventListener('click', () => {
    preferredLabelsVisible = !preferredLabelsVisible;
    labelToggle.textContent = preferredLabelsVisible ? 'NAMEN // AN' : 'NAMEN // AUS';
    labelToggle.classList.toggle('is-off', !preferredLabelsVisible);
    renderer.setLabelsVisible(preferredLabelsVisible);
  });
  applyDisplayMode(preferredDisplayMode);
  labelToggle.textContent = preferredLabelsVisible ? 'NAMEN // AN' : 'NAMEN // AUS';
  labelToggle.classList.toggle('is-off', !preferredLabelsVisible);
  renderer.setLabelsVisible(preferredLabelsVisible);

  const renderCargoScanner = bindCargoMarketScanner(
    () => model,
    cargoToggle,
    cargoPanel,
    cargoSelect,
    cargoContent,
    options.onSelectLocation
  );

  const systemLog = createSystemLogPanel({
    root: shell,
    log: options.log,
    header: 'SYS // NAVIGATION',
    placementClass: 'star-system-log',
  });

  const { updateLocationSelection, updateNpcSelection } = createSelectionUpdater(
    () => model,
    card,
    travelButton,
    dockButton,
    attackButton
  );

  const updateSelection = (): void => {
    updateTravelStatus(model, travelStatus);
    const hasSelection = updateNpcSelection() || updateLocationSelection();
    card.hidden = !hasSelection;
  };

  const observer = new ResizeObserver(() => renderer.resize());
  observer.observe(canvas);

  const unbindInput = bindStarMapInput({
    canvas,
    renderer,
    onSelectLocation: options.onSelectLocation,
    onSelectNpc: options.onSelectNpc,
  });
  travelButton.addEventListener('click', options.onStartTravel);
  dockButton.addEventListener('click', options.onDock);
  attackButton.addEventListener('click', () => {
    const selected = model.npcShips.find((npc) => npc.isSelected);
    if (selected) options.onAttackNpc(selected.id);
  });

  updateSelection();
  return {
    update(nextModel): void {
      model = nextModel;
      renderer.update(model);
      updateSelection();
      renderCargoScanner();
      systemLog.update();
    },
    destroy(): void {
      unbindInput();
      observer.disconnect();
      systemLog.destroy();
      shell.remove();
    },
  };
}
