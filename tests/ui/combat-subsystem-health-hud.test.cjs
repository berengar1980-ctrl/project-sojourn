'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const panel = fs.readFileSync(
  path.join(root, 'src/ui/combat/fleet-native-combat-panel.ts'),
  'utf8'
);
const css = fs.readFileSync(path.join(root, 'src/ui/styles.css'), 'utf8');
assert(panel.includes('data-layer="engine"'), 'engine integrity bar is rendered');
assert(panel.includes('data-layer="tractor"'), 'tractor integrity bar is rendered');
assert(panel.includes('enginePercent'), 'engine integrity uses subsystem health percentage');
assert(panel.includes('tractorPercent'), 'tractor integrity uses subsystem health percentage');
assert(panel.includes('tractorRangeMeters > 0'), 'missing tractor marked unmounted');
assert(
  /playerHud.innerHTML = combatantHud\(\s*model\.attacker,\s*model\.elapsedSeconds,\s*display\.playerWeapons/.test(
    panel
  )
);
assert(
  /enemyHud.innerHTML = combatantHud\(\s*model\.defender,\s*model\.elapsedSeconds,\s*display\.enemyWeapons/.test(
    panel
  )
);
assert(css.includes('.combat-hud-bar--engine i'));
assert(css.includes('.combat-hud-bar--tractor i'));
console.log('PASS dual ship engine/tractor subsystem integrity HUD coverage');
