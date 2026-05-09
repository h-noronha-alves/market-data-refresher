# 📊 Market Data Refresher for Google Sheets

**Author:** [h-noronha-alves](https://github.com/h-noronha-alves)
**Version:** v26.05.08-0001hna
**License:** [MIT](LICENSE)

A Google Apps Script that fetches live cryptocurrency market data for up to 150 tickers, writing results directly to your spreadsheet every N minutes — no formulas, no caching issues, no quota headaches.

---

## How it works

- Reads all tickers at once from a single column
- Makes **one bulk API call** to CoinMarketCap (primary) or CoinGecko (fallback)
- Writes results **directly to cells** via `setValues()` — bypassing Google Sheets' custom function caching entirely
- Automatically retries through up to 5 CMC keys before falling back to CoinGecko
- Runs on a time-based trigger (every N minutes) and via a custom menu

---

## Sheet layout

| Cell / Range | Purpose |
|---|---|
| Column AA, rows 5–155 | Ticker symbols (e.g. BTC, ETH, SOL) |
| AC1 | CoinGecko Pro API key |
| AD1:AH1 | CoinMarketCap API keys (up to 5) |
| Row 4, columns AB:AL | Column headers (written automatically) |
| Rows 5–155, columns AB:AL | Market data output |

### Output columns (AB:AL)

| Column | Field | CMC | CoinGecko |
|---|---|---|---|
| AB | Price USD | ✅ | ✅ |
| AC | 1h % | ✅ | ✅ |
| AD | 24h % | ✅ | ✅ |
| AE | 7d % | ✅ | ✅ |
| AF | 30d % | ✅ | ✅ |
| AG | Volume 24h | ✅ | ✅ |
| AH | Vol Δ 24h % | ✅ | — |
| AI | Market Cap | ✅ | ✅ |
| AJ | Dominance % | ✅ | — |
| AK | Fully Diluted MC | ✅ | ✅ |
| AL | Last Updated | ✅ | ✅ |

> Vol Δ 24h % and Dominance % are only available from CoinMarketCap.

---

## Setup

### 1. Add the script

1. Open your Google Sheet
2. Go to **Extensions → Apps Script**
3. Delete any existing code
4. Paste the contents of `Code.gs`
5. Save (Ctrl+S)

### 2. Add your API keys

- Put your **CoinGecko Pro** key in cell `AC1`
- Put your **CoinMarketCap** key(s) in cells `AD1` through `AH1` (one per cell, up to 5)

### 3. Add your tickers

- Put ticker symbols in column **AA**, starting at row 5
- Symbols must be alphanumeric only (e.g. `BTC`, `ETH`, `SOL`)
- Empty rows are ignored — you can use them as visual separators

### 4. Run setup

1. In the Apps Script editor, select `setupTriggers` from the function dropdown
2. Click **▶ Run** and authorize when prompted
3. Enter your desired refresh interval in minutes
4. Close and reopen the spreadsheet — the **📊 Market Data** menu will appear

---

## Menu options

| Option | Action |
|---|---|
| 🔄 Refresh Now | Fetches and writes data immediately |
| ⚙️ Setup Auto-Refresh | Set or change the auto-refresh interval |

---

## Diagnostic functions

Run these from the Apps Script editor when troubleshooting:

| Function | Purpose |
|---|---|
| `findBadTickers()` | Logs any ticker symbols with invalid characters |
| `testConnectivity()` | Tests CMC key #1 with a single BTC quote |

---

## API failover logic

```
CMC key 1 → CMC key 2 → CMC key 3 → CMC key 4 → CMC key 5 → CoinGecko
```

Each source is tried in order. The first successful response wins. If all fail, nothing is written and the previous values remain.

---

## Notes

- Tickers not recognised by CMC or CoinGecko will show `—`
- Traditional assets (commodities, forex, stocks) are not supported by these APIs
- The CoinGecko symbol→ID map is cached for 6 hours to minimise API calls
- `setupTriggers()` always wipes existing triggers before creating new ones — safe to run multiple times

---

## Requirements

- Google account with access to Google Sheets and Apps Script
- CoinMarketCap API key (free tier works for basic usage)
- CoinGecko Pro API key (for fallback)
