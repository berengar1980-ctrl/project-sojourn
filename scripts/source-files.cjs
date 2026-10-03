'use strict';

const fs = require('fs');
const path = require('path');

function walk(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, predicate));
    else if (entry.isFile() && predicate(full)) out.push(full);
  }
  return out;
}

function runtimeFiles(root) {
  return walk(path.join(root, 'src'), (file) => file.endsWith('.js')).sort();
}

module.exports = { walk, runtimeFiles };
