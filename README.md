# Financials - Personal Financial Dashboard

A privacy-focused, zero-backend personal finance dashboard built with React, Vite, and IndexedDB.

## Features
- **Dashboard**: Executive summary, income vs expense breakdowns, monthly trends, and a reminder when your data hasn't been backed up.
- **Transactions**: Full CRUD table, advanced multi-filter search, category assignment, and bulk edit actions.
- **Statement importers**: Exact, audited local parsers for HDFC, SBI and ICICI credit cards and savings accounts (every statement is proven against its own printed totals); CSV mapping; optional Gemini AI for other layouts, with a consent step and personal numbers blacked out before upload.
- **Accounts**: Default HDFC / SBI / ICICI credit-card and debit-card (savings) accounts with card number, credit limit, statement and due days. Imports find their account from the card/account number.
- **Statement history & health** (Documents): opening-vs-closing chain checks, missed months, stale accounts, and payments matched across statements (bank → card bill, own-account transfers, refunds).
- **Automatic Net Worth & due dates**: each statement updates the card's amount owed or the bank balance, and a card's due date and amount are added to Recurring and the calendar.
- **Needs Review inbox & learned merchants**: unknown payees are never guessed; categorise a payee once and it is applied to all its rows and remembered. Rules page lists what the app has learned.
- **Reports**: financial-year (April–March) summary with year-on-year, fees & interest paid, alerts (double charges, price changes, outliers), 30-day cash-flow forecast, and CSV export.
- **Net Worth, Budgets & Goals, Recurring**: as before.
- **Privacy**: hide amounts toggle and an optional passphrase screen lock.
- **Local-first storage** in IndexedDB; optional end-to-end encrypted cloud sync (with a downloadable recovery kit) and linked JSON file.

## Notes for GitHub Pages
- Build output is multi-file (`npm run build`); PDF reading (pdf.js, pdf-lib) and fonts are bundled and load only when needed, so statements are read offline. Only the OCR engine for scanned/image PDFs is fetched from a CDN on first use.
- `npm run build:single` produces one self-contained `index.html` for opening from disk.
- Browser storage is per address: data imported on `localhost` does not appear on `github.io`. Use Cloud Sync or a JSON backup to move it.
- The deploy workflow runs `npm test` before building. **Never commit statements or exports** (PDF/CSV/XLSX and `financials-*.json` are git-ignored); test fixtures must be synthetic.

## Development

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev

# Production build
npm run build

# Tests (parsers, categoriser, ledger, reports, lock, crypto)
npm test
```
