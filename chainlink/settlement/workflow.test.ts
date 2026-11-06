import { expect } from "bun:test";
import { HttpActionsMock, newTestRuntime, test } from "@chainlink/cre-sdk/test";
import { encodeFunctionResult, keccak256, parseAbi, toHex } from "viem";
import { configSchema, initWorkflow, onCron } from "./workflow";

const now = Date.parse("2026-11-06T22:00:00Z");
const symbolId = keccak256(toHex("NASDAQ:NVDA"));
const market = "0x0000000000000000000000000000000000000001";
const oracle = "0x0000000000000000000000000000000000000002";
const job = { id: `1874:${market}:0:${now / 1000}`, chainId: 1874, policyId: 0, market, oracle,
  symbol: "NASDAQ:NVDA", symbolId, expiry: now / 1000, startPrice: "10000000000" };
const config = { schedule: "0 */5 * * * *", jobsUrl: "http://localhost:8080/api/chainlink/jobs", reportUrl: "http://localhost:8080/api/chainlink/reports", deliveryEnabled: false,
  chains: [{ chainId: 1874 as const, rpc: "https://rpc.testnet.whitechain.io", market, oracle }] };
const abi = parseAbi(["function getPolicy(uint256) view returns ((address holder,bytes32 symbol,bytes32 market,uint256 notional,uint256 shares,uint32 deductibleBps,uint32 capBps,uint256 premium,uint256 startPrice,uint64 start,uint64 expiry,uint8 status,uint256 payout,uint256 settlePrice))"]);

function setup(options: { disagree?: boolean; wrongChain?: boolean; delivery?: boolean; emptyJobs?: boolean } = {}) {
  const mock = HttpActionsMock.testInstance(); let deliveries = 0;
  mock.sendRequest = (input) => {
    let result: string;
    if (input.url === config.jobsUrl) result = JSON.stringify({ jobs: options.emptyJobs ? [] : [job] });
    else if (input.url === config.chains[0].rpc) {
      const req = JSON.parse(Buffer.from(input.body).toString());
      result = JSON.stringify({ jsonrpc: "2.0", id: 1, result: req.method === "eth_chainId" ? (options.wrongChain ? "0x1" : "0x752") : options.emptyJobs ? "0x" + "5".padStart(64, "0") :
        encodeFunctionResult({ abi, functionName: "getPolicy", result: { holder: market, symbol: symbolId, market: symbolId,
          notional: 10000000000n, shares: 1000000000000000000n, deductibleBps: 1000, capBps: 1000, premium: 1000000n,
          startPrice: 10000000000n, start: BigInt(now / 1000 - 86400), expiry: BigInt(now / 1000), status: 1, payout: 0n, settlePrice: 0n } }) });
    } else if (input.url.startsWith("https://query1.finance.yahoo.com/")) result = JSON.stringify({ chart: { result: [{ meta: { symbol: "NVDA", currency: "USD" }, timestamp: [now / 1000 - 8 * 3600], indicators: { quote: [{ close: [80] }] } }] } });
    else if (input.url.startsWith("https://stooq.com/")) result = `Date,Open,High,Low,Close,Volume\n2026-11-06,80,81,79,${options.disagree ? "95" : "80.10"},100`;
    else if (input.url === config.reportUrl) { deliveries++; result = JSON.stringify({ ok: true, validationOnly: true }); }
    else throw new Error(`Unexpected endpoint: ${input.url}`);
    return { statusCode: 200, body: Buffer.from(result).toString("base64") };
  };
  const secrets = new Map([["main", new Map([["CHAINLINK_REPORT_TOKEN", "x".repeat(40)]])]]);
  const runtime = newTestRuntime(secrets, { timeProvider: () => now }, { ...config, deliveryEnabled: Boolean(options.delivery) });
  return { runtime, deliveries: () => deliveries };
}

test("real CRE SDK handler reads chain state, validates two providers and returns a report", () => {
  const { runtime, deliveries } = setup();
  const output = JSON.parse(onCron(runtime));
  expect(output.mode).toBe("read-only"); expect(output.reports[0].price).toBe("8005000000");
  expect(output.reports[0].observations).toHaveLength(2); expect(deliveries()).toBe(0);
  expect(initWorkflow(config)).toHaveLength(1);
});
test("price disagreement produces no report delivery", () => {
  const { runtime, deliveries } = setup({ disagree: true });
  expect(() => onCron(runtime)).toThrow("disagreement"); expect(deliveries()).toBe(0);
});
test("wrong RPC network stops the workflow before delivery", () => {
  const { runtime, deliveries } = setup({ wrongChain: true });
  expect(() => onCron(runtime)).toThrow("chain mismatch"); expect(deliveries()).toBe(0);
});
test("explicit delivery sends one validated report through the authenticated relay", () => {
  const { runtime, deliveries } = setup({ delivery: true });
  expect(JSON.parse(onCron(runtime)).mode).toBe("report-delivery");
  expect(deliveries()).toBe(1);
});
test("workflow configuration rejects insecure remote APIs and mainnet", () => {
  expect(() => configSchema.parse({ ...config, jobsUrl: "http://untrusted.example/jobs" })).toThrow();
  expect(() => configSchema.parse({ ...config, chains: [{ ...config.chains[0], chainId: 1 }] })).toThrow();
});
test("an empty expiry queue monitors the actual market and live-price adapter without authorising settlement", () => {
  const { runtime, deliveries } = setup({ emptyJobs: true, delivery: true });
  const output = JSON.parse(onCron(runtime));
  expect(output.reports).toHaveLength(0);
  expect(output.monitor.policyCount).toBe("5");
  expect(output.monitor.observation.provider).toBe("yahoo");
  expect(output.monitor.settlementAuthorised).toBe(false);
  expect(deliveries()).toBe(0);
});
