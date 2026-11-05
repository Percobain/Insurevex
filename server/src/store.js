// Tiny JSON file store (KYC requests, symbol registry, keeper state). Enough for a single-instance server.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.STORE_FILE || path.join(here, "..", "data", "store.json");
let db = {};
try { db = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { db = {}; }
let timer = null;
function flush() {
  clearTimeout(timer);
  timer = setTimeout(() => { try { fs.writeFileSync(FILE, JSON.stringify(db, null, 1)); } catch {} }, 200);
}
export const store = {
  get: (k, d) => (k in db ? db[k] : d),
  set: (k, v) => { db[k] = v; flush(); },
  push: (k, v) => { (db[k] ||= []).push(v); flush(); },
};
