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
const thrusterGlow = fs.readFileSync(
  path.join(root, 'src/ui/ships/thruster-glow-renderer.ts'),
  'utf8'
);
const hardpointDebug = fs.readFileSync(
  path.join(root, 'src/ui/ships/ship-hardpoint-debug-renderer.ts'),
  'utf8'
);
const input = fs.readFileSync(path.join(root, 'src/ui/local-space/local-space-input.ts'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src/ui/local-space/local-space-panel.ts'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');
const viewModel = fs.readFileSync(
  path.join(root, 'src/features/local-space/local-space-view-model.ts'),
  'utf8'
);
const systemLogPanel = fs.readFileSync(
  path.join(root, 'src/ui/system-log/system-log-panel.ts'),
  'utf8'
);
const systemLogService = fs.readFileSync(
  path.join(root, 'src/systems/system-log/system-log-service.ts'),
  'utf8'
);
const styles = fs.readFileSync(path.join(root, 'src/ui/styles.css'), 'utf8');
const stationKeeping = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-station-keeping.ts'),
  'utf8'
);
const shieldImpact = fs.readFileSync(
  path.join(root, 'src/ui/ships/shield-impact-renderer.ts'),
  'utf8'
);
const shipLighting = fs.readFileSync(
  path.join(root, 'src/ui/ships/ship-lighting-renderer.ts'),
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
  renderer.includes('ShipLightingRenderer'),
  'local-space ship must use shared world lighting'
);
assert(
  renderer.includes('light: { x: -0.72, y: -0.56 }'),
  'ship and asteroids must share the same local light vector'
);
assert(shipLighting.includes('rgba(0,0,0,.58)'), 'ship shadow pass must be visibly directional');
assert(
  renderer.includes('ShipHardpointDebugRenderer'),
  'local space must support visible hardpoint calibration'
);
assert(
  renderer.includes('toggleHardpointDebug'),
  'local renderer must expose hardpoint debug toggling'
);
assert(input.includes("event.key.toLowerCase() === 'h'"), 'H must toggle hardpoint calibration');
assert(
  input.includes('renderer.worldPointAt'),
  'empty-space clicks must convert to world navigation targets'
);
assert(
  input.includes('if (asteroidId)'),
  'asteroid clicks must remain selection instead of navigation'
);
assert(panel.includes('onNavigate'), 'local-space panel must forward click-navigation requests');
assert(
  renderer.includes('drawNavigationRoute'),
  'local-space renderer must show the active click route'
);
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
  renderer.includes('point.x < -cullPadding'),
  'offscreen asteroids must be culled before rendering'
);
assert(renderer.includes('point.x < -8 || point.y < -8'), 'offscreen mining chunks must be culled');
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
assert(engines.includes('ThrusterGlowRenderer'), 'main engines must use shared nozzle glow');
assert(maneuvers.includes('ThrusterGlowRenderer'), 'RCS thrusters must use shared nozzle glow');
assert(
  thrusterGlow.includes("globalCompositeOperation = 'lighter'"),
  'thruster light must use additive glow'
);
assert(thrusterGlow.includes('options.flicker'), 'thruster glow must respond to flicker');
assert(
  renderer.includes('engineEffects.drawExhaust'),
  'engine exhaust must render behind the ship'
);
assert(
  renderer.includes('engineEffects.drawGlow'),
  'engine glow must render after the ship sprite'
);
assert(renderer.includes('maneuverEffects.drawGlow'), 'RCS glow must render after the ship sprite');
assert(engines.includes('engineFlicker'), 'engine thrust must use shared visible flicker');
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
assert(panel.includes('LANGREICHWEITENSCAN'), 'local UI must expose long-range scanning');
assert(
  renderer.includes('drawLongRangeScan'),
  'long-range scan must have a visible expanding wave'
);
assert(
  panel.includes('longRangeScanProgress'),
  'long-range scan progress must be visible in local UI'
);
assert(panel.includes('REDUZIERTER SICHERHEIT'), 'risky click routes must show a warning');
assert(panel.includes('NAHBEREICHSSCAN'), 'selected asteroids must expose close scanning');
assert(
  panel.includes('SCAN-DATEN AN') && panel.includes('SCAN-DATEN AUS'),
  'local UI must expose a scan-callout visibility toggle'
);
assert(
  panel.includes('FRACHT // CONTAINER') && panel.includes('renderCargo'),
  'local UI must show a per-resource cargo manifest'
);
assert(
  panel.includes('GESCHÄTZT ~'),
  'close scan details must report estimated rather than exact resource quantity'
);
assert(
  viewModel.includes('miningResourceById(entry.resourceId)'),
  'cargo labels must resolve stable resource ids through the resource catalog'
);
assert(
  viewModel.includes('deposits: readonly LocalAsteroidDepositView[]'),
  'view model must expose multiple asteroid deposits'
);
assert(
  viewModel.includes('estimatedAmount'),
  'view model must expose live estimated remaining quantity per deposit'
);
assert(
  renderer.includes('drawScanMarker'),
  'surveyed asteroids must be visibly distinguishable in local space'
);
assert(
  renderer.includes('drawScanCallout') && renderer.includes("map(() => '???')"),
  'surveyed asteroids must render one unknown callout line per deposit'
);
assert(
  renderer.includes('startX + 10') && renderer.includes('startY - 10'),
  'scan callout leader must use a short diagonal offset'
);
assert(renderer.includes('setScanLabelsVisible'), 'scan callouts must support visibility toggling');
assert(
  renderer.includes('deposit.estimatedAmount'),
  'analyzed scan callouts must show the current estimated quantity for each deposit'
);
assert(
  renderer.includes("asteroid.surveyResult === 'empty'"),
  'scan markers must distinguish empty asteroids from deposits'
);
assert(
  panel.includes('selected.isMiningTarget'),
  'selected alternate asteroids must remain mineable'
);
assert(
  renderer.includes('ShieldImpactRenderer'),
  'local space must render localized shield impacts'
);
assert(
  shieldImpact.includes('impact.surfaceAnchor.x * shield.radiusX'),
  'shield impact must stay anchored to ship-local shield coordinates'
);
assert(
  shieldImpact.includes('traceIrregularPatch'),
  'shield impact must spread as an irregular filled surface patch'
);
assert(
  shieldImpact.includes('clearRadius'),
  'shield impact transparency must recede outward from the impact point'
);
assert(
  !shieldImpact.includes('drawRipple'),
  'shield impact must not be rendered as a circular ripple line'
);
assert(
  shieldImpact.includes('context.clip()'),
  'shield impact must stay clipped to the projected shield ellipse'
);
assert(
  shieldImpact.includes('0.28 + impact.strength * 0.38'),
  'shield lightning must use thin lines'
);
assert(
  shieldImpact.includes('drawLightning'),
  'strong shield hits must support local blue-white arcs'
);
assert(panel.includes('createSystemLogPanel'), 'local space must use the shared retro system log');
assert(
  panel.includes("systemLog.write('NAV > ROUTENBERECHNUNG...')"),
  'route calculation must be visible in the system log'
);
assert(
  panel.includes("'SCHILD-INTEGRITÄT ' + currentShieldPercent + ' %'"),
  'shield integrity changes must be logged'
);
assert(systemLogPanel.includes('VISIBLE_LOG_LINES = 8'), 'system log must keep a bounded view');
assert(
  systemLogPanel.includes('system-log-line'),
  'shared system log must render individual terminal lines'
);
assert(
  systemLogService.includes('MAX_LOG_ENTRIES = 40'),
  'shared system log service must keep bounded cross-scene history'
);
assert(
  styles.includes('system-log-crt-flicker') &&
    styles.includes('system-log-text-jitter') &&
    styles.includes('system-log-glitch-band'),
  'system log must visibly flicker, jitter and glitch continuously'
);
assert(controller.includes('onCancelMining'), 'app controller must wire mining cancellation');

console.log('PASS shared ship projection, engine, mining impact and local rendering contract');
