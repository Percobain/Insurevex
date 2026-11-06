export const CONTROL_ACTIONS = ["plan", "run", "settings", "stop", "resume"];

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function controlMessage(a) {
  return ["InsureVEX agent control v1", `Origin: ${a.origin}`, `Network: Hedera testnet (${a.chainId})`,
    `Controller: ${a.controller}`, `Action: ${a.action}`, `Parameters: ${canonicalJson(a.payload)}`,
    `Expires: ${a.expiresAt}`, `Nonce: ${a.nonce}`,
    "Authorise this action for the dedicated testnet agent. Its payments remain subject to the spending policy."].join("\n");
}
