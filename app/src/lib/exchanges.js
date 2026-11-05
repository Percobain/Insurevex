// Exchanges InsureVEX quotes on. Used for the landing grid and as an offline fallback for the market picker
// (live symbols, prices and quotes always come from the server's /api/markets).
export const EXCHANGES = [
  { id: "US", exchange: "NYSE / Nasdaq", country: "United States", code: "US", currency: "USD", region: "Americas", sample: ["NASDAQ:NVDA", "NASDAQ:AAPL", "NYSE:JPM"] },
  { id: "Canada", exchange: "TSX", country: "Canada", code: "CA", currency: "CAD", region: "Americas", sample: ["TSX:RY", "TSX:SHOP"] },
  { id: "Brazil", exchange: "B3", country: "Brazil", code: "BR", currency: "BRL", region: "Americas", sample: ["B3:PETR4", "B3:VALE3"] },
  { id: "Mexico", exchange: "BMV", country: "Mexico", code: "MX", currency: "MXN", region: "Americas", sample: ["BMV:WALMEX", "BMV:AMXB"] },
  { id: "UK", exchange: "LSE", country: "United Kingdom", code: "GB", currency: "GBP", region: "Europe", sample: ["LSE:HSBA", "LSE:AZN"] },
  { id: "Germany", exchange: "Xetra", country: "Germany", code: "DE", currency: "EUR", region: "Europe", sample: ["XETRA:SAP", "XETRA:SIE"] },
  { id: "France", exchange: "Euronext Paris", country: "France", code: "FR", currency: "EUR", region: "Europe", sample: ["EPA:MC", "EPA:TTE"] },
  { id: "Netherlands", exchange: "Euronext Amsterdam", country: "Netherlands", code: "NL", currency: "EUR", region: "Europe", sample: ["AMS:ASML"] },
  { id: "Switzerland", exchange: "SIX", country: "Switzerland", code: "CH", currency: "CHF", region: "Europe", sample: ["SIX:NESN", "SIX:UBSG"] },
  { id: "Spain", exchange: "BME", country: "Spain", code: "ES", currency: "EUR", region: "Europe", sample: ["BME:SAN", "BME:ITX"] },
  { id: "Italy", exchange: "Borsa Italiana", country: "Italy", code: "IT", currency: "EUR", region: "Europe", sample: ["MIL:ENI", "MIL:ISP"] },
  { id: "Sweden", exchange: "Nasdaq Stockholm", country: "Sweden", code: "SE", currency: "SEK", region: "Europe", sample: ["STO:VOLV-B"] },
  { id: "Japan", exchange: "Tokyo SE", country: "Japan", code: "JP", currency: "JPY", region: "Asia-Pacific", sample: ["TSE:7203", "TSE:6758"] },
  { id: "HongKong", exchange: "HKEX", country: "Hong Kong", code: "HK", currency: "HKD", region: "Asia-Pacific", sample: ["HKEX:0700", "HKEX:9988"] },
  { id: "ChinaA", exchange: "Shanghai / Shenzhen", country: "China", code: "CN", currency: "CNY", region: "Asia-Pacific", sample: ["SSE:600519"] },
  { id: "Taiwan", exchange: "TWSE", country: "Taiwan", code: "TW", currency: "TWD", region: "Asia-Pacific", sample: ["TWSE:2330"] },
  { id: "Korea", exchange: "KRX", country: "South Korea", code: "KR", currency: "KRW", region: "Asia-Pacific", sample: ["KRX:005930"] },
  { id: "India", exchange: "NSE", country: "India", code: "IN", currency: "INR", region: "Asia-Pacific", sample: ["NSE:RELIANCE", "NSE:HDFCBANK"] },
  { id: "Singapore", exchange: "SGX", country: "Singapore", code: "SG", currency: "SGD", region: "Asia-Pacific", sample: ["SGX:D05"] },
  { id: "Australia", exchange: "ASX", country: "Australia", code: "AU", currency: "AUD", region: "Asia-Pacific", sample: ["ASX:BHP", "ASX:CBA"] },
  { id: "Indonesia", exchange: "IDX", country: "Indonesia", code: "ID", currency: "IDR", region: "Asia-Pacific", sample: ["IDX:BBCA"] },
  { id: "SouthAfrica", exchange: "JSE", country: "South Africa", code: "ZA", currency: "ZAR", region: "Middle East & Africa", sample: ["JSE:NPN"] },
  { id: "Saudi", exchange: "Tadawul", country: "Saudi Arabia", code: "SA", currency: "SAR", region: "Middle East & Africa", sample: ["TADAWUL:2222"] },
];

export const REGIONS = ["Americas", "Europe", "Asia-Pacific", "Middle East & Africa"];

/** Regional-indicator flag from a 2-letter country code. */
export function flag(code) {
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}
