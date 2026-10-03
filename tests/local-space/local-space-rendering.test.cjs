'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const renderer = fs.readFileSync(
  path.join(root, 'src/ui/local-space/local-space-renderer.ts'),
  'utf8'
);
const effects = fs.readFileSync(
  path.join(root, 'src/ui/local-space/mining-effects-renderer.ts'),
  'utf8'
);
const projector = fs.readFileSync(
  path.join(root, 'src/ui/ships/ship-hardpoint-projector.ts'),
  'utf8'
);
const engines = fs.readFileSync(
  path.join(root, 'src/ui/ships/ship-engine-effects-renderer.ts'),
  'utf8'
);
const maneuvers = fs.readFileSync(
  path.join(root, 'src/ui/ships/ship-maneuver-effects-renderer.ts'),
  'utf8'
);
const hardpointDebug = fs.readFileSync(
  path.join(root, 'src/ui/ships/ship-hardpoint-debug-renderer.ts'),
  'utf8'
);
const input = fs.readFileSync(path.join(root, 'src/ui/local-space/local-space-input.ts'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src/ui/local-space/local-space-panel.ts'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');
const systemLog = fs.readFileSync(
  path.join(root, 'src/ui/local-space/local-space-system-log.ts'),
  'utf8'
);
const stationKeeping = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-station-keeping.ts'),
  'utf8'
);
const shieldImpact = fs.readFileSync(
  path.join(root, 'src/ui/ships/shield-impact-renderer.ts'),
  'utf8'
);

assert(renderer.includes('MiningEffectsRenderer'), 'mining VFX must be split from scene renderer');
assert(
  renderer.includes('this.camera.zoomAt(3'),
  'larger local space must preserve the previous initial visual scale'
);
assert(
  renderer.includes('SpaceBackgroundRenderer'),
  'local mining must use shared parallax background'
);
assert(renderer.includes('ShipEngineEffectsRenderer'), 'engine VFX must use shared renderer');
assert(renderer.includes('ShipManeuverEffectsRenderer'), 'local space must render RCS effects');
assert(
  renderer.includes('ShipHardpointDebugRenderer'),
  'local space must support visible hardpoint calibration'
);
assert(
  renderer.includes('toggleHardpointDebug'),
  'local renderer must expose hardpoint debug toggling'
);
assert(input.includes("event.key.toLowerCase() === 'h'"), 'H must toggle hardpoint calibration');
assert(hardpointDebug.includes("label: 'PIVOT'"), 'debug overlay must mark the ship pivot');
assert(hardpointDebug.includes('source.miningLasers'), 'debug overlay must mark mining lasers');
assert(hardpointDebug.includes('source.engines'), 'debug overlay must mark main engines');
assert(
  shieldImpact.includes('projectShieldGeometry'),
  'shield impacts must use shared ship projection'
);
assert(renderer.includes('spriteDrawOffset'), 'ship sprite must use shared pivot projection');
assert(renderer.includes("asteroid.kind === 'debris'"), 'renderer must distinguish small debris');
assert(
  renderer.includes("asteroid.kind === 'resource'"),
  'only resource asteroids should be selectable'
);
assert(
  renderer.includes('camera.scale(this.model.ship.nominalLengthMeters)'),
  'local ship visuals must use world scale'
);
assert(projector.includes('projectHardpoint'), 'shared projector must expose hardpoint projection');
assert(
  projector.includes('projectShieldGeometry'),
  'shared projector must expose shield projection'
);
assert(engines.includes('projectHardpoint'), 'engine effects must use shared hardpoint projection');
assert(engines.includes('fastPulse'), 'engine thrust must include subtle flicker');
assert(
  engines.includes('0.58 + normalizedIntensity * 0.92'),
  'main engine exhaust must remain compact'
);
assert(maneuvers.includes('torqueSign'), 'RCS selection must derive from thruster torque');
assert(
  maneuvers.includes('demand.angularThrust'),
  'RCS turn selection must follow commanded angular thrust'
);
assert(maneuvers.includes('shouldBurst'), 'small RCS corrections must fire in bursts');
assert(
  stationKeeping.includes('Math.max(-0.8, Math.min(0.8, state.lateralVelocity))'),
  'idle station keeping must allow visible low-speed drift before correcting'
);
assert(maneuvers.includes('rgba(213, 244, 255'), 'RCS exhaust must use a white-blue core');
assert(effects.includes('projectHardpoint'), 'mining lasers must use shared hardpoint projection');
assert(effects.includes('model.miningImpact'), 'mining VFX must use simulation impact point');
assert(!effects.includes('surfaceImpactPoint'), 'renderer must not invent its own mining impact');
assert(effects.includes('Math.sin(timeSeconds * 13)'), 'mining laser must pulse over time');
assert(effects.includes('drawImpactSparks'), 'mining impact must render sparks');
assert(effects.includes('drawImpactDust'), 'mining impact must render transparent dust');
assert(effects.includes('drawTractorFields'), 'mining effects must render tractor collection');
assert(effects.includes('rgba(54, 229, 117'), 'tractor field must use green pulse rendering');
assert(panel.includes('ABBRECHEN'), 'active mining must provide a cancel action');
assert(
  panel.includes('selected.isMiningTarget'),
  'selected alternate asteroids must remain mineable'
);
assert(
  renderer.includes('ShieldImpactRenderer'),
  'local space must render localized shield impacts'
);
assert(
  shieldImpact.includes('impactAngle - spread'),
  'shield impact must illuminate only a local ellipse arc'
);
assert(
  shieldImpact.includes('drawLightning'),
  'strong shield hits must support local blue-white arcs'
);
assert(panel.includes('createLocalSpaceSystemLog'), 'local space must expose a retro system log');
assert(
  panel.includes("systemLog.write('NAV > ROUTENBERECHNUNG...')"),
  'route calculation must be visible in the system log'
);
assert(
  panel.includes("'SCHILD-INTEGRITÄT ' + shieldPercent + ' %'"),
  'shield integrity changes must be logged'
);
assert(systemLog.includes('MAX_LOG_LINES = 8'), 'system log must keep a bounded history');
assert(
  systemLog.includes('local-system-log-line'),
  'system log must render individual terminal lines'
);
assert(controller.includes('onCancelMining'), 'app controller must wire mining cancellation');

console.log('PASS shared ship projection, engine, mining impact and local rendering contract');
