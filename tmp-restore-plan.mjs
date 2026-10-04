// For each file differing from the VM, decide restore source:
//   git  — ac7a17f blob md5 == VM md5  → restore via git checkout
//   vm   — VM content is unique        → copy from VM
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const plan = { git: [], vm: [] };
const vmMd5 = new Map(readFileSync('vm-md5.txt', 'utf8').split('\n')
  .filter(l => /^[0-9a-f]{32}  /.test(l)).map(l => { const [h, p] = l.split('  '); return [p.trim(), h]; }));
const report = JSON.parse(readFileSync('drift-report.json', 'utf8'));
const skip = /downloads\/|SMOKE|qr-sheet|CLOUD-URL/;
const files = [...report.diff, ...report.onlyVM].filter(p => !skip.test(p));

for (const p of files) {
  const vmHash = vmMd5.get(p);
  let gitHash = null;
  try {
    gitHash = execSync(`git show ac7a17f:"VELTRUVIA Server/resources/app/${p}" | md5sum`,
      { encoding: 'utf8', cwd: 'C:/Users/Sara/Desktop/ventruvia/gh-oncoconnect1' }).split(' ')[0];
  } catch { /* not in ac7a17f */ }
  if (gitHash && gitHash === vmHash) plan.git.push(p);
  else plan.vm.push(p);
}
console.log(`git-restorable: ${plan.git.length}  vm-only: ${plan.vm.length}`);
plan.git.forEach(p => console.log('G ' + p));
plan.vm.forEach(p => console.log('V ' + p));
writeFileSync('restore-plan.json', JSON.stringify(plan, null, 1));
