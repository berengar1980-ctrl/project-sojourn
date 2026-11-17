import type { LocalShipState } from '../../core/local-space-types';
import type { ShipHardpoints } from '../../core/ship-types';
import {
  activeManeuverThrusterBursts,
  longitudinalManeuverDemand,
  type ManeuverDemand,
} from '../ships/ship-maneuver-thrusters';

// Optional files can be installed later without rebuilding the audio system.
// Missing or invalid assets leave the respective channel silent.
const AMBIENCE_URL = '/audio/deep-space.ogg';
const RCS_BURST_URL = '/audio/spacecraft-rcs-thruster-burst.ogg';

const DEFAULT_AMBIENCE_VOLUME = 0.22;
const DEFAULT_RCS_VOLUME = 0.46;
const AUDIO_SETTINGS_STORAGE_KEY = 'sojourn.audio-settings.v1';
const RCS_POOL_SIZE = 4;
const RCS_RETRIGGER_SECONDS = 0.12;

export interface GameAudioSettings {
  readonly ambienceVolume: number;
  readonly rcsVolume: number;
}

export interface GameAudioService {
  getSettings(): GameAudioSettings;
  setAmbienceVolume(volume: number): void;
  setRcsVolume(volume: number): void;
  updatePlayerRcs(
    hardpoints: ShipHardpoints,
    state: Pick<
      LocalShipState,
      'speed' | 'turnRateRadiansPerSecond' | 'angularThrust' | 'lateralThrust'
    >,
    timeSeconds: number
  ): void;
  clearPlayerRcs(): void;
  destroy(): void;
}

function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function loadStoredSettings(): GameAudioSettings {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY) ?? '{}') as {
      ambienceVolume?: unknown;
      rcsVolume?: unknown;
    };
    return {
      ambienceVolume:
        typeof parsed.ambienceVolume === 'number'
          ? clampVolume(parsed.ambienceVolume)
          : DEFAULT_AMBIENCE_VOLUME,
      rcsVolume:
        typeof parsed.rcsVolume === 'number' ? clampVolume(parsed.rcsVolume) : DEFAULT_RCS_VOLUME,
    };
  } catch {
    return {
      ambienceVolume: DEFAULT_AMBIENCE_VOLUME,
      rcsVolume: DEFAULT_RCS_VOLUME,
    };
  }
}

function storeSettings(settings: GameAudioSettings): void {
  try {
    window.localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Audio remains usable when browser storage is unavailable.
  }
}

function createAudio(url: string, volume: number): HTMLAudioElement {
  const audio = new Audio(url);
  audio.preload = 'auto';
  audio.volume = volume;
  return audio;
}

async function loadOptionalOgg(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.arrayBuffer();
    const header = new Uint8Array(data, 0, Math.min(data.byteLength, 4));
    // Vite may return index.html for a missing public file: reject non-Ogg data.
    if (header.length < 4 || String.fromCharCode(...header) !== 'OggS') return null;
    return URL.createObjectURL(new Blob([data], { type: 'audio/ogg' }));
  } catch {
    return null;
  }
}

export function createGameAudioService(): GameAudioService {
  let settings = loadStoredSettings();
  const ambience = createAudio('', settings.ambienceVolume);
  ambience.loop = true;

  const rcsPool = Array.from({ length: RCS_POOL_SIZE }, () =>
    createAudio('', settings.rcsVolume)
  );
  let ambienceObjectUrl: string | null = null;
  let rcsObjectUrl: string | null = null;
  let rcsPoolIndex = 0;
  let activeThrusters = new Set<string>();
  let lastRcsPlaySeconds = Number.NEGATIVE_INFINITY;
  let unlocked = false;
  let destroyed = false;

  const playAmbience = (): void => {
    if (destroyed || !unlocked || !ambience.src || !ambience.paused) return;
    void ambience.play().catch(() => {
      // Browsers may reject autoplay until the next user gesture.
    });
  };

  void loadOptionalOgg(AMBIENCE_URL).then((url) => {
    if (!url) return;
    if (destroyed) {
      URL.revokeObjectURL(url);
      return;
    }
    ambienceObjectUrl = url;
    ambience.src = url;
    playAmbience();
  });

  void loadOptionalOgg(RCS_BURST_URL).then((url) => {
    if (!url) return;
    if (destroyed) {
      URL.revokeObjectURL(url);
      return;
    }
    rcsObjectUrl = url;
    for (const audio of rcsPool) audio.src = url;
  });

  const unlock = (): void => {
    if (destroyed) return;
    unlocked = true;
    playAmbience();
  };

  const playRcsBurst = (intensity: number, timeSeconds: number): void => {
    if (!unlocked || !rcsObjectUrl || timeSeconds - lastRcsPlaySeconds < RCS_RETRIGGER_SECONDS) {
      return;
    }
    lastRcsPlaySeconds = timeSeconds;

    const audio = rcsPool[rcsPoolIndex]!;
    rcsPoolIndex = (rcsPoolIndex + 1) % rcsPool.length;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = Math.min(1, settings.rcsVolume * (0.7 + intensity * 0.3));
    void audio.play().catch(() => {
      // A future user gesture will unlock playback if the browser blocked this attempt.
    });
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  return {
    getSettings() {
      return { ...settings };
    },

    setAmbienceVolume(volume) {
      settings = { ...settings, ambienceVolume: clampVolume(volume) };
      ambience.volume = settings.ambienceVolume;
      storeSettings(settings);
    },

    setRcsVolume(volume) {
      settings = { ...settings, rcsVolume: clampVolume(volume) };
      for (const audio of rcsPool) audio.volume = settings.rcsVolume;
      storeSettings(settings);
    },

    updatePlayerRcs(hardpoints, state, timeSeconds) {
      playAmbience();
      const demand: ManeuverDemand = {
        turnRateRadiansPerSecond: state.turnRateRadiansPerSecond,
        angularThrust: state.angularThrust,
        lateralThrust: state.lateralThrust,
        longitudinalThrust: longitudinalManeuverDemand(state.speed),
      };
      const bursts = activeManeuverThrusterBursts(hardpoints, demand, timeSeconds);
      const next = new Set(bursts.map((burst) => burst.id));
      const started = bursts.filter((burst) => !activeThrusters.has(burst.id));
      if (started.length > 0) {
        playRcsBurst(Math.max(...started.map((burst) => burst.intensity)), timeSeconds);
      }
      activeThrusters = next;
    },

    clearPlayerRcs() {
      activeThrusters = new Set();
      playAmbience();
    },

    destroy() {
      destroyed = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      ambience.pause();
      ambience.removeAttribute('src');
      if (ambienceObjectUrl) URL.revokeObjectURL(ambienceObjectUrl);
      for (const audio of rcsPool) {
        audio.pause();
        audio.removeAttribute('src');
      }
      if (rcsObjectUrl) URL.revokeObjectURL(rcsObjectUrl);
      activeThrusters.clear();
    },
  };
}
