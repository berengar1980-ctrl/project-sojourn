import type { GameAudioService } from '../../systems/audio/game-audio-service';

export interface AudioSettingsPanel {
  destroy(): void;
}

function percent(value: number): string {
  return Math.round(value * 100) + '%';
}

export function createAudioSettingsPanel(audio: GameAudioService): AudioSettingsPanel {
  document.querySelector('.audio-settings')?.remove();
  const shell = document.createElement('div');
  shell.className = 'audio-settings';
  shell.innerHTML = `
    <button class="audio-settings__toggle" type="button" aria-label="Audio-Einstellungen" title="Audio-Einstellungen">
      AUDIO
    </button>
    <section class="audio-settings__panel" hidden aria-label="Audio-Einstellungen">
      <header>
        <strong>AUDIO</strong>
        <button class="audio-settings__close" type="button" aria-label="Schließen">×</button>
      </header>
      <label>
        <span>UMGEBUNG</span>
        <output data-audio-value="ambience"></output>
        <input data-audio-volume="ambience" type="range" min="0" max="100" step="1" />
      </label>
      <label>
        <span>RCS</span>
        <output data-audio-value="rcs"></output>
        <input data-audio-volume="rcs" type="range" min="0" max="100" step="1" />
      </label>
    </section>
  `;

  document.body.append(shell);

  const toggle = shell.querySelector<HTMLButtonElement>('.audio-settings__toggle')!;
  const panel = shell.querySelector<HTMLElement>('.audio-settings__panel')!;
  const close = shell.querySelector<HTMLButtonElement>('.audio-settings__close')!;
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

  ambience.addEventListener('input', onAmbience);
  rcs.addEventListener('input', onRcs);
  toggle.addEventListener('click', onToggle);
  close.addEventListener('click', onClose);

  sync();
  setOpen(false);

  return {
    destroy() {
      ambience.removeEventListener('input', onAmbience);
      rcs.removeEventListener('input', onRcs);
      toggle.removeEventListener('click', onToggle);
      close.removeEventListener('click', onClose);
      shell.remove();
    },
  };
}
