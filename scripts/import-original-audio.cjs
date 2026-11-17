'use strict';

// Optional audio importer: use only sounds for which redistribution is permitted.
const fs = require('node:fs');
const path = require('node:path');

function importOgg(source, destination) {
  const data = fs.readFileSync(source);
  if (data.subarray(0, 4).toString('ascii') !== 'OggS') {
    throw new Error(source + ' is not an Ogg audio file');
  }
  fs.copyFileSync(source, destination);
}

const [ambience, rcs] = process.argv.slice(2);
if (!ambience && !rcs) {
  console.error('Usage: npm run audio:import-originals -- <ambience.ogg|-> <rcs.ogg|->');
  process.exitCode = 1;
} else {
  const output = path.resolve(__dirname, '../public/audio');
  fs.mkdirSync(output, { recursive: true });
  if (ambience && ambience !== '-') importOgg(ambience, path.join(output, 'deep-space.ogg'));
  if (rcs && rcs !== '-') importOgg(rcs, path.join(output, 'spacecraft-rcs-thruster-burst.ogg'));
  console.log('Optional audio installed in public/audio/. Verify redistribution rights.');
}
