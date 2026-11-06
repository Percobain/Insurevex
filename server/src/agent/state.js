import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { insist } from "./policy.js";

// Durable state is a safety control. No in-memory or /tmp fallback for live payments.
export class AgentState {
  constructor(file) {
    insist(file && path.isAbsolute(file) && !file.startsWith("/tmp/"), "An absolute durable agent state path is required");
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(file);
    fs.chmodSync(file, 0o600);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, intent_hash TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, payment_hash TEXT UNIQUE);
      CREATE TABLE IF NOT EXISTS spending (id TEXT PRIMARY KEY, day TEXT NOT NULL, kind TEXT NOT NULL, merchant TEXT NOT NULL, amount TEXT NOT NULL, status TEXT NOT NULL, tx TEXT);
      CREATE TABLE IF NOT EXISTS locks (id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY, at TEXT NOT NULL, event TEXT NOT NULL, data TEXT NOT NULL, previous TEXT NOT NULL, digest TEXT NOT NULL);`);
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }
  get(id) {
    const r = this.db.prepare("SELECT * FROM requests WHERE id=?").get(id);
    return r ? { ...r, data: JSON.parse(r.data) } : null;
  }
  put(id, intentHash, data) {
    this.db.prepare("INSERT INTO requests VALUES (?,?,'quoted',?,NULL)").run(id, intentHash, JSON.stringify(data));
  }
  claim(id, paymentHash) {
    return this.transaction(() => {
      const r = this.get(id);
      insist(r?.status === "quoted", "Request already processing; reconcile before retrying", 409);
      insist(!this.db.prepare("SELECT id FROM requests WHERE payment_hash=?").get(paymentHash), "Payment replay rejected", 409);
      this.db.prepare("UPDATE requests SET status='settling',payment_hash=? WHERE id=?").run(paymentHash, id);
      return r;
    });
  }
  finish(id, status, data) { this.db.prepare("UPDATE requests SET status=?,data=? WHERE id=?").run(status, JSON.stringify(data), id); }
  acquire(id) {
    try { this.db.prepare("INSERT INTO locks VALUES (?)").run(id); }
    catch { throw new Error("Agent is running or a prior run needs reconciliation (persistent lock)"); }
  }
  release(id) { this.db.prepare("DELETE FROM locks WHERE id=?").run(id); }
  reserve(id, kind, merchant, amount, perCall, daily, day = new Date().toISOString().slice(0, 10)) {
    return this.transaction(() => {
      insist(amount > 0n && amount <= perCall, `${kind} per-call limit exceeded`);
      // Unknown/pending spends remain charged to the budget, including after a restart.
      const used = this.db.prepare("SELECT amount FROM spending WHERE day=? AND kind=?").all(day, kind)
        .reduce((n, r) => n + BigInt(r.amount), 0n);
      const merchantUsed = this.db.prepare("SELECT amount FROM spending WHERE day=? AND kind=? AND merchant=?").all(day, kind, merchant)
        .reduce((n, r) => n + BigInt(r.amount), 0n);
      insist(used + amount <= daily && merchantUsed + amount <= daily, `${kind} daily/merchant budget exceeded`);
      this.db.prepare("INSERT INTO spending VALUES (?,?,?,?,?,'reserved',NULL)").run(id, day, kind, merchant, amount.toString());
    });
  }
  spent(id, status, tx = null) { this.db.prepare("UPDATE spending SET status=?,tx=? WHERE id=?").run(status, tx, id); }
  spending() { return this.db.prepare("SELECT * FROM spending ORDER BY rowid DESC LIMIT 50").all(); }
  events() { return this.db.prepare("SELECT * FROM audit ORDER BY seq DESC LIMIT 50").all().map((r) => ({ ...r, data: JSON.parse(r.data) })); }
}
