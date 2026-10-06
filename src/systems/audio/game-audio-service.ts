import ambience0 from '../../../resources/audio/base64/ambience-00.b64?raw';
import ambience1 from '../../../resources/audio/base64/ambience-01.b64?raw';
import rcsBurst from '../../../resources/audio/base64/rcs-burst.b64?raw';
import type { LocalShipState } from '../../core/local-space-types';
import type { ShipHardpoints } from '../../core/ship-types';
import {
  activeManeuverThrusterBursts,
  type ManeuverDemand,
} from '../ships/ship-maneuver-thrusters';

const AMBIENCE_BASE64 = [ambience0, ambience1] as const;
const RCS_BURST_BASE64 = [rcsBurst] as const;

function audioObjectUrl(chunks: readonly string[]): string {
  const encoded = chunks.join('').replace(/\s+/g, '');
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/ogg' }));
}

const AMBIENCE_VOLUME = 0.22;
const RCS_VOLUME = 0.46;
const RCS_POOL_SIZE = 4;
const RCS_RETRIGGER_SECONDS = 0.12;

export interface GameAudioService {
  updatePlayerRcs(
    hardpoints: ShipHardpoints,
    state: Pick<LocalShipState, 'turnRateRadiansPerSecond' | 'angularThrust' | 'lateralThrust'>,
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

export function createGameAudioService(): GameAudioService {
  const ambienceUrl = audioObjectUrl(AMBIENCE_BASE64);
  const rcsBurstUrl = audioObjectUrl(RCS_BURST_BASE64);
  const ambience = createAudio(ambienceUrl, AMBIENCE_VOLUME);
  ambience.loop = true;

  const rcsPool = Array.from({ length: RCS_POOL_SIZE }, () => createAudio(rcsBurstUrl, RCS_VOLUME));
  let rcsPoolIndex = 0;
  let activeThrusters = new Set<string>();
  let lastRcsPlaySeconds = Number.NEGATIVE_INFINITY;
  let unlocked = false;
  let destroyed = false;

  const playAmbience = (): void => {
    if (destroyed || !unlocked || !ambience.paused) return;
    void ambience.play().catch(() => {
      // Browsers may reject autoplay until the next user gesture.
    });
  };

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
      for (const audio of rcsPool) audio.pause();
      URL.revokeObjectURL(ambienceUrl);
      URL.revokeObjectURL(rcsBurstUrl);
      activeThrusters.clear();
    },
  };
}
