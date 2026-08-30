#!/usr/bin/env node
/**
 * Build each app and save the unpacked folder separately.
 */
import { execSync } from "node:child_process";
import { cpSync, rmSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEST = join(ROOT, "dist-desktop");

const VARIANTS = [
  { name: "Doctor",  config: "electron/electron-builder-doctor.json",  main: "electron/main-doctor.js" },
  { name: "Patient", config: "electron/electron-builder-patient.json", main: "electron/main-patient.js" },
  { name: "Lab",     config: "electron/electron-builder-lab.json",     main: "electron/main-lab.js" },
  { name: "Server",  config: "electron/electron-builder-server.json",  main: "electron/main-server.js" },
];

// Read original main from package.json
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const originalMain = pkg.main;

for (const v of VARIANTS) {
  console.log(`\n🔨 Building ${v.name}...`);

  // Patch package.json main
  pkg.main = v.main;
  writeFileSync(join(ROOT, "package.json"), JSON.stringify(pkg, null, 2));

  // Build with dir target (not portable) to get unpacked folder
  try {
    execSync(
      `npx electron-builder --config ${v.config} --win dir`,
      { cwd: ROOT, stdio: "inherit" }
    );
  } catch (e) {
    console.error(`❌ Failed to build ${v.name}:`, e.message);
  }

  // Copy win-unpacked to a named folder
  const src = join(DEST, "win-unpacked");
  const dst = join(DEST, v.name);
  if (existsSync(src)) {
    if (existsSync(dst)) rmSync(dst, { recursive: true });
    cpSync(src, dst, { recursive: true });
    console.log(`✅ Saved ${v.name} to dist-desktop/${v.name}/`);
  }
}

// Restore original main
pkg.main = originalMain;
writeFileSync(join(ROOT, "package.json"), JSON.stringify(pkg, null, 2));
console.log("\n✅ All builds complete!");
