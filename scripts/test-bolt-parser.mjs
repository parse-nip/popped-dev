#!/usr/bin/env node
/**
 * Smoke tests for bolt-action-parser (no test runner required).
 * Run: node --experimental-strip-types scripts/test-bolt-parser.mjs
 */

import assert from "node:assert/strict";
import {
  boltActionsToEditResult,
  parseBoltActions,
} from "../shared/bolt-action-parser.ts";

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

console.log("bolt-action-parser");

test("parses file + shell actions", () => {
  const text = `
Here is the change:

<boltArtifact id="snake-game" title="Add snake game widget">
  <boltAction type="file" filePath="src/components/community/SnakeGame.tsx">
    export function SnakeGame() {
      return <div>Snake</div>;
    }
  </boltAction>
  <boltAction type="shell">
    npm install canvas-confetti
  </boltAction>
</boltArtifact>
`;

  const artifact = parseBoltActions(text);
  assert.ok(artifact);
  assert.equal(artifact.title, "Add snake game widget");
  assert.equal(artifact.actions.length, 2);
  assert.equal(artifact.actions[0].type, "file");
  assert.match(artifact.actions[0].content, /SnakeGame/);

  const result = boltActionsToEditResult(artifact);
  assert.equal(result.writes.length, 1);
  assert.equal(result.writes[0].path, "src/components/community/SnakeGame.tsx");
  assert.equal(result.commands.length, 1);
  assert.match(result.commands[0], /npm install/);
});

test("parses actions without artifact wrapper", () => {
  const text = `<boltAction type="file" filePath="./src/app/globals.css">
body { background: #000; }
</boltAction>`;

  const artifact = parseBoltActions(text);
  assert.ok(artifact);
  assert.equal(artifact.actions.length, 1);
  assert.equal(artifact.actions[0].filePath, "src/app/globals.css");
});

test("ignores non-npm shell commands", () => {
  const text = `
<boltArtifact id="x" title="X">
  <boltAction type="shell">npm run dev</boltAction>
  <boltAction type="file" filePath="index.js">x</boltAction>
</boltArtifact>`;

  const result = boltActionsToEditResult(parseBoltActions(text));
  assert.equal(result.commands.length, 0);
  assert.equal(result.writes.length, 1);
});

test("returns null for empty input", () => {
  assert.equal(parseBoltActions("just some text"), null);
});

test("multi-file artifact for complex builds", () => {
  const text = `<boltArtifact id="theme-toggle" title="Theme switcher">
  <boltAction type="file" filePath="src/components/community/ThemeToggle.tsx">export function ThemeToggle(){}</boltAction>
  <boltAction type="file" filePath="src/components/community/CommunityChrome.tsx">import { ThemeToggle } from "./ThemeToggle";
export function CommunityChrome() { return <ThemeToggle />; }</boltAction>
</boltArtifact>`;

  const result = boltActionsToEditResult(parseBoltActions(text));
  assert.equal(result.writes.length, 2);
  assert.equal(result.summary, "Theme switcher");
});

console.log("\nAll bolt-action-parser tests passed.");
