import { createPlayerProfile, type PlayerProfile } from '../../core/player-profile';
import { createPortraitPicker } from './character-editor-portraits';
import { createSkillAllocator } from './character-editor-skills';
import type { ShipStationDefinition } from '../../core/ship-types';

export interface CharacterEditor {
  destroy(): void;
}

export function createCharacterEditor(
  root: HTMLElement,
  onStart: (profile: PlayerProfile) => void,
  onBack: () => void,
  stations: readonly ShipStationDefinition[]
): CharacterEditor {
  const shell = document.createElement('section');
  shell.className = 'character-editor';
  shell.setAttribute('aria-label', 'Charakter erstellen');
  shell.innerHTML = `
    <div class="character-editor__shade" aria-hidden="true"></div>
    <main class="character-editor__layout">
      <header class="character-editor__header">
        <span class="character-editor__eyebrow">SOJOURN / NEUER DURCHLAUF / 01</span>
        <h1>DEINE REISE BEGINNT</h1>
        <p>Wähle ein Porträt und registriere deinen Kapitän und dein Schiff.</p>
      </header>
      <div class="character-editor__columns">
        <aside class="character-editor__preview" aria-label="Charaktervorschau">
          <div class="character-editor__preview-image"></div>
          <div class="character-editor__preview-details">
            <span>PERSONALAKTE / KAPITÄN</span>
            <strong data-preview-captain>UNBENANNT</strong>
            <span>SCHIFFSREGISTRIERUNG</span>
            <strong data-preview-ship>UNBENANNT</strong>
          </div>
        </aside>
        <form class="character-editor__form">
          <h2>01 / PORTRÄT</h2>
          <div class="character-editor__portraits" role="group" aria-label="Porträt auswählen"></div>
          <h2>02 / IDENTITÄT</h2>
          <div class="character-editor__fields">
            <label>CHARAKTERNAME
              <input name="captainName" type="text" maxlength="32" autocomplete="off"
                placeholder="Name des Kapitäns" required />
            </label>
            <label>SCHIFFSNAME
              <input name="shipName" type="text" maxlength="32" autocomplete="off"
                placeholder="Name deines Schiffs" required />
            </label>
          </div>
          <h2>03 / AUSBILDUNG UND SCHIFFSDIENST</h2>
          <div class="character-editor__skills"></div>
          <p class="character-editor__note">Deine Werte gelten für den Kapitän im Crew- und Stationssystem. Spielstände folgen später.</p>
          <div class="character-editor__actions">
            <button class="character-editor__back" type="button">ZURÜCK</button>
            <button class="character-editor__launch" type="submit" disabled>REISE BEGINNEN →</button>
          </div>
        </form>
      </div>
    </main>`;

  const gallery = shell.querySelector<HTMLElement>('.character-editor__portraits')!;
  const previewImage = shell.querySelector<HTMLElement>('.character-editor__preview-image')!;
  const form = shell.querySelector<HTMLFormElement>('.character-editor__form')!;
  const captain = form.querySelector<HTMLInputElement>('[name="captainName"]')!;
  const ship = form.querySelector<HTMLInputElement>('[name="shipName"]')!;
  const launch = form.querySelector<HTMLButtonElement>('.character-editor__launch')!;
  const previewCaptain = shell.querySelector<HTMLElement>('[data-preview-captain]')!;
  const previewShip = shell.querySelector<HTMLElement>('[data-preview-ship]')!;
  const portraitPicker = createPortraitPicker(gallery, previewImage);
  const allocator = createSkillAllocator(
    shell.querySelector<HTMLElement>('.character-editor__skills')!,
    stations,
    () => sync()
  );
  let submitted = false;

  const sync = (): void => {
    previewCaptain.textContent = captain.value.trim() || 'UNBENANNT';
    previewShip.textContent = ship.value.trim() || 'UNBENANNT';
    launch.disabled = submitted || !captain.value.trim() || !ship.value.trim() || !allocator.valid();
  };
  captain.addEventListener('input', sync);
  ship.addEventListener('input', sync);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (submitted || !form.reportValidity() || !allocator.valid()) return;
    const profile = createPlayerProfile({
      portraitId: portraitPicker.selectedPortrait(),
      captainName: captain.value,
      shipName: ship.value,
      ...allocator.values(),
    });
    submitted = true;
    sync();
    onStart(profile);
  });
  shell
    .querySelector<HTMLButtonElement>('.character-editor__back')!
    .addEventListener('click', onBack);

  sync();
  root.replaceChildren(shell);
  return { destroy: () => shell.remove() };
}
