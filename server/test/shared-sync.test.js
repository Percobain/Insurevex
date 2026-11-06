import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// server/src/shared is a deployable copy of ../shared (Vercel uploads server/ only). Fail if they drift.
test("server/src/shared/agent-control.mjs matches the canonical shared/ copy", () => {
  const canonical = new URL("../../shared/agent-control.mjs", import.meta.url);
  if (!existsSync(canonical)) return; // deployed bundle has no repo root
  const copy = new URL("../src/shared/agent-control.mjs", import.meta.url);
  assert.equal(readFileSync(copy, "utf8"), readFileSync(canonical, "utf8"), "run: node shared/sync.mjs");
});
test("server/src/shared/chainlink-settlement.mjs matches the canonical shared/ copy", () => {
  const canonical = new URL("../../shared/chainlink-settlement.mjs", import.meta.url);
  if (!existsSync(canonical)) return;
  const copy = new URL("../src/shared/chainlink-settlement.mjs", import.meta.url);
  assert.equal(readFileSync(copy, "utf8"), readFileSync(canonical, "utf8"), "run: node shared/sync.mjs");
});
