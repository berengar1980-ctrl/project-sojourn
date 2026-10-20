import type { CampaignJournalEntry } from '../../core/campaign-types';

export interface CampaignJournalActions {
  readonly selectLocation: (id: string) => void;
  readonly choose: (campaignId: string, dialogueId: string, choiceId: string) => void;
}

function line(text: string, className: string): HTMLElement {
  const element = document.createElement('p');
  element.className = className;
  element.textContent = text;
  return element;
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'star-map-directory__item';
  element.textContent = text;
  element.addEventListener('click', onClick);
  return element;
}

/** Mission UI is a pure view of campaign-owned progress; no DOM-derived state. */
export function renderCampaignJournal(
  container: HTMLElement,
  entries: readonly CampaignJournalEntry[],
  currentLocationId: string | null,
  actions: CampaignJournalActions
): void {
  container.replaceChildren(line('KAMPAGNEN // ' + entries.length, 'star-map-directory__summary'));
  if (!entries.length) {
    container.append(line('Keine Kampagnen aktiv.', 'star-map-directory__empty'));
    return;
  }
  for (const entry of entries) {
    const article = document.createElement('article');
    article.className = 'campaign-journal__entry';
    const heading = document.createElement('strong');
    heading.textContent = entry.title;
    article.append(
      heading,
      line(entry.chapter + ' · ' + entry.status.toUpperCase(), 'star-map-directory__group'),
      line(entry.objective, 'campaign-journal__objective'),
      line(entry.detail, 'campaign-journal__detail')
    );
    if (entry.status === 'active' && entry.targetLocationId &&
      entry.targetLocationId !== currentLocationId) {
      article.append(button('ZIEL AUF STERNKARTE WÄHLEN', () =>
        actions.selectLocation(entry.targetLocationId!)));
    }
    if (entry.status === 'active' && entry.dialogue) {
      const dialogue = entry.dialogue;
      article.append(
        line(dialogue.speaker.toUpperCase(), 'star-map-directory__group'),
        line(dialogue.text, 'campaign-journal__detail')
      );
      for (const option of dialogue.choices) {
        article.append(button(option.label, () => actions.choose(entry.id, dialogue.id, option.id)));
      }
    }
    container.append(article);
  }
}
