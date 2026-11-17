'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const audio = read('src/systems/audio/game-audio-service.ts');
const bursts = read('src/systems/ships/ship-maneuver-thrusters.ts');
const visual = read('src/ui/ships/ship-maneuver-effects-renderer.ts');
const controller = read('src/app/game-controller.ts');
const sceneTick = read('src/app/game-controller-scene-tick.ts');
const salvage = read('src/app/game-controller-salvage.ts');
const settings = read('src/ui/settings/settings-menu.ts');
const duel = read('src/ui/start/duel-lobby.ts');
const styles = read('src/ui/styles.css');
const settingsCall = controller.match(/createSettingsMenu\([^;]+\);/s)?.[0] ?? '';

const rcsPath = path.join(root, 'public/audio/spacecraft-rcs-thruster-burst.ogg');
if (fs.existsSync(rcsPath)) {
  const rcs = fs.readFileSync(rcsPath);
  assert.equal(rcs.subarray(0, 4).toString('ascii'), 'OggS');
}

assert(
  audio.includes('AMBIENCE_CHUNK_URLS') &&
    audio.includes('ambience.loop = true') &&
    audio.includes("window.addEventListener('pointerdown', unlock") &&
    audio.includes("window.addEventListener('keydown', unlock"),
  'optional deep-space ambience must loop and unlock after the first browser user gesture'
);

assert(
  bursts.includes('activeManeuverThrusterBursts') &&
    visual.includes('activeManeuverThrusterBursts') &&
    audio.includes('activeManeuverThrusterBursts'),
  'RCS visual and audio must use the same burst decision function'
);

assert(
  audio.includes('longitudinalManeuverDemand(state.speed)') &&
    audio.includes('!activeThrusters.has(burst.id)') &&
    audio.includes('RCS_RETRIGGER_SECONDS'),
  'RCS audio must fire on burst onset without frame-by-frame audio spam'
);

assert(
  controller.includes('tickControllerScene(context, deltaSeconds)') &&
    sceneTick.includes('context.audio.updatePlayerRcs') &&
    salvage.includes('options.audio.updatePlayerRcs'),
  'player RCS audio must run in mining/local and salvage spaces'
);

assert(
  audio.includes('getSettings(): GameAudioSettings') &&
    audio.includes('setAmbienceVolume(volume: number)') &&
    audio.includes('setRcsVolume(volume: number)') &&
    audio.includes('localStorage.setItem'),
  'audio volume settings must be adjustable and persist in browser storage'
);

assert(
  settingsCall.includes('context.audio') &&
    settingsCall.includes('options.onReturnToMainMenu') &&
    settingsCall.includes('state.playerProfile') &&
    settings.includes('EINSTELLUNGEN') &&
    settings.includes('data-audio-volume="ambience"') &&
    settings.includes('data-audio-volume="rcs"') &&
    settings.includes('settings-menu__main-menu') &&
    settings.includes('settings-menu__backdrop') &&
    settings.includes('settings-menu__chrome') &&
    settings.includes("document.body.classList.add('app-has-system-bar')") &&
    settings.includes('aria-modal="true"') &&
    settings.includes("event.key === 'Escape'") &&
    settings.includes("event.key !== 'Tab'") &&
    settings.includes("backdrop.addEventListener('click', onClose)") &&
    settings.includes('confirmation.request(') &&
    settings.includes('onReturnToMainMenu'),
  'general settings menu must expose audio controls and a main-menu return action'
);

assert(
  duel.includes('createSettingsMenu(audio, onBack)') &&
    duel.includes('settingsMenu.destroy()') &&
    styles.includes('.settings-menu__chrome') &&
    styles.includes('body.app-has-system-bar #app') &&
    !styles.includes('body:has(.local-space-shell) .settings-menu'),
  'duels and campaign must share one scene-independent system console'
);

assert(
  settings.includes('data-career-save') &&
    settings.includes('data-career-status') &&
    settings.includes('settings-menu__main-menu:not([data-career-save])'),
  'settings console must expose a separate Career save action without hijacking main menu'
);

console.log('PASS bundled ambience loop, RCS audio and settings menu wiring');
