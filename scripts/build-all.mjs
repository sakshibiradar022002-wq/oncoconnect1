#!/usr/bin/env node
/**
 * build-all.mjs — Build all OncoConnect standalone apps.
 *
 * Produces portable .exe files for:
 *   - OncoConnect Doctor   (Doctor Software)
 *   - OncoConnect Patient  (Patient App)
 *   - OncoConnect Lab      (Lab Portal)
 *   - OncoConnect Server   (Backend Server — the "linking software")
 *
 * Usage:
 *   node scripts/build-all.mjs
 *   npm run electron:build:all
 *
 * Individual builds:
 *   npm run electron:build:doctor
 *   npm run electron:build:patient
 *   npm run electron:build:lab
 *   npm run electron:build:server
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const BUILD_VARIANTS = [
  { name: "Doctor",  config: "electron/electron-builder-doctor.json",  main: "electron/main-doctor.js" },
  { name: "Patient", config: "electron/electron-builder-patient.json", main: "electron/main-patient.js" },
  { name: "Lab",     config: "electron/electron-builder-lab.json",     main: "electron/main-lab.js" },
  { name: "Server",  config: "electron/electron-builder-server.json",  main: "electron/main-server.js" },
];

function log(msg) {
  console.log(`\x1b[36m▸\x1b[0m ${msg}`);
}

function run(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

const targetName = process.argv[2]; // optional: doctor, patient, lab, server

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
const builder = existsSync(electronBuilder + ".cmd")
  ? electronBuilder + ".cmd"
  : electronBuilder;

for (const v of variants) {
  log(`\n${"═".repeat(50)}`);
  log(`Building OncoConnect ${v.name}...`);
  log(`${"═".repeat(50)}\n`);

  // Patch package.json with the correct main entry point
  const pkgPath = join(ROOT, "package.json");
  const originalPkg = readFileSync(pkgPath, "utf-8");
  const pkg = JSON.parse(originalPkg);
  const origMain = pkg.main;
  pkg.main = v.main;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  log(`Patched package.json main → ${v.main}`);

  try {
    run(`"${builder}" --config "${v.config}" --win portable`);
  } finally {
    // Restore original package.json
    writeFileSync(pkgPath, originalPkg);
    log(`Restored package.json main → ${origMain}`);
  }
}

// Report output
const distDir = join(ROOT, "dist-desktop");
if (existsSync(distDir)) {
  const exes = readdirSync(distDir).filter((f) => f.endsWith(".exe"));
  if (exes.length > 0) {
    log(`\n✅ Build complete! Files in dist-desktop/:\n`);
    for (const exe of exes) {
      const { size } = statSync(join(distDir, exe));
      const mb = (size / 1024 / 1024).toFixed(1);
      log(`  📦 ${exe} (${mb} MB)`);
    }
  }
}
