// Loads the stress-test wallets: W1..W3 from ../hidden.txt (never committed) and G1..G5 generated once into
// stress/wallets.local.json (gitignored). Keys are never printed.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const ROOT = path.join(__dirname, "..", "..");
const LOCAL = path.join(__dirname, "wallets.local.json");
function loadKeys() {
  const keys = {};
  for (const l of fs.readFileSync(path.join(ROOT, "hidden.txt"), "utf8").split(/\r?\n/)) {
    const m = l.match(/(W\d+)\W+((?:0x)?[0-9a-fA-F]{64})/);
    if (m) keys[m[1]] = m[2].startsWith("0x") ? m[2] : "0x" + m[2];
  }
  if (!fs.existsSync(LOCAL)) {
    const gen = {};
    for (const n of ["G1", "G2", "G3", "G4", "G5"]) gen[n] = ethers.Wallet.createRandom().privateKey;
    fs.writeFileSync(LOCAL, JSON.stringify(gen, null, 2));
  }
  Object.assign(keys, JSON.parse(fs.readFileSync(LOCAL, "utf8")));
  return keys;
}
module.exports = { loadKeys };
