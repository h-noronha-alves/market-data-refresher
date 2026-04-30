// ============================================================
//  MARKET DATA REFRESHER FOR GOOGLE SHEETS
//  Author: —
//  Version: 1.0.0
//
//  Fetches cryptocurrency market data for up to 150 tickers
//  using CoinMarketCap (primary) and CoinGecko (fallback),
//  writing results directly to the sheet every 5 minutes
//  (or any interval you choose).
//
//  SHEET LAYOUT:
//    Tickers      → Column AA (rows 5–155)
//    Headers      → Row 4, starting at Column AB
//    Market Data  → Columns AB:AL (rows 5–155)
//    CoinGecko key→ AC1
//    CMC keys     → AD1:AH1
//
//  COLUMNS AB:AL (11 fields):
//    AB  Price USD
//    AC  1h %
//    AD  24h %
//    AE  7d %
//    AF  30d %
//    AG  Volume 24h
//    AH  Vol Δ 24h %   (CMC only)
//    AI  Market Cap
//    AJ  Dominance %   (CMC only)
//    AK  Fully Diluted MC
//    AL  Last Updated
// ============================================================


// ── CONFIGURATION ────────────────────────────────────────────
const CFG = {
  tickerCol:    27,        // Column AA (1-indexed)
  firstDataRow: 5,         // First row with ticker data
  lastDataRow:  155,       // Last row with ticker data
  headerRow:    4,         // Row where column headers are written
  outputCol:    28,        // Column AB (1-indexed) — first output column
  cgKeyCell:    'AC1',     // CoinGecko API key cell
  cmcKeyRange:  'AD1:AH1', // CoinMarketCap API key cells (up to 5 keys)
  numCols:      11,        // Number of output columns
};

// Column headers written to headerRow
const HEADERS = [
  'Price USD',
  '1h %',
  '24h %',
  '7d %',
  '30d %',
  'Volume 24h',
  'Vol Δ 24h %',
  'Market Cap',
  'Dominance %',
  'Fully Diluted MC',
  'Last Updated'
];


// ── MENU ─────────────────────────────────────────────────────
/**
 * Creates the custom menu when the spreadsheet is opened.
 * Triggered automatically via onOpen trigger set by setupTriggers().
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 Market Data')
    .addItem('🔄 Refresh Now',          'refreshMarketData')
    .addSeparator()
    .addItem('⚙️ Setup Auto-Refresh',   'setupTriggers')
    .addToUi();
}


// ── MAIN REFRESH FUNCTION ─────────────────────────────────────
/**
 * Main entry point. Reads tickers from column AA, fetches market
 * data from CMC (primary) or CoinGecko (fallback), and writes
 * results directly to columns AB:AL.
 *
 * Called by:
 *   - The "🔄 Refresh Now" menu item
 *   - The time-based trigger every N minutes
 */
function refreshMarketData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // ── 1. Read tickers ────────────────────────────────────────
  const total      = CFG.lastDataRow - CFG.firstDataRow + 1;
  const rawTickers = sheet.getRange(CFG.firstDataRow, CFG.tickerCol, total, 1).getValues();
  const tickers    = rawTickers
    .map((r, i) => ({ symbol: r[0].toString().trim().toUpperCase(), row: i }))
    .filter(t => t.symbol !== '');

  if (!tickers.length) {
    Logger.log('No tickers found in column AA');
    return;
  }
  Logger.log('Found ' + tickers.length + ' tickers');

  // ── 2. Read API keys ───────────────────────────────────────
  const cmcKeys = sheet.getRange(CFG.cmcKeyRange).getValues()[0]
                       .map(k => k.toString().trim()).filter(k => k);
  const cgKey   = sheet.getRange(CFG.cgKeyCell).getValue().toString().trim();

  Logger.log('CMC keys: ' + cmcKeys.length + ' | CG key: ' + (cgKey ? 'yes' : 'no'));

  // ── 3. Fetch data: CMC first, CoinGecko as fallback ────────
  let dataMap = null;
  let source  = '';

  for (let i = 0; i < cmcKeys.length; i++) {
    Logger.log('Trying CMC key #' + (i + 1));
    dataMap = fetchCMC(tickers.map(t => t.symbol), cmcKeys[i]);
    if (dataMap) { source = 'CMC #' + (i + 1); break; }
  }

  if (!dataMap && cgKey) {
    Logger.log('Trying CoinGecko...');
    dataMap = fetchCoinGecko(tickers.map(t => t.symbol), cgKey);
    if (dataMap) source = 'CoinGecko';
  }

  if (!dataMap) {
    Logger.log('All API sources failed.');
    return;
  }

  Logger.log('Data fetched from: ' + source + ' | Coins returned: ' + Object.keys(dataMap).length);

  // ── 4. Build output grid (one row per ticker) ──────────────
  const output = rawTickers.map(r => {
    const sym = r[0].toString().trim().toUpperCase();
    if (!sym) return Array(CFG.numCols).fill('');   // empty row → blank
    return dataMap[sym] || Array(CFG.numCols).fill('—'); // unknown ticker → dash
  });

  // ── 5. Write headers and data to sheet ────────────────────
  sheet.getRange(CFG.headerRow,    CFG.outputCol, 1,     CFG.numCols).setValues([HEADERS]);
  sheet.getRange(CFG.firstDataRow, CFG.outputCol, total, CFG.numCols).setValues(output);

  // Timestamp one row above headers
  sheet.getRange(CFG.headerRow - 1, CFG.outputCol)
       .setValue('Updated: ' + new Date().toLocaleTimeString() + ' via ' + source);

  Logger.log('Done! Written to sheet.');
}


// ── CMC FETCHER ───────────────────────────────────────────────
/**
 * Fetches market data for all symbols in a single CMC API call.
 * Returns a map of { SYMBOL: [11 values] } or null on failure.
 *
 * Provides all 11 fields including Vol Δ 24h % and Dominance %.
 *
 * @param {string[]} symbols  - Array of ticker symbols e.g. ['BTC','ETH']
 * @param {string}   apiKey   - CoinMarketCap API key
 * @returns {Object|null}
 */
function fetchCMC(symbols, apiKey) {
  const url = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest'
            + '?symbol=' + encodeURIComponent(symbols.join(',')) + '&convert=USD';
  try {
    const res  = UrlFetchApp.fetch(url, {
      headers: { 'X-CMC_PRO_API_KEY': apiKey },
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    const body = res.getContentText();

    Logger.log('CMC status: ' + code);
    Logger.log('CMC response: ' + body.substring(0, 500));

    if (code !== 200) return null;

    const json = JSON.parse(body);
    if (!json.data) return null;

    const map = {};
    for (const [sym, raw] of Object.entries(json.data)) {
      // CMC may return arrays when a symbol maps to multiple coins
      const coin = Array.isArray(raw) ? raw[0] : raw;
      const q    = coin?.quote?.USD;
      if (!q) continue;

      map[sym.toUpperCase()] = [
        q.price                    ?? '',   // AB  Price USD
        q.percent_change_1h        ?? '',   // AC  1h %
        q.percent_change_24h       ?? '',   // AD  24h %
        q.percent_change_7d        ?? '',   // AE  7d %
        q.percent_change_30d       ?? '',   // AF  30d %
        q.volume_24h               ?? '',   // AG  Volume 24h
        q.volume_change_24h        ?? '',   // AH  Vol Δ 24h %
        q.market_cap               ?? '',   // AI  Market Cap
        q.market_cap_dominance     ?? '',   // AJ  Dominance %
        q.fully_diluted_market_cap ?? '',   // AK  Fully Diluted MC
        q.last_updated             ?? ''    // AL  Last Updated
      ];
    }
    return Object.keys(map).length ? map : null;

  } catch(e) {
    Logger.log('CMC error: ' + e);
    return null;
  }
}


// ── COINGECKO FETCHER ─────────────────────────────────────────
/**
 * Fallback fetcher using CoinGecko Pro API.
 * Returns a map of { SYMBOL: [11 values] } or null on failure.
 *
 * Note: Vol Δ 24h % and Dominance % are not available per-coin
 * from CoinGecko — those fields will be empty strings.
 *
 * The symbol→id map is cached for 6 hours to avoid redundant calls.
 *
 * @param {string[]} symbols  - Array of ticker symbols e.g. ['BTC','ETH']
 * @param {string}   apiKey   - CoinGecko Pro API key
 * @returns {Object|null}
 */
function fetchCoinGecko(symbols, apiKey) {

  // ── Step 1: Get symbol → CoinGecko ID map (cached 6h) ─────
  const cache    = CacheService.getScriptCache();
  const cacheKey = 'cg_idmap';
  let   idMap    = null;

  const cached = cache.get(cacheKey);
  if (cached) {
    idMap = JSON.parse(cached);
    Logger.log('CG id map from cache');
  } else {
    Logger.log('Building CG id map...');
    idMap = {};
    try {
      const res = UrlFetchApp.fetch(
        'https://pro-api.coingecko.com/api/v3/coins/list',
        { headers: { 'x-cg-pro-api-key': apiKey }, muteHttpExceptions: true }
      );
      if (res.getResponseCode() === 200) {
        const coins = JSON.parse(res.getContentText());
        // First occurrence of a symbol wins (highest market cap ordering)
        for (const c of coins)
          if (!idMap[c.symbol.toUpperCase()])
            idMap[c.symbol.toUpperCase()] = c.id;
        cache.put(cacheKey, JSON.stringify(idMap), 6 * 3600);
        Logger.log('CG id map built: ' + Object.keys(idMap).length + ' coins');
      }
    } catch(e) {
      Logger.log('CG id map error: ' + e);
      return null;
    }
  }

  // ── Step 2: Fetch market data for all matched symbols ──────
  const ids = symbols.map(s => idMap[s]).filter(Boolean).join(',');
  if (!ids) return null;

  try {
    const url = 'https://pro-api.coingecko.com/api/v3/coins/markets'
              + '?vs_currency=usd&ids=' + encodeURIComponent(ids)
              + '&price_change_percentage=1h,24h,7d,30d&per_page=250';

    const res = UrlFetchApp.fetch(url, {
      headers: { 'x-cg-pro-api-key': apiKey },
      muteHttpExceptions: true
    });

    Logger.log('CG markets status: ' + res.getResponseCode());
    if (res.getResponseCode() !== 200) return null;

    const coins = JSON.parse(res.getContentText());

    // Reverse map: coingecko id → user's ticker symbol
    const rev = {};
    for (const [sym, id] of Object.entries(idMap)) rev[id] = sym;

    const map = {};
    for (const c of coins) {
      const sym = (rev[c.id] || c.symbol).toUpperCase();
      map[sym] = [
        c.current_price                            ?? '',   // AB  Price USD
        c.price_change_percentage_1h_in_currency   ?? '',   // AC  1h %
        c.price_change_percentage_24h_in_currency  ?? '',   // AD  24h %
        c.price_change_percentage_7d_in_currency   ?? '',   // AE  7d %
        c.price_change_percentage_30d_in_currency  ?? '',   // AF  30d %
        c.total_volume                             ?? '',   // AG  Volume 24h
        '',                                                 // AH  Vol Δ 24h % — unavailable
        c.market_cap                               ?? '',   // AI  Market Cap
        '',                                                 // AJ  Dominance % — unavailable
        c.fully_diluted_valuation                  ?? '',   // AK  Fully Diluted MC
        c.last_updated                             ?? ''    // AL  Last Updated
      ];
    }
    return Object.keys(map).length ? map : null;

  } catch(e) {
    Logger.log('CG markets error: ' + e);
    return null;
  }
}


// ── TRIGGERS ──────────────────────────────────────────────────
/**
 * Prompts for a refresh interval, then wipes all existing triggers
 * and creates fresh ones:
 *   - Time-based trigger: refreshMarketData every N minutes
 *   - onOpen trigger: rebuilds the custom menu on file open
 *
 * Run this once manually from the Apps Script editor after setup,
 * or anytime you want to change the refresh interval.
 */
function setupTriggers() {
  const ui       = SpreadsheetApp.getUi();
  const response = ui.prompt(
    '⚙️ Auto-Refresh Interval',
    'Enter refresh interval in minutes (minimum 1):',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const minutes = parseInt(response.getResponseText().trim());
  if (isNaN(minutes) || minutes < 1) {
    ui.alert('⚠️ Invalid number. Please enter a number greater than 0.');
    return;
  }

  // Wipe all existing triggers cleanly
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Time-based auto-refresh
  ScriptApp.newTrigger('refreshMarketData')
    .timeBased().everyMinutes(minutes).create();

  // Menu on open
  ScriptApp.newTrigger('onOpen')
    .forSpreadsheet(SpreadsheetApp.getActive()).onOpen().create();

  ui.alert('✅ Done! Refreshing every ' + minutes + ' min. Reopen the sheet to see the menu.');
}


// ── DIAGNOSTICS ───────────────────────────────────────────────
/**
 * Logs any ticker symbols that contain non-alphanumeric characters.
 * CMC rejects the entire batch if any symbol is invalid, so run
 * this if you get a 400 error from CMC.
 */
function findBadTickers() {
  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const total   = CFG.lastDataRow - CFG.firstDataRow + 1;
  const tickers = sheet.getRange(CFG.firstDataRow, CFG.tickerCol, total, 1)
    .getValues()
    .map(r => r[0].toString().trim())
    .filter(t => t !== ''); // remove empty rows first

  const bad = tickers.filter(t => !/^[a-zA-Z0-9]+$/.test(t));
  Logger.log('Bad tickers: ' + JSON.stringify(bad));
}

/**
 * Quick connectivity test — runs a single BTC quote from CMC key 1.
 * Use this to verify API keys and network access are working.
 */
function testConnectivity() {
  const sheet  = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const cmcKey = sheet.getRange('AD1').getValue().toString().trim();
  const url    = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=BTC&convert=USD';

  const res = UrlFetchApp.fetch(url, {
    headers: { 'X-CMC_PRO_API_KEY': cmcKey },
    muteHttpExceptions: true
  });

  Logger.log('Status: ' + res.getResponseCode());
  Logger.log('Response: ' + res.getContentText().substring(0, 500));
}
