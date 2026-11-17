import type { ShipRole } from '../../core/ship-types';
import type { StarMapLocationView } from '../../features/star-map/star-map-view-model';

export type SignalKind = 'distress' | 'salvage';
export type EventFilterKind = SignalKind | 'trade' | 'mining' | 'patrol' | 'blockade' | 'campaign';
export type SignalSort = 'distance' | 'danger' | 'name';
export interface MissionFilters {
  readonly distress: boolean;
  readonly salvage: boolean;
  readonly campaign: boolean;
  readonly trade: boolean;
  readonly mining: boolean;
  readonly patrol: boolean;
  readonly blockade: boolean;
  readonly relevantFirst: boolean;
  readonly sort: SignalSort;
}

const STORAGE_PREFIX = 'sojourn:star-map-signals:v1:';
export const EVENT_KINDS = [
  ['distress', 'Notsignal'],
  ['salvage', 'Bergung'],
  ['trade', 'Handel'],
  ['mining', 'Bergbau'],
  ['patrol', 'Patrouille'],
  ['blockade', 'Blockade'],
  ['campaign', 'Kampagne'],
] as const;

export function signalKind(location: StarMapLocationView): SignalKind | null {
  // A static "missions" capability is not an active distress incident.
  // Actual distress events enter the map as wreck contacts with missions=true.
  if (location.kind !== 'wreck') return null;
  if (location.activities.missions) return 'distress';
  return location.activities.salvage ? 'salvage' : null;
}

export function defaultMissionFilters(role: ShipRole): MissionFilters {
  return {
    distress: true,
    salvage: role === 'salvage',
    campaign: true,
    trade: role === 'freighter',
    mining: role === 'mining',
    patrol: role === 'patrol',
    blockade: role === 'freighter',
    relevantFirst: true,
    sort: 'distance',
  };
}

export function loadMissionFilters(role: ShipRole): MissionFilters {
  const defaults = defaultMissionFilters(role);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_PREFIX + role) ?? 'null') as unknown;
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaults;
    const values = saved as Record<string, unknown>;
    return {
      distress: typeof values.distress === 'boolean' ? values.distress : defaults.distress,
      salvage: typeof values.salvage === 'boolean' ? values.salvage : defaults.salvage,
      campaign: typeof values.campaign === 'boolean' ? values.campaign : defaults.campaign,
      trade: typeof values.trade === 'boolean' ? values.trade : defaults.trade,
      mining: typeof values.mining === 'boolean' ? values.mining : defaults.mining,
      patrol: typeof values.patrol === 'boolean' ? values.patrol : defaults.patrol,
      blockade: typeof values.blockade === 'boolean' ? values.blockade : defaults.blockade,
      relevantFirst: typeof values.relevantFirst === 'boolean' ? values.relevantFirst : true,
      sort: ['distance', 'danger', 'name'].includes(String(values.sort))
        ? (values.sort as SignalSort)
        : defaults.sort,
    };
  } catch {
    return defaults;
  }
}

export function saveMissionFilters(role: ShipRole, filters: MissionFilters): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + role, JSON.stringify(filters));
  } catch {
    // Private browsing or blocked storage: filters still work in this menu session.
  }
}

export function filteredSignals(
  locations: readonly StarMapLocationView[],
  filters: MissionFilters,
  playerPosition: { readonly x: number; readonly y: number }
): StarMapLocationView[] {
  const distance = (location: StarMapLocationView): number =>
    Math.hypot(location.position.x - playerPosition.x, location.position.y - playerPosition.y);
  return locations
    .filter((location) => {
      const kind = signalKind(location);
      return kind !== null && filters[kind];
    })
    .sort((a, b) => {
      if (filters.sort === 'distance')
        return distance(a) - distance(b) || a.name.localeCompare(b.name);
      if (filters.sort === 'danger')
        return b.dangerLevel - a.dangerLevel || distance(a) - distance(b);
      return a.name.localeCompare(b.name);
    });
}

export function missionFilterControls(
  filters: MissionFilters,
  counts: Readonly<Record<EventFilterKind, number>>,
  onChange: (next: MissionFilters) => void
): HTMLElement {
  const container = document.createElement('div');
  let currentFilters = filters;
  const submit = (next: MissionFilters): void => {
    currentFilters = next;
    for (const [kind] of EVENT_KINDS) {
      const input = container.querySelector<HTMLInputElement>(
        '.star-map-event-filter--' + kind + ' input'
      );
      if (input) input.checked = next[kind];
    }
    for (const button of container.querySelectorAll<HTMLButtonElement>(
      '.star-map-event-filters__presets button'
    )) {
      const all = EVENT_KINDS.every(([kind]) => next[kind]);
      const none = EVENT_KINDS.every(([kind]) => !next[kind]);
      button.setAttribute('aria-pressed', String(button.textContent === 'Alle' ? all : none));
    }
    onChange(next);
  };
  container.className = 'star-map-event-filters';
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', 'Ereignistypen ein- oder ausblenden');

  const presets = document.createElement('div');
  presets.className = 'star-map-event-filters__presets';
  for (const [label, checked] of [
    ['Alle', EVENT_KINDS.every(([kind]) => filters[kind])],
    ['Keine', EVENT_KINDS.every(([kind]) => !filters[kind])],
  ] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-pressed', String(checked));
    button.addEventListener('click', () =>
      submit({
        ...currentFilters,
        distress: label === 'Alle',
        salvage: label === 'Alle',
        campaign: label === 'Alle',
        trade: label === 'Alle',
        mining: label === 'Alle',
        patrol: label === 'Alle',
        blockade: label === 'Alle',
      })
    );
    presets.append(button);
  }
  container.append(presets);

  const choices = document.createElement('div');
  choices.className = 'star-map-event-filters__choices';
  for (const [kind, label] of EVENT_KINDS) {
    const choice = document.createElement('label');
    choice.className = 'star-map-event-filter star-map-event-filter--' + kind;
    choice.dataset.kind = kind;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = filters[kind];
    input.addEventListener('change', () => submit({ ...currentFilters, [kind]: input.checked }));
    const caption = document.createElement('span');
    caption.className = 'star-map-event-filter__count';
    caption.textContent = label + ' (' + counts[kind] + ')';
    choice.append(input, caption);
    choices.append(choice);
  }
  container.append(choices);
  const relevant = document.createElement('label');
  relevant.className = 'star-map-event-filters__relevant';
  const relevantInput = document.createElement('input');
  relevantInput.type = 'checkbox';
  relevantInput.checked = filters.relevantFirst;
  relevantInput.addEventListener('change', () =>
    submit({
      ...currentFilters,
      relevantFirst: relevantInput.checked,
    })
  );
  relevant.append(relevantInput, document.createTextNode('Zum Schiff passende zuerst'));
  container.append(relevant);

  const sortLabel = document.createElement('label');
  sortLabel.className = 'star-map-event-filters__sort';
  sortLabel.textContent = 'SORTIEREN';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Signale sortieren');
  for (const [value, label] of [
    ['distance', 'Entfernung'],
    ['danger', 'Gefahr (hoch zuerst)'],
    ['name', 'Name A–Z'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  select.value = filters.sort;
  select.addEventListener('change', () =>
    submit({ ...currentFilters, sort: select.value as SignalSort })
  );
  sortLabel.append(select);
  container.append(sortLabel);
  return container;
}
