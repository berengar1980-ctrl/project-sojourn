import { PORTRAIT_IDS, playerPortraitUrl, type PortraitId } from '../../core/player-profile';

export interface PortraitPicker {
  selectedPortrait(): PortraitId;
}

function portraitElement(portraitId: PortraitId): HTMLElement {
  const url = playerPortraitUrl(portraitId);
  if (!url) {
    const placeholder = document.createElement('span');
    placeholder.className = 'character-editor__placeholder';
    placeholder.textContent = String(portraitId).padStart(2, '0');
    return placeholder;
  }
  const image = document.createElement('img');
  image.src = url;
  image.alt = 'Porträt ' + portraitId;
  image.draggable = false;
  return image;
}

function portraitButton(portraitId: PortraitId, onSelect: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'character-editor__portrait';
  button.setAttribute('aria-label', 'Porträt ' + portraitId);
  button.setAttribute('aria-pressed', 'false');
  button.append(portraitElement(portraitId));
  const caption = document.createElement('span');
  caption.textContent = playerPortraitUrl(portraitId)
    ? 'PORTRÄT ' + String(portraitId).padStart(2, '0')
    : 'PLATZHALTER ' + String(portraitId).padStart(2, '0');
  button.append(caption);
  button.addEventListener('click', onSelect);
  return button;
}

export function createPortraitPicker(
  gallery: HTMLElement,
  previewImage: HTMLElement
): PortraitPicker {
  const portraitButtons = new Map<PortraitId, HTMLButtonElement>();
  let selectedPortrait: PortraitId = 1;

  const selectPortrait = (portraitId: PortraitId): void => {
    selectedPortrait = portraitId;
    previewImage.replaceChildren(portraitElement(portraitId));
    for (const [id, button] of portraitButtons) {
      button.setAttribute('aria-pressed', String(id === portraitId));
      button.classList.toggle('is-selected', id === portraitId);
    }
  };

  for (const portraitId of PORTRAIT_IDS) {
    const button = portraitButton(portraitId, () => selectPortrait(portraitId));
    portraitButtons.set(portraitId, button);
    gallery.append(button);
  }

  selectPortrait(1);
  return { selectedPortrait: () => selectedPortrait };
}
