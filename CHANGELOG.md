# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses date-based versioning: `vYY.MM.DD-NNNNhna`

---

## [v26.05.08-0001hna] - 2026-05-08

First formally versioned release.

The underlying code was functional prior to this release but existed without
authorship, licensing, versioning, or project structure of any kind. This release
establishes all of that as a matter of principle and good practice. Four code
corrections were also made during this process — none affecting the core fetch
and write behaviour, but improving correctness, consistency and robustness.

### Project structure — established in this release
- Formal authorship declaration
- MIT license
- CalVer versioning scheme (`vYY.MM.DD-NNNNhna`)
- Complete project file structure (README, CHANGELOG, CONTRIBUTING, SECURITY, LICENSE)
- GitHub issue templates (bug report, feature request)
- Full JSDoc on every function
- Inline comments on every non-obvious line
- All configurable values centralised in the `CFG` constant — no magic numbers elsewhere

### Code corrections — made in this release
- Corrected factually wrong comment: `/coins/list` is not market-cap ordered
- Fixed `testConnectivity()` to derive the first CMC key cell from `CFG.cmcKeyRange`
  dynamically, rather than hardcoding `'AD1'`
- Added `CFG.sheetName` with documented note on time-based trigger sheet resolution
- Added null check and log message when the configured sheet name is not found

### Core functional behaviour — unchanged from initial commit
- Bulk fetch of up to 150 cryptocurrency tickers in a single API call per source
- CoinMarketCap as primary data source with support for up to 5 API keys
- CoinGecko Pro as fallback data source
- Automatic failover across all CMC keys before falling back to CoinGecko
- Direct cell writing via `setValues()` — bypasses Google Sheets formula caching
- 11 output fields per ticker: Price USD, 1h %, 24h %, 7d %, 30d %, Volume 24h,
  Vol Δ 24h % (CMC only), Market Cap, Dominance % (CMC only), Fully Diluted MC, Last Updated
- Custom menu with Refresh Now and Setup Auto-Refresh options
- Configurable auto-refresh interval via prompted input
- Time-based and onOpen trigger management
- CoinGecko symbol→ID map cached for 6 hours
- Timestamp written above headers on every refresh
- `findBadTickers()` diagnostic function
- `testConnectivity()` diagnostic function
- Empty ticker rows silently ignored
- Unrecognised tickers written as `—`
