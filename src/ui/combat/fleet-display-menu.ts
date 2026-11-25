/** Display-only controls. Never alter combat tactics, snapshots or career saves. */
export interface FleetDisplayPreferences {
  readonly lines: boolean;
  readonly assignments: boolean;
  readonly actions: boolean;
  readonly maneuvers: boolean;
  readonly names: boolean;
  readonly boost: boolean;
  readonly overview: boolean;
  readonly playerHud: boolean;
  readonly enemyHud: boolean;
  readonly playerWeapons: boolean;
  readonly enemyWeapons: boolean;
  readonly playerMarker: boolean;
  readonly events: boolean;
}

export interface FleetDisplayMenu {
  get(): FleetDisplayPreferences;
  onChange(callback: () => void): void;
}

const STORAGE_KEY = 'sojourn.fleet-combat.display.v1';
export const DEFAULT_COMBAT_DISPLAY: FleetDisplayPreferences = {
  lines: true,
  assignments: true,
  actions: true,
  maneuvers: true,
  names: true,
  boost: true,
  overview: true,
  playerHud: true,
  enemyHud: true,
  playerWeapons: true,
  enemyWeapons: true,
  playerMarker: false,
  events: true,
};

const CONTROLS: readonly { key: keyof FleetDisplayPreferences; label: string }[] = [
  { key: 'lines', label: 'Zielverbindungen' },
  { key: 'assignments', label: 'Duell-Zuordnung (D / +)' },
  { key: 'actions', label: 'Strategie' },
  { key: 'maneuvers', label: 'Manöver' },
  { key: 'names', label: 'Schiffsnamen' },
  { key: 'boost', label: 'Boostanzeigen' },
  { key: 'overview', label: 'Duellübersicht' },
  { key: 'playerHud', label: 'Übersicht Spielerschiff' },
  { key: 'enemyHud', label: 'Übersicht Gegnerschiff' },
  { key: 'playerWeapons', label: 'Waffenstatistik Spieler' },
  { key: 'enemyWeapons', label: 'Waffenstatistik Gegner' },
  { key: 'playerMarker', label: 'Spielerschiff markieren' },
  { key: 'events', label: 'Kampfmeldungen' },
];

function restorePreferences(): FleetDisplayPreferences {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved))
      return { ...DEFAULT_COMBAT_DISPLAY };
    const values = saved as Record<string, unknown>;
    return Object.fromEntries(
      CONTROLS.map(({ key }) => [
        key,
        typeof values[key] === 'boolean'
          ? values[key]
          : (key === 'playerHud' || key === 'enemyHud') && typeof values.hud === 'boolean'
            ? values.hud
            : key === 'maneuvers' && typeof values.actions === 'boolean'
              ? values.actions
              : DEFAULT_COMBAT_DISPLAY[key],
      ])
    ) as unknown as FleetDisplayPreferences;
  } catch {
    return { ...DEFAULT_COMBAT_DISPLAY };
  }
}

function savePreferences(preferences: FleetDisplayPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Combat display controls still work if local storage is unavailable.
  }
}

/** One collapsible, keyboard-accessible options menu for the entire FleetCombat view. */
export function createFleetDisplayMenu(
  shell: HTMLElement,
  hiddenOptions: readonly (keyof FleetDisplayPreferences)[] = [],
  top = 12
): FleetDisplayMenu {
  let preferences = restorePreferences();
  let notify: () => void = () => undefined;
  const details = document.createElement('details');
  details.className = 'combat-fleet-display-menu';
  details.style.cssText =
    `position:absolute;left:50%;top:${top}px;transform:translateX(-50%);z-index:20;width:max-content;max-width:90vw;` +
    'background:rgba(7,19,26,.96);border:1px solid #607c89;' +
    'color:#dbeef3;font:11px ui-monospace,monospace;box-shadow:0 8px 24px #0008;';
  const summary = document.createElement('summary');
  summary.textContent = 'ANZEIGE';
  summary.style.cssText = 'cursor:pointer;padding:4px 7px;font-weight:700;letter-spacing:.5px;';
  summary.setAttribute('aria-label', 'Kampfanzeige öffnen oder schließen');
  const body = document.createElement('div');
  body.style.cssText = 'padding:4px 8px 7px;display:grid;gap:3px;max-height:65vh;overflow-y:auto;';
  const inputs = new Map<keyof FleetDisplayPreferences, HTMLInputElement>();

  const apply = (next: FleetDisplayPreferences): void => {
    preferences = next;
    for (const [key, input] of inputs) input.checked = preferences[key];
    savePreferences(preferences);
    notify();
  };

  const controls = CONTROLS.filter(({ key }) => !hiddenOptions.includes(key));
  for (const { key, label } of controls) {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = preferences[key];
    input.style.accentColor = '#8bcbd7';
    input.addEventListener('change', () => apply({ ...preferences, [key]: input.checked }));
    inputs.set(key, input);
    row.append(input, document.createTextNode(label));
    body.append(row);
  }

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:7px;padding-top:4px;';
  for (const [label, visible] of [
    ['ALLE AN', true],
    ['ALLE AUS', false],
  ] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText =
      'flex:1;cursor:pointer;border:1px solid #587682;background:#142834;' +
      'color:#d9eef4;font:11px ui-monospace,monospace;padding:6px;';
    button.addEventListener('click', () =>
      apply({ ...preferences, ...Object.fromEntries(controls.map(({ key }) => [key, visible])) })
    );
    actions.append(button);
  }
  body.append(actions);
  details.append(summary, body);
  shell.append(details);
  return {
    get: () => preferences,
    onChange(callback) {
      notify = callback;
    },
  };
}
