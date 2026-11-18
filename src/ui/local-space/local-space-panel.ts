import type { CombatTactic } from '../../systems/combat/strategic-combat-service';

import type { LocalSpaceViewModel } from '../../features/local-space/local-space-view-model';

import { bindScanDataToggle } from '../local-operations/local-operations-hud';

import { bindLocalSpaceInput } from './local-space-input';

import { LocalSpaceRenderer } from './local-space-renderer';
import { createEmbeddedCombatHud } from '../combat/embedded-combat-hud';

import type { SystemLogService } from '../../core/system-log-types';

import { createMiningEventPanel } from './mining-event-panel';

import { MiningResourceSelector } from './mining-resource-selector';

import { createSystemLogPanel, type SystemLogPanel } from '../system-log/system-log-panel';

import {
  type LocalSpacePanelOptions,
  createLocalSpaceShell,
  localSpaceControls,
  createIntegrityTracker,
  createScanCompletionTracker,
} from './local-space-panel-controls';

import { updateLocalOverlay } from './local-space-panel-view';

export interface LocalSpacePanel {
  update(model: LocalSpaceViewModel): void;
  destroy(): void;
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
    onSelectNpc: options.onSelectNpc,
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

function observeCanvas(canvas: HTMLCanvasElement, renderer: LocalSpaceRenderer): ResizeObserver {
  const observer = new ResizeObserver(() => renderer.resize());
  observer.observe(canvas);
  return observer;
}

function bindShortScanPlanning(
  button: HTMLButtonElement,
  options: LocalSpacePanelOptions,
  systemLog: SystemLogPanel,
  updateOverlay: () => void
): void {
  bindRoutePlanning(
    button,
    options.log,
    systemLog,
    async () => {
      options.log.write('SCAN > NAHBEREICHSANALYSE');
      await options.onShortRangeScan();
    },
    updateOverlay
  );
}

function bindLongScanButton(
  button: HTMLButtonElement,
  getModel: () => LocalSpaceViewModel,
  options: LocalSpacePanelOptions,
  systemLog: SystemLogPanel,
  updateOverlay: () => void
): void {
  button.addEventListener('click', () => {
    if (!getModel().scanAvailable || getModel().longRangeScanProgress != null) return;
    options.log.write('SCAN > LANGREICHWEITENSCAN GESTARTET');
    options.onLongRangeScan();
    systemLog.update();
    updateOverlay();
  });
}

function combatAwareLocalOptions(
  options: LocalSpacePanelOptions,
  isCombat: () => boolean
): LocalSpacePanelOptions {
  return {
    ...options,
    onSelectAsteroid: (id) => {
      if (!isCombat()) options.onSelectAsteroid(id);
    },
    onSelectNpc: (id) => {
      if (!isCombat()) options.onSelectNpc(id);
    },
    onNavigate: (target) => (isCombat() ? Promise.resolve(false) : options.onNavigate(target)),
  };
}

export function createLocalSpacePanel(options: LocalSpacePanelOptions): LocalSpacePanel {
  const shell = createLocalSpaceShell(options);
  const combatHud = createEmbeddedCombatHud(shell);
  const controls = localSpaceControls(shell);
  const {
    canvas,
    resourceSelector,
    mineButton,
    claimButton,
    shortScanButton,
    attackButton,
    longScanButton,
    cancelButton,
    backButton,
    scanLabelsButton,
    eventContainer,
    combatTactics,
  } = controls;

  let model = options.model;
  const renderer = new LocalSpaceRenderer(canvas, model);
  const systemLog = createSystemLogPanel({
    root: shell,
    log: options.log,
    header: 'SYS // LOCAL OPS',
    placementClass: 'local-system-log',
  });
  const trackIntegrity = createIntegrityTracker(options.log, systemLog, model);
  const trackScanCompletion = createScanCompletionTracker(options.log, systemLog, model);
  const miningEventPanel = createMiningEventPanel({
    container: eventContainer,
    log: options.log,
    logPanel: systemLog,
    onChoice: options.onMiningEventChoice,
  });
  const miningResourceSelector = new MiningResourceSelector(
    resourceSelector,
    options.onMiningResourceSelection
  );

  const updateOverlay = (): void => {
    combatHud.update(model.combat);
    updateLocalOverlay({
      model,
      controls,
      trackIntegrity,
      trackScanCompletion,
      miningEventPanel,
      miningResourceSelector,
    });
  };

  const observer = observeCanvas(canvas, renderer);
  const unbindInput = bindNavigationInput(
    canvas,
    renderer,
    combatAwareLocalOptions(options, () => model.combat !== null),
    systemLog,
    updateOverlay
  );

  bindRoutePlanning(mineButton, options.log, systemLog, options.onStartMining, updateOverlay);
  claimButton.addEventListener('click', options.onToggleAsteroidClaim);
  bindShortScanPlanning(shortScanButton, options, systemLog, updateOverlay);
  bindLongScanButton(longScanButton, () => model, options, systemLog, updateOverlay);
  bindScanDataToggle(scanLabelsButton, (visible) => renderer.setScanLabelsVisible(visible));
  attackButton.addEventListener('click', () => {
    const selected = model.npcShips.find((npc) => npc.isSelected);
    if (selected) options.onAttackNpc(selected.id);
  });
  combatTactics.addEventListener('click', (event) => {
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
  cancelButton.addEventListener('click', options.onCancelMining);
  backButton.addEventListener('click', options.onReturnToStarMap);
  updateOverlay();

  let lastOverlayUpdate = -Infinity;
  return {
    update(nextModel): void {
      model = nextModel;
      renderer.update(model);
      if (model.combat) combatHud.update(model.combat);
      const now = performance.now();
      if (now - lastOverlayUpdate >= 100) {
        lastOverlayUpdate = now;
        updateOverlay();
      }
    },
    destroy(): void {
      unbindInput();
      observer.disconnect();
      systemLog.destroy();
      shell.remove();
    },
  };
}
