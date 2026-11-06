import { redirect } from "next/navigation";

// /history became /metrics; keep old links working.
export default function HistoryRedirect() {
  redirect("/metrics");
}
