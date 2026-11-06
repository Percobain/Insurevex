import { canonicalJson, controlMessage } from "../shared/agent-control.mjs";
import { AGENT_API_BASE, apiPost } from "./api";

export async function authoriseAgentAction({ action, payload = {}, address, signMessageAsync }) {
  const { authorization: a, message } = await apiPost("/api/agent/control/challenge", { action, payload });
  if (!a || a.chainId !== 296 || a.controller?.toLowerCase() !== address?.toLowerCase() || a.action !== action ||
    a.origin !== new URL(AGENT_API_BASE).origin || canonicalJson(a.payload) !== canonicalJson(payload) ||
    a.expiresAt <= Date.now() || a.expiresAt > Date.now() + 125000 || message !== controlMessage(a)) {
    throw new Error("The authorisation does not match the action you requested.");
  }
  const signature = await signMessageAsync({ message });
  return apiPost("/api/agent/control", { nonce: a.nonce, signature }, { timeout: action === "plan" ? 60000 : 20000 });
}

export const LIMIT_FIELDS = [
  { key: "notionalPerPolicy", label: "Protected amount per policy", decimals: 6, unit: "tUSD" },
  { key: "premiumPerPolicy", label: "Premium per policy", decimals: 6, unit: "tUSD" },
  { key: "premiumDaily", label: "Premiums per day", decimals: 6, unit: "tUSD" },
  { key: "apiPerCall", label: "Underwriting fee per request", decimals: 8, unit: "HBAR" },
  { key: "apiDaily", label: "Underwriting fees per day", decimals: 8, unit: "HBAR" },
  { key: "gasPerTransaction", label: "Gas per transaction", decimals: 8, unit: "HBAR" },
  { key: "gasDaily", label: "Gas per day", decimals: 8, unit: "HBAR" },
  { key: "maxOpenPolicies", label: "Open policies", decimals: 0, unit: "policies" },
];

export function displayUnits(value, decimals) {
  if (value === undefined || value === null) return "";
  const raw = String(value).padStart(decimals + 1, "0");
  if (!decimals) return raw;
  const fraction = raw.slice(-decimals).replace(/0+$/, "");
  return raw.slice(0, -decimals) + (fraction ? `.${fraction}` : "");
}

export function inputUnits(value, decimals) {
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${Math.max(1, decimals)}})?$`).test(value) || (!decimals && value.includes("."))) throw new Error("Enter a valid positive limit.");
  const [whole, fraction = ""] = value.split(".");
  const result = BigInt(whole + fraction.padEnd(decimals, "0"));
  if (result <= 0n) throw new Error("Spending limits must be greater than zero.");
  return result.toString();
}
