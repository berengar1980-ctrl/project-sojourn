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
const salvage = read('src/app/game-controller-salvage.ts');
const settingsPanel = read('src/ui/settings/audio-settings-panel.ts');
const styles = read('src/ui/styles.css');

const rcs = fs.readFileSync(
  path.join(root, 'resources/audio/spacecraft-rcs-thruster-burst.ogg')
);

assert.equal(
  rcs.subarray(0, 4).toString('ascii'),
  'OggS',
  'bundled RCS burst must be a valid Ogg stream'
);

assert(
  audio.includes('AMBIENCE_CHUNK_URLS') &&
    audio.includes('ambience.loop = true') &&
    audio.includes("window.addEventListener('pointerdown', unlock") &&
    audio.includes("window.addEventListener('keydown', unlock"),
  'chunked deep-space ambience must loop and unlock after the first browser user gesture'
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
  controller.includes('context.audio.updatePlayerRcs') &&
    salvage.includes('options.audio.updatePlayerRcs'),
  'player RCS audio must run in mining/local and salvage spaces'
);

assert(
  audio.includes("AUDIO_SETTINGS_STORAGE_KEY = 'sojourn.audio-settings.v1'") &&
    audio.includes('getSettings(): GameAudioSettings') &&
    audio.includes('setAmbienceVolume(volume: number)') &&
    audio.includes('setRcsVolume(volume: number)') &&
    audio.includes('window.localStorage.setItem'),
  'audio volumes must be adjustable at runtime and persisted locally'
);

assert(
  controller.includes('createAudioSettingsPanel(context.audio)') &&
    settingsPanel.includes('UMGEBUNGSSOUND') &&
    settingsPanel.includes('RCS-SOUND') &&
    settingsPanel.includes('data-audio-slider="ambience"') &&
    settingsPanel.includes('data-audio-slider="rcs"') &&
    styles.includes('.audio-settings__panel'),
  'global settings menu must expose separate ambience and RCS volume sliders'
);

console.log('PASS bundled ambience, synchronized RCS bursts and persistent audio settings');
