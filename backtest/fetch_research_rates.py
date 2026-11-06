"""Download and validate official inputs used by principal_research.py."""
import hashlib
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen, Request

import pandas as pd


def main():
    target = Path(__file__).resolve().parent / "data/research_raw"
    target.mkdir(parents=True, exist_ok=True)
    sources = {f"{series}.csv": f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}"
               for series in ["DTB3", "DGS1", "DGS3", "DGS5"]}
    sources["feds200628.csv"] = "https://www.federalreserve.gov/data/yield-curve-tables/feds200628.csv"
    provenance = []
    for filename, url in sources.items():
        with urlopen(Request(url, headers={"User-Agent": "InsureVEX-research/1.0"}), timeout=90) as response:
            raw = response.read()
        if filename == "feds200628.csv":
            table = pd.read_csv(io.BytesIO(raw), skiprows=9)
            assert {"Date", "SVENY01", "SVENY03", "SVENY05"}.issubset(table.columns)
        else:
            table = pd.read_csv(io.BytesIO(raw))
            assert filename[:-4] in table.columns
        assert len(table) > 10000, "unexpectedly short historical series"
        (target / filename).write_bytes(raw)
        provenance.append(dict(file=filename, url=url, rows=len(table), sha256=hashlib.sha256(raw).hexdigest()))
        print(filename, len(table), flush=True)
    (target / "provenance.json").write_text(json.dumps(dict(fetched_utc=datetime.now(timezone.utc).isoformat(), sources=provenance), indent=2))


if __name__ == "__main__":
    main()
