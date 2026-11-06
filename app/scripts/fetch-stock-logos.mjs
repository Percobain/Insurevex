import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { MARKETS } from "../../server/src/catalog.js";

// Company websites, keyed by exchange-qualified symbol to avoid ticker collisions.
const domains = {
  "NASDAQ:NVDA": "nvidia.com", "NASDAQ:AAPL": "apple.com", "NASDAQ:MSFT": "microsoft.com", "NASDAQ:AMZN": "amazon.com",
  "NASDAQ:TSLA": "tesla.com", "NASDAQ:META": "meta.com", "NYSE:JPM": "jpmorganchase.com", "NYSE:XOM": "exxonmobil.com",
  "NYSEARCA:SPY": "ssga.com", "NASDAQ:QQQ": "invesco.com",
  "NSE:RELIANCE": "ril.com", "NSE:TCS": "tcs.com", "NSE:HDFCBANK": "hdfcbank.com", "NSE:INFY": "infosys.com",
  "NSE:ICICIBANK": "icicibank.com", "NSE:SBIN": "onlinesbi.sbi", "NSE:ADANIENT": "adanienterprises.com", "NSE:INDUSINDBK": "indusind.com",
  "LSE:HSBA": "hsbc.com", "LSE:SHEL": "shell.com", "LSE:AZN": "astrazeneca.com", "LSE:ULVR": "unilever.com", "LSE:BP": "bp.com", "LSE:RIO": "riotinto.com",
  "XETRA:SAP": "sap.com", "XETRA:SIE": "siemens.com", "XETRA:ALV": "allianz.com", "XETRA:DTE": "telekom.com", "XETRA:BMW": "bmwgroup.com",
  "EPA:MC": "lvmh.com", "EPA:TTE": "totalenergies.com", "EPA:AIR": "airbus.com", "EPA:BNP": "group.bnpparibas",
  "AMS:ASML": "asml.com", "AMS:INGA": "ing.com", "AMS:AD": "aholddelhaize.com",
  "SIX:NESN": "nestle.com", "SIX:NOVN": "novartis.com", "SIX:ROG": "roche.com", "SIX:UBSG": "ubs.com",
  "BME:SAN": "santander.com", "BME:ITX": "inditex.com", "BME:IBE": "iberdrola.com",
  "BIT:ISP": "intesasanpaolo.com", "BIT:ENEL": "enel.com", "BIT:RACE": "ferrari.com",
  "STO:VOLV-B": "volvogroup.com", "STO:ERIC-B": "ericsson.com", "STO:INVE-B": "investorab.com",
  "TSE:7203": "global.toyota", "TSE:6758": "sony.com", "TSE:9984": "group.softbank", "TSE:8306": "mufg.jp", "TSE:6861": "keyence.com",
  "HKEX:0700": "tencent.com", "HKEX:9988": "alibaba.com", "HKEX:0005": "hsbc.com", "HKEX:1299": "aia.com",
  "SSE:600519": "moutaichina.com", "SSE:601398": "icbc.com.cn", "SZSE:300750": "catl.com",
  "TWSE:2330": "tsmc.com", "TWSE:2317": "honhai.com", "TWSE:2454": "mediatek.com",
  "KRX:005930": "samsung.com", "KRX:000660": "skhynix.com", "KRX:005380": "hyundai.com",
  "SGX:D05": "dbs.com", "SGX:O39": "ocbc.com", "SGX:Z74": "singtel.com",
  "ASX:BHP": "bhp.com", "ASX:CBA": "commbank.com.au", "ASX:CSL": "csl.com",
  "TSX:RY": "rbc.com", "TSX:SHOP": "shopify.com", "TSX:ENB": "enbridge.com",
  "B3:PETR4": "petrobras.com.br", "B3:VALE3": "vale.com", "B3:ITUB4": "itau.com.br",
  "BMV:WALMEX": "walmex.mx", "BMV:AMXB": "americamovil.com", "BMV:GFNORTEO": "banorte.com",
  "JSE:NPN": "naspers.com", "JSE:FSR": "firstrand.co.za", "JSE:SBK": "standardbank.com",
  "IDX:BBCA": "bca.co.id", "MIL:ENI": "eni.com", "MIL:ISP": "intesasanpaolo.com",
  "TADAWUL:2222": "aramco.com", "TADAWUL:1120": "alrajhibank.com.sa",
};

const sourceOverrides = {
  "JSE:FSR": "https://www.firstrand.co.za/images/logos/favicon.png",
  "ASX:CSL": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/CSL_Limited_logo.svg/250px-CSL_Limited_logo.svg.png",
};

const outDir = fileURLToPath(new URL("../public/logos/stocks/", import.meta.url));
await mkdir(outDir, { recursive: true });
const logos = {};
const failed = [];
const entries = [...MARKETS, { id: "ID", symbols: [["IDX:BBCA", "BBCA.JK", "Bank Central Asia"]] }, { id: "IT", symbols: [["MIL:ENI", "ENI.MI", "Eni"], ["MIL:ISP", "ISP.MI", "Intesa Sanpaolo"]] }].flatMap((market) => market.symbols.map(([symbol, , name]) => ({ symbol, name, market: market.id }))).filter(({ symbol }) => domains[symbol]);
let cursor = 0;
async function worker() {
  while (cursor < entries.length) {
    const { symbol, name, market } = entries[cursor++];
    const domain = domains[symbol];
    try {
      let data, source, ext;
      for (const host of [domain, `www.${domain}`]) {
        source = sourceOverrides[symbol] || `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
        const res = await fetch(source, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) continue;
        data = Buffer.from(await res.arrayBuffer());
        ext = data.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" ? "png" : data.subarray(0, 3).toString("hex") === "ffd8ff" ? "jpg" : null;
        if (ext) break;
      }
      if (!ext) throw new Error("No image found");
      const filename = `${symbol.replace(":", "-").toLowerCase()}.${ext}`;
      await writeFile(`${outDir}${filename}`, data);
      logos[symbol] = { src: `/logos/stocks/${filename}`, name, market, domain, source };
    } catch (error) {
      failed.push({ symbol, domain, error: error.message });
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
const sorted = Object.fromEntries(Object.entries(logos).sort(([a], [b]) => a.localeCompare(b)));
if (failed.length) {
  console.error("Could not fetch:", failed);
  process.exitCode = 1;
} else {
  await writeFile(`${outDir}manifest.json`, `${JSON.stringify(sorted, null, 2)}\n`);
}
console.log(`Saved ${Object.keys(logos).length}/${entries.length} company and fund logos across ${new Set(Object.values(logos).map((l) => l.market)).size} markets.`);
