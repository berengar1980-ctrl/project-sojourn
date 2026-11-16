import type { CampaignSelection } from '../../systems/campaigns/campaign-selection';

export interface CampaignSelectionMenu {
  destroy(): void;
}

const CATEGORY_LABELS = {
  core: 'PFLICHTKAMPAGNE',
  optional: 'OPTIONALE KAMPAGNE',
  development: 'ENTWICKLUNG / TEST',
} as const;

function createCampaignRow(
  selection: CampaignSelection,
  entry: ReturnType<CampaignSelection['list']>[number],
  updateCounter: () => void
): HTMLElement {
  const row = document.createElement('label');
  row.className = 'harrow-campaigns__item';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = entry.enabled;
  checkbox.disabled = entry.category === 'core';
  checkbox.setAttribute('aria-label', entry.title + ' aktivieren');
  const content = document.createElement('span');
  content.className = 'harrow-campaigns__item-content';
  const title = document.createElement('strong');
  title.textContent = entry.title;
  const meta = document.createElement('small');
  meta.textContent = CATEGORY_LABELS[entry.category] + ' · VERSION ' + entry.version;
  const description = document.createElement('span');
  description.textContent = entry.description || 'Keine Beschreibung hinterlegt.';
  content.append(title, meta, description);
  row.append(checkbox, content);
  if (checkbox.disabled) {
    row.title = 'Diese Kampagne wird vom Spiel benötigt und ist nicht deaktivierbar.';
  } else {
    checkbox.addEventListener('change', () => {
      if (!selection.setEnabled(entry.id, checkbox.checked)) {
        checkbox.checked = selection.list().find((item) => item.id === entry.id)?.enabled ?? false;
      }
      updateCounter();
    });
  }
  return row;
}

/** Lists every registered campaign package; changes apply to the next new game only. */
export function createCampaignSelectionMenu(
  root: HTMLElement,
  selection: CampaignSelection,
  onBack: () => void,
  onNewGame: () => void
): CampaignSelectionMenu {
  const shell = document.createElement('section');
  shell.className = 'harrow-campaigns';
  shell.setAttribute('aria-label', 'Kampagnen auswählen');
  const layout = document.createElement('main');
  layout.className = 'harrow-campaigns__layout';
  const eyebrow = document.createElement('span');
  eyebrow.className = 'harrow-campaigns__eyebrow';
  eyebrow.textContent = 'SOJOURN / KAMPAGNENVERWALTUNG';
  const heading = document.createElement('h1');
  heading.textContent = 'KAMPAGNEN';
  const explanation = document.createElement('p');
  explanation.textContent =
    'Wähle die Kampagnen für deinen nächsten Spieldurchlauf. Die Auswahl gilt für neue Spiele. Karriere-Spielstände werden separat im Hauptmenü geladen.';
  const counter = document.createElement('p');
  counter.className = 'harrow-campaigns__counter';
  const updateCounter = (): void => {
    const entries = selection.list();
    counter.textContent =
      entries.filter((entry) => entry.enabled).length + ' / ' + entries.length + ' AKTIV';
  };
  const list = document.createElement('div');
  list.className = 'harrow-campaigns__list';
  const entries = selection.list();
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.textContent = 'Keine Kampagnen installiert.';
    list.append(empty);
  }
  for (const entry of entries) list.append(createCampaignRow(selection, entry, updateCounter));
  updateCounter();
  const actions = document.createElement('div');
  actions.className = 'harrow-campaigns__actions';
  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.textContent = 'ZURÜCK ZUM HAUPTMENÜ';
  backButton.addEventListener('click', onBack);
  const newGame = document.createElement('button');
  newGame.type = 'button';
  newGame.textContent = 'NEUES SPIEL →';
  newGame.addEventListener('click', onNewGame);
  actions.append(backButton, newGame);
  layout.append(eyebrow, heading, explanation, counter, list, actions);
  shell.append(layout);
  root.replaceChildren(shell);
  return { destroy: () => shell.remove() };
}
