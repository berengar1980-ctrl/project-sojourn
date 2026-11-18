'use strict';

const { readModuleSource } = require('../module-source.cjs');

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const renderer = readModuleSource(root, 'src/ui/local-space/local-space-renderer.ts');
const fieldThrust = readModuleSource(root, 'src/ui/combat/embedded-combat-thrusters.ts');
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
const maneuverSelection = fs.readFileSync(
  path.join(root, 'src/systems/ships/ship-maneuver-thrusters.ts'),
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
const panel = readModuleSource(root, 'src/ui/local-space/local-space-panel.ts');
const operationsHud = fs.readFileSync(
  path.join(root, 'src/ui/local-operations/local-operations-hud.ts'),
  'utf8'
);
const scanEffects = fs.readFileSync(
  path.join(root, 'src/ui/local-operations/scan-effects.ts'),
  'utf8'
);
const controller = readModuleSource(root, 'src/app/game-controller.ts');
const fieldBridge = readModuleSource(root, 'src/app/game-controller-field-world-bridge.ts');
const sceneTick = readModuleSource(root, 'src/app/game-controller-scene-tick.ts');
const localActions = readModuleSource(root, 'src/app/game-controller-local-actions.ts');
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
const stationKeeping = readModuleSource(
  root,
  'src/systems/local-space/local-space-station-keeping.ts'
);
const shieldImpact = fs.readFileSync(
  path.join(root, 'src/ui/ships/shield-impact-renderer.ts'),
  'utf8'
);
const shipLighting = fs.readFileSync(
  path.join(root, 'src/ui/ships/ship-lighting-renderer.ts'),
  'utf8'
);
const spaceBodyRenderer = fs.readFileSync(
  path.join(root, 'src/ui/space/procedural-space-body-renderer.ts'),
  'utf8'
);
const surfaceTextures = fs.readFileSync(
  path.join(root, 'src/ui/space/procedural-surface-textures.ts'),
  'utf8'
);

assert(renderer.includes('MiningEffectsRenderer'), 'mining VFX must be split from scene renderer');
assert(renderer.includes('drawNpcShips'), 'local space must render physical NPC miners');
assert(
  renderer.includes('drawNpcMinerScan'),
  'NPC miners must visibly scan their asteroid before starting extraction'
);
assert(
  renderer.includes('drawNpcMiningBeam'),
  'working NPC miners must visibly fire a mining beam at their target asteroid'
);
assert(
  renderer.includes('drawFieldNpcThrusters(') &&
    fieldThrust.includes('if (speed <= 1) return;') &&
    fieldThrust.includes('engineRenderer.draw('),
  'arriving and departing NPC miners must show engine thrust instead of popping in place'
);
assert(
  renderer.includes('new PvPMapCamera(model.width, model.height)'),
  'local map must use the same PvP camera'
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
assert(
  shipLighting.includes('alpha(0.34)') && shipLighting.includes('base * strength'),
  'ship shadow pass must remain directional without overpowering the sprite'
);
assert(
  shipLighting.includes("return 'saturate(.92) contrast(.94)';"),
  'near ship rendering must preserve the shared softened appearance'
);
assert(
  shipLighting.includes('if (width < 42) return 0.68;') &&
    shipLighting.includes("return 'saturate(.72) contrast(.8)';"),
  'small ship sprites must merge fine details through a cheaper far LOD'
);
assert(
  shipLighting.includes("imageSmoothingQuality = 'high'"),
  'ship LOD resampling must use high-quality image smoothing'
);
assert(
  spaceBodyRenderer.includes("if (radius < 15) return 'far';") &&
    spaceBodyRenderer.includes("if (radius > 60) return 'near';"),
  'asteroid LOD must depend on actual screen radius'
);
assert(
  spaceBodyRenderer.includes("if (detail === 'near') this.drawStaticMicroRelief") &&
    surfaceTextures.includes("detail === 'near' ? 10.5"),
  'near asteroids must add cached high-frequency surface detail'
);
assert(
  surfaceTextures.includes("kind === 'debris' ? 160 : 320"),
  'near asteroid textures must use a higher cached resolution'
);
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
  maneuvers.includes('ShipEffectLayer') &&
    maneuvers.includes("(thruster.layer ?? 'below') !== layer"),
  'RCS effects must respect per-hardpoint above/below rendering'
);
assert(
  thrusterGlow.includes("globalCompositeOperation = 'lighter'"),
  'thruster light must use additive glow'
);
assert(thrusterGlow.includes('options.flicker'), 'thruster glow must respond to flicker');
const sharedThrustBehind = renderer.includes("drawThrusters('below')");
const sharedThrustAbove = renderer.includes("drawThrusters('above')");
const operationalEngine = fieldThrust.includes('engineRenderer.draw(');
const operationalRcs = fieldThrust.includes('maneuverRenderer.draw(');
assert(sharedThrustBehind && operationalEngine, 'engine exhaust must render behind the ship');
assert(
  sharedThrustAbove && operationalEngine && engines.includes('this.drawGlow('),
  'engine glow must render after the ship sprite'
);
assert(
  sharedThrustAbove && operationalRcs && maneuvers.includes('this.drawGlow('),
  'RCS glow must render after the ship sprite'
);
assert(engines.includes('engineFlicker'), 'engine thrust must use shared visible flicker');
assert(
  engines.includes('0.58 + normalizedIntensity * 0.92'),
  'main engine exhaust must remain compact'
);
assert(maneuverSelection.includes('torqueSign'), 'RCS selection must derive from thruster torque');
assert(
  maneuverSelection.includes('demand.angularThrust'),
  'RCS turn selection must follow commanded angular thrust'
);
assert(maneuverSelection.includes('shouldBurst'), 'small RCS corrections must fire in bursts');
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
assert(
  effects.includes('source.tractorBeams') || effects.includes('hardpoints.tractorBeams'),
  'tractor collection must originate from configured ship hardpoints'
);
assert(
  effects.includes("(hardpoint.layer ?? 'below') === layer"),
  'mining and tractor effects must support above/below ship layers'
);
const miningVisuals = fs.readFileSync(
  path.join(root, 'src/ui/local-space/mining-beam-visuals.ts'),
  'utf8'
);
assert(
  effects.includes('drawMiningTractorBeam(') &&
    miningVisuals.includes('rgba(54, 229, 117'),
  'tractor field must use the shared green pulse rendering'
);
assert(operationsHud.includes('VORGANG ABBRECHEN'), 'active mining must provide a cancel action');
assert(operationsHud.includes('FERNBEREICHSSCAN'), 'local UI must expose long-range scanning');
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
  panel.includes('shortRangeScanProgress'),
  'close-range scan progress must be visible in the local status UI'
);
assert(
  renderer.includes('drawShortRangeScan') &&
    renderer.includes('drawTargetDetailScan') &&
    scanEffects.includes('const sweepY') &&
    scanEffects.includes('context.clip()'),
  'close-range scan must visibly sweep across the moving target asteroid'
);
assert(
  operationsHud.includes('SCAN-DATEN AN') && operationsHud.includes('SCAN-DATEN AUS'),
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
  renderer.includes('drawScanCallout') &&
    renderer.includes("deposit.resourceName?.toUpperCase() ?? '???'"),
  'surveyed asteroids must keep unknown deposits as question marks while showing mined samples'
);
assert(
  viewModel.includes('analyzed || deposit.identified'),
  'a mined deposit name must be revealed independently from full asteroid analysis'
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
  styles.includes('system-log-text-jitter') && styles.includes('system-log-glitch-band'),
  'system log content must visibly jitter and glitch continuously'
);
assert(
  !styles.includes('animation: system-log-crt-flicker'),
  'system log frame itself must remain stationary'
);
assert(
  styles.includes('.system-log--activity .system-log-lines'),
  'fresh log activity must jolt only the log content'
);
assert(
  controller.includes('createLocalPanelActions') && localActions.includes('onCancelMining'),
  'app controller must wire mining cancellation'
);
assert(
  controller.includes('advanceControllerFieldWorld(context, deltaSeconds)') &&
    fieldBridge.includes('field.miners.tick(seconds, activeCombat?.defender.id)') &&
    fieldBridge.includes('tickFieldPirates(context, seconds, field, activeCombat?.defender.id)') &&
    fieldBridge.includes('tickFieldSecurity(context, seconds, field)'),
  'campaign clock must advance shared miners, pirates and security even without a local scene'
);
assert(
  !sceneTick.includes('state.localNpcMining?.tick(') &&
    !sceneTick.includes('tickFieldPirates(') &&
    !sceneTick.includes('tickFieldSecurity('),
  'scene rendering must not advance NPC traffic a second time'
);

console.log('PASS shared ship projection, engine, mining impact and local rendering contract');
