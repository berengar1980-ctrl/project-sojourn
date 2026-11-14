'use strict';

/**
 * Optional Chromium smoke test (not part of npm test).
 * Run after installing Playwright's Chromium: node tests/browser/campaign-startup.smoke.cjs
 */
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const baseUrl = 'http://127.0.0.1:5187';
const server = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5187', '--strictPort'],
  { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
for (const pipe of [server.stdout, server.stderr]) {
  pipe.on('data', (chunk) => { output += chunk.toString().slice(0, 10000); });
}

async function awaitServer() {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error('Vite exited: ' + output);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Vite has not opened its socket yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Vite did not start: ' + output);
}

(async () => {
  let browser;
  try {
    await awaitServer();
    browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('.harrow-start__nav [data-action="campaign"]').waitFor();
    await page.locator('.harrow-start__nav [data-action="campaign"]').click();
    await page.locator('input[name="captainName"]').fill('Testkapitaen');
    await page.locator('input[name="shipName"]').fill('Integrationstest');
    assert(
      await page.locator('.character-editor__launch').isEnabled(),
      'Default skills should permit launching the campaign'
    );
    await page.locator('.character-editor__launch').click();
    await page.locator('.star-map-canvas').waitFor({ timeout: 60000 });
    await page.waitForTimeout(2500);
    const ui = await page.evaluate(() => ({
      exists: Boolean(document.querySelector('.star-map-shell')),
      canvasWidth: document.querySelector('.star-map-canvas')?.width ?? 0,
      canvasHeight: document.querySelector('.star-map-canvas')?.height ?? 0,
    }));
    assert(ui.exists, 'A complete star map must mount after campaign initialization');
    assert(ui.canvasWidth > 0 && ui.canvasHeight > 0, 'The game must render into a sized canvas');
    assert.deepEqual(errors, [], 'No unhandled browser exceptions during campaign boot and ticks');
    console.log('PASS browser: character editor, real campaign bootstrap, map canvas and running game loop');
    await page.screenshot({ path: '/tmp/sojourn-campaign-startup.png', fullPage: true });
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
