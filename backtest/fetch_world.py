"""Fetch the world universe for the InsureVEX backtest (yfinance daily, split/dividend adjusted) + USD rates (FRED).
Current large-cap constituents per market (survivorship bias applies: companies that died are missing).
Run: python fetch_world.py  [--refresh]   -> data/<ticker>.csv, data/FRED_*.csv, data/fetch_log.json"""
import os, sys, json, time
import pandas as pd, yfinance as yf

HERE = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.join(HERE, "data"); os.makedirs(DATA, exist_ok=True)
START = "1999-06-01"

def sfx(lst, s): return [t + s for t in lst]

MARKETS = {
 "US": dict(index="^GSPC", ccy="USD", tickers=["NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA", "AMD", "AVGO", "NFLX", "JPM", "XOM",
      "BAC", "C", "WFC", "GS", "MS", "INTC", "CSCO", "ORCL", "IBM", "KO", "PEP", "PG", "JNJ", "PFE", "MRK", "UNH", "WMT", "HD", "DIS", "BA",
      "CAT", "GE", "CVX", "T", "VZ", "MU", "QCOM", "ADBE", "CRM", "NKE", "MCD", "COST", "SPY", "QQQ"]),
 "Canada": dict(index="^GSPTSE", ccy="CAD", tickers=sfx(["RY", "TD", "ENB", "SHOP", "CNR", "CP", "BMO", "BNS", "CNQ", "SU", "TRP", "BCE", "MFC",
      "ATD", "CSU", "NTR", "ABX", "WCN", "FTS", "T", "SLF", "CM", "TECK-B", "CVE", "BAM"], ".TO")),
 "Brazil": dict(index="^BVSP", ccy="BRL", tickers=sfx(["PETR4", "VALE3", "ITUB4", "BBDC4", "BBAS3", "ABEV3", "WEGE3", "B3SA3", "RENT3", "SUZB3",
      "GGBR4", "ITSA4", "ELET3", "JBSS3", "LREN3", "RADL3", "PRIO3", "CSNA3", "EMBR3", "MGLU3", "CMIG4", "SBSP3"], ".SA")),
 "Mexico": dict(index="^MXX", ccy="MXN", tickers=sfx(["AMXB", "WALMEX", "FEMSAUBD", "GFNORTEO", "CEMEXCPO", "GMEXICOB", "BIMBOA", "GAPB",
      "ASURB", "KOFUBL", "GRUMAB", "TLEVISACPO", "PE&OLES", "ORBIA", "GCARSOA1", "KIMBERA", "AC"], ".MX")),
 "UK": dict(index="^FTSE", ccy="GBP", tickers=sfx(["SHEL", "AZN", "HSBA", "ULVR", "BP", "GSK", "RIO", "BATS", "DGE", "LLOY", "BARC", "VOD",
      "REL", "NG", "GLEN", "LSEG", "PRU", "TSCO", "RR", "BT-A", "AAL", "BA", "NWG", "STAN", "AV"], ".L")),
 "Germany": dict(index="^GDAXI", ccy="EUR", tickers=sfx(["SAP", "SIE", "ALV", "DTE", "MBG", "BMW", "BAS", "BAYN", "MUV2", "DBK", "IFX", "ADS",
      "VOW3", "DHL", "RWE", "EOAN", "CBK", "HEN3", "FRE", "MRK", "DB1", "BEI", "CON", "LHA"], ".DE")),
 "France": dict(index="^FCHI", ccy="EUR", tickers=sfx(["MC", "OR", "TTE", "SAN", "AIR", "SU", "BNP", "AI", "KER", "RMS", "GLE", "ACA", "CS",
      "EL", "DG", "BN", "VIE", "ENGI", "ORA", "CAP", "SGO", "RI", "ML", "VIV"], ".PA")),
 "Netherlands": dict(index="^AEX", ccy="EUR", tickers=sfx(["ASML", "INGA", "PHIA", "AD", "HEIA", "AKZA", "KPN", "WKL", "RAND", "ADYEN",
      "PRX", "ABN", "ASM", "NN", "AGN", "BESI"], ".AS")),
 "Switzerland": dict(index="^SSMI", ccy="CHF", tickers=sfx(["NESN", "NOVN", "ROG", "UBSG", "ZURN", "ABBN", "CFR", "SIKA", "GIVN", "LONN",
      "SREN", "HOLN", "ALC", "SCMN", "SLHN", "GEBN", "PGHN", "SGSN", "LOGN", "STMN"], ".SW")),
 "Spain": dict(index="^IBEX", ccy="EUR", tickers=sfx(["SAN", "BBVA", "ITX", "IBE", "TEF", "REP", "CABK", "AENA", "FER", "AMS", "IAG", "ACS",
      "GRF", "MAP", "SAB", "ELE", "NTGY", "BKT", "MTS", "ACX"], ".MC")),
 "Italy": dict(index="FTSEMIB.MI", ccy="EUR", tickers=sfx(["ENI", "ENEL", "ISP", "UCG", "STLAM", "G", "RACE", "TIT", "PST", "MB", "LDO",
      "PRY", "TEN", "BAMI", "BMPS", "SRG", "TRN", "MONC", "A2A", "BPE"], ".MI")),
 "Sweden": dict(index="^OMX", ccy="SEK", tickers=sfx(["VOLV-B", "ERIC-B", "ATCO-A", "INVE-B", "SEB-A", "SHB-A", "SWED-A", "HM-B", "SAND",
      "ESSITY-B", "TELIA", "SKF-B", "ABB", "ALFA", "EVO", "NDA-SE", "ASSA-B", "BOL", "SCA-B", "ELUX-B"], ".ST")),
 "Japan": dict(index="^N225", ccy="JPY", tickers=sfx(["7203", "6758", "9984", "6861", "8306", "9432", "6501", "7974", "8035", "9983", "4063",
      "6098", "8058", "7267", "6902", "4502", "8316", "6367", "7751", "6954", "8411", "6752", "4568", "8001", "6702"], ".T")),
 "HongKong": dict(index="^HSI", ccy="HKD", tickers=sfx(["0700", "9988", "0005", "1299", "0941", "0388", "3690", "1810", "0883", "2318", "0939",
      "1398", "0001", "0016", "0011", "2388", "0027", "1928", "9618", "3988", "0175", "2020", "1211", "3333"], ".HK")),
 "ChinaA": dict(index="000001.SS", ccy="CNY", tickers=sfx(["600519", "601318", "600036", "601398", "600900", "600276", "601166", "600030",
      "600887", "601012", "600309", "601857", "601288", "600028", "601888"], ".SS") + sfx(["000858", "000333", "002594", "300750", "000001",
      "002415", "000651", "000002", "300059"], ".SZ")),
 "Taiwan": dict(index="^TWII", ccy="TWD", tickers=sfx(["2330", "2317", "2454", "2308", "2412", "2882", "2881", "1301", "1303", "2002", "3711",
      "2891", "2303", "2886", "1216", "2357", "3008", "2382", "2603", "2884"], ".TW")),
 "Korea": dict(index="^KS11", ccy="KRW", tickers=sfx(["005930", "000660", "035420", "005380", "051910", "006400", "035720", "068270", "105560",
      "055550", "012330", "028260", "066570", "096770", "003550", "017670", "034730", "207940", "000270", "015760"], ".KS")),
 "India": dict(index="^NSEI", ccy="INR", tickers=sfx(["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "SBIN", "BHARTIARTL", "ITC", "LT",
      "KOTAKBANK", "AXISBANK", "HINDUNILVR", "BAJFINANCE", "MARUTI", "SUNPHARMA", "TATASTEEL", "WIPRO", "HCLTECH", "ASIANPAINT", "TITAN",
      "ULTRACEMCO", "NTPC", "POWERGRID", "ONGC", "M&M", "ADANIENT", "ADANIPORTS", "INDUSINDBK", "YESBANK", "IDEA", "ZEEL", "TMPV",
      "JSWSTEEL", "HINDALCO", "VEDL", "SAIL", "BHEL", "PNB", "BANKBARODA", "TATAPOWER"], ".NS")),
 "Singapore": dict(index="^STI", ccy="SGD", tickers=sfx(["D05", "O39", "U11", "Z74", "C6L", "BN4", "C38U", "A17U", "F34", "S68", "G13", "Y92",
      "U96", "C09", "S63", "V03", "BS6"], ".SI")),
 "Australia": dict(index="^AXJO", ccy="AUD", tickers=sfx(["BHP", "CBA", "CSL", "NAB", "WBC", "ANZ", "WES", "MQG", "WOW", "FMG", "RIO", "TLS",
      "WDS", "GMG", "TCL", "STO", "QBE", "ALL", "COL", "SUN", "ORG", "AMC", "RMD", "XRO"], ".AX")),
 "SouthAfrica": dict(index="STX40.JO", ccy="ZAR", tickers=sfx(["NPN", "PRX", "FSR", "SBK", "ABG", "NED", "MTN", "VOD", "SOL", "AGL", "BHG",
      "ANG", "GFI", "IMP", "SHP", "BTI", "CFR", "REM", "BID", "AMS", "SLM", "INL"], ".JO")),
 "Saudi": dict(index="^TASI.SR", ccy="SAR", tickers=sfx(["2222", "1120", "2010", "1180", "7010", "2082", "1150", "1211", "2280", "4200",
      "1010", "2350", "4190", "1060", "2020"], ".SR")),
 "Indonesia": dict(index="^JKSE", ccy="IDR", tickers=sfx(["BBCA", "BBRI", "BMRI", "TLKM", "ASII", "UNVR", "BBNI", "ICBP", "KLBF", "ADRO",
      "PGAS", "UNTR", "INDF", "GGRM", "CPIN", "SMGR", "INCO", "ANTM"], ".JK")),
}
EXTRA = ["^IRX", "^VIX", "SPY", "BTC-USD", "GLD", "ACWI", "EEM"]
FRED = ["DGS1", "DGS3", "DGS5", "DTB3"]

def path(t): return os.path.join(DATA, f"{t}.csv")

def fetch(tickers, refresh, log):
    todo = [t for t in tickers if refresh or not os.path.exists(path(t))]
    print(f"{len(tickers)} tickers, {len(todo)} to download")
    for i in range(0, len(todo), 20):
        batch = todo[i:i + 20]
        try:
            d = yf.download(batch, start=START, auto_adjust=True, progress=False, group_by="ticker", threads=True)
        except Exception as e:
            print("batch failed", e); time.sleep(10); continue
        for t in batch:
            try:
                df = (d[t] if len(batch) > 1 else d.droplevel(1, axis=1) if isinstance(d.columns, pd.MultiIndex) else d)
                df = df[["Open", "High", "Low", "Close", "Volume"]].dropna(subset=["Close"])
            except Exception:
                log["failed"].append(t); continue
            if len(df) < 250: log["failed"].append(t); continue
            df.to_csv(path(t)); log["ok"][t] = [str(df.index[0].date()), str(df.index[-1].date()), len(df)]
        time.sleep(3)

if __name__ == "__main__":
    refresh = "--refresh" in sys.argv
    log = {"ok": {}, "failed": []}
    allt = sorted(set(sum([m["tickers"] + [m["index"]] for m in MARKETS.values()], []) + EXTRA))
    fetch(allt, refresh, log)
    for s in FRED:
        p = os.path.join(DATA, f"FRED_{s}.csv")
        if os.path.exists(p) and not refresh: continue
        df = pd.read_csv(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={s}"); df.columns = ["Date", s]
        df[s] = pd.to_numeric(df[s], errors="coerce"); df.dropna().to_csv(p, index=False)
    for t in allt:
        if t not in log["ok"] and os.path.exists(path(t)) and t not in log["failed"]:
            log["ok"][t] = "cached"
    json.dump(log, open(os.path.join(DATA, "fetch_log.json"), "w"), indent=1)
    print("failed:", log["failed"])
