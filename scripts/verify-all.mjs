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
const checksPerApp = 70; // keep in sync with verify-app.mjs check list
for (const [dir, name] of APPS) {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('./verify-app.mjs', import.meta.url)), dir, name], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}

console.log('\n═══════════════════════════════════════════════');
if (failed === 0) console.log(`  ✅ ALL 4 APPS: ${checksPerApp}/${checksPerApp} feature checks passed`);
else console.log(`  ❌ ${failed} of 4 apps had failing checks`);
console.log('═══════════════════════════════════════════════');
process.exit(failed === 0 ? 0 : 1);
