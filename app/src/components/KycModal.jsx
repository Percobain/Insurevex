"use client";
import { useState } from "react";
import { useAccount } from "wagmi";
import { apiPost } from "@/lib/api";
import { useToasts } from "./Toasts";

export const COUNTRIES = [
  { code: 840, name: "United States" }, { code: 356, name: "India" }, { code: 826, name: "United Kingdom" },
  { code: 276, name: "Germany" }, { code: 250, name: "France" }, { code: 392, name: "Japan" }, { code: 344, name: "Hong Kong" },
  { code: 702, name: "Singapore" }, { code: 36, name: "Australia" }, { code: 124, name: "Canada" }, { code: 76, name: "Brazil" },
  { code: 756, name: "Switzerland" }, { code: 410, name: "South Korea" }, { code: 158, name: "Taiwan" }, { code: 710, name: "South Africa" },
  { code: 682, name: "Saudi Arabia" }, { code: 784, name: "United Arab Emirates" }, { code: 528, name: "Netherlands" },
];

export default function KycModal({ onClose }) {
  const { address } = useAccount();
  const { push } = useToasts();
  const [name, setName] = useState("");
  const [country, setCountry] = useState(356);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPost("/api/kyc/request", { address, country: Number(country), name });
      setDone(true);
      push({ state: "success", title: "KYC request sent", body: "The issuer approves it on-chain from the Issuer console." });
    } catch (err) {
      push({ state: "error", title: "Could not reach the InsureVEX server", body: String(err.message || err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card w-full max-w-md p-6 space-y-4">
        <div>
          <div className="eyebrow">Identity</div>
          <h2 className="text-xl font-semibold mt-1">Verify to hold notes and buy cover</h2>
          <p className="text-sm text-ink2 mt-2">
            InsureVEX notes and policies are restricted assets. The issuer records your verification in the on-chain identity registry;
            every transfer checks it. Testnet: no documents needed.
          </p>
        </div>
        {done ? (
          <div className="rounded-xl bg-sunk p-4 text-sm">Request received for <span className="font-mono">{address}</span>. You can close this window.</div>
        ) : (
          <>
            <label className="block space-y-1.5">
              <span className="label">Full name</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Asha Rao" required />
            </label>
            <label className="block space-y-1.5">
              <span className="label">Country of residence</span>
              <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </label>
          </>
        )}
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
          {!done && <button className="btn-primary" disabled={busy || !name}>{busy ? "Sending…" : "Request verification"}</button>}
        </div>
      </form>
    </div>
  );
}
