import type { GameAudioService } from '../../systems/audio/game-audio-service';
import { playerPortraitUrl, type PlayerProfile } from '../../core/player-profile';

export interface SettingsMenu {
  destroy(): void;
}

function percent(value: number): string {
  return Math.round(value * 100) + '%';
}

function createSettingsShell(): HTMLDivElement {
  const shell = document.createElement('div');
  shell.className = 'settings-menu';
  shell.innerHTML = `
    <header class="settings-menu__chrome" aria-label="Systemleiste">
      <div class="settings-menu__brand"><strong>SOJOURN</strong><span>SYSTEMKONSOLE</span></div>
      <button
        class="settings-menu__toggle"
        type="button"
        aria-label="Menü und Einstellungen öffnen"
        aria-expanded="false"
        aria-controls="settings-menu-dialog"
        aria-keyshortcuts="Escape"
        title="Menü öffnen (Esc)"
      >MENÜ <span aria-hidden="true">· ESC</span></button>
    </header>

    <div class="settings-menu__backdrop" hidden></div>
    <section
      id="settings-menu-dialog"
      class="settings-menu__panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-menu-title"
      hidden
    >
      <header class="settings-menu__header">
        <div>
          <span>SOJOURN</span>
          <strong id="settings-menu-title">EINSTELLUNGEN</strong>
        </div>
        <button class="settings-menu__close" type="button" aria-label="Schließen">×</button>
      </header>

      <nav class="settings-menu__tabs" aria-label="Einstellungsbereiche">
        <button class="is-active" type="button" data-settings-tab="audio">AUDIO</button>
        <button type="button" data-settings-tab="game" disabled>SPIEL</button>
      </nav>

      <div class="settings-menu__content">
        <section class="settings-menu__section" data-settings-view="audio">
          <div class="settings-menu__section-title">
            <strong>AUDIO</strong>
            <span>Wiedergabelautstärke</span>
          </div>

          <label class="settings-menu__slider">
            <span>UMGEBUNG</span>
            <output data-audio-value="ambience"></output>
            <input data-audio-volume="ambience" type="range" min="0" max="100" step="1" />
          </label>

          <label class="settings-menu__slider">
            <span>RCS</span>
            <output data-audio-value="rcs"></output>
            <input data-audio-volume="rcs" type="range" min="0" max="100" step="1" />
          </label>
        </section>

        <section class="settings-menu__future">
          <span>KARRIERE</span>
          <button class="settings-menu__main-menu" type="button" data-career-save>
            SPIELSTAND SPEICHERN
          </button>
          <small role="status" data-career-status>
            Speichern im ruhenden Orbit oder Hafen
          </small>
        </section>
        <button class="settings-menu__main-menu" type="button">ZUM HAUPTMENÜ</button>
        <small class="settings-menu__main-menu-note">Der aktuelle Durchlauf wird beendet.</small>
      </div>
    </section>
  `;

  document.body.append(shell);
  document.body.classList.add('app-has-system-bar');

  return shell;
}

function createSettingsKeyHandler(
  panel: HTMLElement,
  setOpen: (open: boolean) => void
): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      if (event.repeat) return;
      if (
        panel.hidden &&
        document.querySelector(
          '.star-map-menu__drawer:not([hidden]), .combat-surrender-confirm:not([hidden])'
        )
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(panel.hidden);
      return;
    }
    if (event.key !== 'Tab' || panel.hidden) return;
    const focusable = [
      ...panel.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'
      ),
    ];
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const focusOutside = !panel.contains(document.activeElement);
    if (event.shiftKey && (document.activeElement === first || focusOutside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || focusOutside)) {
      event.preventDefault();
      first.focus();
    }
  };
}

function appendProfileIdentity(shell: HTMLDivElement, profile: PlayerProfile): void {
  const identity = document.createElement('div');
  identity.className = 'settings-menu__identity';
  const icon = document.createElement('div');
  icon.className = 'settings-menu__identity-icon';
  const portrait = playerPortraitUrl(profile.portraitId);
  if (portrait) {
    const image = document.createElement('img');
    image.src = portrait;
    image.alt = 'Kapitänsporträt';
    icon.append(image);
  } else {
    icon.textContent = String(profile.portraitId).padStart(2, '0');
  }
  const labels = document.createElement('div');
  labels.className = 'settings-menu__identity-labels';
  const captainName = document.createElement('strong');
  captainName.textContent = profile.captainName;
  const shipName = document.createElement('span');
  shipName.textContent = profile.shipName;
  labels.append(captainName, shipName);
  identity.append(icon, labels);
  shell.querySelector('.settings-menu__toggle')?.before(identity);
}

export function createSettingsMenu(
  audio: GameAudioService,
  onReturnToMainMenu: () => void,
  profile?: PlayerProfile,
  onSaveCareer?: () => void
): SettingsMenu {
  document.querySelector('.settings-menu')?.remove();

  const shell = createSettingsShell();
  if (profile) appendProfileIdentity(shell, profile);

  const toggle = shell.querySelector<HTMLButtonElement>('.settings-menu__toggle')!;
  const panel = shell.querySelector<HTMLElement>('.settings-menu__panel')!;
  const backdrop = shell.querySelector<HTMLElement>('.settings-menu__backdrop')!;
  const close = shell.querySelector<HTMLButtonElement>('.settings-menu__close')!;
  const mainMenu = shell.querySelector<HTMLButtonElement>(
    '.settings-menu__main-menu:not([data-career-save])'
  )!;
  const save = shell.querySelector<HTMLButtonElement>('[data-career-save]')!;
  const saveStatus = shell.querySelector<HTMLElement>('[data-career-status]')!;
  save.disabled = !onSaveCareer;
  const ambience = shell.querySelector<HTMLInputElement>('[data-audio-volume="ambience"]')!;
  const rcs = shell.querySelector<HTMLInputElement>('[data-audio-volume="rcs"]')!;
  const ambienceValue = shell.querySelector<HTMLOutputElement>('[data-audio-value="ambience"]')!;
  const rcsValue = shell.querySelector<HTMLOutputElement>('[data-audio-value="rcs"]')!;

  const sync = (): void => {
    const settings = audio.getSettings();
    ambience.value = String(Math.round(settings.ambienceVolume * 100));
    rcs.value = String(Math.round(settings.rcsVolume * 100));
    ambienceValue.value = percent(settings.ambienceVolume);
    rcsValue.value = percent(settings.rcsVolume);
  };

  let previouslyFocused: HTMLElement | null = null;
  const setOpen = (open: boolean): void => {
    const wasOpen = !panel.hidden;
    if (open && !wasOpen) {
      previouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    panel.hidden = !open;
    backdrop.hidden = !open;
    toggle.hidden = open;
    toggle.setAttribute('aria-expanded', String(open));
    shell.classList.toggle('is-open', open);
    if (open) {
      sync();
      close.focus();
    } else if (wasOpen) {
      const focusTarget = previouslyFocused?.isConnected ? previouslyFocused : toggle;
      previouslyFocused = null;
      focusTarget.focus();
    }
  };

  const onAmbience = (): void => {
    audio.setAmbienceVolume(Number(ambience.value) / 100);
    ambienceValue.value = percent(audio.getSettings().ambienceVolume);
  };

  const onRcs = (): void => {
    audio.setRcsVolume(Number(rcs.value) / 100);
    rcsValue.value = percent(audio.getSettings().rcsVolume);
  };

  const onToggle = (): void => setOpen(panel.hidden);
  const onClose = (): void => setOpen(false);
  const onMainMenu = (): void => {
    if (!window.confirm('Zum Hauptmenü zurückkehren? Der aktuelle Durchlauf wird beendet.')) return;
    onReturnToMainMenu();
  };
  const onSave = (): void => {
    try {
      onSaveCareer?.();
      saveStatus.textContent = 'Spielstand erfolgreich gespeichert.';
    } catch (error) {
      saveStatus.textContent =
        error instanceof Error ? error.message : 'Spielstand konnte nicht gespeichert werden.';
    }
  };
  const onKeyDown = createSettingsKeyHandler(panel, setOpen);
  ambience.addEventListener('input', onAmbience);
  rcs.addEventListener('input', onRcs);
  toggle.addEventListener('click', onToggle);
  backdrop.addEventListener('click', onClose);
  close.addEventListener('click', onClose);
  mainMenu.addEventListener('click', onMainMenu);
  save.addEventListener('click', onSave);
  window.addEventListener('keydown', onKeyDown, true);

  sync();
  setOpen(false);

  return {
    destroy() {
      ambience.removeEventListener('input', onAmbience);
      rcs.removeEventListener('input', onRcs);
      toggle.removeEventListener('click', onToggle);
      backdrop.removeEventListener('click', onClose);
      close.removeEventListener('click', onClose);
      mainMenu.removeEventListener('click', onMainMenu);
      save.removeEventListener('click', onSave);
      window.removeEventListener('keydown', onKeyDown, true);
      shell.remove();
      document.body.classList.remove('app-has-system-bar');
    },
  };
}
