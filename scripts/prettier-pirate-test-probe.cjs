'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const file = 'tests/combat/pirate-npc-behavior.test.cjs';
const original = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
const result = spawnSync('npx', ['prettier', file], {cwd:process.cwd(),encoding:'utf8',env:{...process.env,FORCE_COLOR:'0',NO_COLOR:'1'}});
if (result.status !== 0) { process.stderr.write(result.stderr || result.stdout || 'prettier probe failed'); process.exit(result.status ?? 1); }
const formatted = result.stdout.replaceAll('\r\n','\n');
const before=original.split('\n'), after=formatted.split('\n');
for(let i=0;i<Math.max(before.length,after.length);i+=1){
 if(before[i]===after[i]) continue;
 console.error('Error: PRETTIER line '+(i+1)+' current='+JSON.stringify(before[i]??'<missing>')+' expected='+JSON.stringify(after[i]??'<missing>'));
 process.exit(1);
}
console.log('formatted');
