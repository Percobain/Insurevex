import { CronCapability, HTTPClient, bytesToBase64, consensusIdenticalAggregation, handler, text, type HTTPSendRequester, type Runtime } from "@chainlink/cre-sdk";
import { decodeFunctionResult, encodeFunctionData, parseAbi, keccak256, toHex } from "viem";
import { z } from "zod";
import { parseYahoo, parseStooq, sourceUrls, validateObservations } from "../../shared/chainlink-settlement.mjs";

// QuickJS has no URL global; keep validation independent of Node/browser APIs.
const url = z.string().regex(/^(?:https:\/\/[a-zA-Z0-9.-]+(?::\d+)?|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)(?:\/[a-zA-Z0-9._~!$&'()*+,;=:@%/?-]*)?$/, "HTTPS or localhost required");
const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
export const configSchema = z.object({ schedule: z.string(), jobsUrl: url, reportUrl: url,
  deliveryEnabled: z.boolean().default(false), chains: z.array(z.object({ chainId: z.union([z.literal(1874), z.literal(296)]), rpc: url, market: address, oracle: address })).min(1).max(2) });
type Config = z.infer<typeof configSchema>;
const jobSchema = z.object({ id: z.string(), chainId: z.number(), policyId: z.number().int().min(0).max(499), market: address, oracle: address,
  symbol: z.string(), symbolId: z.string().regex(/^0x[a-fA-F0-9]{64}$/), expiry: z.number().int(), startPrice: z.string() });
type Job = z.infer<typeof jobSchema>;
const abi = parseAbi(["function policyCount() view returns (uint256)", "function getPolicy(uint256) view returns ((address holder,bytes32 symbol,bytes32 market,uint256 notional,uint256 shares,uint32 deductibleBps,uint32 capBps,uint256 premium,uint256 startPrice,uint64 start,uint64 expiry,uint8 status,uint256 payout,uint256 settlePrice))"]);

function startRequest(sender: HTTPSendRequester, url: string, body?: unknown, token?: string) {
  return sender.sendRequest({ url, method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 InsureVEX-CRE/1.0", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: bytesToBase64(new TextEncoder().encode(JSON.stringify(body))), cacheSettings: { store: false } } : {}) });
}
function finishRequest(pending: ReturnType<typeof startRequest>) {
  const response = pending.result();
  if (response.statusCode !== 200) throw new Error(`HTTP ${response.statusCode}; settlement remains pending`);
  const bodyText = text(response);
  if (bodyText.length > 262144) throw new Error("Source response exceeds the workflow size limit");
  return bodyText;
}
function request(sender: HTTPSendRequester, url: string, body?: unknown, token?: string) {
  return finishRequest(startRequest(sender, url, body, token));
}

function readAndValidate(sender: HTTPSendRequester, config: Config, now: number): string {
  const raw = JSON.parse(request(sender, config.jobsUrl));
  if (!Array.isArray(raw.jobs) || raw.jobs.length > 10) throw new Error("Too many settlement jobs");
  const jobs = z.object({ jobs: z.array(jobSchema).max(10) }).parse(raw).jobs;
  const reports = [];
  let monitor = null;
  // With no expired policy, still exercise the real insurance market and price API.
  // This observation is explicitly NOT a two-source settlement authorisation.
  if (!jobs.length) {
    const target = config.chains[0];
    const rpc = (method: string, params: unknown[]) => {
      const result = JSON.parse(request(sender, target.rpc, { jsonrpc: "2.0", id: 1, method, params }));
      if (result.error || !result.result) throw new Error("Market monitor blockchain read failed");
      return result.result;
    };
    if (Number(BigInt(rpc("eth_chainId", []))) !== target.chainId) throw new Error("RPC chain mismatch");
    const count = decodeFunctionResult({ abi, functionName: "policyCount", data: rpc("eth_call", [{ to: target.market, data: encodeFunctionData({ abi, functionName: "policyCount" }) }, "latest"]) });
    const sample = { symbol: "NASDAQ:NVDA", expiry: now };
    const observation = parseYahoo(request(sender, sourceUrls(sample).yahoo), sample, now);
    monitor = { chainId: target.chainId, market: target.market, policyCount: count.toString(), observation,
      settlementAuthorised: false, reason: "No expired jobs; single-source market observation only" };
  }
  // Bound capabilities and resource use: one policy per run in the initial integration.
  for (const job of jobs.slice(0, 1)) {
    const target = config.chains.find((c) => c.chainId === job.chainId);
    if (!target || target.market.toLowerCase() !== job.market.toLowerCase() || target.oracle.toLowerCase() !== job.oracle.toLowerCase()) throw new Error("Job contract is not allowlisted");
    const rpc = (method: string, params: unknown[]) => {
      const result = JSON.parse(request(sender, target.rpc, { jsonrpc: "2.0", id: 1, method, params }));
      if (result.error || !result.result) throw new Error("Blockchain read failed");
      return result.result;
    };
    if (Number(BigInt(rpc("eth_chainId", []))) !== job.chainId) throw new Error("RPC chain mismatch");
    const data = encodeFunctionData({ abi, functionName: "getPolicy", args: [BigInt(job.policyId)] });
    const p = decodeFunctionResult({ abi, functionName: "getPolicy", data: rpc("eth_call", [{ to: job.market, data }, "latest"]) });
    if (p.status !== 1 || p.symbol !== job.symbolId || keccak256(toHex(job.symbol)) !== job.symbolId || Number(p.expiry) !== job.expiry || p.startPrice.toString() !== job.startPrice || job.expiry > now) throw new Error("Job does not match an open expired policy");
    const urls = sourceUrls(job);
    const yahoo = startRequest(sender, urls.yahoo);
    const stooq = startRequest(sender, urls.stooq);
    const observations = [parseYahoo(finishRequest(yahoo), job, now), parseStooq(finishRequest(stooq), job, now)];
    const result = validateObservations(job, observations, now);
    reports.push({ chainId: job.chainId, policyId: job.policyId, jobId: job.id, observations: result.observations, price: result.price });
  }
  // Identical aggregation happens on canonical values, not raw provider HTTP responses.
  return JSON.stringify({ reports, monitor });
}

export function onCron(runtime: Runtime<Config>): string {
  const http = new HTTPClient();
  const now = Math.floor(runtime.now().getTime() / 1000);
  const result = http.sendRequest(runtime, readAndValidate, consensusIdenticalAggregation())(runtime.config, now).result();
  const { reports, monitor } = JSON.parse(result) as { reports: Array<{ chainId: number; policyId: number; jobId: string; observations: unknown[]; price: string }>; monitor: null | { chainId: number; policyCount: string; observation: { symbol: string; price: string; sessionDate: string } } };
  if (monitor) runtime.log(`InsureVEX CRE market monitor: chain ${monitor.chainId}, ${monitor.policyCount} policies; ${monitor.observation.symbol} close ${monitor.observation.price} USD (${monitor.observation.sessionDate}). No settlement authorised.`);
  else runtime.log(`CRE validated ${reports.length} expired policies using on-chain state and two independent price providers`);
  if (runtime.config.deliveryEnabled && reports.length) {
    const token = runtime.getSecret({ id: "CHAINLINK_REPORT_TOKEN" }).result().value;
    if (token.length < 32) throw new Error("Relay secret is not configured");
    for (const report of reports) {
      const delivered = http.sendRequest(runtime, (sender: HTTPSendRequester, url: string, data: typeof report, secret: string) =>
        request(sender, url, data, secret), consensusIdenticalAggregation())(runtime.config.reportUrl, report, token).result();
      runtime.log(`Report delivered for policy ${report.policyId}: ${delivered}`);
    }
  }
  return JSON.stringify({ mode: runtime.config.deliveryEnabled ? "report-delivery" : "read-only", reports, monitor });
}

export function initWorkflow(config: Config) {
  return [handler(new CronCapability().trigger({ schedule: config.schedule }), onCron)];
}
