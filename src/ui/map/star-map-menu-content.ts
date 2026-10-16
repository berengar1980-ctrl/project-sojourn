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
  summary.textContent =
    'SENSORKONTAKTE // ' +
    model.npcShips.length +
    ' SICHTBAR · ' +
    combatCount +
    ' IM GEFECHT';

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
  actions: DirectoryActions
): void {
  const events = model.locations.filter((location) => {
    if (location.kind !== 'wreck') return false;
    return Boolean(location.activities.salvage || location.activities.missions);
  });
  const summary = document.createElement('p');
  summary.className = 'star-map-directory__summary';
  summary.textContent = 'BEKANNTE SIGNALE // ' + events.length;
  container.replaceChildren(summary);
  if (!events.length) {
    container.append(emptyState('Noch keine bekannten Bergungs- oder Notsignale.'));
    return;
  }
  for (const location of events.slice(0, 24)) {
    const activity = location.activities.missions ? 'NOTSIGNAL' : 'BERGUNG';
    container.append(
      createRow(
        location.name,
        activity + ' · GEFAHR ' + location.dangerLevel + '/3',
        location.isSelected,
        () => actions.onSelectLocation(location.id)
      )
    );
  }
}
