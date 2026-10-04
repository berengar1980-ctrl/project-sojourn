'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '../..');
const shipsRoot = path.join(root, 'resources', 'ships');
const hardpointsRoot = path.join(root, 'src', 'data', 'ships');

const PIXELS_PER_METER = 4;
const MIN_MARGIN_PX = 8;
const MAX_MARGIN_PX = 24;
const MARGIN_TOLERANCE_PX = 2;
const LENGTH_TOLERANCE_PX = 2;
const ALPHA_THRESHOLD = 8;

const ROLE_BY_FOLDER = {
  mining: 'miner',
  freight: 'freighter',
  cargo: 'freighter',
  trader: 'freighter',
  patrol: 'patrol',
  cutter: 'patrol',
  salvage: 'salvage',
  boarding: 'salvage',
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function parsePng(file) {
  const buffer = fs.readFileSync(file);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert(buffer.subarray(0, 8).equals(signature), `${file}: not a valid PNG`);

  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  let palette = null;
  let transparency = null;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'tRNS') {
      transparency = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  assert(width && height, `${file}: PNG has no IHDR dimensions`);
  assert.strictEqual(bitDepth, 8, `${file}: ship validator supports 8-bit PNG assets only`);
  assert.strictEqual(interlace, 0, `${file}: interlaced PNG assets are not allowed`);

  const channelsByType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = channelsByType[colorType];
  assert(channels, `${file}: unsupported PNG color type ${colorType}`);

  const bytesPerPixel = channels;
  const stride = width * channels;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const expectedBytes = height * (stride + 1);
  assert.strictEqual(
    inflated.length,
    expectedBytes,
    `${file}: unexpected decompressed PNG byte length`
  );

  const rows = [];
  let sourceOffset = 0;
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const filter = inflated[sourceOffset++];
    const raw = inflated.subarray(sourceOffset, sourceOffset + stride);
    sourceOffset += stride;
    const row = Buffer.alloc(stride);

    for (let x = 0; x < stride; x++) {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previous[x] || 0;
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] || 0 : 0;
      const value = raw[x];

      if (filter === 0) row[x] = value;
      else if (filter === 1) row[x] = (value + left) & 255;
      else if (filter === 2) row[x] = (value + up) & 255;
      else if (filter === 3) row[x] = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (value + paeth(left, up, upLeft)) & 255;
      else throw new Error(`${file}: unsupported PNG filter ${filter}`);
    }

    rows.push(row);
    previous = row;
  }

  const alphaAt = (x, y) => {
    const row = rows[y];
    const i = x * channels;
    if (colorType === 6) return row[i + 3];
    if (colorType === 4) return row[i + 1];
    if (colorType === 3) {
      const paletteIndex = row[i];
      if (transparency && paletteIndex < transparency.length) return transparency[paletteIndex];
      return 255;
    }
    if (colorType === 2 && transparency && transparency.length >= 6) {
      const tr = transparency.readUInt16BE(0) & 255;
      const tg = transparency.readUInt16BE(2) & 255;
      const tb = transparency.readUInt16BE(4) & 255;
      return row[i] === tr && row[i + 1] === tg && row[i + 2] === tb ? 0 : 255;
    }
    if (colorType === 0 && transparency && transparency.length >= 2) {
      const t = transparency.readUInt16BE(0) & 255;
      return row[i] === t ? 0 : 255;
    }
    return 255;
  };

  return { width, height, alphaAt, palette };
}

function findShipAssets(dir = shipsRoot) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findShipAssets(full));
    else if (entry.isFile() && /\.(png|webp)$/i.test(entry.name)) found.push(full);
  }
  return found.sort();
}

function inferSpec(file) {
  const relative = path.relative(shipsRoot, file).replaceAll('\\', '/');
  const parts = relative.split('/');
  const folderRole = ROLE_BY_FOLDER[parts[0]];
  const base = path.basename(file, path.extname(file));
  const lengthMatch = base.match(/(?:^|-)(\d+(?:\.\d+)?)m(?:-|$)/i);
  const filenameRole = /^miner(?:-|$)/i.test(base)
    ? 'miner'
    : /^freighter(?:-|$)|^trader(?:-|$)/i.test(base)
      ? 'freighter'
      : /^patrol(?:-|$)|^cutter(?:-|$)/i.test(base)
        ? 'patrol'
        : /^salvag(?:e|er)(?:-|$)|^boarding(?:-|$)/i.test(base)
          ? 'salvage'
          : null;

  return {
    relative,
    base,
    type: filenameRole || folderRole || null,
    lengthMeters: lengthMatch ? Number(lengthMatch[1]) : null,
  };
}

function measureAlpha(file) {
  const ext = path.extname(file).toLowerCase();
  assert.strictEqual(
    ext,
    '.png',
    `${path.relative(root, file)}: WebP ship assets are not yet supported by the deterministic CI validator; use PNG for canonical ship sprites`
  );

  const png = parsePng(file);
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  let edgePixels = 0;

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.alphaAt(x, y) <= ALPHA_THRESHOLD) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const onEdge = x === 0 || y === 0 || x === png.width - 1 || y === png.height - 1;
      if (onEdge) edgePixels++;
    }
  }

  assert(maxX >= 0, `${path.relative(root, file)}: no visible ship pixels found`);

  return {
    width: png.width,
    height: png.height,
    bbox: { minX, minY, maxX, maxY },
    visibleWidth: maxX - minX + 1,
    visibleHeight: maxY - minY + 1,
    margins: {
      left: minX,
      right: png.width - 1 - maxX,
      top: minY,
      bottom: png.height - 1 - maxY,
    },
    edgePixels,
  };
}

function expectedMargin(lengthMeters) {
  return clamp(Math.round(lengthMeters * PIXELS_PER_METER * 0.04), MIN_MARGIN_PX, MAX_MARGIN_PX);
}

function allowedMarginRange(target) {
  return {
    min: Math.max(MIN_MARGIN_PX, target - MARGIN_TOLERANCE_PX),
    max: Math.min(MAX_MARGIN_PX, target + MARGIN_TOLERANCE_PX),
  };
}

function validateTypeSpecific(spec, metrics) {
  const failures = [];
  const hardpointsFile = path.join(hardpointsRoot, `${spec.base}.hardpoints.json`);

  if (spec.type === 'miner') {
    if (!fs.existsSync(hardpointsFile)) {
      const relHardpoints = path.relative(root, hardpointsFile);
      failures.push(`${spec.relative}: miner requires ${relHardpoints}`);
      return failures;
    }

    const hardpoints = JSON.parse(fs.readFileSync(hardpointsFile, 'utf8'));
    if (!Array.isArray(hardpoints.miningLasers) || hardpoints.miningLasers.length === 0) {
      failures.push(`${spec.relative}: miner requires at least one mining-laser hardpoint`);
    }
    if (!Array.isArray(hardpoints.engines) || hardpoints.engines.length === 0) {
      failures.push(`${spec.relative}: miner requires at least one engine hardpoint`);
    }
    if (hardpoints.sourceWidth !== metrics.width || hardpoints.sourceHeight !== metrics.height) {
      failures.push(
        `${spec.relative}: hardpoint source canvas ${hardpoints.sourceWidth}x${hardpoints.sourceHeight}px does not match sprite ${metrics.width}x${metrics.height}px`
      );
    }

    const sternLimit = metrics.width * 0.45;
    const bowLimit = metrics.width * 0.55;
    if (hardpoints.engines.some((hp) => hp.x >= sternLimit)) {
      failures.push(`${spec.relative}: miner engine hardpoints must remain on the left/stern side`);
    }
    if (hardpoints.miningLasers.some((hp) => hp.x <= bowLimit)) {
      failures.push(
        `${spec.relative}: miner mining-laser hardpoints must remain on the right/bow side for right-facing rotation 0°`
      );
    }
  }

  return failures;
}

const assets = findShipAssets();
assert(assets.length > 0, 'resources/ships contains no ship assets');

const failures = [];
for (const file of assets) {
  const spec = inferSpec(file);

  if (!spec.type) {
    failures.push(
      `${spec.relative}: ship type cannot be inferred; use a canonical type folder/name (miner, freighter, patrol/cutter, salvage/boarding)`
    );
    continue;
  }
  if (!Number.isFinite(spec.lengthMeters) || spec.lengthMeters <= 0) {
    failures.push(
      `${spec.relative}: physical ship length is missing from filename; expected e.g. miner-80m-standard.png`
    );
    continue;
  }

  let metrics;
  try {
    metrics = measureAlpha(file);
  } catch (error) {
    failures.push(String(error.message || error));
    continue;
  }

  const expectedVisibleWidth = spec.lengthMeters * PIXELS_PER_METER;
  if (Math.abs(metrics.visibleWidth - expectedVisibleWidth) > LENGTH_TOLERANCE_PX) {
    failures.push(
      `${spec.relative}: visible length is ${metrics.visibleWidth}px; expected ${expectedVisibleWidth}px for ${spec.lengthMeters}m at ${PIXELS_PER_METER}px/m (±${LENGTH_TOLERANCE_PX}px)`
    );
  }

  if (metrics.edgePixels !== 0) {
    failures.push(
      `${spec.relative}: ${metrics.edgePixels} visible pixel(s) touch the canvas edge; ship must be fully visible with transparent safety margin`
    );
  }

  const targetMargin = expectedMargin(spec.lengthMeters);
  const allowed = allowedMarginRange(targetMargin);

  for (const [side, actual] of Object.entries(metrics.margins)) {
    if (actual < MIN_MARGIN_PX) {
      failures.push(
        `${spec.relative}: ${side} margin is ${actual}px; hard minimum is ${MIN_MARGIN_PX}px`
      );
    } else if (actual > MAX_MARGIN_PX) {
      failures.push(
        `${spec.relative}: ${side} margin is ${actual}px; hard maximum is ${MAX_MARGIN_PX}px`
      );
    } else if (actual < allowed.min || actual > allowed.max) {
      failures.push(
        `${spec.relative}: ${side} margin is ${actual}px; target is ${targetMargin}px, allowed ${allowed.min}..${allowed.max}px`
      );
    }
  }

  failures.push(...validateTypeSpecific(spec, metrics));

  console.log(
    `CHECK ${spec.relative} [${spec.type}] ${spec.lengthMeters}m · canvas ${metrics.width}x${metrics.height}px · visible ${metrics.visibleWidth}x${metrics.visibleHeight}px · margins L/R/T/B ${metrics.margins.left}/${metrics.margins.right}/${metrics.margins.top}/${metrics.margins.bottom}px`
  );
}

if (failures.length) {
  console.error(`\nSHIP ASSET STANDARD: FAILED · ${failures.length} violation(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`\nSHIP ASSET STANDARD: PASSED · ${assets.length} asset(s)`);
}

console.log(
  'INFO Visual-art review still remains manual for perspective quality, class readability, baked effects/background objects, and whether the drawn modules plausibly match their declared hardpoints.'
);
