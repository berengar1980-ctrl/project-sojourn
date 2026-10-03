'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const starter = fs.readFileSync(path.join(root, 'start-sojourn.cmd'), 'utf8');

assert.equal(pkg.scripts.start, 'vite --open', 'local start script must launch Vite and open browser');
assert(starter.includes('npm install'), 'Windows starter must install missing dependencies');
assert(starter.includes('npm run start'), 'Windows starter must launch SOJOURN');

console.log('PASS local startup contract');
