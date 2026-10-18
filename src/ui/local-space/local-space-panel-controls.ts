import { localOperationsHeader } from '../local-operations/local-operations-hud';

import type { CombatTactic } from '../../systems/combat/strategic-combat-service';

import type { WorldPoint } from '../../core/world-types';

import type { LocalSpaceViewModel } from '../../features/local-space/local-space-view-model';

import type { SystemLogService } from '../../core/system-log-types';

import { type SystemLogPanel } from '../system-log/system-log-panel';

export interface LocalSpacePanelOptions {
  readonly root: HTMLElement;
  readonly model: LocalSpaceViewModel;
  readonly onSelectAsteroid: (id: string | null) => void;
  readonly onSelectNpc: (id: string | null) => void;
  readonly onAttackNpc: (id: string) => void;
  readonly onCombatTactic: (tactic: CombatTactic) => void;
  readonly onCombatGrapple: () => void;
  readonly onNavigate: (target: WorldPoint) => Promise<'safe' | 'risk' | false>;
  readonly log: SystemLogService;
  readonly onStartMining: () => Promise<void>;
  readonly onMiningResourceSelection: (resourceIds: readonly string[] | null) => void;
  readonly onLongRangeScan: () => void;
  readonly onShortRangeScan: () => Promise<void>;
  readonly onMiningEventChoice: (choiceId: string) => {
    readonly title: string;
    readonly resultText: string;
    readonly aborted: boolean;
  } | null;
  readonly onCancelMining: () => void;
  readonly onReturnToStarMap: () => void;
}

function shieldPercent(model: LocalSpaceViewModel): number {
  return Math.max(0, Math.round((model.shield.currentHp / model.shield.maxHp) * 100));
}

function hullPercent(model: LocalSpaceViewModel): number {
  return Math.max(0, Math.round((model.hull.currentHp / model.hull.maxHp) * 100));
}

interface LocalSpaceControls {
  readonly canvas: HTMLCanvasElement;
  readonly card: HTMLElement;
  readonly name: HTMLElement;
  readonly meta: HTMLElement;
  readonly oreBar: HTMLElement;
  readonly resourceSelector: HTMLElement;
  readonly mineButton: HTMLButtonElement;
  readonly shortScanButton: HTMLButtonElement;
  readonly attackButton: HTMLButtonElement;
  readonly longScanButton: HTMLButtonElement;
  readonly cancelButton: HTMLButtonElement;
  readonly backButton: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly scanLabelsButton: HTMLButtonElement;
  readonly cargoTotal: HTMLElement;
  readonly cargoList: HTMLElement;
  readonly eventContainer: HTMLElement;
  readonly combatTactics: HTMLElement;
}

export function createLocalSpaceShell(options: LocalSpacePanelOptions): HTMLElement {
  const shell = document.createElement('section');
  shell.className = 'local-space-shell';
  shell.innerHTML = [
    '<canvas class="local-space-canvas" aria-label="Lokales Abbaugebiet"></canvas>',
    localOperationsHeader('MINING // LOKALER EINSATZ', options.model.title),
    '<div class="local-combat-tactics combat-tactics" hidden>',
    '<button type="button" data-tactic="fight">KAMPF</button>',
    '<button type="button" data-tactic="kite">DISTANZ</button>',
    '<button type="button" data-tactic="minefield">MINEN</button>',
    '<button type="button" data-tactic="flee">FLUCHT</button>',
    '<button type="button" data-grapple>GREIFHAKEN</button></div>',
    '<aside class="local-mining-event" hidden></aside>',
    '<div class="local-cargo-panel">',
    '<div class="local-cargo-title">FRACHT // CONTAINER</div>',
    '<div class="local-cargo-total">GESAMT · <strong>0</strong></div>',
    '<div class="local-cargo-list"></div></div>',
    '<div class="local-selection-card" hidden>',
    '<div class="local-selection-kind">ASTEROID</div>',
    '<div class="local-selection-name"></div><div class="local-selection-meta"></div>',
    '<div class="local-ore-bar"><div></div></div>',
    '<div class="mining-resource-selector" hidden></div>',
    '<button class="short-scan-button" type="button">NAHBEREICHSSCAN</button>',
    '<button class="mine-button" type="button">MINING</button>',
    '<button class="local-attack-button" type="button" hidden>ANGREIFEN</button></div>',
  ].join('');
  options.root.replaceChildren(shell);
  return shell;
}

export function localSpaceControls(shell: HTMLElement): LocalSpaceControls {
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
    resourceSelector: query<HTMLElement>('.mining-resource-selector'),
    mineButton: query<HTMLButtonElement>('.mine-button'),
    shortScanButton: query<HTMLButtonElement>('.short-scan-button'),
    attackButton: query<HTMLButtonElement>('.local-attack-button'),
    longScanButton: query<HTMLButtonElement>('.long-scan-button'),
    cancelButton: query<HTMLButtonElement>('.operations-cancel-button'),
    backButton: query<HTMLButtonElement>('.return-map-button'),
    status: query<HTMLElement>('.local-operations-status'),
    scanLabelsButton: query<HTMLButtonElement>('.scan-label-toggle'),
    cargoTotal: query<HTMLElement>('.local-cargo-total strong'),
    cargoList: query<HTMLElement>('.local-cargo-list'),
    eventContainer: query<HTMLElement>('.local-mining-event'),
    combatTactics: query<HTMLElement>('.local-combat-tactics'),
  };
}

function initializeSystemLog(
  log: SystemLogService,
  panel: SystemLogPanel,
  shieldValue: number,
  hullValue: number
): void {
  log.write('SCHILD-INTEGRITÄT ' + shieldValue + ' %');
  log.write('HÜLLEN-INTEGRITÄT ' + hullValue + ' %');
  panel.update();
}

export function createIntegrityTracker(
  log: SystemLogService,
  panel: SystemLogPanel,
  initialModel: LocalSpaceViewModel
): (model: LocalSpaceViewModel) => void {
  let lastShieldPercent = shieldPercent(initialModel);
  let lastHullPercent = hullPercent(initialModel);
  initializeSystemLog(log, panel, lastShieldPercent, lastHullPercent);

  return (model) => {
    const currentShieldPercent = shieldPercent(model);
    const currentHullPercent = hullPercent(model);
    const shieldChanged = currentShieldPercent !== lastShieldPercent;
    const hullChanged = currentHullPercent !== lastHullPercent;
    if (shieldChanged) {
      log.write('SCHILD-INTEGRITÄT ' + currentShieldPercent + ' %');
      lastShieldPercent = currentShieldPercent;
    }
    if (hullChanged) {
      log.write('HÜLLEN-INTEGRITÄT ' + currentHullPercent + ' %');
      lastHullPercent = currentHullPercent;
    }
    if (shieldChanged || hullChanged) panel.update();
  };
}

export function createScanCompletionTracker(
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
