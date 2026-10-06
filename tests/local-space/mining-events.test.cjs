'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const events = loadStandaloneTypeScriptModule(
  root,
  'src/systems/local-space/mining-event-service.ts'
);

function asteroid(amount = 100) {
  return {
    id: 'asteroid-event-test',
    kind: 'resource',
    routeBlocking: true,
    position: { x: 0, y: 0 },
    radius: 40,
    rotation: 0,
    physics: {
      mass: 1000,
      centerOfMassOffset: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      angularVelocity: 0,
      momentOfInertia: 100,
    },
    deposits: [
      {
        resourceId: 'ferrite',
        oreType: 'Ferrit',
        oreRemaining: amount,
        oreCapacity: amount,
      },
    ],
    scanLevel: 'analyzed',
  };
}

function sequence(values) {
  let index = 0;
  return () => values[index++] ?? 0.1;
}

{
  const target = asteroid(100);
  const controller = events.createMiningEventController(
    7,
    sequence([0.78, 0.5, 0.1, 0.2, 0.6, 0.9, 0.4])
  );
  controller.begin(target);
  target.deposits[0].oreRemaining = 60;
  const event = controller.update(target);

  assert(event, 'scheduled event must interrupt live extraction after real deposit progress');
  assert.equal(event.type, 'rare');
  assert.equal(event.choices.length, 3);
  const result = controller.resolve(target, 'careful', () => 0);
  assert(result);
  assert(result.resultText.includes('Cyranthite'));
  assert(
    target.deposits.some((deposit) => deposit.resourceId === 'cyranthite'),
    'rare inclusion must become a real asteroid deposit'
  );
}

{
  const target = asteroid(100);
  const controller = events.createMiningEventController(9, sequence([0.1, 0.3, 0.9]));
  controller.begin(target);
  target.deposits[0].oreRemaining = 20;
  assert.equal(controller.update(target), null, 'unscheduled sessions must not fabricate events');
}

{
  const target = asteroid(80);
  const effect = {
    title: 'test',
    resultText: 'test',
    abort: false,
    cycleMultiplier: 1,
    recoverySeconds: 0,
    hullDamageFraction: 0,
    depositLossFraction: 0.25,
    bonusResourceId: null,
    bonusAmount: 0,
  };
  const result = events.applyMiningEventDepositEffects(target, effect);
  assert.equal(result.lostTons, 20);
  assert.equal(target.deposits[0].oreRemaining, 60);
}

const service = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-service.ts'),
  'utf8'
);
const panel = fs.readFileSync(
  path.join(root, 'src/ui/local-space/mining-event-panel.ts'),
  'utf8'
);
assert(service.includes('this.miningEvents.pauseExtraction(asteroid, deltaSeconds)'));
assert(service.includes('this.shipSystems.damageHullFraction'));
assert(service.includes('miningRecoverySeconds'));
assert(panel.includes('ABBAUEREIGNIS // LIVE'));
assert(!panel.includes('dialog'), 'mining decisions must remain embedded in local-space UI');

console.log('PASS live mining events, decisions, physical consequences and non-modal UI');
