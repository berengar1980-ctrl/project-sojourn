import { filteredSignals, signalKind, type MissionFilters } from './star-map-event-filters';
import type { NpcShipMapView, StarMapViewModel } from '../../features/star-map/star-map-view-model';

interface DirectoryActions {
  readonly onSelectNpc: (id: string) => void;
  readonly onSelectLocation: (id: string) => void;
}

function createRow(
  title: string,
  detail: string,
  isSelected: boolean,
  onSelect: () => void
): HTMLButtonElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'star-map-directory__item' + (isSelected ? ' is-selected' : '');
  const name = document.createElement('strong');
  name.textContent = title;
  const detailText = document.createElement('small');
  detailText.textContent = detail;
  row.append(name, detailText);
  row.addEventListener('click', onSelect);
  return row;
}

function emptyState(message: string): HTMLElement {
  const paragraph = document.createElement('p');
  paragraph.className = 'star-map-directory__empty';
  paragraph.textContent = message;
  return paragraph;
}

function contactStatus(npc: NpcShipMapView): string {
  if (npc.combatMode) return npc.combatMode.toUpperCase();
  if (npc.isPursuitTarget) return 'VERFOLGUNG';
  return npc.activity;
}

const CONTACT_GROUPS = [
  'GEFECHTSKONTAKTE',
  'VERFOLGUNG',
  'PIRATEN',
  'PATROUILLE',
  'BERGUNG',
  'BERGBAU',
  'FRACHTVERKEHR',
] as const;

function contactGroup(npc: NpcShipMapView): (typeof CONTACT_GROUPS)[number] {
  if (npc.combatMode) return 'GEFECHTSKONTAKTE';
  if (npc.isPursuitTarget) return 'VERFOLGUNG';
  if (npc.job === 'pirate') return 'PIRATEN';
  if (npc.job === 'patrol') return 'PATROUILLE';
  if (npc.job === 'salvager') return 'BERGUNG';
  if (npc.job === 'miner') return 'BERGBAU';
  return 'FRACHTVERKEHR';
}

export function renderStarMapContacts(
  model: StarMapViewModel,
  container: HTMLElement,
  actions: DirectoryActions
): void {
  const combatCount = model.npcShips.filter((npc) => Boolean(npc.combatMode)).length;
  const summary = document.createElement('p');
  summary.className = 'star-map-directory__summary';
  summary.textContent = [
    'SENSORKONTAKTE // ' + model.npcShips.length + ' SICHTBAR',
    combatCount + ' IM GEFECHT',
  ].join(' · ');

  const entries = model.npcShips.map((npc) => {
    const distance = Math.round(
      Math.hypot(
        npc.position.x - model.playerShip.position.x,
        npc.position.y - model.playerShip.position.y
      )
    );
    return {
      group: contactGroup(npc),
      distance,
      row: createRow(
        npc.name,
        npc.job.toUpperCase() + ' · ' + distance + ' u · ' + contactStatus(npc),
        npc.isSelected === true,
        () => actions.onSelectNpc(npc.id)
      ),
    };
  });
  entries.sort((a, b) => {
    const priority = CONTACT_GROUPS.indexOf(a.group) - CONTACT_GROUPS.indexOf(b.group);
    return priority || a.distance - b.distance;
  });
  container.replaceChildren(summary);
  if (!entries.length) {
    container.append(emptyState('Keine Schiffe innerhalb der aktuellen Sensorreichweite.'));
    return;
  }

  const visible = entries.slice(0, 24);
  for (const group of CONTACT_GROUPS) {
    const matching = visible.filter((entry) => entry.group === group);
    if (!matching.length) continue;
    const heading = document.createElement('p');
    heading.className = 'star-map-directory__group';
    heading.textContent = group + ' // ' + matching.length;
    container.append(heading, ...matching.map((entry) => entry.row));
  }
  if (entries.length > visible.length) {
    container.append(emptyState('WEITERE ' + (entries.length - visible.length) + ' KONTAKTE'));
  }
}

export function renderStarMapEvents(
  model: StarMapViewModel,
  container: HTMLElement,
  actions: DirectoryActions,
  filters: MissionFilters
): void {
  const all = model.locations.filter((location) => signalKind(location) !== null);
  const events = filteredSignals(model.locations, filters, model.playerShip.position);
  const summary = document.createElement('p');
  summary.className = 'star-map-directory__summary';
  summary.textContent = 'BEKANNTE SIGNALE // ' + events.length + ' / ' + all.length;
  container.replaceChildren(summary);
  if (!events.length) {
    container.append(
      emptyState(
        all.length
          ? 'Keine Signale entsprechen den gewählten Filtern.'
          : 'Noch keine bekannten Bergungs- oder Notsignale.'
      )
    );
    return;
  }
  for (const location of events.slice(0, 24)) {
    const kind = signalKind(location);
    const activity = kind === 'distress' ? 'NOTSIGNAL' : 'BERGUNG';
    const row = createRow(
      location.name,
      activity + ' · GEFAHR ' + location.dangerLevel + '/3',
      location.isSelected,
      () => actions.onSelectLocation(location.id)
    );
    row.classList.add('star-map-event-row', 'star-map-event-row--' + kind);
    container.append(row);
  }
  if (events.length > 24) {
    container.append(emptyState('WEITERE ' + (events.length - 24) + ' SIGNALE'));
  }
}
