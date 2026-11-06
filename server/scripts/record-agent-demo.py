"""Record a real autonomous CLI run, with its live output and final receipts.

Requires Pillow and ffmpeg. Starts a real paid testnet run, subject to all agent
budgets. Run from server/ after starting the merchant. No synthetic transactions.
"""
import json
import os
from pathlib import Path
import selectors
import subprocess
import sys
import textwrap
import time
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / "docs" / "evidence"
OUT.mkdir(parents=True, exist_ok=True)
FONT_PATH = os.environ.get("DEMO_FONT", "/System/Library/Fonts/Menlo.ttc")
FONT = ImageFont.truetype(FONT_PATH, 17)
SMALL = ImageFont.truetype(FONT_PATH, 14)
TITLE = ImageFont.truetype(FONT_PATH, 28)
W, H, FPS = 1440, 960, 2
video = OUT / "hedera-x402-demo.mp4"
ffmpeg = subprocess.Popen([
    "ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
    "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264",
    "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", str(video)
], stdin=subprocess.PIPE)
start = time.monotonic()
lines = ["$ npm run agent:run", ""]

def frame(summary=None):
    im = Image.new("RGB", (W, H), "#0b1120")
    draw = ImageDraw.Draw(im)
    draw.text((40, 28), "InsureVEX | AI Agents That Pay", font=TITLE, fill="#eef2ff")
    draw.text((40, 75), "LIVE TESTNET RUN  |  Official x402 facilitator  |  No per-payment approval", font=FONT, fill="#7dd3fc")
    draw.rounded_rectangle((30, 115, W - 30, H - 100), 12, fill="#111b30", outline="#263653")
    display = summary or lines[-32:]
    y = 136
    for line in display:
        for wrapped in textwrap.wrap(line, width=128, replace_whitespace=False) or [""]:
            if y > H - 130:
                break
            color = "#86efac" if ("settled" in wrapped or "confirmed" in wrapped or "SUCCESS" in wrapped) else "#e2e8f0"
            draw.text((48, y), wrapped, font=FONT, fill=color)
            y += 21
    elapsed = time.monotonic() - start
    draw.text((40, H - 74), "Limits: $25 notional | $1 premium/policy | 0.05 HBAR service/day | 2 HBAR gas/day", font=SMALL, fill="#cbd5e1")
    draw.text((40, H - 48), f"Hedera testnet only | ATS holdings + KYC | persistent budgets | HCS audit | elapsed {elapsed:.1f}s", font=SMALL, fill="#94a3b8")
    ffmpeg.stdin.write(im.tobytes())

for _ in range(6):
    frame(["InsureVEX autonomous insurance agent", "", "1. Discover an underwriting API", "2. Receive HTTP 402 and validate its exact payment requirements", "3. Sign a bounded test HBAR transfer; facilitator sponsors settlement", "4. Verify the quote and pay the test USD insurance premium", "5. Anchor the spending log in Hedera Consensus Service", "", "The following terminal output is captured from an actual run."])
    time.sleep(1 / FPS)

run = subprocess.Popen(["node", "scripts/agent.js", "--execute"], cwd=ROOT,
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=0)
selector = selectors.DefaultSelector()
selector.register(run.stdout, selectors.EVENT_READ)
pending = b""
while run.poll() is None or selector.get_map():
    tick = time.monotonic()
    for key, _ in selector.select(timeout=0):
        chunk = os.read(key.fileobj.fileno(), 65536)
        if chunk:
            pending += chunk
            while b"\n" in pending:
                line, pending = pending.split(b"\n", 1)
                value = line.decode("utf8", errors="replace")
                lines.append(value)
                print(value, flush=True)
        else:
            selector.unregister(key.fileobj)
    frame()
    if time.monotonic() - start > 240:
        run.terminate()
        lines.append("Stopped: demo exceeded the 4-minute safety limit. Reconcile before retrying.")
        break
    time.sleep(max(0, 1 / FPS - (time.monotonic() - tick)))

code = run.wait()
(OUT / "hedera-x402-demo.log").write_text("\n".join(lines))
if code == 0:
    state = Path(os.environ.get("AGENT_STATE_DIR", ROOT / ".agent-state"))
    evidence = json.loads((state / "last-run.json").read_text())
    (OUT / "hedera-x402.json").write_text(json.dumps(evidence, indent=2) + "\n")
    summary = ["SUCCESS: autonomous x402 underwriting + insurance purchase", "",
        "x402 service payment (0.01 test HBAR):", evidence["servicePayment"]["transaction"], evidence["servicePayment"]["hashscan"], "",
        f"Insurance policy #{evidence['insurance']['policyId']}:", evidence["insurance"]["hashscan"], "",
        "Restricted HCS audit topic:", evidence["hcs"]["topic"] if evidence.get("hcs") else "Not configured",
        evidence["hcs"]["hashscan"] if evidence.get("hcs") else "", "",
        "All signing and payments completed without per-payment human approval.",
        "Transaction links and reproducible setup: README.md and docs/HEDERA_X402.md"]
else:
    summary = lines[-25:] + ["", "Run stopped safely. Inspect the recorded output before retrying."]
for _ in range(24):
    frame(summary)
    time.sleep(1 / FPS)
ffmpeg.stdin.close()
ffmpeg.wait()
print(f"Demo: {video}")
sys.exit(code)
