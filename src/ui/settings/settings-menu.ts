import type { GameAudioService } from '../../systems/audio/game-audio-service';

export interface SettingsMenu {
  destroy(): void;
}

function percent(value: number): string {
  return Math.round(value * 100) + '%';
}

export function createSettingsMenu(audio: GameAudioService): SettingsMenu {
  document.querySelector('.settings-menu')?.remove();

  const shell = document.createElement('div');
  shell.className = 'settings-menu';
  shell.innerHTML = `
    <button
      class="settings-menu__toggle"
      type="button"
      aria-label="Einstellungen"
      aria-expanded="false"
      title="Einstellungen"
    >
      SETTINGS
    </button>

    <section class="settings-menu__panel" hidden aria-label="Einstellungen">
      <header class="settings-menu__header">
        <div>
          <span>SOJOURN</span>
          <strong>EINSTELLUNGEN</strong>
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
          <span>WEITERE EINSTELLUNGEN</span>
          <small>Spielstand, Laden und Export werden hier später ergänzt.</small>
        </section>
      </div>
    </section>
  `;

  document.body.append(shell);

  const toggle = shell.querySelector<HTMLButtonElement>('.settings-menu__toggle')!;
  const panel = shell.querySelector<HTMLElement>('.settings-menu__panel')!;
  const close = shell.querySelector<HTMLButtonElement>('.settings-menu__close')!;
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

  const setOpen = (open: boolean): void => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) sync();
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
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false);
  };

  ambience.addEventListener('input', onAmbience);
  rcs.addEventListener('input', onRcs);
  toggle.addEventListener('click', onToggle);
  close.addEventListener('click', onClose);
  window.addEventListener('keydown', onKeyDown);

  sync();
  setOpen(false);

  return {
    destroy() {
      ambience.removeEventListener('input', onAmbience);
      rcs.removeEventListener('input', onRcs);
      toggle.removeEventListener('click', onToggle);
      close.removeEventListener('click', onClose);
      window.removeEventListener('keydown', onKeyDown);
      shell.remove();
    },
  };
}
