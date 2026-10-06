import type { LocalShipState } from '../../core/local-space-types';
import type { ShipHardpoints } from '../../core/ship-types';
import {
  activeManeuverThrusterBursts,
  longitudinalManeuverDemand,
  type ManeuverDemand,
} from '../ships/ship-maneuver-thrusters';

const AMBIENCE_CHUNK_URLS = [
  new URL('../../../resources/audio/ambience/deep-space-00.b64', import.meta.url).href,
  new URL('../../../resources/audio/ambience/deep-space-01.b64', import.meta.url).href,
  new URL('../../../resources/audio/ambience/deep-space-02.b64', import.meta.url).href,
  new URL('../../../resources/audio/ambience/deep-space-03.b64', import.meta.url).href,
  new URL('../../../resources/audio/ambience/deep-space-04.b64', import.meta.url).href,
] as const;

const RCS_BURST_URL = new URL(
  '../../../resources/audio/spacecraft-rcs-thruster-burst.ogg',
  import.meta.url
).href;

const AMBIENCE_VOLUME = 0.22;
const RCS_VOLUME = 0.46;
const RCS_POOL_SIZE = 4;
const RCS_RETRIGGER_SECONDS = 0.12;

export interface GameAudioService {
  updatePlayerRcs(
    hardpoints: ShipHardpoints,
    state: Pick<LocalShipState, 'speed' | 'turnRateRadiansPerSecond' | 'angularThrust' | 'lateralThrust'>,
    timeSeconds: number
  ): void;
  clearPlayerRcs(): void;
  destroy(): void;
}

function createAudio(url: string, volume: number): HTMLAudioElement {
  const audio = new Audio(url);
  audio.preload = 'auto';
  audio.volume = volume;
  return audio;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function loadChunkedAmbience(): Promise<string> {
  const chunks = await Promise.all(
    AMBIENCE_CHUNK_URLS.map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Unable to load deep-space ambience data: ' + response.status);
      }
      return (await response.text()).trim();
    })
  );
  const bytes = base64ToBytes(chunks.join(''));
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/ogg' }));
}

export function createGameAudioService(): GameAudioService {
  const ambience = createAudio('', AMBIENCE_VOLUME);
  ambience.loop = true;

  const rcsPool = Array.from(
    { length: RCS_POOL_SIZE },
    () => createAudio(RCS_BURST_URL, RCS_VOLUME)
  );
  let ambienceObjectUrl: string | null = null;
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

  void loadChunkedAmbience()
    .then((url) => {
      if (destroyed) {
        URL.revokeObjectURL(url);
        return;
      }
      ambienceObjectUrl = url;
      ambience.src = url;
      playAmbience();
    })
    .catch(() => {
      // RCS audio remains available even if the ambience asset cannot be loaded.
    });

  const unlock = (): void => {
    if (destroyed) return;
    unlocked = true;
    playAmbience();
  };

  const playRcsBurst = (intensity: number, timeSeconds: number): void => {
    if (!unlocked || timeSeconds - lastRcsPlaySeconds < RCS_RETRIGGER_SECONDS) return;
    lastRcsPlaySeconds = timeSeconds;

    const audio = rcsPool[rcsPoolIndex]!;
    rcsPoolIndex = (rcsPoolIndex + 1) % rcsPool.length;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = Math.min(0.62, RCS_VOLUME * (0.7 + intensity * 0.3));
    void audio.play().catch(() => {
      // A future user gesture will unlock playback if the browser blocked this attempt.
    });
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  return {
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
        playRcsBurst(
          Math.max(...started.map((burst) => burst.intensity)),
          timeSeconds
        );
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
      for (const audio of rcsPool) audio.pause();
      activeThrusters.clear();
    },
  };
}
