import type { ShipRole } from '../../core/ship-types';
import type {
  StarMapViewModel,
  StarMapWorldEvent,
  WorldEventKind,
} from '../../features/star-map/star-map-view-model';
import type { MissionFilters } from './star-map-event-filters';

export function eventRelevant(kind: WorldEventKind, role: ShipRole): boolean {
  return kind === 'trade' || kind === 'blockade'
    ? role === 'freighter'
    : kind === 'mining'
      ? role === 'mining'
      : kind === 'salvage'
        ? role === 'salvage'
        : kind === 'patrol'
          ? role === 'patrol'
          : false;
}

export function visibleWorldEvents(
  model: StarMapViewModel,
  filters: MissionFilters
): StarMapWorldEvent[] {
  const role = model.playerShip.role ?? 'freighter';
  const point = model.playerShip.position;
  const locations = new Map(model.locations.map((location) => [location.id, location]));
  const distance = (event: StarMapWorldEvent): number => {
    const location = locations.get(event.locationId ?? '');
    return location
      ? Math.hypot(location.position.x - point.x, location.position.y - point.y)
      : Number.POSITIVE_INFINITY;
  };
  return (model.worldEvents ?? [])
    .filter((event) => filters[event.kind])
    .sort((a, b) => {
      const relevance = filters.relevantFirst
        ? Number(eventRelevant(b.kind, role)) - Number(eventRelevant(a.kind, role))
        : 0;
      if (relevance) return relevance;
      if (filters.sort === 'danger')
        return b.dangerLevel - a.dangerLevel || distance(a) - distance(b);
      if (filters.sort === 'name') return a.title.localeCompare(b.title);
      return distance(a) - distance(b) || a.title.localeCompare(b.title);
    });
}

/** A world report is informational; only real locations have navigable buttons. */
export function renderStarMapWorldEvents(
  model: StarMapViewModel,
  container: HTMLElement,
  filters: MissionFilters,
  onSelectLocation: (id: string) => void
): void {
  const entries = visibleWorldEvents(model, filters);
  const heading = document.createElement('p');
  heading.className = 'star-map-directory__summary';
  heading.textContent =
    'WELTEREIGNISSE // ' + entries.length + ' / ' + (model.worldEvents?.length ?? 0);
  container.replaceChildren(heading);
  const known = new Set(model.locations.map((location) => location.id));
  for (const event of entries.slice(0, 40)) {
    const navigable = event.locationId !== null && known.has(event.locationId);
    const row = document.createElement(navigable ? 'button' : 'div');
    row.className = 'star-map-directory__item star-map-event-row star-map-event-row--' + event.kind;
    if (row instanceof HTMLButtonElement && event.locationId) {
      row.type = 'button';
      row.addEventListener('click', () => onSelectLocation(event.locationId!));
    } else {
      row.classList.add('star-map-event-row--information');
    }
    const title = document.createElement('strong');
    title.textContent = event.title;
    const detail = document.createElement('small');
    detail.textContent = event.kind.toUpperCase() + ' · ' + event.detail;
    if (!eventRelevant(event.kind, model.playerShip.role ?? 'freighter')) {
      detail.textContent += ' · INFO';
    }
    row.append(title, detail);
    container.append(row);
  }
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'star-map-directory__empty';
    empty.textContent = 'Keine bekannten Weltereignisse für diese Filter.';
    container.append(empty);
  }
}
