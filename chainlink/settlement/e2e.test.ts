// Local integration-test adapter. Uses the real SDK handler, API and EVM reads;
// only external market data and the SDK capability transport are fixtures.
import { HttpActionsMock, newTestRuntime, test } from "@chainlink/cre-sdk/test";
import { onCron } from "./workflow";

// Registered only by server's chainlink:e2e command, which starts the local chain/API.
if (process.env.CHAINLINK_E2E_CONTEXT) test("SDK delivers a report against actual local contracts and HTTP API", async () => {
  const context = await Bun.file(process.env.CHAINLINK_E2E_CONTEXT!).json();
  const mock = HttpActionsMock.testInstance();
  mock.sendRequest = (input) => {
    let result: string;
    if (input.url.startsWith("https://query1.finance.yahoo.com/")) {
      result = JSON.stringify({ chart: { result: [{ meta: { symbol: "NVDA", currency: "USD" },
        timestamp: [context.now - 8 * 3600], indicators: { quote: [{ close: [80] }] } }] } });
    } else if (input.url.startsWith("https://stooq.com/")) {
      result = "Date,Open,High,Low,Close,Volume\n2026-11-06,80,81,79,80.10,100";
    } else {
      if (!input.url.startsWith(context.base + "/")) throw new Error("Non-local request in local integration test");
      const args = ["--silent", "--show-error", "--fail-with-body", "--max-time", "15", input.url];
      for (const [key, value] of Object.entries(input.headers || {})) args.push("-H", `${key}: ${value}`);
      if (input.method === "POST") args.push("--data-binary", Buffer.from(input.body).toString());
      const response = Bun.spawnSync(["curl", ...args]);
      if (response.exitCode !== 0) throw new Error("Local HTTP integration request failed");
      result = response.stdout.toString();
    }
    return { statusCode: 200, body: Buffer.from(result).toString("base64") };
  };
  const secrets = new Map([["main", new Map([["CHAINLINK_REPORT_TOKEN", context.token]])]]);
  const runtime = newTestRuntime(secrets, { timeProvider: () => context.now * 1000 }, context.config);
  const output = JSON.parse(onCron(runtime));
  if (output.reports.length !== 1 || output.reports[0].price !== "8005000000") throw new Error("Unexpected workflow report");
  console.log(JSON.stringify({ sdk: "official test runtime (not CRE CLI/DON)", price: output.reports[0].price, mode: output.mode }));
});
