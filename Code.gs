// ============================================================
//  MARKET DATA REFRESHER FOR GOOGLE SHEETS
//  Author:  h-noronha-alves (https://github.com/h-noronha-alves)
//  Version: v26.05.08-0001hna
//  License: MIT
//
//  Fetches cryptocurrency market data for up to 150 tickers
//  using CoinMarketCap (primary) and CoinGecko (fallback),
//  writing results directly to the sheet every N minutes
//  (or on demand via the custom menu).
//
//  SHEET LAYOUT:
//    Tickers       → Column AA (rows 5–155)
//    Headers       → Row 4, starting at Column AB
//    Market Data   → Columns AB:AL (rows 5–155)
//    CoinGecko key → AC1
//    CMC keys      → AD1:AH1 (up to 5 keys, tried in order)
//
//  COLUMNS AB:AL (11 fields):
//    AB  Price USD
//    AC  1h %
//    AD  24h %
//    AE  7d %
//    AF  30d %
//    AG  Volume 24h
//    AH  Vol Δ 24h %   (CMC only — empty when CoinGecko is used)
//    AI  Market Cap
//    AJ  Dominance %   (CMC only — empty when CoinGecko is used)
//    AK  Fully Diluted MC
//    AL  Last Updated
// ============================================================


// ── CONFIGURATION ────────────────────────────────────────────
// All layout and key references are defined here.
// Update these values if the sheet structure changes —
// never hardcode column numbers or cell references elsewhere.
const CFG = {
  sheetName:    '',          // Tab name of the data sheet. Leave '' to use the active sheet.
                             // Set this explicitly if time-based triggers pick the wrong tab.
  tickerCol:    27,          // Column AA (1-indexed) — ticker symbols
  firstDataRow: 5,           // First row containing ticker data
  lastDataRow:  155,         // Last row containing ticker data (supports up to 150 tickers)
  headerRow:    4,           // Row where column headers are written
  outputCol:    28,          // Column AB (1-indexed) — first output column
  cgKeyCell:    'AC1',       // CoinGecko Pro API key cell
  cmcKeyRange:  'AD1:AH1',   // CoinMarketCap API key cells (up to 5 keys, tried left to right)
  numCols:      11,          // Number of output columns (must match HEADERS length)
};

// Column headers written to CFG.headerRow on every refresh.
// Order must match the data arrays returned by fetchCMC() and fetchCoinGecko().
const HEADERS = [
  'Price USD',        // AB
  '1h %',            // AC
  '24h %',           // AD
  '7d %',            // AE
  '30d %',           // AF
  'Volume 24h',      // AG
  'Vol Δ 24h %',     // AH  (CMC only)
  'Market Cap',      // AI
  'Dominance %',     // AJ  (CMC only)
  'Fully Diluted MC',// AK
  'Last Updated'     // AL
];


// ── MENU ─────────────────────────────────────────────────────
/**
 * Creates the custom '📊 Market Data' menu when the spreadsheet opens.
 * Called automatically via the onOpen trigger set by setupTriggers(),
 * and also runs natively when the file is opened (simple trigger).
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 Market Data')
    .addItem('🔄 Refresh Now',         'refreshMarketData')
    .addSeparator()
    .addItem('⚙️ Setup Auto-Refresh',  'setupTriggers')
    .addToUi();
}


// ── MAIN REFRESH FUNCTION ─────────────────────────────────────
/**
 * Main entry point. Reads all tickers from the configured column,
 * fetches market data via CMC (primary) or CoinGecko (fallback)
 * in a single bulk API call, and writes results directly to the sheet.
 *
 * Tickers not recognised by any source are written as '—'.
 * Empty rows in the ticker column are silently ignored and written as blank.
 *
 * Called by:
 *   - The '🔄 Refresh Now' menu item
 *   - The time-based trigger every N minutes (set via setupTriggers)
 *
 * Note: when called from a time-based trigger, Apps Script may not
 * reliably resolve getActiveSheet(). Set CFG.sheetName explicitly
 * if the wrong sheet is being written to.
 */
function refreshMarketData() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = CFG.sheetName ? ss.getSheetByName(CFG.sheetName) : ss.getActiveSheet();

  if (!sheet) {
    Logger.log('Sheet not found: "' + CFG.sheetName + '"');
    return;
  }

  // ── 1. Read tickers ────────────────────────────────────────
  // Reads the full configured range including empty rows.
  // Empty rows are kept in rawTickers to preserve row alignment when writing back.
  const total      = CFG.lastDataRow - CFG.firstDataRow + 1;
  const rawTickers = sheet.getRange(CFG.firstDataRow, CFG.tickerCol, total, 1).getValues();

  // Filtered list used for the API call only — no empty or whitespace-only entries.
  const tickers = rawTickers
    .map((r, i) => ({ symbol: r[0].toString().trim().toUpperCase(), row: i }))
    .filter(t => t.symbol !== '');

  if (!tickers.length) {
    Logger.log('No tickers found in column ' + CFG.tickerCol);
    return;
  }
  Logger.log('Found ' + tickers.length + ' tickers');

  // ── 2. Read API keys ───────────────────────────────────────
  // CMC keys are read left to right from the configured range.
  // Empty cells are excluded — only populated keys are tried.
  const cmcKeys = sheet.getRange(CFG.cmcKeyRange).getValues()[0]
                       .map(k => k.toString().trim()).filter(k => k);
  const cgKey   = sheet.getRange(CFG.cgKeyCell).getValue().toString().trim();

  Logger.log('CMC keys available: ' + cmcKeys.length + ' | CoinGecko key: ' + (cgKey ? 'yes' : 'no'));

  // ── 3. Fetch data — CMC first, CoinGecko as fallback ───────
  // Each source is tried with a single bulk call for all tickers.
  // The first source that returns a non-null result wins.
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
    Logger.log('All API sources failed. Sheet not updated.');
    return;
  }

  Logger.log('Data fetched from: ' + source + ' | Coins returned: ' + Object.keys(dataMap).length);

  // ── 4. Build output grid ───────────────────────────────────
  // Iterates over the full raw ticker range (including empty rows)
  // to produce one output row per sheet row — preserving alignment.
  const output = rawTickers.map(r => {
    const sym = r[0].toString().trim().toUpperCase();
    if (!sym) return Array(CFG.numCols).fill('');       // empty row → blank
    return dataMap[sym] || Array(CFG.numCols).fill('—'); // unknown ticker → dash
  });

  // ── 5. Write to sheet ──────────────────────────────────────
  // Headers and data are written in two separate range calls.
  // Timestamp is written one row above the headers for visibility.
  sheet.getRange(CFG.headerRow,    CFG.outputCol, 1,     CFG.numCols).setValues([HEADERS]);
  sheet.getRange(CFG.firstDataRow, CFG.outputCol, total, CFG.numCols).setValues(output);
  sheet.getRange(CFG.headerRow - 1, CFG.outputCol)
       .setValue('Updated: ' + new Date().toLocaleTimeString() + ' via ' + source);

  Logger.log('Done. ' + total + ' rows written to sheet.');
}


// ── CMC FETCHER ───────────────────────────────────────────────
/**
 * Fetches market data for all symbols in a single CoinMarketCap API call.
 * Returns a map of { 'SYMBOL': [11 values] } or null on failure.
 *
 * All 11 output fields are available from CMC, including
 * Vol Δ 24h % (volume_change_24h) and Dominance % (market_cap_dominance).
 *
 * CMC may return an array instead of a single object when a symbol
 * maps to multiple coins — in that case the first entry is used,
 * which corresponds to the highest market cap match.
 *
 * @param  {string[]}     symbols  Array of ticker symbols e.g. ['BTC', 'ETH']
 * @param  {string}       apiKey   CoinMarketCap Pro API key
 * @returns {Object|null}          Map of symbol → 11-value array, or null on failure
 */
function fetchCMC(symbols, apiKey) {
  const url = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest'
            + '?symbol=' + encodeURIComponent(symbols.join(',')) + '&convert=USD';
  try {
    const res  = UrlFetchApp.fetch(url, {
      headers: { 'X-CMC_PRO_API_KEY': apiKey },
      muteHttpExceptions: true  // prevents thrown exceptions on 4xx/5xx — handled below
    });
    const code = res.getResponseCode();
    const body = res.getContentText();

    Logger.log('CMC status: ' + code);
    Logger.log('CMC response (first 500 chars): ' + body.substring(0, 500));

    if (code !== 200) return null;

    const json = JSON.parse(body);
    if (!json.data) return null;

    const map = {};
    for (const [sym, raw] of Object.entries(json.data)) {
      // CMC returns an array when a symbol is shared by multiple coins.
      // The first element is the highest market cap match.
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
 * Fallback fetcher using the CoinGecko Pro API.
 * Returns a map of { 'SYMBOL': [11 values] } or null on failure.
 *
 * Limitations vs CMC:
 *   - Vol Δ 24h % is not available per coin from the markets endpoint → empty string
 *   - Dominance % is not available per coin from the markets endpoint → empty string
 *
 * CoinGecko requires coin IDs (e.g. 'bitcoin') rather than symbols (e.g. 'BTC').
 * A symbol→ID map is built on first use by calling the /coins/list endpoint,
 * then cached for 6 hours via CacheService to avoid redundant calls.
 *
 * Warning: /coins/list returns 10,000+ entries and can be slow or time out.
 * If CoinGecko is consistently failing, check the execution log for the
 * 'Building CG id map...' step specifically.
 *
 * When multiple coins share the same symbol, the first occurrence in the
 * /coins/list response is used. Note: /coins/list is NOT ordered by market
 * cap — the match may not always be the most prominent coin for that symbol.
 *
 * @param  {string[]}     symbols  Array of ticker symbols e.g. ['BTC', 'ETH']
 * @param  {string}       apiKey   CoinGecko Pro API key
 * @returns {Object|null}          Map of symbol → 11-value array, or null on failure
 */
function fetchCoinGecko(symbols, apiKey) {

  // ── Step 1: Resolve symbols to CoinGecko IDs (cached 6h) ──
  const cache    = CacheService.getScriptCache();
  const cacheKey = 'cg_idmap';
  let   idMap    = null;

  const cached = cache.get(cacheKey);
  if (cached) {
    idMap = JSON.parse(cached);
    Logger.log('CG id map loaded from cache (' + Object.keys(idMap).length + ' entries)');
  } else {
    Logger.log('Building CG id map from /coins/list — this may be slow...');
    idMap = {};
    try {
      const res = UrlFetchApp.fetch(
        'https://pro-api.coingecko.com/api/v3/coins/list',
        { headers: { 'x-cg-pro-api-key': apiKey }, muteHttpExceptions: true }
      );
      if (res.getResponseCode() === 200) {
        const coins = JSON.parse(res.getContentText());
        // First occurrence of each symbol wins.
        // /coins/list is not market-cap ordered, so this is best-effort for ambiguous symbols.
        for (const c of coins)
          if (!idMap[c.symbol.toUpperCase()])
            idMap[c.symbol.toUpperCase()] = c.id;
        cache.put(cacheKey, JSON.stringify(idMap), 6 * 3600); // cache for 6 hours
        Logger.log('CG id map built and cached: ' + Object.keys(idMap).length + ' coins');
      } else {
        Logger.log('CG id map fetch failed with status: ' + res.getResponseCode());
        return null;
      }
    } catch(e) {
      Logger.log('CG id map error: ' + e);
      return null;
    }
  }

  // ── Step 2: Fetch market data for all resolved IDs ─────────
  // Symbols not found in the id map are silently skipped.
  const ids = symbols.map(s => idMap[s]).filter(Boolean).join(',');
  if (!ids) {
    Logger.log('CG: no matching IDs found for the provided symbols');
    return null;
  }

  try {
    const url = 'https://pro-api.coingecko.com/api/v3/coins/markets'
              + '?vs_currency=usd'
              + '&ids=' + encodeURIComponent(ids)
              + '&price_change_percentage=1h,24h,7d,30d'
              + '&per_page=250';

    const res = UrlFetchApp.fetch(url, {
      headers: { 'x-cg-pro-api-key': apiKey },
      muteHttpExceptions: true
    });

    Logger.log('CG markets status: ' + res.getResponseCode());
    if (res.getResponseCode() !== 200) return null;

    const coins = JSON.parse(res.getContentText());
    if (!Array.isArray(coins) || !coins.length) return null;

    // Reverse map: CoinGecko ID → original ticker symbol
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
        '',                                                 // AH  Vol Δ 24h % — not available
        c.market_cap                               ?? '',   // AI  Market Cap
        '',                                                 // AJ  Dominance %  — not available
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
 * Prompts for a refresh interval in minutes, then replaces all
 * existing project triggers with two fresh ones:
 *   - Time-based trigger: calls refreshMarketData() every N minutes
 *   - onOpen trigger:     rebuilds the custom menu when the file opens
 *
 * All existing triggers are deleted before new ones are created,
 * preventing duplicate triggers from accumulating across runs.
 *
 * Run this once manually from the Apps Script editor after initial setup,
 * or any time you want to change the refresh interval.
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
    ui.alert('⚠️ Invalid input. Please enter a whole number greater than 0.');
    return;
  }

  // Delete all existing triggers cleanly before creating new ones
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Time-based auto-refresh trigger
  ScriptApp.newTrigger('refreshMarketData')
    .timeBased().everyMinutes(minutes).create();

  // onOpen trigger to rebuild the custom menu on file open
  ScriptApp.newTrigger('onOpen')
    .forSpreadsheet(SpreadsheetApp.getActive()).onOpen().create();

  ui.alert('✅ Done! Auto-refreshing every ' + minutes + ' min.\nReopen the sheet to see the menu.');
}


// ── DIAGNOSTICS ───────────────────────────────────────────────
/**
 * Logs all ticker symbols that contain non-alphanumeric characters.
 *
 * CoinMarketCap rejects the entire batch request if any single symbol
 * contains invalid characters, returning HTTP 400. Run this function
 * first whenever a 400 error is logged by fetchCMC().
 *
 * Empty rows are excluded before validation to avoid false positives.
 */
function findBadTickers() {
  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const total   = CFG.lastDataRow - CFG.firstDataRow + 1;
  const tickers = sheet.getRange(CFG.firstDataRow, CFG.tickerCol, total, 1)
    .getValues()
    .map(r => r[0].toString().trim())
    .filter(t => t !== '');  // exclude empty rows before validating

  const bad = tickers.filter(t => !/^[a-zA-Z0-9]+$/.test(t));
  Logger.log('Bad tickers found: ' + bad.length);
  Logger.log(JSON.stringify(bad));
}

/**
 * Runs a single BTC quote request against the first CMC key in CFG.cmcKeyRange.
 * Use this to verify API key validity and network connectivity before
 * running the full refresh.
 *
 * Reads the first key cell from CFG.cmcKeyRange dynamically —
 * consistent with CFG so no hardcoded cell references.
 *
 * Logs the HTTP status code and the first 500 characters of the response.
 * A 200 status with recognisable JSON confirms the setup is working.
 */
function testConnectivity() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // Derive the first CMC key cell from CFG.cmcKeyRange (e.g. 'AD1:AH1' → 'AD1')
  const firstCmcKeyCell = CFG.cmcKeyRange.split(':')[0];
  const cmcKey = sheet.getRange(firstCmcKeyCell).getValue().toString().trim();

  if (!cmcKey) {
    Logger.log('No CMC key found in cell ' + firstCmcKeyCell);
    return;
  }

  const url = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest'
            + '?symbol=BTC&convert=USD';

  const res = UrlFetchApp.fetch(url, {
    headers: { 'X-CMC_PRO_API_KEY': cmcKey },
    muteHttpExceptions: true
  });

  Logger.log('Connectivity test — status: ' + res.getResponseCode());
  Logger.log('Response (first 500 chars): ' + res.getContentText().substring(0, 500));
}
