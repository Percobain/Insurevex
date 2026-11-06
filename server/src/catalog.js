// Global catalog: major exchanges and liquid names a holder can protect. Any listed stock works the same way;
// this list is what the UI offers out of the box. `yahoo` is the data symbol for official daily closes.
export const MARKETS = [
  { id: "US", name: "United States", country: "USA", flag: "🇺🇸", currency: "USD", exchange: "NYSE / Nasdaq", symbols: [
    ["NASDAQ:NVDA", "NVDA", "NVIDIA"], ["NASDAQ:AAPL", "AAPL", "Apple"], ["NASDAQ:MSFT", "MSFT", "Microsoft"], ["NASDAQ:AMZN", "AMZN", "Amazon"],
    ["NASDAQ:TSLA", "TSLA", "Tesla"], ["NASDAQ:META", "META", "Meta"], ["NYSE:JPM", "JPM", "JPMorgan"], ["NYSE:XOM", "XOM", "Exxon Mobil"],
    ["NYSEARCA:SPY", "SPY", "S&P 500 ETF"], ["NASDAQ:QQQ", "QQQ", "Nasdaq-100 ETF"]] },
  { id: "IN", name: "India", country: "IND", flag: "🇮🇳", currency: "INR", exchange: "NSE", symbols: [
    ["NSE:RELIANCE", "RELIANCE.NS", "Reliance Industries"], ["NSE:TCS", "TCS.NS", "Tata Consultancy"], ["NSE:HDFCBANK", "HDFCBANK.NS", "HDFC Bank"],
    ["NSE:INFY", "INFY.NS", "Infosys"], ["NSE:ICICIBANK", "ICICIBANK.NS", "ICICI Bank"], ["NSE:SBIN", "SBIN.NS", "State Bank of India"],
    ["NSE:ADANIENT", "ADANIENT.NS", "Adani Enterprises"], ["NSE:INDUSINDBK", "INDUSINDBK.NS", "IndusInd Bank"], ["NSE:NIFTY", "^NSEI", "NIFTY 50"],
    ["NSE:BANKNIFTY", "^NSEBANK", "Bank NIFTY"]] },
  { id: "UK", name: "United Kingdom", country: "GBR", flag: "🇬🇧", currency: "GBP", exchange: "LSE", symbols: [
    ["LSE:HSBA", "HSBA.L", "HSBC"], ["LSE:SHEL", "SHEL.L", "Shell"], ["LSE:AZN", "AZN.L", "AstraZeneca"], ["LSE:ULVR", "ULVR.L", "Unilever"],
    ["LSE:BP", "BP.L", "BP"], ["LSE:RIO", "RIO.L", "Rio Tinto"], ["LSE:UKX", "^FTSE", "FTSE 100"]] },
  { id: "DE", name: "Germany", country: "DEU", flag: "🇩🇪", currency: "EUR", exchange: "Xetra", symbols: [
    ["XETRA:SAP", "SAP.DE", "SAP"], ["XETRA:SIE", "SIE.DE", "Siemens"], ["XETRA:ALV", "ALV.DE", "Allianz"], ["XETRA:DTE", "DTE.DE", "Deutsche Telekom"],
    ["XETRA:BMW", "BMW.DE", "BMW"], ["XETRA:DAX", "^GDAXI", "DAX"]] },
  { id: "FR", name: "France", country: "FRA", flag: "🇫🇷", currency: "EUR", exchange: "Euronext Paris", symbols: [
    ["EPA:MC", "MC.PA", "LVMH"], ["EPA:TTE", "TTE.PA", "TotalEnergies"], ["EPA:AIR", "AIR.PA", "Airbus"], ["EPA:BNP", "BNP.PA", "BNP Paribas"],
    ["EPA:CAC", "^FCHI", "CAC 40"]] },
  { id: "NL", name: "Netherlands", country: "NLD", flag: "🇳🇱", currency: "EUR", exchange: "Euronext Amsterdam", symbols: [
    ["AMS:ASML", "ASML.AS", "ASML"], ["AMS:INGA", "INGA.AS", "ING"], ["AMS:AD", "AD.AS", "Ahold Delhaize"]] },
  { id: "CH", name: "Switzerland", country: "CHE", flag: "🇨🇭", currency: "CHF", exchange: "SIX", symbols: [
    ["SIX:NESN", "NESN.SW", "Nestle"], ["SIX:NOVN", "NOVN.SW", "Novartis"], ["SIX:ROG", "RO.SW", "Roche"], ["SIX:UBSG", "UBSG.SW", "UBS"]] },
  { id: "ES", name: "Spain", country: "ESP", flag: "🇪🇸", currency: "EUR", exchange: "BME", symbols: [
    ["BME:SAN", "SAN.MC", "Santander"], ["BME:ITX", "ITX.MC", "Inditex"], ["BME:IBE", "IBE.MC", "Iberdrola"]] },
  { id: "IT", name: "Italy", country: "ITA", flag: "🇮🇹", currency: "EUR", exchange: "Borsa Italiana", symbols: [
    ["BIT:ISP", "ISP.MI", "Intesa Sanpaolo"], ["BIT:ENEL", "ENEL.MI", "Enel"], ["BIT:RACE", "RACE.MI", "Ferrari"]] },
  { id: "SE", name: "Sweden", country: "SWE", flag: "🇸🇪", currency: "SEK", exchange: "Nasdaq Stockholm", symbols: [
    ["STO:VOLV-B", "VOLV-B.ST", "Volvo"], ["STO:ERIC-B", "ERIC-B.ST", "Ericsson"], ["STO:INVE-B", "INVE-B.ST", "Investor AB"]] },
  { id: "JP", name: "Japan", country: "JPN", flag: "🇯🇵", currency: "JPY", exchange: "Tokyo Stock Exchange", symbols: [
    ["TSE:7203", "7203.T", "Toyota"], ["TSE:6758", "6758.T", "Sony"], ["TSE:9984", "9984.T", "SoftBank Group"], ["TSE:8306", "8306.T", "Mitsubishi UFJ"],
    ["TSE:6861", "6861.T", "Keyence"], ["TSE:N225", "^N225", "Nikkei 225"]] },
  { id: "HK", name: "Hong Kong", country: "HKG", flag: "🇭🇰", currency: "HKD", exchange: "HKEX", symbols: [
    ["HKEX:0700", "0700.HK", "Tencent"], ["HKEX:9988", "9988.HK", "Alibaba"], ["HKEX:0005", "0005.HK", "HSBC Holdings"], ["HKEX:1299", "1299.HK", "AIA"],
    ["HKEX:HSI", "^HSI", "Hang Seng"]] },
  { id: "CN", name: "China A-shares", country: "CHN", flag: "🇨🇳", currency: "CNY", exchange: "Shanghai / Shenzhen", symbols: [
    ["SSE:600519", "600519.SS", "Kweichow Moutai"], ["SSE:601398", "601398.SS", "ICBC"], ["SZSE:300750", "300750.SZ", "CATL"],
    ["SSE:000001", "000001.SS", "SSE Composite"]] },
  { id: "TW", name: "Taiwan", country: "TWN", flag: "🇹🇼", currency: "TWD", exchange: "TWSE", symbols: [
    ["TWSE:2330", "2330.TW", "TSMC"], ["TWSE:2317", "2317.TW", "Hon Hai"], ["TWSE:2454", "2454.TW", "MediaTek"], ["TWSE:TAIEX", "^TWII", "TAIEX"]] },
  { id: "KR", name: "South Korea", country: "KOR", flag: "🇰🇷", currency: "KRW", exchange: "KRX", symbols: [
    ["KRX:005930", "005930.KS", "Samsung Electronics"], ["KRX:000660", "000660.KS", "SK Hynix"], ["KRX:005380", "005380.KS", "Hyundai Motor"],
    ["KRX:KOSPI", "^KS11", "KOSPI"]] },
  { id: "SG", name: "Singapore", country: "SGP", flag: "🇸🇬", currency: "SGD", exchange: "SGX", symbols: [
    ["SGX:D05", "D05.SI", "DBS"], ["SGX:O39", "O39.SI", "OCBC"], ["SGX:Z74", "Z74.SI", "Singtel"]] },
  { id: "AU", name: "Australia", country: "AUS", flag: "🇦🇺", currency: "AUD", exchange: "ASX", symbols: [
    ["ASX:BHP", "BHP.AX", "BHP"], ["ASX:CBA", "CBA.AX", "Commonwealth Bank"], ["ASX:CSL", "CSL.AX", "CSL"], ["ASX:XJO", "^AXJO", "ASX 200"]] },
  { id: "CA", name: "Canada", country: "CAN", flag: "🇨🇦", currency: "CAD", exchange: "TSX", symbols: [
    ["TSX:RY", "RY.TO", "Royal Bank of Canada"], ["TSX:SHOP", "SHOP.TO", "Shopify"], ["TSX:ENB", "ENB.TO", "Enbridge"], ["TSX:TSX", "^GSPTSE", "S&P/TSX"]] },
  { id: "BR", name: "Brazil", country: "BRA", flag: "🇧🇷", currency: "BRL", exchange: "B3", symbols: [
    ["B3:PETR4", "PETR4.SA", "Petrobras"], ["B3:VALE3", "VALE3.SA", "Vale"], ["B3:ITUB4", "ITUB4.SA", "Itau Unibanco"], ["B3:IBOV", "^BVSP", "Ibovespa"]] },
  { id: "MX", name: "Mexico", country: "MEX", flag: "🇲🇽", currency: "MXN", exchange: "BMV", symbols: [
    ["BMV:WALMEX", "WALMEX.MX", "Walmart de Mexico"], ["BMV:AMXB", "AMXB.MX", "America Movil"], ["BMV:GFNORTEO", "GFNORTEO.MX", "Banorte"]] },
  { id: "ZA", name: "South Africa", country: "ZAF", flag: "🇿🇦", currency: "ZAR", exchange: "JSE", symbols: [
    ["JSE:NPN", "NPN.JO", "Naspers"], ["JSE:FSR", "FSR.JO", "FirstRand"], ["JSE:SBK", "SBK.JO", "Standard Bank"]] },
  { id: "SA", name: "Saudi Arabia", country: "SAU", flag: "🇸🇦", currency: "SAR", exchange: "Tadawul", symbols: [
    ["TADAWUL:2222", "2222.SR", "Saudi Aramco"], ["TADAWUL:1120", "1120.SR", "Al Rajhi Bank"]] },
];

export const SYMBOLS = new Map();
for (const m of MARKETS) for (const [symbol, yahoo, name] of m.symbols) {
  SYMBOLS.set(symbol, { symbol, yahoo, name, market: m.id, currency: m.currency, exchange: m.exchange, country: m.name, flag: m.flag });
}

/** Any listed stock works: a symbol not in the catalog can still be quoted if the caller passes its data symbol. */
export function resolveSymbol(symbol, yahoo) {
  if (SYMBOLS.has(symbol)) return SYMBOLS.get(symbol);
  if (!yahoo) return null;
  return { symbol, yahoo, name: symbol, market: "OTHER", currency: "", exchange: symbol.split(":")[0], country: "", flag: "🌐" };
}
