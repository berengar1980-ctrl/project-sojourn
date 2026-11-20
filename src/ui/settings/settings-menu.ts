import type { GameAudioService } from '../../systems/audio/game-audio-service';
import { playerPortraitUrl, type PlayerProfile } from '../../core/player-profile';

export interface SettingsMenu {
  destroy(): void;
}

function percent(value: number): string {
  return Math.round(value * 100) + '%';
}

function appendConfirmationStyles(shell: HTMLDivElement): void {
  const style = document.createElement('style');
  style.textContent = `
    .settings-menu__panel { position: relative; }
    .settings-menu__confirm:not([hidden]) {
      position: absolute; inset: 0; z-index: 10; padding: 28px;
      display: flex; flex-direction: column; justify-content: center;
      background: #07151c; border: 1px solid #467c8c; color: #d0e3e8;
      box-sizing: border-box;
    }
    .settings-menu__confirm strong { color: #d0e3e8; letter-spacing: .07em; }
    .settings-menu__confirm p { line-height: 1.6; color: #f4d9a8; }
    .settings-menu__confirm-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 16px; }
    .settings-menu__confirm-actions button {
      flex: 1; min-width: 110px; padding: 12px;
      border: 1px solid #477b8b; background: #172e3b; color: #e0f3f6; cursor: pointer;
    }
    .settings-menu__confirm-actions [data-confirm-accept] {
      background: #28576a; border-color: #6bb6c2;
    }
    @media (max-width: 480px) {
      .settings-menu__confirm:not([hidden]) { padding: 16px; }
    }
  `;
  shell.append(style);
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

      <div class="settings-menu__confirm" role="alertdialog" aria-modal="true" aria-labelledby="settings-confirm-title" aria-describedby="settings-confirm-message" hidden>
        <strong id="settings-confirm-title"></strong>
        <p id="settings-confirm-message"></p>
        <div class="settings-menu__confirm-actions">
          <button type="button" data-confirm-cancel>ABBRECHEN</button>
          <button type="button" data-confirm-accept>BESTÄTIGEN</button>
        </div>
      </div>
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
          <button class="settings-menu__main-menu" type="button" data-career-load>
            SPIELSTAND LADEN
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

  appendConfirmationStyles(shell);
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

function saveCareer(onSaveCareer: (() => void) | undefined, status: HTMLElement): void {
  try {
    onSaveCareer?.();
    status.textContent = 'Spielstand erfolgreich gespeichert.';
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : 'Spielstand konnte nicht gespeichert werden.';
  }
}

function loadSavedCareer(onLoadCareer: (() => void) | undefined, status: HTMLElement): void {
  if (!onLoadCareer) return;
  try {
    onLoadCareer();
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : 'Spielstand konnte nicht geladen werden.';
  }
}

function createSettingsConfirmation(shell: HTMLDivElement) {
  const confirm = shell.querySelector<HTMLElement>('.settings-menu__confirm')!;
  const confirmTitle = shell.querySelector<HTMLElement>('#settings-confirm-title')!;
  const confirmMessage = shell.querySelector<HTMLElement>('#settings-confirm-message')!;
  const confirmAccept = shell.querySelector<HTMLButtonElement>('[data-confirm-accept]')!;
  const confirmCancel = shell.querySelector<HTMLButtonElement>('[data-confirm-cancel]')!;
  let pendingAction: (() => void) | null = null;
  let previousConfirmFocus: HTMLElement | null = null;
  const hideConfirm = (restoreFocus = true): void => {
    confirm.hidden = true;
    pendingAction = null;
    if (restoreFocus) previousConfirmFocus?.focus();
    previousConfirmFocus = null;
  };
  const requestConfirm = (
    title: string,
    message: string,
    actionLabel: string,
    action: () => void
  ): void => {
    if (!confirm.hidden) return;
    previousConfirmFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pendingAction = action;
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmAccept.textContent = actionLabel;
    confirm.hidden = false;
    confirmCancel.focus();
  };
  const onConfirmCancel = (): void => hideConfirm();
  const onConfirmAccept = (): void => {
    const action = pendingAction;
    hideConfirm(false);
    action?.();
  };
  confirmCancel.addEventListener('click', onConfirmCancel);
  confirmAccept.addEventListener('click', onConfirmAccept);

  const handleKeyDown = (event: KeyboardEvent): boolean => {
    if (confirm.hidden) return false;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      hideConfirm();
    } else if (event.key === 'Tab') {
      const first = confirmCancel;
      const last = confirmAccept;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    return true;
  };
  return {
    request: requestConfirm,
    hide: hideConfirm,
    isOpen: () => !confirm.hidden,
    handleKeyDown,
    destroy: () => {
      confirmCancel.removeEventListener('click', onConfirmCancel);
      confirmAccept.removeEventListener('click', onConfirmAccept);
    },
  };
}

function bindSettingsAudio(audio: GameAudioService, shell: HTMLDivElement): () => void {
  const ambience = shell.querySelector<HTMLInputElement>('[data-audio-volume="ambience"]')!;
  const rcs = shell.querySelector<HTMLInputElement>('[data-audio-volume="rcs"]')!;
  const ambienceValue = shell.querySelector<HTMLOutputElement>('[data-audio-value="ambience"]')!;
  const rcsValue = shell.querySelector<HTMLOutputElement>('[data-audio-value="rcs"]')!;
  const onAmbience = (): void => {
    audio.setAmbienceVolume(Number(ambience.value) / 100);
    ambienceValue.value = percent(audio.getSettings().ambienceVolume);
  };
  const onRcs = (): void => {
    audio.setRcsVolume(Number(rcs.value) / 100);
    rcsValue.value = percent(audio.getSettings().rcsVolume);
  };
  const settings = audio.getSettings();
  ambience.value = String(Math.round(settings.ambienceVolume * 100));
  rcs.value = String(Math.round(settings.rcsVolume * 100));
  ambienceValue.value = percent(settings.ambienceVolume);
  rcsValue.value = percent(settings.rcsVolume);
  ambience.addEventListener('input', onAmbience);
  rcs.addEventListener('input', onRcs);
  return () => {
    ambience.removeEventListener('input', onAmbience);
    rcs.removeEventListener('input', onRcs);
  };
}

export function createSettingsMenu(
  audio: GameAudioService,
  onReturnToMainMenu: () => void,
  profile?: PlayerProfile,
  onSaveCareer?: () => void,
  onLoadCareer?: () => void,
  careerSaveBlockReason?: () => string | null
): SettingsMenu {
  document.querySelector('.settings-menu')?.remove();

  const shell = createSettingsShell();
  if (profile) appendProfileIdentity(shell, profile);

  const toggle = shell.querySelector<HTMLButtonElement>('.settings-menu__toggle')!;
  const panel = shell.querySelector<HTMLElement>('.settings-menu__panel')!;
  const backdrop = shell.querySelector<HTMLElement>('.settings-menu__backdrop')!;
  const close = shell.querySelector<HTMLButtonElement>('.settings-menu__close')!;
  const mainMenu = shell.querySelector<HTMLButtonElement>(
    '.settings-menu__main-menu:not([data-career-save]):not([data-career-load])'
  )!;
  const save = shell.querySelector<HTMLButtonElement>('[data-career-save]')!;
  const load = shell.querySelector<HTMLButtonElement>('[data-career-load]')!;
  const saveStatus = shell.querySelector<HTMLElement>('[data-career-status]')!;
  const confirmation = createSettingsConfirmation(shell);
  const refreshCareerSave = (): void => {
    const reason = careerSaveBlockReason?.() ?? null;
    save.disabled = !onSaveCareer || reason !== null;
    saveStatus.textContent =
      reason ?? 'Speichern im ruhenden Orbit oder Hafen';
  };
  refreshCareerSave();
  load.disabled = !onLoadCareer;
  let detachAudio: (() => void) | null = null;
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
    if (!open && confirmation.isOpen()) confirmation.hide(false);
    if (open) {
      refreshCareerSave();
      detachAudio?.();
      detachAudio = bindSettingsAudio(audio, shell);
      close.focus();
    } else if (wasOpen) {
      const focusTarget = previouslyFocused?.isConnected ? previouslyFocused : toggle;
      previouslyFocused = null;
      focusTarget.focus();
    }
  };

  const onToggle = (): void => setOpen(panel.hidden);
  const onClose = (): void => setOpen(false);
  const onMainMenu = (): void =>
    confirmation.request(
      'ZUM HAUPTMENÜ?',
      'Der aktuelle Durchlauf wird beendet. Ungespeicherter Fortschritt geht verloren.',
      'ZUM HAUPTMENÜ',
      onReturnToMainMenu
    );
  const onSave = (): void => saveCareer(onSaveCareer, saveStatus);
  const onLoad = (): void => {
    if (!onLoadCareer) return;
    confirmation.request(
      'SPIELSTAND LADEN?',
      'Ungespeicherter Fortschritt geht verloren.',
      'SPIELSTAND LADEN',
      () => loadSavedCareer(onLoadCareer, saveStatus)
    );
  };
  const baseKeyHandler = createSettingsKeyHandler(panel, setOpen);
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!confirmation.handleKeyDown(event)) baseKeyHandler(event);
  };
  toggle.addEventListener('click', onToggle);
  backdrop.addEventListener('click', onClose);
  close.addEventListener('click', onClose);
  mainMenu.addEventListener('click', onMainMenu);
  save.addEventListener('click', onSave);
  load.addEventListener('click', onLoad);
  window.addEventListener('keydown', onKeyDown, true);

  setOpen(false);

  return {
    destroy() {
      detachAudio?.();
      toggle.removeEventListener('click', onToggle);
      backdrop.removeEventListener('click', onClose);
      close.removeEventListener('click', onClose);
      mainMenu.removeEventListener('click', onMainMenu);
      save.removeEventListener('click', onSave);
      load.removeEventListener('click', onLoad);
      window.removeEventListener('keydown', onKeyDown, true);
      confirmation.destroy();
      shell.remove();
      document.body.classList.remove('app-has-system-bar');
    },
  };
}
