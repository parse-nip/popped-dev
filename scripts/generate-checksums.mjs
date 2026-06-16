#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const manifest = JSON.parse(
  readFileSync(join(root, "src/locked/manifest.json"), "utf8")
);

const checksums = {};

for (const relativePath of manifest.files) {
  const fullPath = join(root, relativePath);
  const content = readFileSync(fullPath);
  checksums[relativePath] = createHash("sha256").update(content).digest("hex");
}

const outPath = join(root, "src/locked/checksums.json");
writeFileSync(outPath, `${JSON.stringify(checksums, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
