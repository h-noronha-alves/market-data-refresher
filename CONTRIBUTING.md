# Contributing to Market Data Refresher

Thank you for considering contributing to this project. All contributions are welcome — bug fixes, new features, documentation improvements, or suggestions.

---

## Code of Conduct

Be respectful, constructive, and direct. Feedback should be about the code, not the person.

---

## How to Contribute

### Reporting Bugs

Please use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) and include:
- A clear description of the issue
- Steps to reproduce it
- What you expected vs what actually happened
- Relevant logs from the Apps Script Execution log

### Suggesting Features

Please use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md) and include:
- A clear description of the feature and its purpose
- Why it would be useful to others, not just your specific use case
- Any relevant API documentation if it involves a new data source

### Submitting Code

1. Fork the repository
2. Create a branch with a descriptive name (e.g. `add-binance-fallback`, `fix-cmc-400-error`)
3. Make your changes
4. Test thoroughly in a real Google Sheet before submitting
5. Submit a Pull Request with a clear description of what changed and why

---

## Code Standards

These are non-negotiable and apply regardless of how small the change is:

- **Comment every function** with a JSDoc block (`@param`, `@returns`, purpose)
- **Comment non-obvious logic** inline — never assume the next reader knows what you know
- **Define all configurable values as constants** — never hardcode magic numbers or strings
- **Handle errors explicitly** — every API call must have `muteHttpExceptions: true` and a status code check
- **Log meaningfully** — `Logger.log()` calls should help diagnose issues, not just confirm execution
- **Never break the failover chain** — CMC keys must be tried in order before CoinGecko

---

## Project Structure

```
market-data-refresher/
├── Code.gs              # Main Apps Script source
├── appsscript.json      # Apps Script project manifest
├── README.md            # Setup and usage documentation
├── CHANGELOG.md         # Version history
├── CONTRIBUTING.md      # This file
├── SECURITY.md          # Security policy
├── LICENSE              # MIT License
└── .github/
    └── ISSUE_TEMPLATE/
        ├── bug_report.md
        └── feature_request.md
```

---

## Adding a New Data Source

If you want to add a new API as an additional fallback:

1. Add a new `fetch<SourceName>()` function following the same pattern as `fetchCMC()` and `fetchCoinGecko()`
2. The function must return either a `{ SYMBOL: [11 values] }` map or `null` on failure
3. The 11 values must follow the exact column order defined in `HEADERS`
4. Add the new key cell reference to `CFG`
5. Add the fallback call in `refreshMarketData()` after the existing fallbacks
6. Document the new source in `README.md` and update `CHANGELOG.md`
