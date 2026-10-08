'use strict';

const fs = require('node:fs');
const path = require('node:path');
const nodeCrypto = require('node:crypto');

const EXPECTED = {
  ambience: {
    bytes: 803485,
    sha256: 'ae563895f5877cf4f9fc12cfd46e84483f90d1550be6e0e1f8af1e7cbe57e694',
  },
  rcs: {
    bytes: 14763,
    sha256: '222e505a3cb619343a52b92abba3e30d7c8e556aa6a1deaca80e9d04f23c7500',
  },
};

const AMBIENCE_CHUNKS = 5;

function sha256(buffer) {
  return nodeCrypto.createHash('sha256').update(buffer).digest('hex');
}

function readAndVerify(label, filePath, expected) {
  const buffer = fs.readFileSync(filePath);
  const hash = sha256(buffer);

  if (buffer.length !== expected.bytes || hash !== expected.sha256) {
    throw new Error(
      `${label} is not the uploaded original. Expected ${expected.bytes} bytes / ${expected.sha256}, got ${buffer.length} bytes / ${hash}.`
    );
  }

  return buffer;
}

function writeAmbienceChunks(buffer, outputDirectory) {
  const base64 = buffer.toString('base64');
  const chunkLength = Math.ceil(base64.length / AMBIENCE_CHUNKS / 4) * 4;

  fs.mkdirSync(outputDirectory, { recursive: true });

  for (let index = 0; index < AMBIENCE_CHUNKS; index += 1) {
    const start = index * chunkLength;
    const end = index === AMBIENCE_CHUNKS - 1 ? base64.length : start + chunkLength;
    const chunk = base64.slice(start, end);
    fs.writeFileSync(
      path.join(outputDirectory, `deep-space-${String(index).padStart(2, '0')}.b64`),
      chunk
    );
  }

  const reconstructed = Buffer.from(
    Array.from({ length: AMBIENCE_CHUNKS }, (_, index) =>
      fs.readFileSync(
        path.join(outputDirectory, `deep-space-${String(index).padStart(2, '0')}.b64`),
        'utf8'
      )
    ).join(''),
    'base64'
  );

  if (!reconstructed.equals(buffer)) {
    throw new Error('Ambience reconstruction differs from the uploaded original.');
  }
}

function main() {
  const [ambiencePath, rcsPath] = process.argv.slice(2);

  if (!ambiencePath || !rcsPath) {
    console.error(
      'Usage: npm run audio:import-originals -- "<path-to-ambience.ogg>" "<path-to-rcs.ogg>"'
    );
    process.exitCode = 1;
    return;
  }

  const root = path.resolve(__dirname, '..');
  const audioDirectory = path.join(root, 'resources', 'audio');
  const ambienceDirectory = path.join(audioDirectory, 'ambience');

  const ambience = readAndVerify('Ambience', ambiencePath, EXPECTED.ambience);
  const rcs = readAndVerify('RCS', rcsPath, EXPECTED.rcs);

  writeAmbienceChunks(ambience, ambienceDirectory);
  fs.copyFileSync(rcsPath, path.join(audioDirectory, 'spacecraft-rcs-thruster-burst.ogg'));

  console.log(
    `Restored exact uploaded audio: ambience ${ambience.length} bytes, RCS ${rcs.length} bytes.`
  );
  console.log('The game will reconstruct the ambience byte-for-byte without re-encoding.');
}

main();
