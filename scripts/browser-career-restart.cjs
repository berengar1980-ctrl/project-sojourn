'use strict';

// Real Chromium smoke test: browser storage, controller lifecycle, and page reload.
// Run after "npm run dev -- --host 127.0.0.1" with Playwright installed.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = process.env.SOJOURN_BASE_URL || 'http://127.0.0.1:5173/';
const storageKey = 'sojourn.career.v1';
const required = [
  'navigation',
  'player',
  'ships',
  'crew',
  'economy',
  'npcs',
  'operations',
  'fields',
  'claims',
  'legal',
  'custody',
  'combat',
  'campaigns',
  'world',
];

async function readSavedCareer(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const envelope = JSON.parse(raw);
    return {
      envelope,
      snapshot: JSON.parse(envelope.payload),
      raw,
    };
  }, storageKey);
}

async function saveFromSystemMenu(page) {
  await page.locator('.settings-menu__toggle').click();
  await page.locator('[data-career-save]').click();
  try {
    await page.getByText('Spielstand erfolgreich gespeichert.').waitFor({ timeout: 10000 });
  } catch {
    const messages = await page.locator('[data-career-status]').allTextContents();
    throw new Error('Career save did not succeed: ' + messages.join(' | '));
  }
  const saved = await readSavedCareer(page);
  assert(saved, 'Save button must write a career record in real browser localStorage');
  assert.equal(saved.envelope.format, 'sojourn-career');
  assert.equal(saved.envelope.formatVersion, 1);
  assert.equal(saved.snapshot.version, 1);
  assert.deepEqual(Object.keys(saved.snapshot.sections).sort(), [...required].sort());
  return saved;
}


// Measure responsiveness during a real running campaign, not on the title screen.
// Performance figures are diagnostic: CI machine load must not define gameplay budgets.
async function sampleFrameTimes(page, seconds = 12) {
  return page.evaluate(
    (durationMs) =>
      new Promise((resolve) => {
        const intervals = [];
        const start = performance.now();
        let previous = start;
        function sample(now) {
          intervals.push(now - previous);
          previous = now;
          if (now - start < durationMs) {
            requestAnimationFrame(sample);
          } else {
            const sorted = intervals.slice(1).sort((a, b) => a - b);
            resolve({
              frames: sorted.length,
              p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
              maxMs: sorted.at(-1) ?? 0,
            });
          }
        }
        requestAnimationFrame(sample);
      }),
    seconds * 1000
  );
}

function verifyAdvancedSnapshot(saved, fieldIds) {
  const { sections } = saved.snapshot;
  assert.deepEqual(
    Object.keys(sections.fields.fields).sort(),
    fieldIds,
    'All simulated fields must remain present after Save/Reload'
  );
  const ids = sections.npcs.npcs.map((npc) => npc.id);
  assert.equal(new Set(ids).size, ids.length, 'Career must not duplicate NPC identities');
  const chargeIds = sections.legal.charges.map((charge) => charge.id);
  assert.equal(new Set(chargeIds).size, chargeIds.length, 'Legal charges must remain unique');
  const incidents = sections.legal.charges
    .map((charge) => charge.incidentId)
    .filter(Boolean);
  assert.equal(new Set(incidents).size, incidents.length, 'An offense must not be billed twice');
}

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  try {
    await page.goto(url);
    await page.locator('[data-action="campaign"]').click();
    await page.locator('[name="captainName"]').fill('Reload Browser Tester');
    await page.locator('[name="shipName"]').fill('Persistent Voyager');
    await page.locator('.character-editor__launch').click();
    await page.locator('.settings-menu__toggle').waitFor({ timeout: 45000 });

    const before = await saveFromSystemMenu(page);
    assert.equal(before.snapshot.sections.player.profile.captainName, 'Reload Browser Tester');
    assert.equal(before.snapshot.sections.player.profile.shipName, 'Persistent Voyager');
    assert.equal(
      before.snapshot.sections.combat,
      null,
      'Orbit save must not contain active combat'
    );

    // A genuine document reload destroys every JS module, controller, and service.
    await page.reload();
    const resume = page.locator('[data-action="continue"]');
    await resume.waitFor();
    assert.equal(await resume.isEnabled(), true, 'Saved career must enable Continue after reload');
    await resume.click();
    await page.locator('.settings-menu__toggle').waitFor({ timeout: 45000 });
    await page.getByText('Reload Browser Tester').first().waitFor();

    // Save again using the newly reconstructed controller, not the old instance.
    const after = await saveFromSystemMenu(page);
    assert.equal(after.snapshot.sections.player.profile.captainName, 'Reload Browser Tester');
    assert.equal(after.snapshot.sections.player.profile.shipName, 'Persistent Voyager');
    assert.deepEqual(
      after.snapshot.sections.player.player,
      before.snapshot.sections.player.player,
      'Wallet and cargo must not be paid twice by loading'
    );
    assert.deepEqual(
      after.snapshot.sections.ships,
      before.snapshot.sections.ships,
      'Owned ship, loadout, research and ship operating state must survive reload'
    );
    assert.deepEqual(
      after.snapshot.sections.legal,
      before.snapshot.sections.legal,
      'Legal records must not reset on browser reload'
    );
    assert.deepEqual(
      after.snapshot.sections.claims,
      before.snapshot.sections.claims,
      'Mining and wreck claims must survive browser reload'
    );
    assert.deepEqual(
      after.snapshot.sections.npcs.npcs.map((npc) => npc.id),
      before.snapshot.sections.npcs.npcs.map((npc) => npc.id),
      'NPC identities must not duplicate or disappear on reload'
    );


    // Long-running, real Chromium campaign: continue ticking without any local map.
    // Keep the browser alive across two separate save/restart boundaries.
    const fieldIds = Object.keys(after.snapshot.sections.fields.fields).sort();
    assert(fieldIds.length >= 2, 'Endurance test needs multiple real asteroid fields');
    const frameStats = await sampleFrameTimes(page);
    assert(frameStats.frames > 10, 'Active campaign must continue rendering frames');
    console.log('CAREER_BROWSER_FRAME_METRICS ' + JSON.stringify(frameStats));
    const advancedBefore = await saveFromSystemMenu(page);
    verifyAdvancedSnapshot(advancedBefore, fieldIds);

    await page.reload();
    await page.locator('[data-action="continue"]').click();
    await page.locator('.settings-menu__toggle').waitFor({ timeout: 45000 });
    const resumed = await saveFromSystemMenu(page);
    verifyAdvancedSnapshot(resumed, fieldIds);
    assert.deepEqual(
      resumed.snapshot.sections.claims,
      advancedBefore.snapshot.sections.claims,
      'Ore claims must not be regenerated by a document restart'
    );
    assert.deepEqual(
      resumed.snapshot.sections.legal,
      advancedBefore.snapshot.sections.legal,
      'Legal cases must not change simply from loading a career'
    );
    assert.deepEqual(
      resumed.snapshot.sections.npcs.npcs.map((npc) => npc.id),
      advancedBefore.snapshot.sections.npcs.npcs.map((npc) => npc.id),
      'NPC identities must survive the second real browser restart'
    );
    await sampleFrameTimes(page, 8);
    const advancedAfter = await saveFromSystemMenu(page);
    verifyAdvancedSnapshot(advancedAfter, fieldIds);
    assert.deepEqual(errors, [], 'Extended browser session must not throw page errors');

    // Corruption must disable Continue; never silently enter an incomplete game.
    await page.evaluate((key) => localStorage.setItem(key, '{corrupt'), storageKey);
    await page.reload();
    await page.locator('[data-action="campaign"]').waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Karriere fortsetzen' }).isEnabled(),
      false
    );
    assert.equal(await page.getByRole('button', { name: 'Spiel laden' }).isEnabled(), false);
    assert.deepEqual(errors, [], 'Browser must not throw uncaught game errors');
    console.log('PASS real Chromium Career Save / full reload / resume / corruption');
  } catch (error) {
    await page.screenshot({ path: 'career-browser-failure.png', fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
