#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const checksumsPath = join(root, "src/locked/checksums.json");

if (!existsSync(checksumsPath)) {
  console.error("Missing src/locked/checksums.json — run: npm run lock:checksum");
  process.exit(1);
}

const expected = JSON.parse(readFileSync(checksumsPath, "utf8"));
let failed = false;

for (const [relativePath, expectedHash] of Object.entries(expected)) {
  const fullPath = join(root, relativePath);
  if (!existsSync(fullPath)) {
    console.error(`Missing locked file: ${relativePath}`);
    failed = true;
    continue;
  }

  const content = readFileSync(fullPath);
  const actualHash = createHash("sha256").update(content).digest("hex");

  if (actualHash !== expectedHash) {
    console.error(`Checksum mismatch: ${relativePath}`);
    console.error(`  expected: ${expectedHash}`);
    console.error(`  actual:   ${actualHash}`);
    failed = true;
  }
}

if (failed) {
  console.error(
    "\nLocked content was modified. Community PRs must not change src/locked/ or LockedIntro.tsx."
  );
  console.error("Site owner: update checksums with npm run lock:checksum after intentional edits.");
  process.exit(1);
}

console.log("Locked content verification passed.");
