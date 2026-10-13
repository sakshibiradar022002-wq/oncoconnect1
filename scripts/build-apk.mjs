// ═════════════════════════════════════════════════════════════════════
// VELTRUVIA mobile APK build helper
//
//   npm run apk:patient            # Patient app
//   npm run apk:lab                # Lab app
//   VELTRUVIA_API_BASE=https://emr.yourclinic.com npm run apk:patient
//   npm run apk:patient -- --release
//
// Steps:
//   1. Copy the shared web UI (public/) into mobile/<app>/www
//   2. Bake the server URL into <meta name="veltruvia-api-base"> (CSP-safe)
//   3. Prune the other role's UI — each app ships only its own portal
//   4. If an android/ project exists → cap sync + gradle assemble
//      If not → print the one-time setup commands (needs Android Studio).
// ═════════════════════════════════════════════════════════════════════
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampGradle, computeVersionCode } from './gradle-stamp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = process.argv[2];
const release = process.argv.includes('--release');

if (app !== 'patient' && app !== 'lab') {
  console.error('Usage: node scripts/build-apk.mjs <patient|lab> [--release]');
  process.exit(1);
}

// No dev default: a build with no baked URL must not point at the emulator
// loopback. Users set the address in-app (⚙ button) or it stays same-origin.
const apiBase = (process.env.VELTRUVIA_API_BASE || '').replace(/\/+$/, '');
const publicDir = join(root, 'VELTRUVIA Server', 'resources', 'app', 'public');
const mobileDir = join(root, 'mobile', app);
const wwwDir = join(mobileDir, 'www');
const androidDir = join(mobileDir, 'android');

console.log(`\n📱 Building VELTRUVIA ${app[0].toUpperCase() + app.slice(1)} APK`);
console.log(`   Server baked in: ${apiBase || '(none — set in-app via ⚙)'}\n`);

// ── 1. Web assets ───────────────────────────────────────────────────
rmSync(wwwDir, { recursive: true, force: true });
mkdirSync(wwwDir, { recursive: true });
cpSync(publicDir, wwwDir, { recursive: true });
// Never ship the /downloads/ file-share folder (hosted installers) inside an APK.
rmSync(join(wwwDir, 'downloads'), { recursive: true, force: true });

// Ship only this role's UI: drop the other portals, desktop-only pages and
// the doctor portal (phones use the Patient and Lab apps only).
const entry = app === 'patient' ? 'patient.html' : 'lab.html';
const otherEntry = app === 'patient' ? 'lab.html' : 'patient.html';
const dropHtml = [otherEntry, 'admin.html', 'blockchain.html', 'download.html',
  'index.html.bak', 'lab.html.bak'];
const dropJs = ['page/index-1-helpers.js', 'page/index-2-record.js', 'page/index-3-reports.js',
  'page/index-4-standalone.js', 'page/admin-1-boot.js', 'page/admin-2-app.js',
  'page/blockchain-1-app.js', 'patient-pages.js'];
if (app === 'patient') dropJs.push('page/lab-1-app.js');
else dropJs.push('page/patient-1-core.js', 'page/patient-2-app.js', 'page/patient-3-boot.js');

for (const name of dropHtml) rmSync(join(wwwDir, name), { force: true });
for (const name of dropJs) rmSync(join(wwwDir, 'js', name), { force: true });

// ── 2. Bake the API base + role-specific PWA manifest/icons ─────────
const marker = '<meta name="veltruvia-api-base" content="">';
const entryPath = join(wwwDir, entry);
if (!existsSync(entryPath)) {
  console.error(`   ❌ ${entry} missing from public/ — run sync-bundles first.`);
  process.exit(1);
}
let html = readFileSync(entryPath, 'utf8');
if (!html.includes(marker)) {
  console.error(`   ❌ API-base marker not found in ${entry} — expected: ${marker}`);
  process.exit(1);
}
html = html.replace(marker, `<meta name="veltruvia-api-base" content="${apiBase}">`);
writeFileSync(entryPath, html);

// Role-specific app name and icons in the PWA manifest.
const manifestPath = join(wwwDir, 'manifest.json');
try {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const role = app === 'patient' ? 'patient' : 'lab';
  manifest.name = `VELTRUVIA ${role === 'patient' ? 'Patient' : 'Lab'}`;
  manifest.short_name = manifest.name;
  for (const icon of manifest.icons || []) {
    icon.src = icon.src.replace(/\/icons\/[a-z-]+-/, `/icons/${role}-`);
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
} catch (e) {
  console.log(`   ⚠️  manifest.json untouched: ${e.message}`);
}

// Capacitor requires www/index.html as the web entry — redirect to the portal.
writeFileSync(join(wwwDir, 'index.html'),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>VELTRUVIA</title>` +
  `<script>location.replace('${entry}');</script>` +
  `<meta http-equiv="refresh" content="0;url=${entry}"></head>` +
  `<body style="background:#080d1a;color:#e2e8f0;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">Opening VELTRUVIA…</body></html>`);
console.log(`   ✅ www/ prepared (${entry}${apiBase ? ` → ${apiBase}` : ', no baked URL'})`);
console.log(`   ✅ Pruned ${dropHtml.length + dropJs.length} non-${app} files`);

// ── 3. Android project ──────────────────────────────────────────────
if (!existsSync(androidDir)) {
  console.log(`    ⚠️  No android/ project yet — one-time setup (needs JDK 21 + Android SDK):

     cd "${mobileDir}"
     npm install
     npx cap add android

   The www/ payload above is ready; cap add simply wraps it.`);
  process.exit(0);
}

console.log('   ⟳ cap sync android…');
const cap = spawnSync('npx', ['cap', 'sync', 'android'], { cwd: mobileDir, stdio: 'inherit', shell: true });
if (cap.status !== 0) {
  console.error('   ❌ cap sync failed');
  process.exit(cap.status ?? 1);
}

// WebView camera (QR pairing) needs the CAMERA permission — Capacitor's
// generated projects don't declare it, and getUserMedia fails silently
// without it. Idempotent.
const manifestFile = join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');
if (existsSync(manifestFile)) {
  let manifest = readFileSync(manifestFile, 'utf8');
  if (!manifest.includes('android.permission.CAMERA')) {
    manifest = manifest.replace(
      '<uses-permission android:name="android.permission.INTERNET"',
      '<uses-permission android:name="android.permission.CAMERA" />\n    <uses-permission android:name="android.permission.INTERNET"');
    writeFileSync(manifestFile, manifest);
    console.log('   ✅ CAMERA permission added to AndroidManifest (QR pairing)');
  }
  // Medicine/appointment reminders are OS-level local notifications — the
  // plugin manifest carries POST_NOTIFICATIONS, but declare it in the app too
  // so a stale generated project can't silently drop reminders (Android 13+).
  if (!manifest.includes('android.permission.POST_NOTIFICATIONS')) {
    manifest = readFileSync(manifestFile, 'utf8');
    manifest = manifest.replace(
      '<uses-permission android:name="android.permission.INTERNET"',
      '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n    <uses-permission android:name="android.permission.INTERNET"');
    writeFileSync(manifestFile, manifest);
    console.log('   ✅ POST_NOTIFICATIONS permission added to AndroidManifest (reminders)');
  }
}

// Stamp the app version from package.json into the generated gradle config:
// a fresh `cap add android` ships versionCode 1, which would be a *downgrade*
// for phones already running an earlier release. Also ensures the release
// signingConfig exists (generated projects have none → unsigned APK on CI).
const pkg = JSON.parse(readFileSync(join(mobileDir, 'package.json'), 'utf8'));
const gradleFile = join(androidDir, 'app', 'build.gradle');
const stamped = stampGradle(readFileSync(gradleFile, 'utf8'), pkg.version);
writeFileSync(gradleFile, stamped);
console.log(`   ✅ stamped version ${pkg.version} (versionCode ${computeVersionCode(pkg.version)})`);

const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const task = release ? 'assembleRelease' : 'assembleDebug';
console.log(`   ⟳ gradle ${task}…`);
const build = spawnSync(join(androidDir, gradle), [task], { cwd: androidDir, stdio: 'inherit', shell: process.platform === 'win32' });
if (build.status !== 0) {
  console.error('   ❌ gradle build failed');
  process.exit(build.status ?? 1);
}

const out = join(androidDir, 'app', 'build', 'outputs', 'apk', release ? 'release' : 'debug');
console.log(`\n✅ APK ready: ${out}`);
console.log('   Install on a phone:  adb install -r <file.apk>   (or copy the file and tap it)');
if (release) {
  console.log('   Release APKs must be signed — see BUILDING.md → "Signing the APKs".');
}
