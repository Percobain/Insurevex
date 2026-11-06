// Copies the canonical shared modules into each deploy root (server/ and app/ deploy to Vercel separately and
// cannot import files outside their own folder). Run after editing anything in shared/: node shared/sync.mjs
import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
for (const dest of ["../server/src/shared", "../app/src/shared"]) {
  copyFileSync(join(here, "agent-control.mjs"), join(here, dest, "agent-control.mjs"));
  console.log("synced", join(dest, "agent-control.mjs"));
}
