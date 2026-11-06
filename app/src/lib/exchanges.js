// Exchanges InsureVEX quotes on (city + lat/lng of the exchange, for the globe). Used for the landing grid and as an offline fallback for the market picker
// (live symbols, prices and quotes always come from the server's /api/markets).
export const EXCHANGES = [
  { id: "US", exchange: "NYSE / Nasdaq", country: "United States", code: "US", currency: "USD", city: "New York", lat: 40.71, lng: -74.01, region: "Americas", sample: ["NASDAQ:NVDA", "NASDAQ:AAPL", "NYSE:JPM"] },
  { id: "Canada", exchange: "TSX", country: "Canada", code: "CA", currency: "CAD", city: "Toronto", lat: 43.65, lng: -79.38, region: "Americas", sample: ["TSX:RY", "TSX:SHOP"] },
  { id: "Brazil", exchange: "B3", country: "Brazil", code: "BR", currency: "BRL", city: "São Paulo", lat: -23.55, lng: -46.63, region: "Americas", sample: ["B3:PETR4", "B3:VALE3"] },
  { id: "Mexico", exchange: "BMV", country: "Mexico", code: "MX", currency: "MXN", city: "Mexico City", lat: 19.43, lng: -99.13, region: "Americas", sample: ["BMV:WALMEX", "BMV:AMXB"] },
  { id: "UK", exchange: "LSE", country: "United Kingdom", code: "GB", currency: "GBP", city: "London", lat: 51.51, lng: -0.13, region: "Europe", sample: ["LSE:HSBA", "LSE:AZN"] },
  { id: "Germany", exchange: "Xetra", country: "Germany", code: "DE", currency: "EUR", city: "Frankfurt", lat: 50.11, lng: 8.68, region: "Europe", sample: ["XETRA:SAP", "XETRA:SIE"] },
  { id: "France", exchange: "Euronext Paris", country: "France", code: "FR", currency: "EUR", city: "Paris", lat: 48.86, lng: 2.35, region: "Europe", sample: ["EPA:MC", "EPA:TTE"] },
  { id: "Netherlands", exchange: "Euronext Amsterdam", country: "Netherlands", code: "NL", currency: "EUR", city: "Amsterdam", lat: 52.37, lng: 4.9, region: "Europe", sample: ["AMS:ASML"] },
  { id: "Switzerland", exchange: "SIX", country: "Switzerland", code: "CH", currency: "CHF", city: "Zurich", lat: 47.38, lng: 8.54, region: "Europe", sample: ["SIX:NESN", "SIX:UBSG"] },
  { id: "Spain", exchange: "BME", country: "Spain", code: "ES", currency: "EUR", city: "Madrid", lat: 40.42, lng: -3.7, region: "Europe", sample: ["BME:SAN", "BME:ITX"] },
  { id: "Italy", exchange: "Borsa Italiana", country: "Italy", code: "IT", currency: "EUR", city: "Milan", lat: 45.46, lng: 9.19, region: "Europe", sample: ["MIL:ENI", "MIL:ISP"] },
  { id: "Sweden", exchange: "Nasdaq Stockholm", country: "Sweden", code: "SE", currency: "SEK", city: "Stockholm", lat: 59.33, lng: 18.07, region: "Europe", sample: ["STO:VOLV-B"] },
  { id: "Japan", exchange: "Tokyo SE", country: "Japan", code: "JP", currency: "JPY", city: "Tokyo", lat: 35.68, lng: 139.69, region: "Asia-Pacific", sample: ["TSE:7203", "TSE:6758"] },
  { id: "HongKong", exchange: "HKEX", country: "Hong Kong", code: "HK", currency: "HKD", city: "Hong Kong", lat: 22.32, lng: 114.17, region: "Asia-Pacific", sample: ["HKEX:0700", "HKEX:9988"] },
  { id: "ChinaA", exchange: "Shanghai / Shenzhen", country: "China", code: "CN", currency: "CNY", city: "Shanghai", lat: 31.23, lng: 121.47, region: "Asia-Pacific", sample: ["SSE:600519"] },
  { id: "Taiwan", exchange: "TWSE", country: "Taiwan", code: "TW", currency: "TWD", city: "Taipei", lat: 25.03, lng: 121.57, region: "Asia-Pacific", sample: ["TWSE:2330"] },
  { id: "Korea", exchange: "KRX", country: "South Korea", code: "KR", currency: "KRW", city: "Seoul", lat: 37.57, lng: 126.98, region: "Asia-Pacific", sample: ["KRX:005930"] },
  { id: "India", exchange: "NSE", country: "India", code: "IN", currency: "INR", city: "Mumbai", lat: 19.08, lng: 72.88, region: "Asia-Pacific", sample: ["NSE:RELIANCE", "NSE:HDFCBANK"] },
  { id: "Singapore", exchange: "SGX", country: "Singapore", code: "SG", currency: "SGD", city: "Singapore", lat: 1.35, lng: 103.82, region: "Asia-Pacific", sample: ["SGX:D05"] },
  { id: "Australia", exchange: "ASX", country: "Australia", code: "AU", currency: "AUD", city: "Sydney", lat: -33.87, lng: 151.21, region: "Asia-Pacific", sample: ["ASX:BHP", "ASX:CBA"] },
  { id: "Indonesia", exchange: "IDX", country: "Indonesia", code: "ID", currency: "IDR", city: "Jakarta", lat: -6.21, lng: 106.85, region: "Asia-Pacific", sample: ["IDX:BBCA"] },
  { id: "SouthAfrica", exchange: "JSE", country: "South Africa", code: "ZA", currency: "ZAR", city: "Johannesburg", lat: -26.2, lng: 28.05, region: "Middle East & Africa", sample: ["JSE:NPN"] },
  { id: "Saudi", exchange: "Tadawul", country: "Saudi Arabia", code: "SA", currency: "SAR", city: "Riyadh", lat: 24.71, lng: 46.68, region: "Middle East & Africa", sample: ["TADAWUL:2222"] },
];

export const REGIONS = ["Americas", "Europe", "Asia-Pacific", "Middle East & Africa"];

/** Regional-indicator flag from a 2-letter country code. */
export function flag(code) {
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}
