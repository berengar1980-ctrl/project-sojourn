import type { CombatTactic } from '../../systems/combat/strategic-combat-service';

import type { SystemLogService } from '../../core/system-log-types';

import type { SalvageSpaceViewModel } from '../../features/salvage/salvage-space-view-model';

import type { WorldPoint } from '../../core/world-types';

export interface SalvageSpacePanelOptions {
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
  readonly onDiagnoseDistress?: (eventId: string) => void;
  readonly onRepairDistress?: (eventId: string) => void;
  readonly onTowDistress?: (eventId: string) => void;
  readonly onEvacuateDistress?: (eventId: string) => void;
  readonly onCancel: () => void;
  readonly onReturnToStarMap: () => void;
}

export interface SalvageControls {
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
  readonly sectorEventContainer: HTMLElement;
  readonly combatTactics: HTMLElement;
}

export function createShell(options: SalvageSpacePanelOptions): HTMLElement {
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
    '<aside class="sector-salvage-event" hidden></aside>',
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

export function controls(shell: HTMLElement): SalvageControls {
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
    sectorEventContainer: query<HTMLElement>('.sector-salvage-event'),
    combatTactics: query<HTMLElement>('.salvage-combat-tactics'),
  };
}
