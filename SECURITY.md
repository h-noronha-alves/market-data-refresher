# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 1.0.x | ✅ |

---

## API Key Safety

This project reads API keys directly from spreadsheet cells. Please follow these practices:

- **Never commit API keys** to the repository — keys live in the sheet, not in the code
- **Never share your spreadsheet** publicly if it contains API keys in the key cells
- **Restrict sharing** of the Google Sheet to only the accounts that need access
- **Rotate keys regularly** — especially CoinMarketCap keys, which are tied to usage quotas
- The `.gitignore` is configured to exclude `.clasp.json` and any `.env` files, but the
  responsibility for keeping keys out of version control remains with the user

---

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please **do not open a public issue**.

Instead, report it privately by:

1. Going to the [Security tab](../../security) of this repository
2. Clicking **"Report a vulnerability"**
3. Providing a clear description of the issue, its potential impact, and steps to reproduce it

You can expect an acknowledgement within **72 hours** and a resolution or update within **14 days**, depending on severity.

---

## Scope

Given the nature of this project (a Google Apps Script utility), the most relevant security concerns are:

- **API key exposure** — accidental inclusion of keys in committed code
- **Unvalidated external data** — the script parses JSON from external APIs; malformed responses are handled with try/catch but should be reviewed if APIs change
- **OAuth scope creep** — the `appsscript.json` manifest defines the minimum required OAuth scopes; any contribution that adds broader scopes must be explicitly justified
