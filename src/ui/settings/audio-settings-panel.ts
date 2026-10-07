import type { GameAudioService } from '../../systems/audio/game-audio-service';

export interface AudioSettingsPanel {
  destroy(): void;
}

function percent(value: number): string {
  return Math.round(value * 100) + '%';
}

export function createAudioSettingsPanel(audio: GameAudioService): AudioSettingsPanel {
  document.querySelector<HTMLElement>('.audio-settings')?.remove();

  const host = document.createElement('section');
  host.className = 'audio-settings';
  host.innerHTML = `
    <button class="audio-settings__toggle" type="button" aria-expanded="false" aria-label="Audioeinstellungen öffnen">
      AUDIO
    </button>
    <div class="audio-settings__panel" hidden>
      <div class="audio-settings__header">
        <div>
          <span>SETTINGS</span>
          <strong>AUDIO</strong>
        </div>
        <button class="audio-settings__close" type="button" aria-label="Audioeinstellungen schließen">×</button>
      </div>
      <label class="audio-settings__row">
        <span>UMGEBUNGSSOUND</span>
        <strong data-audio-value="ambience"></strong>
        <input data-audio-slider="ambience" type="range" min="0" max="100" step="1" />
      </label>
      <label class="audio-settings__row">
        <span>RCS-SOUND</span>
        <strong data-audio-value="rcs"></strong>
        <input data-audio-slider="rcs" type="range" min="0" max="100" step="1" />
      </label>
      <small>Die Lautstärken werden lokal gespeichert.</small>
    </div>
  `;

  document.body.append(host);

  const toggle = host.querySelector<HTMLButtonElement>('.audio-settings__toggle')!;
  const panel = host.querySelector<HTMLElement>('.audio-settings__panel')!;
  const close = host.querySelector<HTMLButtonElement>('.audio-settings__close')!;
  const ambience = host.querySelector<HTMLInputElement>('[data-audio-slider="ambience"]')!;
  const rcs = host.querySelector<HTMLInputElement>('[data-audio-slider="rcs"]')!;
  const ambienceValue = host.querySelector<HTMLElement>('[data-audio-value="ambience"]')!;
  const rcsValue = host.querySelector<HTMLElement>('[data-audio-value="rcs"]')!;

  const sync = (): void => {
    const settings = audio.getSettings();
    ambience.value = String(Math.round(settings.ambienceVolume * 100));
    rcs.value = String(Math.round(settings.rcsVolume * 100));
    ambienceValue.textContent = percent(settings.ambienceVolume);
    rcsValue.textContent = percent(settings.rcsVolume);
  };

  const setOpen = (open: boolean): void => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    host.classList.toggle('is-open', open);
  };

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false));
  ambience.addEventListener('input', () => {
    audio.setAmbienceVolume(Number(ambience.value) / 100);
    sync();
  });
  rcs.addEventListener('input', () => {
    audio.setRcsVolume(Number(rcs.value) / 100);
    sync();
  });

  sync();

  return {
    destroy() {
      host.remove();
    },
  };
}
