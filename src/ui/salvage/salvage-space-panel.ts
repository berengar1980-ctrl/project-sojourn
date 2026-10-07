import type { CombatTactic } from '../../systems/combat/strategic-combat-service';
import type { SystemLogService } from '../../core/system-log-types';
import type { SalvageSpaceViewModel } from '../../features/salvage/salvage-space-view-model';
import type { WorldPoint } from '../../core/world-types';
import { createSystemLogPanel, type SystemLogPanel } from '../system-log/system-log-panel';
import { createSalvageEventPanel } from './salvage-event-panel';
import { bindSalvageSpaceInput } from './salvage-space-input';
import { SalvageSpaceRenderer } from './salvage-space-renderer';

export interface SalvageSpacePanel {
  update(model: SalvageSpaceViewModel): void;
  destroy(): void;
}

interface SalvageSpacePanelOptions {
  readonly root: HTMLElement;
  readonly model: SalvageSpaceViewModel;
  readonly log: SystemLogService;
  readonly onSelectWreck: (id: string | null) => void;
  readonly onSelectNpc: (id: string | null) => void;
  readonly onAttackNpc: (id: string) => void;
  readonly onCombatTactic: (tactic: CombatTactic) => void;
  readonly onNavigate: (target: WorldPoint) => void;
  readonly onInspect: (wreckId: string) => void;
  readonly onStrip: (wreckId: string, resourceId: string) => void;
  readonly onRecoverComponent: (wreckId: string) => void;
  readonly onEventChoice: (choiceId: string) => SalvageSpaceViewModel['lastEventResolution'];
  readonly onCancel: () => void;
  readonly onReturnToStarMap: () => void;
}

interface SalvageControls {
  readonly canvas: HTMLCanvasElement;
  readonly card: HTMLElement;
  readonly name: HTMLElement;
  readonly meta: HTMLElement;
  readonly integrity: HTMLElement;
  readonly inspectButton: HTMLButtonElement;
  readonly attackButton: HTMLButtonElement;
  readonly resources: HTMLElement;
  readonly status: HTMLElement;
  readonly cancelButton: HTMLButtonElement;
  readonly help: HTMLElement;
  readonly cargoTotal: HTMLElement;
  readonly cargoList: HTMLElement;
  readonly backButton: HTMLButtonElement;
  readonly eventContainer: HTMLElement;
  readonly combatTactics: HTMLElement;
}

function createShell(options: SalvageSpacePanelOptions): HTMLElement {
  const shell = document.createElement('section');
  shell.className = 'local-space-shell salvage-space-shell';
  shell.innerHTML = [
    '<canvas class="local-space-canvas salvage-space-canvas" aria-label="Lokales Wrackfeld"></canvas>',
    '<div class="local-space-title"><span>BERGUNGSZONE</span><strong>',
    options.model.title,
    '</strong></div>',
    '<button class="return-map-button" type="button">ZUR STERNKARTE</button>',
    '<div class="salvage-operation-status" hidden></div>',
    '<div class="salvage-help"></div>',
    '<div class="salvage-combat-tactics combat-tactics" hidden>',
    '<button type="button" data-tactic="fight">KAMPF</button>',
    '<button type="button" data-tactic="kite">DISTANZ</button>',
    '<button type="button" data-tactic="minefield">MINEN</button>',
    '<button type="button" data-tactic="flee">FLUCHT</button></div>',
    '<button class="salvage-cancel-button" type="button" hidden>VORGANG ABBRECHEN</button>',
    '<aside class="salvage-event" hidden></aside>',
    '<div class="local-cargo-panel">',
    '<div class="local-cargo-title">FRACHT // BERGUNG</div>',
    '<div class="local-cargo-total">BELEGT · <strong>0 / 0</strong></div>',
    '<div class="local-cargo-list"></div></div>',
    '<div class="local-selection-card salvage-selection-card" hidden>',
    '<div class="local-selection-kind">WRACK</div>',
    '<div class="local-selection-name"></div>',
    '<div class="local-selection-meta"></div>',
    '<div class="salvage-integrity"><div></div></div>',
    '<div class="salvage-resource-list"></div>',
    '<button class="salvage-inspect-button" type="button">UNTERSUCHEN</button>',
    '<button class="salvage-attack-button" type="button" hidden>ANGREIFEN</button>',
    '</div>',
  ].join('');
  options.root.replaceChildren(shell);
  return shell;
}

function controls(shell: HTMLElement): SalvageControls {
  const query = <T extends Element>(selector: string): T => {
    const element = shell.querySelector<T>(selector);
    if (!element) throw new Error('Salvage-space UI is incomplete: ' + selector);
    return element;
  };
  return {
    canvas: query<HTMLCanvasElement>('.salvage-space-canvas'),
    card: query<HTMLElement>('.salvage-selection-card'),
    name: query<HTMLElement>('.local-selection-name'),
    meta: query<HTMLElement>('.local-selection-meta'),
    integrity: query<HTMLElement>('.salvage-integrity > div'),
    inspectButton: query<HTMLButtonElement>('.salvage-inspect-button'),
    attackButton: query<HTMLButtonElement>('.salvage-attack-button'),
    resources: query<HTMLElement>('.salvage-resource-list'),
    status: query<HTMLElement>('.salvage-operation-status'),
    cancelButton: query<HTMLButtonElement>('.salvage-cancel-button'),
    help: query<HTMLElement>('.salvage-help'),
    cargoTotal: query<HTMLElement>('.local-cargo-total strong'),
    cargoList: query<HTMLElement>('.local-cargo-list'),
    backButton: query<HTMLButtonElement>('.return-map-button'),
    eventContainer: query<HTMLElement>('.salvage-event'),
    combatTactics: query<HTMLElement>('.salvage-combat-tactics'),
  };
}

function statusText(model: SalvageSpaceViewModel): string {
  if (model.phase === 'navigating') return 'NAVIGATION IM WRACKFELD';
  if (model.phase === 'approaching') return 'ANFLUG AUF BERGUNGSPOSITION';
  if (model.phase === 'inspecting') {
    return 'WRACKANALYSE · ' + Math.round((model.operationProgress ?? 0) * 100) + ' %';
  }
  if (model.phase === 'stripping') {
    return 'BERGUNG AKTIV · ' + Math.round((model.operationProgress ?? 0) * 100) + ' %';
  }
  if (model.phase === 'extracting-component') {
    return 'KOMPONENTENEXTRAKTION · ' + Math.round((model.operationProgress ?? 0) * 100) + ' %';
  }
  if (model.salvageEventRecoverySeconds > 0) {
    return 'BERGUNGSTEAM SICHERT SEKTION · ' + model.salvageEventRecoverySeconds.toFixed(1) + ' s';
  }
  return '';
}

function renderCargo(model: SalvageSpaceViewModel, total: HTMLElement, list: HTMLElement): void {
  total.textContent =
    Math.round(model.cargoUsedTons) + ' / ' + Math.round(model.cargoCapacityTons) + ' t';
  list.replaceChildren();
  if (model.cargoResources.length === 0 && model.looseComponents.length === 0) {
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
    amount.textContent = Math.round(resource.amount) + ' t';
    row.append(name, amount);
    list.append(row);
  }
  for (const component of model.looseComponents) {
    const row = document.createElement('div');
    row.className = 'local-cargo-row local-cargo-row--component';
    const name = document.createElement('span');
    const amount = document.createElement('strong');
    name.textContent = component.name.toUpperCase();
    amount.textContent = component.cargoTons + ' t · MK ' + component.tier;
    row.append(name, amount);
    list.append(row);
  }
}

function resourceRow(
  model: SalvageSpaceViewModel,
  wreckId: string,
  resource: SalvageSpaceViewModel['selectedWreck'] extends infer _T
    ? { readonly resourceId: string; readonly name: string; readonly remaining: number }
    : never,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'salvage-resource-row';
  const label = document.createElement('span');
  label.textContent = resource.name.toUpperCase();
  const amount = document.createElement('strong');
  amount.textContent = Math.round(resource.remaining) + ' t';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent =
    !model.salvageAvailable
      ? 'BERGUNGSMODUL FEHLT'
      : model.phase === 'stripping' && model.activeResourceId === resource.resourceId
        ? 'BERGUNG LÄUFT'
        : 'ANFLIEGEN & BERGEN';
  button.disabled =
    !model.salvageAvailable ||
    model.phase !== 'idle' ||
    model.salvageEvent !== null ||
    model.salvageEventRecoverySeconds > 0 ||
    resource.remaining <= 0;
  button.dataset.salvageAction = 'strip';
  button.dataset.wreckId = wreckId;
  button.dataset.resourceId = resource.resourceId;
  row.append(label, amount, button);
  return row;
}

function componentRow(
  model: SalvageSpaceViewModel,
  wreckId: string,
  options: SalvageSpacePanelOptions
): HTMLElement | null {
  const component = model.selectedWreck?.component;
  if (!component) return null;
  const row = document.createElement('div');
  row.className = 'salvage-component-row';
  const copy = document.createElement('div');
  const label = document.createElement('span');
  const detail = document.createElement('strong');
  label.textContent = 'SCHIFFSKOMPONENTE';
  detail.textContent =
    component.name.toUpperCase() + ' · MK ' + component.tier + ' · ' + component.cargoTons + ' t';
  copy.append(label, detail);

  const button = document.createElement('button');
  button.type = 'button';
  if (component.status === 'recovered') button.textContent = 'GEBORGEN';
  else if (component.status === 'destroyed') button.textContent = 'ZERSTÖRT';
  else button.textContent = 'KOMPONENTE BERGEN · ' + component.chancePercent + ' %';
  button.disabled =
    component.status !== 'available' ||
    !model.salvageAvailable ||
    model.phase !== 'idle' ||
    model.salvageEvent !== null ||
    model.salvageEventRecoverySeconds > 0;
  button.dataset.salvageAction = 'component';
  button.dataset.wreckId = wreckId;
  row.append(copy, button);
  return row;
}

function renderSelection(
  model: SalvageSpaceViewModel,
  ui: SalvageControls,
  options: SalvageSpacePanelOptions
): void {
  const npc = model.npcShips.find((entry) => entry.isSelected);
  const wreck = model.selectedWreck;
  ui.card.hidden = !wreck && !npc;
  if (npc) {
    ui.name.textContent = npc.name;
    ui.meta.textContent = model.combat
      ? 'GEFECHT · SCHILD ' +
        Math.round(model.combat.defender.shieldHp) +
        ' · HÜLLE ' +
        Math.round(model.combat.defender.hullHp)
      : 'SCHIFF · ' + npc.phase.toUpperCase();
    ui.integrity.style.width = '100%';
    ui.resources.replaceChildren();
    ui.inspectButton.hidden = true;
    ui.attackButton.hidden = model.combat !== null;
    return;
  }
  ui.attackButton.hidden = true;
  if (!wreck) return;

  ui.name.textContent = wreck.name;
  ui.integrity.style.width = Math.max(0, Math.min(100, wreck.integrity)) + '%';
  const busy =
    model.phase !== 'idle' || model.salvageEvent !== null || model.salvageEventRecoverySeconds > 0;
  if (!wreck.inspected) {
    ui.meta.textContent = wreck.kindLabel + ' · ANALYSE ERFORDERLICH';
    ui.inspectButton.textContent =
      model.phase === 'approaching' || model.phase === 'inspecting'
        ? 'SCAN LÄUFT'
        : 'ANFLIEGEN & SCANNEN';
    ui.resources.replaceChildren();
    ui.inspectButton.hidden = false;
    ui.inspectButton.disabled = busy;
    return;
  }

  ui.meta.textContent =
    wreck.kindLabel +
    ' · QUALITÄT ' +
    wreck.qualityLabel +
    ' · INTEGRITÄT ' +
    wreck.integrity +
    '%' +
    (wreck.componentSignal ? ' · KOMPONENTENSIGNATUR' : '');
  ui.inspectButton.hidden = true;
  ui.resources.replaceChildren();
  const component = componentRow(model, wreck.id, options);
  if (component) ui.resources.append(component);

  if (wreck.depleted) {
    const empty = document.createElement('div');
    empty.className = 'salvage-resource-empty';
    empty.textContent = 'WRACK AUSGESCHLACHTET';
    ui.resources.append(empty);
    return;
  }
  for (const resource of wreck.resources) {
    ui.resources.append(resourceRow(model, wreck.id, resource));
  }
}

function createRecoveryTracker(
  options: SalvageSpacePanelOptions,
  panel: SystemLogPanel
): (model: SalvageSpaceViewModel) => void {
  let lastSerial = options.model.recoverySerial;
  let lastComponentSerial = options.model.componentRecoverySerial;
  const inspected = new Set(
    options.model.wrecks.filter((wreck) => wreck.inspected).map((wreck) => wreck.id)
  );

  return (model) => {
    let changed = false;
    for (const wreck of model.wrecks) {
      if (!wreck.inspected || inspected.has(wreck.id)) continue;
      inspected.add(wreck.id);
      options.log.write('BERGUNG > WRACKANALYSE ABGESCHLOSSEN: ' + wreck.name.toUpperCase());
      changed = true;
    }

    if (model.recoverySerial !== lastSerial && model.lastRecovery) {
      lastSerial = model.recoverySerial;
      const resource = model.cargoResources.find(
        (entry) => entry.resourceId === model.lastRecovery?.resourceId
      );
      options.log.write(
        'BERGUNG > +' +
          model.lastRecovery.recovered +
          ' t ' +
          (resource?.name ?? model.lastRecovery.resourceId).toUpperCase()
      );
      if (model.lastRecovery.depleted) options.log.write('BERGUNG > WRACK AUSGESCHLACHTET');
      changed = true;
    }

    if (model.componentRecoverySerial !== lastComponentSerial && model.lastComponentRecovery) {
      lastComponentSerial = model.componentRecoverySerial;
      const result = model.lastComponentRecovery;
      const wreck = model.wrecks.find((entry) => entry.id === result.wreckId);
      const component = wreck?.component;
      if (result.outcome === 'recovered') {
        options.log.write(
          'BERGUNG > KOMPONENTE GEBORGEN: ' + (component?.name ?? result.componentId).toUpperCase()
        );
      } else if (result.outcome === 'destroyed') {
        options.log.write(
          'BERGUNG > KOMPONENTE ZERSTÖRT: ' + (component?.name ?? result.componentId).toUpperCase()
        );
      } else {
        options.log.write('BERGUNG > NICHT GENÜGEND FRACHTRAUM FÜR KOMPONENTE');
      }
      changed = true;
    }

    if (changed) panel.update();
  };
}

export function createSalvageSpacePanel(options: SalvageSpacePanelOptions): SalvageSpacePanel {
  const shell = createShell(options);
  const ui = controls(shell);
  let model = options.model;
  const renderer = new SalvageSpaceRenderer(ui.canvas, model);
  const systemLog = createSystemLogPanel({
    root: shell,
    log: options.log,
    header: 'BERGUNGSKONTROLLE // SYSTEMLOG',
    placementClass: 'system-log--local',
  });
  const trackRecovery = createRecoveryTracker(options, systemLog);
  const eventPanel = createSalvageEventPanel({
    container: ui.eventContainer,
    log: options.log,
    logPanel: systemLog,
    onChoice: options.onEventChoice,
  });
  const resizeObserver = new ResizeObserver(() => renderer.resize());
  resizeObserver.observe(ui.canvas);

  const update = (next: SalvageSpaceViewModel): void => {
    model = next;
    renderer.update(model);
    const status = statusText(model);
    ui.status.hidden = status.length === 0;
    ui.status.textContent = status;
    ui.help.classList.toggle('is-warning', !model.salvageAvailable);
    ui.help.innerHTML = model.salvageAvailable
      ? '<strong>BERGUNG:</strong> 1 · Wrack anklicken & scannen &nbsp; 2 · Material oder Komponente wählen &nbsp; 3 · Schiff fliegt automatisch auf Arbeitsdistanz und birgt in Zyklen.'
      : '<strong>KEIN BERGUNGSSYSTEM:</strong> Scannen ist möglich, Bergen nicht. Wechsle auf ein Bergungsschiff oder montiere später ein Bergungssystem Mk I.';
    ui.cancelButton.hidden = model.phase === 'idle';
    ui.backButton.disabled =
      model.phase !== 'idle' ||
      model.salvageEvent !== null ||
      model.salvageEventRecoverySeconds > 0;
    ui.canvas.classList.toggle('is-locked', model.salvageEvent !== null);
    eventPanel.update(model.salvageEvent);
    renderCargo(model, ui.cargoTotal, ui.cargoList);
    ui.combatTactics.hidden = model.combat === null;
    for (const button of ui.combatTactics.querySelectorAll<HTMLButtonElement>('[data-tactic]')) {
      button.classList.toggle('is-active', button.dataset.tactic === model.combat?.attacker.tactic);
    }
    renderSelection(model, ui, options);
    trackRecovery(model);
  };

  const unbindInput = bindSalvageSpaceInput({
    canvas: ui.canvas,
    renderer,
    onSelectWreck: options.onSelectWreck,
    onSelectNpc: options.onSelectNpc,
    onNavigate: (x, y) => options.onNavigate({ x, y }),
  });
  ui.resources.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest<HTMLButtonElement>('button[data-salvage-action]');
    if (!button || button.disabled) return;
    const wreckId = button.dataset.wreckId;
    if (!wreckId) return;

    event.preventDefault();
    event.stopPropagation();

    if (button.dataset.salvageAction === 'strip') {
      const resourceId = button.dataset.resourceId;
      if (resourceId) options.onStrip(wreckId, resourceId);
      return;
    }
    if (button.dataset.salvageAction === 'component') {
      options.onRecoverComponent(wreckId);
    }
  });

  ui.inspectButton.addEventListener('click', () => {
    if (model.selectedWreck) options.onInspect(model.selectedWreck.id);
  });
  ui.attackButton.addEventListener('click', () => {
    const selected = model.npcShips.find((entry) => entry.isSelected);
    if (selected) options.onAttackNpc(selected.id);
  });
  ui.combatTactics.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const tactic = target.dataset.tactic as CombatTactic | undefined;
    if (tactic) options.onCombatTactic(tactic);
  });
  ui.cancelButton.addEventListener('click', options.onCancel);
  ui.backButton.addEventListener('click', options.onReturnToStarMap);
  update(model);

  return {
    update,
    destroy() {
      unbindInput();
      resizeObserver.disconnect();
      systemLog.destroy();
      shell.remove();
    },
  };
}
