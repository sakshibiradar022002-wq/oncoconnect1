// Run the full feature verification against all four app bundles, sequentially.
// Usage: npm run verify  (or: node scripts/verify-all.mjs)
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const APPS = [
  ['VELTRUVIA Server/resources/app', 'Server'],
  ['VELTRUVIA Doctor/resources/app', 'Doctor'],
  ['VELTRUVIA Patient/resources/app', 'Patient'],
  ['VELTRUVIA Lab/resources/app', 'Lab'],
];

let failed = 0;
let passed = 0;
let total = 0;

for (const [dir, name] of APPS) {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('./verify-app.mjs', import.meta.url)), dir, name], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  process.stdout.write(out);
  // Totals come from verify-app's own summary; never hardcode the check count
  // here (it silently drifted last time the check list grew).
  const m = out.match(/(\d+) passed, (\d+) failed, (\d+) total/);
  if (m) { passed += Number(m[1]); total += Number(m[3]); }
  if (r.status !== 0) failed++;
}

console.log('\n═══════════════════════════════════════════════');
if (failed === 0) console.log(`  ✅ ALL ${APPS.length} APPS: ${passed}/${total} feature checks passed`);
else console.log(`  ❌ ${failed} of ${APPS.length} apps had failing checks (${passed}/${total} checks passed)`);
console.log('═══════════════════════════════════════════════');
process.exit(failed === 0 ? 0 : 1);
