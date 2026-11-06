import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ethers } from "ethers";
import { CONTROL_ACTIONS, controlMessage } from "../shared/agent-control.mjs";
import { AgentState } from "./state.js";
import { audit } from "./audit.js";
import { AgentRuntime, parameters } from "./runtime.js";
import { CHAIN_ID, insist, DEFAULT_LIMITS } from "./policy.js";

export function controlPayload(action, raw = {}) {
  insist(CONTROL_ACTIONS.includes(action), "Unknown agent action");
  insist(raw && typeof raw === "object" && !Array.isArray(raw), "Invalid action parameters");
  if (action === "plan") return parameters(raw);
  if (action === "run") {
    insist(Object.keys(raw).length === 1 && typeof raw.planId === "string" && /^[a-f0-9-]{36}$/.test(raw.planId), "A valid preflight is required");
    return { planId: raw.planId };
  }
  if (action === "settings") {
    insist(Object.keys(raw).length === 1 && raw.limits && typeof raw.limits === "object" && !Array.isArray(raw.limits), "Invalid spending limits");
    insist(Object.keys(raw.limits).length > 0 && Object.keys(raw.limits).every((k) => Object.hasOwn(DEFAULT_LIMITS, k)), "Unexpected limit");
    for (const [key, value] of Object.entries(raw.limits)) insist(key === "maxOpenPolicies" ? Number.isInteger(value) && value > 0 && value <= DEFAULT_LIMITS[key] :
      typeof value === "string" && /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= BigInt(DEFAULT_LIMITS[key]), "Limit exceeds service ceiling");
    return { limits: raw.limits };
  }
  insist(Object.keys(raw).length === 0, "This action takes no parameters");
  return {};
}

export function mountAgentControls(app, options = {}) {
  const env = options.env || process.env;
  const config = options.config;
  const controller = ethers.isAddress(env.AGENT_CONTROLLER_ADDRESS || "") && env.AGENT_CONTROLLER_ADDRESS !== ethers.ZeroAddress ? ethers.getAddress(env.AGENT_CONTROLLER_ADDRESS) : null;
  let runtime = options.runtime || null;
  let state = options.state || null;
  const stopped = () => env.AGENT_KILL_SWITCH === "1" || Boolean(config && fs.existsSync(config.killFile));
  const ready = () => {
    insist(config && !env.VERCEL, "Agent control requires the persistent testnet merchant", 503);
    if (!runtime) {
      try { runtime = new AgentRuntime({ config, env }); }
      catch { throw Object.assign(new Error("Complete the dedicated agent wallet setup before using controls"), { status: 503 }); }
    }
    return runtime;
  };
  const authState = () => {
    if (!state) state = new AgentState(path.join(path.resolve(env.AGENT_STATE_DIR || ".agent-state"), "control.sqlite"));
    return state;
  };
  const wrap = (fn) => async (req, res) => {
    res.set("Cache-Control", "no-store");
    try { await fn(req, res); }
    catch (e) { res.status(e.status || 503).json({ ok: false, error: e.status ? e.message : "Agent action failed; refresh its status before retrying" }); }
  };
  app.get("/api/agent/control/status", wrap(async (req, res) => {
    let snapshot = { ready: false, reason: "The persistent agent merchant is not enabled" };
    if (config && !env.VERCEL) {
      try { snapshot = ready().status(); }
      catch (e) { snapshot.reason = e.message; }
    }
    res.json({ ...snapshot, controller, controlsEnabled: Boolean(config && controller && snapshot.ready && !env.VERCEL),
      stopped: stopped(), environmentStopped: env.AGENT_KILL_SWITCH === "1", chainId: CHAIN_ID });
  }));
  app.post("/api/agent/control/challenge", wrap(async (req, res) => {
    insist(config && controller && !env.VERCEL, "Wallet-signed agent controls are not configured", 503);
    const action = req.body?.action;
    const payload = controlPayload(action, req.body?.payload);
    const now = Date.now();
    const db = authState().db;
    db.prepare("DELETE FROM control_nonces WHERE expires<?").run(now);
    insist(db.prepare("SELECT COUNT(*) AS n FROM control_nonces").get().n < 20, "Too many pending authorisations; wait for them to expire", 429);
    const authorization = { origin: config.origin, chainId: CHAIN_ID, controller, action, payload,
      nonce: randomUUID(), expiresAt: now + 120000 };
    db.prepare("INSERT INTO control_nonces VALUES (?,?,?)").run(authorization.nonce, JSON.stringify(authorization), authorization.expiresAt);
    res.json({ authorization, message: controlMessage(authorization) });
  }));
  app.post("/api/agent/control", wrap(async (req, res) => {
    insist(config && controller && !env.VERCEL, "Wallet-signed agent controls are not configured", 503);
    const s = authState();
    const authorization = s.transaction(() => {
      insist(typeof req.body?.nonce === "string", "Missing control nonce", 403);
      const row = s.db.prepare("SELECT * FROM control_nonces WHERE nonce=?").get(req.body.nonce);
      insist(row && row.expires > Date.now(), "Authorisation expired or already used", 403);
      const a = JSON.parse(row.authorization);
      let signer;
      try { signer = ethers.verifyMessage(controlMessage(a), req.body.signature); } catch { /* fail closed */ }
      insist(signer === controller, "Only the configured controller wallet can authorise actions", 403);
      s.db.prepare("DELETE FROM control_nonces WHERE nonce=?").run(a.nonce);
      return a;
    });
    const { action, payload } = authorization;
    audit(s, "controller.authorized", { action, controller });
    if (action === "stop") {
      fs.mkdirSync(path.dirname(config.killFile), { recursive: true, mode: 0o700 });
      fs.writeFileSync(config.killFile, "Stopped from the agent dashboard\n", { mode: 0o600 });
      return res.json({ ok: true, stopped: true });
    }
    const agent = ready();
    if (action === "resume") {
      insist(env.AGENT_KILL_SWITCH !== "1", "Environment emergency stop must be cleared by the operator", 409);
      insist(!agent.status().locked, "Reconcile the prior run before resuming", 409);
      if (fs.existsSync(config.killFile)) fs.unlinkSync(config.killFile);
      return res.json({ ok: true, stopped: false });
    }
    insist(!stopped(), "Emergency stop active", 409);
    if (action === "settings") return res.json({ ok: true, limits: agent.saveSettings(payload.limits) });
    if (action === "plan") return res.json({ ok: true, plan: await agent.plan(payload) });
    const id = agent.start(payload.planId);
    res.status(202).json({ ok: true, runId: id });
  }));
}
