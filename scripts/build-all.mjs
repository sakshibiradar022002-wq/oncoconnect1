#!/usr/bin/env node
/**
 * build-all.mjs — Build all VELTRUVIA standalone apps.
 *
 * Produces unpacked Electron app folders for:
 *   - VELTRUVIA Doctor   (Doctor Software)
 *   - VELTRUVIA Patient  (Patient App)
 *   - VELTRUVIA Lab      (Lab Portal)
 *   - VELTRUVIA Server   (Backend Server)
 *
 * Each app is a self-contained Electron app that opens in a native window.
 *
 * Usage:
 *   node scripts/build-all.mjs
 *   node scripts/build-all.mjs doctor    (build just one)
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, cpSync, rmSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist-desktop");
const DESKTOP = join(ROOT, "Desktop");

const BUILD_VARIANTS = [
  { name: "Doctor",  config: "electron/electron-builder-doctor.json",  main: "electron/main-doctor.js" },
  { name: "Patient", config: "electron/electron-builder-patient.json", main: "electron/main-patient.js" },
  { name: "Lab",     config: "electron/electron-builder-lab.json",     main: "electron/main-lab.js" },
  { name: "Server",  config: "electron/electron-builder-server.json",  main: "electron/main-server.js" },
];

function log(msg) { console.log(`\x1b[36m▸\x1b[0m ${msg}`); }
function run(cmd) { execSync(cmd, { cwd: ROOT, stdio: "inherit" }); }

// ── Parse args ──────────────────────────────────────────────────
const targetName = process.argv[2];
const variants = targetName
  ? BUILD_VARIANTS.filter((v) => v.name.toLowerCase() === targetName.toLowerCase())
  : BUILD_VARIANTS;

if (variants.length === 0) {
  console.error(`Unknown variant: ${targetName}`);
  console.error(`Available: ${BUILD_VARIANTS.map((v) => v.name.toLowerCase()).join(", ")}`);
  process.exit(1);
}

process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";

const electronBuilder = join(ROOT, "node_modules/.bin/electron-builder");
const builder = existsSync(electronBuilder + ".cmd") ? electronBuilder + ".cmd" : electronBuilder;

// ── Build each variant ──────────────────────────────────────────
for (const v of variants) {
  log(`\n${"═".repeat(50)}`);
  log(`Building VELTRUVIA ${v.name}...`);
  log(`${"═".repeat(50)}\n`);

  // Patch package.json main entry point
  const pkgPath = join(ROOT, "package.json");
  const originalPkg = readFileSync(pkgPath, "utf-8");
  const pkg = JSON.parse(originalPkg);
  pkg.main = v.main;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  log(`Patched package.json main → ${v.main}`);

  try {
    // Build as unpacked dir (not portable) — creates actual Electron .exe
    run(`"${builder}" --config "${v.config}" --win dir`);
  } finally {
    writeFileSync(pkgPath, originalPkg);
  }

  // Save win-unpacked to a named folder before next build overwrites it
  const unpacked = join(DIST, "win-unpacked");
  const named = join(DIST, `VELTRUVIA ${v.name}`);
  if (existsSync(unpacked)) {
    if (existsSync(named)) rmSync(named, { recursive: true });
    cpSync(unpacked, named, { recursive: true });
    log(`✅ Saved VELTRUVIA ${v.name}/ (${countFiles(named)} files)`);
  } else {
    log(`⚠️  win-unpacked not found for ${v.name}`);
  }
}

// ── Deploy to user's Desktop ────────────────────────────────────
log("\n📂 Deploying to Desktop...");

for (const v of variants) {
  const src = join(DIST, `VELTRUVIA ${v.name}`);
  const dst = join(DESKTOP, `VELTRUVIA ${v.name}`);

  if (!existsSync(src)) {
    log(`  ⚠️  VELTRUVIA ${v.name} not built — skipping`);
    continue;
  }

  mkdirSync(dst, { recursive: true });
  rmSync(dst, { recursive: true, force: true });
  cpSync(src, dst, { recursive: true });

  // Find the main .exe
  const exe = findExe(dst);
  if (exe) {
    log(`  ✅ VELTRUVIA ${v.name} → Desktop (${basename(exe)})`);
  } else {
    log(`  ✅ VELTRUVIA ${v.name} → Desktop (folder)`);
  }
}

log("\n🎉 Done! Double-click the .exe in each Desktop folder to launch.");

// ── Helpers ─────────────────────────────────────────────────────
function countFiles(dir) {
  let count = 0;
  const items = readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.isFile()) count++;
    else if (item.isDirectory()) count += countFiles(join(dir, item.name));
  }
  return count;
}

function findExe(dir) {
  const items = readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.isFile() && item.name.endsWith(".exe")) return join(dir, item.name);
  }
  return null;
}

function basename(p) {
  return p.split(/[\\/]/).pop();
}
