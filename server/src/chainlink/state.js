import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export class SettlementState {
  constructor(file) {
    if (!path.isAbsolute(file) || file.startsWith("/tmp/")) throw new Error("CRE state must use an absolute persistent path");
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(file); fs.chmodSync(file, 0o600);
    this.db.exec("PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, price TEXT NOT NULL, body TEXT NOT NULL, validated_at INTEGER NOT NULL, status TEXT NOT NULL, tx TEXT);");
  }
  get(id) {
    const r = this.db.prepare("SELECT * FROM reports WHERE id=?").get(id);
    return r ? { ...r, body: JSON.parse(r.body) } : null;
  }
  accept(id, result, now) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const old = this.get(id);
      if (old && old.price !== result.price) throw new Error("Conflicting report already exists; operator reconciliation required");
      if (old?.status !== "settled") this.db.prepare("INSERT INTO reports VALUES (?,?,?,?, 'validated',NULL) ON CONFLICT(id) DO UPDATE SET body=excluded.body,validated_at=excluded.validated_at")
        .run(id, result.price, JSON.stringify(result), now);
      this.db.exec("COMMIT"); return this.get(id);
    } catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }
  settled(id, tx) { this.db.prepare("UPDATE reports SET status='settled',tx=? WHERE id=?").run(tx, id); }
  recent() { return this.db.prepare("SELECT * FROM reports ORDER BY validated_at DESC LIMIT 20").all().map((r) => ({ ...r, body: JSON.parse(r.body) })); }
  close() { this.db.close(); }
}
