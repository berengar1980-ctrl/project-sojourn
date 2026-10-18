'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const source = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const scene = source('src/app/game-controller-salvage.ts');
const callbacks = source('src/app/game-controller-events.ts');
const rights = source('src/systems/salvage/distress-salvage-rights.ts');
const panel = source('src/ui/salvage/salvage-space-panel.ts');
const eventControls = source('src/ui/salvage/salvage-sector-event.ts');
const miningPanel = source('src/ui/local-space/mining-event-panel.ts');
const miningView = source('src/ui/local-space/local-space-panel-view.ts');
const styles = source('src/ui/styles.css');

assert(scene.includes('updateSectorEvent(event)'));
assert(scene.includes('grantDistressSalvageRights(context.field, event)'));
assert(scene.includes('state.activeSectorEvent.salvageRights'));
assert(
  rights.includes('...current'),
  'existing wreck position and motion must survive loot unlock'
);
assert(!callbacks.includes('actions.mountSalvage(true)'));
assert(callbacks.includes('state.salvageScene?.updateSectorEvent(event)'));
assert(eventControls.includes('GREIFHAKEN AUSSER REICHWEITE'));
assert(eventControls.includes('distressTowWithinRange(model.ship.position, wreck.position)'));
assert(
  panel.includes("model.sectorEvent?.distressStage !== 'approach'"),
  'completed diagnosis must refresh action buttons without recreating the scene'
);
assert(miningPanel.includes('renderRecovery(options.container, result, null)'));
assert(miningPanel.includes('recoverySeconds > 0'));
assert(miningPanel.includes("activity.setAttribute('aria-hidden', 'true')"));
assert(
  miningView.includes('miningEventPanel.update(model.miningEvent, model.miningRecoverySeconds)')
);
assert(styles.includes('@keyframes mining-decision-processing'));
console.log('PASS rescue scene continuity, tow range UI, and mining processing feedback');
