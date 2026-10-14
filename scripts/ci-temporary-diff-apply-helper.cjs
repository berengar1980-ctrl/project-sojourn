'use strict';
// Temporary pure-JS decoder for CircleCI's exact Prettier diagnostic patch.
// Never included in final PR and not used in the application.
function parseFormattedPatches(statuses) {
  const chunks = statuses
    .filter((s) => /^ci\/format-patch\/\d{3}$/.test(s.context))
    .sort((a, b) => a.context.localeCompare(b.context));
  if (chunks.length !== 38 || !statuses.some((s) => s.context === 'ci/format-patch/complete'))
    throw Error('Incomplete CI patch');
  const encoded = chunks.map((s) => s.target_url.split('#fmt=')[1]).join('');
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const raw = [];
  let carry = 0, carryBits = 0;
  for (const c of encoded) {
    const v = abc.indexOf(c);
    if (v < 0) throw Error('Invalid CI patch encoding');
    carry = (carry << 6) | v;
    carryBits += 6;
    if (carryBits >= 8) {
      carryBits -= 8;
      raw.push((carry >>> carryBits) & 255);
      carry &= (1 << carryBits) - 1;
    }
  }
  let cursor = 0, bits = 0, bitCount = 0;
  function read(n) {
    let value = 0;
    for (let i = 0; i < n; i++) {
      if (!bitCount) {
        if (cursor >= raw.length) throw Error('Unexpected compressed patch EOF');
        bits = raw[cursor++];
        bitCount = 8;
      }
      value |= (bits & 1) << i;
      bits >>>= 1;
      bitCount--;
    }
    return value;
  }
  function huff(lengths) {
    const maximum = Math.max(...lengths);
    const count = Array(maximum + 1).fill(0);
    const next = Array(maximum + 1).fill(0);
    for (const length of lengths) if (length) count[length]++;
    let code = 0;
    for (let length = 1; length <= maximum; length++) {
      code = (code + (count[length - 1] || 0)) * 2;
      next[length] = code;
    }
    const map = new Map();
    lengths.forEach((length, symbol) => {
      if (!length) return;
      let value = next[length]++, reversed = 0;
      for (let i = 0; i < length; i++) {
        reversed = (reversed << 1) | (value & 1);
        value >>>= 1;
      }
      map.set((length << 16) | reversed, symbol);
    });
    return { maximum, map };
  }
  function symbol(table) {
    let value = 0;
    for (let length = 1; length <= table.maximum; length++) {
      value |= read(1) << (length - 1);
      const result = table.map.get((length << 16) | value);
      if (result !== undefined) return result;
    }
    throw Error('Malformed Huffman code in CI patch');
  }
  const order = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
  const lengthBase = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const lengthExtra = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const distanceBase = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const distanceExtra = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  const decoded = [];
  let finalBlock = false;
  while (!finalBlock) {
    finalBlock = read(1) === 1;
    const type = read(2);
    if (type === 0) {
      bits = bitCount = 0;
      const size = read(16), complement = read(16);
      if ((size ^ complement) !== 65535) throw Error('Invalid stored block');
      for (let i = 0; i < size; i++) decoded.push(read(8));
      continue;
    }
    if (type === 3) throw Error('Reserved DEFLATE block');
    let literals, distances;
    if (type === 1) {
      const lengths = Array(288).fill(8);
      for (let i = 144; i < 256; i++) lengths[i] = 9;
      for (let i = 256; i < 280; i++) lengths[i] = 7;
      for (let i = 280; i < 288; i++) lengths[i] = 8;
      literals = huff(lengths);
      distances = huff(Array(32).fill(5));
    } else {
      const litCount = read(5) + 257, distCount = read(5) + 1, codeCount = read(4) + 4;
      const codeLengths = Array(19).fill(0);
      for (let i = 0; i < codeCount; i++) codeLengths[order[i]] = read(3);
      const codes = huff(codeLengths), lengths = [];
      while (lengths.length < litCount + distCount) {
        const code = symbol(codes);
        if (code < 16) lengths.push(code);
        else {
          let repeat, value = 0;
          if (code === 16) {
            if (!lengths.length) throw Error('Invalid repeat');
            repeat = read(2) + 3;
            value = lengths[lengths.length - 1];
          } else if (code === 17) repeat = read(3) + 3;
          else if (code === 18) repeat = read(7) + 11;
          else throw Error('Invalid code lengths');
          for (let i = 0; i < repeat; i++) lengths.push(value);
        }
      }
      literals = huff(lengths.slice(0, litCount));
      distances = huff(lengths.slice(litCount, litCount + distCount));
    }
    for (;;) {
      const code = symbol(literals);
      if (code < 256) {
        decoded.push(code);
        continue;
      }
      if (code === 256) break;
      const index = code - 257;
      if (index < 0 || index >= lengthBase.length) throw Error('Invalid match length');
      const count = lengthBase[index] + read(lengthExtra[index]);
      const distanceCode = symbol(distances);
      if (distanceCode >= distanceBase.length) throw Error('Invalid back-reference');
      const distance = distanceBase[distanceCode] + read(distanceExtra[distanceCode]);
      if (distance > decoded.length) throw Error('Out of bounds DEFLATE back-reference');
      for (let i = 0; i < count; i++) decoded.push(decoded[decoded.length - distance]);
    }
  }
  if (decoded.length !== 156124) throw Error('Unexpected patch size: ' + decoded.length);
  const pieces = [];
  let buffer = [];
  for (let i = 0; i < decoded.length;) {
    const b = decoded[i++];
    let cp;
    if (b < 128) cp = b;
    else if ((b & 224) === 192) cp = ((b & 31) << 6) | (decoded[i++] & 63);
    else if ((b & 240) === 224) cp = ((b & 15) << 12) | ((decoded[i++] & 63) << 6) | (decoded[i++] & 63);
    else cp = ((b & 7) << 18) | ((decoded[i++] & 63) << 12) | ((decoded[i++] & 63) << 6) | (decoded[i++] & 63);
    buffer.push(String.fromCodePoint(cp));
    if (buffer.length === 4096) { pieces.push(buffer.join('')); buffer = []; }
  }
  pieces.push(buffer.join(''));
  const diff = pieces.join('');
  const sections = diff.split(/(?=^diff --git )/m).filter((s) => s.startsWith('diff --git '));
  if (sections.length !== 44) throw Error('Expected 44 formatted source files, received ' + sections.length);
  return sections.map((section) => {
    const match = /^diff --git a\/(.+?) b\/(.+?)$/m.exec(section);
    if (!match || match[1] !== match[2]) throw Error('Unrecognized patch file');
    const path = match[1], lines = section.split('\n'), hunks = [];
    for (let i = 0; i < lines.length; i++) {
      const heading = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[i]);
      if (!heading) continue;
      const oldStart = Number(heading[1]);
      const oldCount = heading[2] === undefined ? 1 : Number(heading[2]);
      const newCount = heading[4] === undefined ? 1 : Number(heading[4]);
      const content = [];
      while (++i < lines.length && !lines[i].startsWith('@@ ')) {
        const line = lines[i];
        if (line.startsWith('diff --git ')) break;
        if (/^[-+ ]/.test(line)) content.push(line);
        else if (line.startsWith('\\ No newline')) {}
        else if (line === '') {}
        else throw Error('Malformed hunk in ' + path + ': ' + line);
      }
      i--;
      if (content.filter((x) => x[0] !== '+').length !== oldCount ||
          content.filter((x) => x[0] !== '-').length !== newCount)
        throw Error('Hunk length mismatch: ' + path);
      hunks.push({ oldStart, oldCount, content });
    }
    if (!hunks.length) throw Error('No patch hunks for ' + path);
    return { path, hunks };
  });
}

function applyFormattedPatch(path, original, hunks) {
  const source = original.split('\n'), output = [];
  let cursor = 0;
  for (const hunk of hunks) {
    const start = hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1;
    if (start < cursor || start > source.length) throw Error('Invalid patch range in ' + path);
    output.push(...source.slice(cursor, start));
    cursor = start;
    for (const row of hunk.content) {
      const content = row.slice(1);
      if (row[0] === '+') output.push(content);
      else {
        if (source[cursor] !== content)
          throw Error('Patch source mismatch: ' + path + ':' + (cursor + 1));
        if (row[0] === ' ') output.push(content);
        cursor++;
      }
    }
  }
  output.push(...source.slice(cursor));
  let updated = output.join('\n');
  if (!updated.endsWith('\n')) updated += '\n';
  if (updated === original) throw Error('No effective formatting change in ' + path);
  return updated;
}
