import type { StarMapViewModel } from '../../features/star-map/star-map-view-model';

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
  const subtext = document.createElement('small');
  subtext.textContent = detail;
  row.append(name, subtext);
  row.addEventListener('click', onSelect);
  return row;
}

function createEmptyState(message: string): HTMLElement {
  const paragraph = document.createElement('p');
  paragraph.className = 'star-map-directory__empty';
  paragraph.textContent = message;
  return paragraph;
}

export function renderStarMapContacts(
  model: StarMapViewModel,
  container: HTMLElement,
  actions: DirectoryActions
): void {
  const summary = document.createElement('p');
  summary.className = 'star-map-directory__summary';
  summary.textContent = 'SENSORKONTAKTE // ' + model.npcShips.length + ' sichtbar';
  const entries = model.npcShips.map((npc) => {
    const distance = Math.round(
      Math.hypot(
        npc.position.x - model.playerShip.position.x,
        npc.position.y - model.playerShip.position.y
      )
    );
    const status = npc.combatMode
      ? npc.combatMode.toUpperCase()
      : npc.isPursuitTarget
        ? 'VERFOLGUNG'
        : npc.activity;
    return {
      npc,
      distance,
      row: createRow(
        npc.name,
        npc.job.toUpperCase() + ' · ' + distance + ' u · ' + status,
        npc.isSelected === true,
        () => actions.onSelectNpc(npc.id)
      ),
    };
  });
  entries.sort((a, b) => a.distance - b.distance);
  container.replaceChildren(
    summary,
    ...(entries.length
      ? entries.slice(0, 24).map((entry) => entry.row)
      : [createEmptyState('Keine Schiffe innerhalb der aktuellen Sensorreichweite.')])
  );
}

export function renderStarMapEvents(
  model: StarMapViewModel,
  container: HTMLElement,
  actions: DirectoryActions
): void {
  // Sector salvage and distress signals enter the map as dynamic wreck locations.
  const events = model.locations.filter(
    (location) => location.kind === 'wreck' && (location.activities.salvage || location.activities.missions)
  );
  const summary = document.createElement('p');
  summary.className = 'star-map-directory__summary';
  summary.textContent = 'BEKANNTE SIGNALE // ' + events.length;
  container.replaceChildren(
    summary,
    ...(events.length
      ? events.slice(0, 24).map((location) =>
          createRow(
            location.name,
            (location.activities.missions ? 'NOTSIGNAL' : 'BERGUNG') +
              ' · GEFAHR ' + location.dangerLevel + '/3',
            location.isSelected,
            () => actions.onSelectLocation(location.id)
          )
        )
      : [createEmptyState('Derzeit keine bekannten Bergungs- oder Notsignale. Weitere Auftragstypen folgen.')])
  );
}
