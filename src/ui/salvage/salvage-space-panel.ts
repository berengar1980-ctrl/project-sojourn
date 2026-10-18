import { updateCombatGrappleButton } from '../combat/combat-grapple-controls';
import type { CombatTactic } from '../../systems/combat/strategic-combat-service';
import { playerAtLocalExit } from '../map/local-space-exit-gate';
import { distressTowWithinRange, DISTRESS_TOW_ATTACH_RANGE } from '../../systems/salvage/distress-tow-physics';

import type { SalvageSpaceViewModel } from '../../features/salvage/salvage-space-view-model';

import { createSystemLogPanel, type SystemLogPanel } from '../system-log/system-log-panel';

import { createSalvageEventPanel } from './salvage-event-panel';

import { bindSalvageSpaceInput } from './salvage-space-input';

import { SalvageSpaceRenderer } from './salvage-space-renderer';

import {
  type SalvageControls,
  type SalvageSpacePanelOptions,
  createShell,
  controls,
} from './salvage-space-panel-controls';

export interface SalvageSpacePanel {
  update(model: SalvageSpaceViewModel): void;
  destroy(): void;
}

function renderSectorEvent(model: SalvageSpaceViewModel, container: HTMLElement): void {
  const event = model.sectorEvent;
  container.hidden = !event;
  if (!event) {
    container.replaceChildren();
    return;
  }
  if (event.type === 'special-wreck') {
    container.innerHTML =
      '<strong>SELTENES BERGUNGSSIGNAL</strong><span>Dieses Wrack kann eine modifizierte Schiffskomponente enthalten.</span>';
    return;
  }
  const damage = event.distressDamage?.replaceAll('_', ' ').toUpperCase() ?? 'UNBEKANNT';
  const stage = event.distressStage ?? 'approach';
  const wreck = model.wrecks[0];
  const towInRange = !!wreck && distressTowWithinRange(model.ship.position, wreck.position);
  const towButton = towInRange
    ? '<button type="button" data-distress-action="tow">ABSCHLEPPEN</button>'
    : '<button type="button" data-distress-action="tow" disabled title="Zuerst den Havaristen anfliegen">GREIFHAKEN AUSSER REICHWEITE</button>';
  const towHint = towInRange
    ? ''
    : '<span>ANFLUG ERFORDERLICH · GREIFHAKENREICHWEITE ' + DISTRESS_TOW_ATTACH_RANGE + ' m</span>';
  const actions =
    stage === 'approach'
      ? '<button type="button" data-distress-action="diagnose">TECHNISCHE DIAGNOSE</button>'
      : stage === 'diagnosed'
        ? '<button type="button" data-distress-action="repair">NOTREPARATUR</button>' + towButton + '<button type="button" data-distress-action="evacuate">EVAKUIEREN</button>' + towHint
        : stage === 'tow_required'
          ? towButton + '<button type="button" data-distress-action="evacuate">EVAKUIEREN</button>' + towHint
          : stage === 'towing'
            ? '<span class="port-positive">SCHLEPPEN VORBEREITET · ZUM MARKIERTEN KARTENAUSGANG FLIEGEN</span>'
            : stage === 'salvage_rights'
              ? '<span class="port-positive">BERGUNGSRECHTE ERTEILT · WRACK KANN AUSGESCHLACHTET WERDEN</span>'
              : '<span>EINSATZ ABGESCHLOSSEN</span>';
  container.innerHTML =
    '<strong>HILFERUF // HAVARIST</strong><span>SCHADEN: ' +
    damage +
    '</span><div class="sector-salvage-actions">' +
    actions +
    '</div>';
}

function statusText(model: SalvageSpaceViewModel): string {
  if (model.longRangeScanProgress !== null) {
    return 'LANGREICHWEITENSCAN · ' + Math.round(model.longRangeScanProgress * 100) + ' %';
  }
  if (model.phase === 'navigating') return 'NAVIGATION IM BERGUNGSFELD';
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
    : never
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'salvage-resource-row';
  const label = document.createElement('span');
  label.textContent = resource.name.toUpperCase();
  const amount = document.createElement('strong');
  amount.textContent = Math.round(resource.remaining) + ' t';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = !model.salvageAvailable
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

function componentRow(model: SalvageSpaceViewModel, wreckId: string): HTMLElement | null {
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

function renderSelection(model: SalvageSpaceViewModel, ui: SalvageControls): void {
  const npc = model.npcShips.find((entry) => entry.isSelected);
  const wreck = model.selectedWreck;
  ui.card.hidden = !wreck && !npc;
  if (npc) {
    const kind = ui.card.querySelector<HTMLElement>('.local-selection-kind');
    if (kind) kind.textContent = 'SCHIFF';
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

  const kind = ui.card.querySelector<HTMLElement>('.local-selection-kind');
  if (kind)
    kind.textContent = wreck.inspected
      ? wreck.containerVariant
        ? 'CONTAINER'
        : 'WRACK'
      : 'KONTAKT';
  ui.name.textContent = wreck.inspected ? wreck.name : 'UNBEKANNTER BERGUNGSKONTAKT';
  ui.integrity.style.width = Math.max(0, Math.min(100, wreck.integrity)) + '%';
  const busy =
    model.phase !== 'idle' || model.salvageEvent !== null || model.salvageEventRecoverySeconds > 0;
  if (!wreck.inspected) {
    ui.meta.textContent =
      (wreck.scanLevel === 'surveyed' ? 'KONTAKT ERFASST · ???' : 'OBJEKT NICHT GESCANNT') +
      ' · ANALYSE ERFORDERLICH';
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
  const component = componentRow(model, wreck.id);
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
      options.log.write('BERGUNG > ANALYSE ABGESCHLOSSEN: ' + wreck.name.toUpperCase());
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

function bindSalvagePanelActions(
  ui: SalvageControls,
  renderer: SalvageSpaceRenderer,
  options: SalvageSpacePanelOptions,
  getModel: () => SalvageSpaceViewModel
): () => void {
  let diagnosisTimer: ReturnType<typeof setTimeout> | null = null;
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
    if (button.dataset.salvageAction === 'component') options.onRecoverComponent(wreckId);
  });
  ui.sectorEventContainer.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button[data-distress-action]');
    if (!button || button.disabled || !ui.sectorEventContainer.contains(button)) return;
    const model = getModel();
    if (!model.sectorEvent) return;
    event.preventDefault();
    event.stopPropagation();
    const id = model.sectorEvent.id;
    switch (button.dataset.distressAction) {
      case 'diagnose':
        if (diagnosisTimer) break;
        button.disabled = true;
        button.textContent = 'TECHNISCHE DIAGNOSE LÄUFT…';
        renderer.startDistressDiagnosis();
        diagnosisTimer = setTimeout(() => {
          diagnosisTimer = null;
          options.onDiagnoseDistress?.(id);
        }, 3000);
        break;
      case 'repair':
        options.onRepairDistress?.(id);
        break;
      case 'tow':
        options.onTowDistress?.(id);
        break;
      case 'evacuate':
        options.onEvacuateDistress?.(id);
        break;
    }
  });
  ui.longScanButton.addEventListener('click', options.onLongRangeScan);
  ui.inspectButton.addEventListener('click', () => {
    const wreck = getModel().selectedWreck;
    if (wreck) options.onInspect(wreck.id);
  });
  ui.attackButton.addEventListener('click', () => {
    const selected = getModel().npcShips.find((entry) => entry.isSelected);
    if (selected) options.onAttackNpc(selected.id);
  });
  ui.combatTactics.addEventListener('click', (event) => {
    const grapple = (event.target as HTMLElement).closest('[data-grapple]');
    if (grapple) {
      options.onCombatGrapple();
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const tactic = target.dataset.tactic as CombatTactic | undefined;
    if (tactic) options.onCombatTactic(tactic);
  });
  ui.cancelButton.addEventListener('click', options.onCancel);
  ui.backButton.addEventListener('click', options.onReturnToStarMap);
  return () => {
    if (diagnosisTimer) clearTimeout(diagnosisTimer);
    unbindInput();
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

  let lastHudUpdate = -Infinity;
  const update = (next: SalvageSpaceViewModel): void => {
    model = next;
    renderer.update(model);
    const now = performance.now();
    if (now - lastHudUpdate < 100) return;
    lastHudUpdate = now;
    const status = statusText(model);
    ui.status.hidden = status.length === 0;
    ui.status.textContent = status;
    ui.help.classList.toggle('is-warning', !model.salvageAvailable);
    ui.help.innerHTML = model.salvageAvailable
      ? '<strong>BERGUNG:</strong> 1 · Wrack anklicken & scannen &nbsp; 2 · Material oder Komponente wählen &nbsp; 3 · Schiff fliegt automatisch auf Arbeitsdistanz und birgt in Zyklen.'
      : '<strong>KEIN BERGUNGSSYSTEM:</strong> Scannen ist möglich, Bergen nicht. Wechsle auf ein Bergungsschiff oder montiere später ein Bergungssystem Mk I.';
    ui.longScanButton.disabled = !model.scanAvailable || model.longRangeScanProgress !== null;
    ui.longScanButton.textContent =
      model.longRangeScanProgress !== null
        ? 'SCAN LÄUFT · ' + Math.round(model.longRangeScanProgress * 100) + ' %'
        : model.scanAvailable
          ? 'LANGREICHWEITENSCAN'
          : 'SCAN NICHT VERFÜGBAR';
    ui.cancelButton.hidden = model.phase === 'idle';
    const atExit = playerAtLocalExit(
      model.ship.position,
      model.width,
      model.height,
      model.backgroundSeed
    );
    ui.backButton.disabled =
      !atExit ||
      model.phase !== 'idle' ||
      model.salvageEvent !== null ||
      model.salvageEventRecoverySeconds > 0;
    ui.backButton.title = atExit
      ? 'Zur Sternkarte wechseln'
      : 'Zuerst den markierten Ausgang anfliegen';
    ui.canvas.classList.toggle('is-locked', model.salvageEvent !== null);
    eventPanel.update(model.salvageEvent);
    if (
      !ui.sectorEventContainer.querySelector('button[data-distress-action="diagnose"]:disabled')
    ) {
      renderSectorEvent(model, ui.sectorEventContainer);
    }
    renderCargo(model, ui.cargoTotal, ui.cargoList);
    ui.combatTactics.hidden = model.combat === null;
    for (const button of ui.combatTactics.querySelectorAll<HTMLButtonElement>('[data-tactic]')) {
      button.classList.toggle('is-active', button.dataset.tactic === model.combat?.attacker.tactic);
    }
    updateCombatGrappleButton(ui.combatTactics, model.combat);
    renderSelection(model, ui);
    trackRecovery(model);
  };

  const unbindInput = bindSalvagePanelActions(ui, renderer, options, () => model);
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
