"""Snapshot economic expectation gaps from saved results, without refitting models.

Run: python3 backtest/track_failures.py
Stdlib only. Keeps timestamped snapshots and source hashes for comparison.
"""
import csv
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from audit_saved_results import main as audit_saved_results
from contextlib import redirect_stdout
from io import StringIO

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / "backtest/results/principal_research"


def snapshot():
    sources = {}

    def read(path, csv_file=False):
        raw = path.read_bytes()
        sources[str(path.relative_to(ROOT))] = hashlib.sha256(raw).hexdigest()
        return list(csv.DictReader(raw.decode().splitlines())) if csv_file else json.loads(raw)

    summary = read(RESEARCH / "summary.json")
    verification = read(RESEARCH / "verification.json")
    cohorts = read(RESEARCH / "insurance_cohorts.csv", True)
    holding = read(RESEARCH / "holding_floor_summary.json")
    models = read(RESEARCH / "model_sensitivity_summary.json")
    historical = read(ROOT / "backtest/results/stress_book.json")
    read(ROOT / "contracts/deployments/hederaTestnet.stress.json")
    read(ROOT / "contracts/stress/book.json")
    read(ROOT / "app/public/data/stress_backtest.json")
    read(ROOT / "app/public/data/stress_run.json")
    output = StringIO()
    with redirect_stdout(output):
        audit_saved_results()
    audit = json.loads(output.getvalue())
    matched = [r for r in cohorts if r["design"] == "matched_zero"]
    accepted = sum(r["accepted"] == "True" for r in matched)
    rejected = len(matched) - accepted
    floor = next(r for r in summary["rate_summary"] if r["period"] == "since_1999" and r["term"] == 3)
    gaps = [
        dict(id="PRINCIPAL-01", status="OPEN", expected="Legacy floor maturity >= 1 per dollar of face",
             observed=floor, scope="Floor asset alone, overlapping 3-year cohorts since June 1999; not whole-note losses"),
        dict(id="PRO-01", status="OPEN", expected="Measure Pro net loss separately from gross claims and pool return",
             observed=audit["testnet"], scope="Saved two-round testnet execution; test USD, not historical CAGR"),
        dict(id="PRO-02", status="OPEN", expected="Continuous Pro investment performance with explicit capital flows",
             observed=dict(**audit["historical"], negative_years=[r for r in historical["yearly"] if r["pro_ret"] < 0]),
             scope="Annual capital resets; continuous unfunded return remains unknown"),
        dict(id="VERIFY-01", status="OPEN" if (accepted, rejected) != (verification["matched_weekly_cohorts"], verification["weekly_rejected"]) else "MATCHED",
             expected="Saved verification counts equal current cohort CSV counts",
             observed=dict(csv_accepted=accepted, csv_rejected=rejected,
                           saved_accepted=verification["matched_weekly_cohorts"], saved_rejected=verification["weekly_rejected"])),
        dict(id="PRICE-01", status="OPEN", expected="Claims / premiums <= 0.95 before additional costs, given 5% execution charge",
             observed=models, scope="Weekly model sensitivities; not the original headline experiment"),
        dict(id="PRICE-02", status="OPEN", expected="Claims / premiums <= 0.95 before additional costs, given 5% execution charge",
             observed=holding, scope="Fixed 156-week stock floors; overlapping cohorts and assumed demand"),
    ]
    changed = [name for name, digest in sources.items()
               if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != digest]
    if changed:
        raise RuntimeError(f"Sources changed during snapshot; retry after generation finishes: {changed}")
    return dict(recorded_at=datetime.now(timezone.utc).isoformat(),
                scope="Saved-output snapshot, not a historical rerun or a test-suite result",
                custom_pro_return_target=None, custom_pro_drawdown_limit=None,
                source_sha256=sources, gaps=gaps,
                reconciliation=audit["checks"])


if __name__ == "__main__":
    data = snapshot()
    directory = ROOT / "backtest/results/failure_tracking"
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    path = directory / f"{stamp}.json"
    path.write_text(json.dumps(data, indent=2) + "\n")
    (directory / "latest.json").write_text(json.dumps(data, indent=2) + "\n")
    print(f"Saved {path.relative_to(ROOT)}")
    for gap in data["gaps"]:
        print(f"{gap['id']}: {gap['status']}")
